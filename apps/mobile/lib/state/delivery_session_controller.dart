import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';

import '../config/app_config.dart';
import 'b3_execution_pending_store.dart';
import '../location/delivery_route_recorder.dart';
import '../location/driver_location_service.dart';
import '../models/delivery_session.dart';
import '../models/delivery_workday.dart';
import '../services/api_exception.dart';
import '../services/delivery_session_service.dart';
import '../services/delivery_workday_repository.dart';

/// Orchestration phase for Home UX (never show "Workday"/"Session" to users).
enum DeliveryLifecyclePhase {
  idle,
  starting,
  /// Workday active, no open Session — resume via job pick.
  activeNoSession,
  /// Recording (Workday-linked or legacy Session).
  active,
  /// End in progress or Workday ending — block new start.
  ending,
  /// Ending failed mid-way; user should retry end.
  endRetryable,
  completed,
}

enum DeliveryStartOutcome {
  started,
  cancelled,
  blocked,
  failed,
  alreadyActive,
}

/// App-scoped owner of delivery Workday + Session + route recorder.
/// UI facade: one "오늘 배송 시작" / "배송 종료" button surface.
class DeliverySessionController extends ChangeNotifier {
  DeliverySessionController({
    required DeliverySessionApi sessionService,
    required DeliveryWorkdayApi workdayRepository,
    required DriverLocationService locationService,
    RouteRecording? recorder,
    bool? workdayExecutionSessionV1,
  })  : _api = sessionService,
        _workdays = workdayRepository,
        _workdayExecutionSessionV1Override = workdayExecutionSessionV1,
        _recorder = recorder ??
            DeliveryRouteRecorder(
              locationService: locationService,
              api: sessionService,
            );

  final DeliverySessionApi _api;
  final DeliveryWorkdayApi _workdays;
  final bool? _workdayExecutionSessionV1Override;
  final RouteRecording _recorder;
  final _uuid = const Uuid();

  DeliverySession? _session;
  DeliveryWorkday? _workday;
  DeliveryLifecyclePhase _phase = DeliveryLifecyclePhase.idle;
  String? _errorMessage;
  bool _busy = false;
  bool _stateMismatch = false;
  Timer? _tick;

  /// Stable across retries for one logical start attempt.
  String? _startWorkdayIdempotencyKey;
  String? _startSessionIdempotencyKey;
  String? _endWorkdayIdempotencyKey;
  String? _lastCompletedWorkdayId;

  bool get _b3ExecutionEnabled {
    final override = _workdayExecutionSessionV1Override;
    if (override != null) {
      return override;
    }
    try {
      return AppConfig.instance.workdayExecutionSessionV1;
    } catch (_) {
      return false;
    }
  }

  /// Completed Workday id for Workday-first report (B3).
  String? get lastCompletedWorkdayId => _lastCompletedWorkdayId;

  bool get preferWorkdayReport =>
      _b3ExecutionEnabled && _lastCompletedWorkdayId != null;

  /// B2 job picker still required (activeNoSession without execution hint).
  bool get needsB2JobPicker =>
      _phase == DeliveryLifecyclePhase.activeNoSession &&
      !_shouldUseB3ExecutionPath(
        workday: _workday,
        session: _session,
        phaseAtDecision: _phase,
      );

  DeliverySession? get session => _session;
  DeliveryWorkday? get workday => _workday;
  DeliveryLifecyclePhase get phase => _phase;
  String? get errorMessage => _errorMessage;
  bool get busy => _busy;
  bool get stateMismatch => _stateMismatch;

  bool get hasActiveSession =>
      _session != null && (_session!.isActive || _session!.status == 'ending');

  /// True when user should see in-progress delivery UI (not idle start).
  bool get isDeliveryInProgress =>
      _phase == DeliveryLifecyclePhase.active ||
      _phase == DeliveryLifecyclePhase.activeNoSession ||
      _phase == DeliveryLifecyclePhase.ending ||
      _phase == DeliveryLifecyclePhase.endRetryable ||
      _phase == DeliveryLifecyclePhase.starting;

  bool get canStartDelivery =>
      !_busy &&
      (_phase == DeliveryLifecyclePhase.idle ||
          _phase == DeliveryLifecyclePhase.activeNoSession ||
          _phase == DeliveryLifecyclePhase.completed);

  bool get canEndDelivery =>
      !_busy &&
      (_phase == DeliveryLifecyclePhase.active ||
          (_phase == DeliveryLifecyclePhase.activeNoSession &&
              _workday != null) ||
          _phase == DeliveryLifecyclePhase.endRetryable ||
          _phase == DeliveryLifecyclePhase.ending);

  bool get needsEndRecovery =>
      _phase == DeliveryLifecyclePhase.ending ||
      _phase == DeliveryLifecyclePhase.endRetryable;

  /// Active membership job ids for picker (detached excluded).
  List<String> get selectableMembershipJobIds =>
      _workday?.activeJobIds ?? const [];

  /// Display elapsed: prefer Session, else Workday start.
  /// Workday [endedAt] means user confirmed end (ending), not finalize time.
  int get displayElapsedSeconds {
    final s = _session;
    if (s != null) {
      final end = s.endedAt ?? DateTime.now().toUtc();
      return end.difference(s.startedAt.toUtc()).inSeconds.clamp(0, 1 << 30);
    }
    final w = _workday;
    if (w != null && w.isOpen) {
      final end = w.endedAt ?? DateTime.now().toUtc();
      return end.difference(w.startedAt.toUtc()).inSeconds.clamp(0, 1 << 30);
    }
    return 0;
  }

  DateTime? get displayStartedAt =>
      _session?.startedAt ?? _workday?.startedAt;

  Future<void> restoreOnBootstrap({required String? driverId}) async {
    if (driverId == null || driverId.isEmpty) return;
    try {
      DeliveryWorkday? workday;
      DeliverySession? session;
      try {
        workday = await _workdays.getActive();
      } catch (_) {
        workday = null;
      }
      try {
        session = await _api.fetchActive();
      } catch (_) {
        session = null;
      }

      _stateMismatch = false;
      await _applyRestoredState(
        driverId: driverId,
        workday: workday,
        session: session,
      );
    } catch (_) {
      // Soft-fail restore; user can retry.
      debugPrint('[delivery] restore soft-fail');
    }
  }

  Future<void> _applyRestoredState({
    required String driverId,
    required DeliveryWorkday? workday,
    required DeliverySession? session,
  }) async {
    // Case F: mismatch — do not force relink.
    if (workday != null &&
        session != null &&
        session.workdayId != null &&
        session.workdayId!.isNotEmpty &&
        session.workdayId != workday.id) {
      _stateMismatch = true;
      _workday = workday;
      _session = session;
      _phase = DeliveryLifecyclePhase.endRetryable;
      _errorMessage = '배송 상태가 일치하지 않습니다. 새로고침 후 다시 시도해 주세요.';
      notifyListeners();
      debugPrint('[delivery] restore mismatch workday/session');
      return;
    }

    // Case D/E: ending workday — prioritize end recovery.
    if (workday != null && workday.isEnding) {
      _workday = workday;
      _session = session;
      if (session != null && session.isActive) {
        _phase = DeliveryLifecyclePhase.endRetryable;
        if (session.isActive) {
          await _recorder.start(
            sessionId: session.id,
            driverId: driverId,
            lastUploadedSequence: session.lastUploadedSequence ?? 0,
          );
          _recorder.stopAcceptingSamples();
        }
        notifyListeners();
        return;
      }
      // Ending + session ending/completed/null → try finalize recovery.
      _phase = DeliveryLifecyclePhase.ending;
      notifyListeners();
      await _recoverEnding(driverId: driverId);
      return;
    }

    // Case A: workday active + linked session active
    if (workday != null &&
        workday.isActive &&
        session != null &&
        session.isOpen) {
      if (workday.isActive) {
        try {
          final reconciled = await _workdays.reconcile(workday.id);
          workday = reconciled.workday;
        } catch (_) {}
      }
      _workday = workday;
      _session = session;
      _phase = session.isActive
          ? DeliveryLifecyclePhase.active
          : DeliveryLifecyclePhase.ending;
      if (session.isActive) {
        await _recorder.start(
          sessionId: session.id,
          driverId: driverId,
          lastUploadedSequence: session.lastUploadedSequence ?? 0,
        );
        _startTick();
      }
      notifyListeners();
      return;
    }

    // Case B: workday active + no session
    if (workday != null && workday.isActive && session == null) {
      var activeWorkday = workday;
      try {
        final reconciled = await _workdays.reconcile(activeWorkday.id);
        activeWorkday = reconciled.workday;
      } catch (_) {}
      _workday = activeWorkday;
      if (await _shouldAutoEnsureExecutionOnRestore(activeWorkday)) {
        try {
          await _ensureExecutionSession(
            driverId: driverId,
            workday: activeWorkday,
          );
          await B3ExecutionPendingStore.clear();
          _phase = DeliveryLifecyclePhase.active;
          notifyListeners();
          return;
        } catch (_) {
          // Fall through to activeNoSession if ensure fails offline.
        }
      }
      _session = null;
      _phase = DeliveryLifecyclePhase.activeNoSession;
      notifyListeners();
      return;
    }

    // Case C: legacy session, no workday
    if ((workday == null || !workday.isOpen) &&
        session != null &&
        session.isOpen) {
      _workday = null;
      _session = session;
      _phase = session.isActive
          ? DeliveryLifecyclePhase.active
          : DeliveryLifecyclePhase.ending;
      if (session.isActive) {
        await _recorder.start(
          sessionId: session.id,
          driverId: driverId,
          lastUploadedSequence: session.lastUploadedSequence ?? 0,
        );
        _startTick();
      } else if (session.status == 'ending') {
        notifyListeners();
        await _finalizeLegacySessionOnly();
      }
      notifyListeners();
      return;
    }

    // Idle
    _workday = null;
    _session = null;
    _phase = DeliveryLifecyclePhase.idle;
    _startWorkdayIdempotencyKey = null;
    _startSessionIdempotencyKey = null;
    _endWorkdayIdempotencyKey = null;
    notifyListeners();
  }

  Future<void> _recoverEnding({required String driverId}) async {
    final workday = _workday;
    if (workday == null || !workday.isEnding) return;
    try {
      var session = _session;
      if (session == null) {
        session = await _api.fetchActive();
        _session = session;
      }

      if (session != null && session.isActive) {
        _phase = DeliveryLifecyclePhase.endRetryable;
        notifyListeners();
        return;
      }

      if (session != null && session.status == 'ending') {
        final completed = await _api.finalize(sessionId: session.id);
        _session = completed;
        await _recorder.stop(flush: false);
      }

      final completedWd = await _workdays.finalize(workday.id);
      _workday = completedWd;
      _session = null;
      _phase = DeliveryLifecyclePhase.completed;
      _endWorkdayIdempotencyKey = null;
      notifyListeners();
      // Settle to idle after brief completed signal for listeners.
      _phase = DeliveryLifecyclePhase.idle;
      _workday = null;
      notifyListeners();
    } on ApiException catch (e) {
      if (e.code == 'open_session_active') {
        _phase = DeliveryLifecyclePhase.endRetryable;
      } else {
        _phase = DeliveryLifecyclePhase.endRetryable;
        _errorMessage = e.message;
      }
      notifyListeners();
    } catch (_) {
      _phase = DeliveryLifecyclePhase.endRetryable;
      _errorMessage = '배송 종료 처리 중 오류가 발생했습니다. 다시 시도해 주세요.';
      notifyListeners();
    }
  }

  Future<void> _finalizeLegacySessionOnly() async {
    final session = _session;
    if (session == null) return;
    try {
      final endedAt = session.endedAt ?? DateTime.now().toUtc();
      await _recorder.flushAfterEnd(endedAt: endedAt);
      final completed = await _api.finalize(sessionId: session.id);
      _session = completed;
      await _recorder.stop(flush: false);
      _tick?.cancel();
      _phase = DeliveryLifecyclePhase.idle;
      _session = null;
    } catch (_) {
      _phase = DeliveryLifecyclePhase.endRetryable;
    }
  }

  /// Orchestrates Workday start (+ optional Session) without exposing internals.
  ///
  /// B3 flag ON: Workday → execution Session ensure (no picker).
  /// B2 flag OFF or compatibility: [selectJob] for job-bound Session.
  Future<DeliveryStartOutcome> startTodayDelivery({
    required String driverId,
    required Future<String?> Function(List<String> membershipJobIds) selectJob,
  }) async {
    if (_busy) return DeliveryStartOutcome.failed;
    if (needsEndRecovery) {
      _errorMessage = '배송 종료 처리가 진행 중입니다. 종료를 완료해 주세요.';
      notifyListeners();
      return DeliveryStartOutcome.blocked;
    }
    if (_phase == DeliveryLifecyclePhase.active && hasActiveSession) {
      return DeliveryStartOutcome.alreadyActive;
    }

    _busy = true;
    _phase = DeliveryLifecyclePhase.starting;
    _errorMessage = null;
    notifyListeners();

    try {
      late final DeliveryWorkday workday;
      final existing = _workday;
      if (existing == null || !existing.isActive) {
        workday = await _ensureWorkdayStarted();
      } else {
        try {
          final r = await _workdays.reconcile(existing.id);
          workday = r.workday;
        } catch (_) {
          workday = existing;
        }
      }
      _workday = workday;

      final jobIds = workday.activeJobIds;
      if (jobIds.isEmpty) {
        _phase = DeliveryLifecyclePhase.activeNoSession;
        _errorMessage = '현재 시작할 수 있는 배송이 없습니다.';
        return DeliveryStartOutcome.failed;
      }

      if (_shouldUseB3ExecutionPath(
        workday: workday,
        session: _session,
        phaseAtDecision: _phase,
      )) {
        await B3ExecutionPendingStore.mark(workday.id);
        try {
          await _ensureExecutionSession(driverId: driverId, workday: workday);
          await B3ExecutionPendingStore.clear();
        } catch (_) {
          rethrow;
        }
        _startWorkdayIdempotencyKey = null;
        _startSessionIdempotencyKey = null;
        _phase = DeliveryLifecyclePhase.active;
        return DeliveryStartOutcome.started;
      }

      // B2 path: job picker → job-bound Session.
      _phase = DeliveryLifecyclePhase.activeNoSession;
      notifyListeners();

      final selected = await selectJob(jobIds);
      if (selected == null || selected.isEmpty) {
        _phase = DeliveryLifecyclePhase.activeNoSession;
        return DeliveryStartOutcome.cancelled;
      }
      if (!jobIds.contains(selected)) {
        _errorMessage = '선택할 수 없는 배송입니다.';
        _phase = DeliveryLifecyclePhase.activeNoSession;
        return DeliveryStartOutcome.failed;
      }

      await _startSessionLinked(
        driverId: driverId,
        workdayId: workday.id,
        deliveryJobId: selected,
      );
      _startWorkdayIdempotencyKey = null;
      _startSessionIdempotencyKey = null;
      _phase = DeliveryLifecyclePhase.active;
      return DeliveryStartOutcome.started;
    } on ApiException catch (e) {
      if (e.code == 'no_eligible_jobs') {
        _errorMessage = '현재 시작할 수 있는 배송이 없습니다.';
        _phase = DeliveryLifecyclePhase.idle;
        _workday = null;
        return DeliveryStartOutcome.failed;
      }
      if (e.statusCode == 409) {
        await restoreOnBootstrap(driverId: driverId);
        if (hasActiveSession) return DeliveryStartOutcome.alreadyActive;
        if (_workday?.isActive == true) {
          _phase = DeliveryLifecyclePhase.activeNoSession;
        }
      }
      _errorMessage = e.message;
      if (_workday?.isActive == true && _session == null) {
        _phase = DeliveryLifecyclePhase.activeNoSession;
      } else if (!isDeliveryInProgress) {
        _phase = DeliveryLifecyclePhase.idle;
      }
      return DeliveryStartOutcome.failed;
    } catch (_) {
      _errorMessage = '배송을 시작하지 못했습니다.';
      if (_workday?.isActive == true && _session == null) {
        _phase = DeliveryLifecyclePhase.activeNoSession;
      } else if (_session == null) {
        _phase = DeliveryLifecyclePhase.idle;
      }
      return DeliveryStartOutcome.failed;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  bool _isB2CompatibleSession(DeliverySession? session) {
    if (session == null) return false;
    if (session.isExecutionSession) return false;
    if (session.isJobBoundSession) return true;
    return false;
  }

  bool _shouldUseB3ExecutionPath({
    required DeliveryWorkday? workday,
    required DeliverySession? session,
    required DeliveryLifecyclePhase phaseAtDecision,
  }) {
    if (!_b3ExecutionEnabled) return false;
    if (session != null && _isB2CompatibleSession(session)) return false;
    // B2 activeNoSession resume (picker cancel): no execution hint yet.
    if (phaseAtDecision == DeliveryLifecyclePhase.activeNoSession &&
        session == null &&
        workday != null &&
        (workday.executionSessionId == null ||
            workday.executionSessionId!.isEmpty)) {
      return false;
    }
    return true;
  }

  Future<bool> _shouldAutoEnsureExecutionOnRestore(
    DeliveryWorkday workday,
  ) async {
    if (!_b3ExecutionEnabled) return false;
    final execId = workday.executionSessionId;
    if (execId != null && execId.isNotEmpty) return true;
    return B3ExecutionPendingStore.isPending(workday.id);
  }

  Future<void> _ensureExecutionSession({
    required String driverId,
    required DeliveryWorkday workday,
  }) async {
    _workday = workday;

    if (_session != null &&
        _session!.isOpen &&
        _session!.isExecutionSession &&
        _session!.workdayId == workday.id) {
      await _startRecorderForSession(driverId: driverId, session: _session!);
      return;
    }

    final hintedId = workday.executionSessionId;
    if (hintedId != null && hintedId.isNotEmpty) {
      try {
        final active = await _api.fetchActive();
        if (active != null &&
            active.id == hintedId &&
            active.workdayId == workday.id) {
          _session = active;
          await _startRecorderForSession(driverId: driverId, session: active);
          return;
        }
      } catch (_) {}
    }

    _startSessionIdempotencyKey ??= _uuid.v4();
    final session = await _api.start(
      idempotencyKey: _startSessionIdempotencyKey!,
      workdayId: workday.id,
    );
    _session = session;
    await _startRecorderForSession(driverId: driverId, session: session);
    await B3ExecutionPendingStore.clear();
  }

  Future<void> _startRecorderForSession({
    required String driverId,
    required DeliverySession session,
  }) async {
    await _recorder.start(
      sessionId: session.id,
      driverId: driverId,
      lastUploadedSequence: session.lastUploadedSequence ?? 0,
    );
    _startTick();
  }

  Future<DeliveryWorkday> _ensureWorkdayStarted() async {
    _startWorkdayIdempotencyKey ??= _uuid.v4();
    final key = _startWorkdayIdempotencyKey!;
    try {
      final result = await _workdays.start(idempotencyKey: key);
      return result.workday;
    } on ApiException catch (e) {
      if (e.code == 'open_workday_exists') {
        final existingId = e.body?['existingWorkdayId'] as String?;
        final active = await _workdays.getActive();
        if (active != null) return active;
        if (existingId != null) {
          return _workdays.getById(existingId);
        }
      }
      rethrow;
    }
  }

  Future<void> _startSessionLinked({
    required String driverId,
    required String workdayId,
    required String deliveryJobId,
  }) async {
    _startSessionIdempotencyKey ??= _uuid.v4();
    final session = await _api.start(
      idempotencyKey: _startSessionIdempotencyKey!,
      deliveryJobId: deliveryJobId,
      workdayId: workdayId,
    );
    _session = session;
    await _recorder.start(
      sessionId: session.id,
      driverId: driverId,
      lastUploadedSequence: session.lastUploadedSequence ?? 0,
    );
    _startTick();
  }

  /// After Today refresh: reconcile membership if Workday active (not every paint).
  Future<void> reconcileAfterTodayRefresh() async {
    final workday = _workday;
    if (workday == null || !workday.isActive || _busy) return;
    try {
      final result = await _workdays.reconcile(workday.id);
      _workday = result.workday;
      notifyListeners();
    } catch (_) {}
  }

  /// Returns incomplete count if confirmation needed; null if ended successfully.
  /// Negative sentinel (-1) when count unknown.
  Future<int?> endTodayDelivery({
    required bool forceIncomplete,
  }) async {
    if (_busy) return null;

    // Legacy Session path (no Workday).
    if (_workday == null && _session != null) {
      return _endLegacySession(forceIncomplete: forceIncomplete);
    }

    final workday = _workday;
    if (workday == null) return null;

    _busy = true;
    _errorMessage = null;
    _phase = DeliveryLifecyclePhase.ending;
    notifyListeners();

    try {
      // 1) Reconcile before end.
      if (workday.isActive) {
        try {
          final r = await _workdays.reconcile(workday.id);
          _workday = r.workday;
        } catch (_) {}
      }

      // 2–5) request-end (idempotent key for retries).
      if (_workday!.isActive) {
        _endWorkdayIdempotencyKey ??= _uuid.v4();
        try {
          final endResult = await _workdays.requestEnd(
            workdayId: _workday!.id,
            forceIncomplete: forceIncomplete,
            endIdempotencyKey: _endWorkdayIdempotencyKey,
          );
          _workday = endResult.workday;
        } on ApiException catch (e) {
          if (e.statusCode == 409 &&
              (e.code == 'incomplete_deliveries' ||
                  e.incompletePoints != null)) {
            _phase = DeliveryLifecyclePhase.active;
            if (_session?.isActive == true) {
              _recorder.resumeAcceptingSamples();
            }
            return e.incompletePoints ?? -1;
          }
          rethrow;
        }
      }

      // Block new samples once ending.
      _recorder.stopAcceptingSamples();

      // 8–11) Session end + flush + finalize when open session exists.
      var session = _session ?? await _api.fetchActive();
      _session = session;
      final useWorkdayReport =
          _b3ExecutionEnabled && (session?.isExecutionSession ?? false);

      if (session != null && session.isOpen) {
        if (session.isActive) {
          final ending = await _api.end(
            sessionId: session.id,
            forceIncomplete: true,
            finalize: false,
          );
          _session = ending;
        }
        final endedAt =
            _session?.endedAt ?? _workday?.endedAt ?? DateTime.now().toUtc();
        await _recorder.flushAfterEnd(endedAt: endedAt);
        final completed = await _api.finalize(sessionId: session.id);
        _session = completed;
        await _recorder.stop(flush: false);
        _tick?.cancel();
      } else {
        await _recorder.stop(flush: false);
        _tick?.cancel();
      }

      // 12–13) Workday finalize (idempotent if already completed).
      final workdayIdForReport = _workday!.id;
      final finalized = await _workdays.finalize(_workday!.id);
      _workday = finalized;
      _phase = DeliveryLifecyclePhase.completed;
      _endWorkdayIdempotencyKey = null;
      _startWorkdayIdempotencyKey = null;
      _startSessionIdempotencyKey = null;

      final reportSession = _session;
      if (useWorkdayReport) {
        _lastCompletedWorkdayId = workdayIdForReport;
      }
      _workday = finalized.isCompleted ? null : finalized;
      _phase = DeliveryLifecyclePhase.idle;
      _session = reportSession;
      return null;
    } on ApiException catch (e) {
      if (e.statusCode == 409 &&
          (e.code == 'incomplete_deliveries' || e.incompletePoints != null)) {
        _phase = _session?.isActive == true
            ? DeliveryLifecyclePhase.active
            : DeliveryLifecyclePhase.activeNoSession;
        _recorder.resumeAcceptingSamples();
        return e.incompletePoints ?? -1;
      }
      _phase = DeliveryLifecyclePhase.endRetryable;
      _errorMessage = e.message;
      return null;
    } catch (_) {
      _phase = DeliveryLifecyclePhase.endRetryable;
      _errorMessage = '배송 종료에 실패했습니다. 다시 시도해 주세요.';
      return null;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<int?> _endLegacySession({required bool forceIncomplete}) async {
    final session = _session;
    if (session == null) return null;

    _busy = true;
    _errorMessage = null;
    _phase = DeliveryLifecyclePhase.ending;
    notifyListeners();

    try {
      if (forceIncomplete) {
        _recorder.stopAcceptingSamples();
      }

      final ending = await _api.end(
        sessionId: session.id,
        forceIncomplete: forceIncomplete,
        finalize: false,
      );
      _session = ending;
      _recorder.stopAcceptingSamples();

      final endedAt = ending.endedAt ?? DateTime.now().toUtc();
      await _recorder.flushAfterEnd(endedAt: endedAt);

      final completed = await _api.finalize(sessionId: session.id);
      _session = completed;

      await _recorder.stop(flush: false);
      _tick?.cancel();
      _phase = DeliveryLifecyclePhase.idle;
      return null;
    } on ApiException catch (e) {
      if (e.statusCode == 409) {
        _recorder.resumeAcceptingSamples();
        _phase = DeliveryLifecyclePhase.active;
        return e.incompletePoints ??
            session.progress?.incompletePoints ??
            -1;
      }
      _phase = DeliveryLifecyclePhase.endRetryable;
      _errorMessage = e.message;
      return null;
    } catch (_) {
      _phase = DeliveryLifecyclePhase.endRetryable;
      _errorMessage = '배송 종료에 실패했습니다.';
      return null;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<void> refreshActive() async {
    try {
      final workday = await _workdays.getActive();
      final session = await _api.fetchActive();
      // Soft update without re-starting recorder if same session active.
      if (session != null &&
          _session?.id == session.id &&
          session.isActive &&
          _phase == DeliveryLifecyclePhase.active) {
        _session = session;
        if (workday != null) _workday = workday;
        notifyListeners();
        return;
      }
      // Full reconcile via restore logic needs driverId — use session/workday driver.
      final driverId = session?.driverId ?? workday?.driverId;
      if (driverId != null) {
        await _applyRestoredState(
          driverId: driverId,
          workday: workday,
          session: session,
        );
      }
    } catch (_) {}
  }

  Future<Map<String, dynamic>?> loadReport({
    String? sessionId,
    String? workdayId,
  }) async {
    try {
      if (workdayId != null && workdayId.isNotEmpty) {
        return await _workdays.fetchReport(workdayId);
      }
      if (sessionId != null && sessionId.isNotEmpty) {
        return await _api.fetchReport(sessionId);
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<Map<String, dynamic>?> loadWorkdayRoute(String workdayId) async {
    try {
      return await _workdays.fetchRoute(workdayId);
    } catch (_) {
      return null;
    }
  }

  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }

  void clearCompletedSession() {
    if (_phase == DeliveryLifecyclePhase.idle ||
        _phase == DeliveryLifecyclePhase.completed) {
      _session = null;
      _lastCompletedWorkdayId = null;
      notifyListeners();
    }
  }

  void _startTick() {
    _tick?.cancel();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (_session?.isActive == true ||
          (_workday?.isActive == true && _session == null)) {
        notifyListeners();
      }
    });
  }

  Future<void> onSignOut() async {
    await _recorder.stop(flush: true);
    await B3ExecutionPendingStore.clear();
    _session = null;
    _workday = null;
    _phase = DeliveryLifecyclePhase.idle;
    _errorMessage = null;
    _stateMismatch = false;
    _lastCompletedWorkdayId = null;
    _startWorkdayIdempotencyKey = null;
    _startSessionIdempotencyKey = null;
    _endWorkdayIdempotencyKey = null;
    _tick?.cancel();
    notifyListeners();
  }

  @override
  void dispose() {
    _tick?.cancel();
    unawaited(_recorder.stop(flush: false));
    super.dispose();
  }
}
