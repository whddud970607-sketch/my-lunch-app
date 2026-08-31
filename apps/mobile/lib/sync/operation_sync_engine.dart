import 'dart:async';

import 'package:flutter/foundation.dart';

import 'local_operation_store.dart';
import 'operation_dispatcher.dart';
import 'operation_queue.dart';
import 'operation_status.dart';
import 'retry_classifier.dart';
import 'sqlite_operation_store.dart';
import 'sync_operation.dart';

/// App-scoped sync engine (NOT owned by Map screens).
class OperationSyncEngine extends ChangeNotifier {
  OperationSyncEngine({
    LocalOperationStore? store,
    OperationDispatcher? dispatcher,
    RetryClassifier? retryClassifier,
    this.concurrencyLimit = 2,
    this.onOperationSettled,
  })  : _store = store ?? SqliteOperationStore(),
        _dispatcher = dispatcher ?? FakeOperationDispatcher(),
        _retry = retryClassifier ?? RetryClassifier() {
    _queue = OperationQueue(store: _store);
  }

  final LocalOperationStore _store;
  OperationDispatcher _dispatcher;
  final RetryClassifier _retry;
  final int concurrencyLimit;

  /// Optional hook for optimistic projection reconciliation (Complete only).
  final void Function(SyncOperation op, DispatchOutcome outcome)?
      onOperationSettled;

  late final OperationQueue _queue;

  OperationQueue get queue => _queue;
  LocalOperationStore get store => _store;
  String? get boundDriverId => _boundDriverId;

  /// Replace dispatcher after construction (e.g. once ApiClient is ready).
  void setDispatcher(OperationDispatcher dispatcher) {
    _dispatcher = dispatcher;
  }

  String? _boundDriverId;
  bool _paused = false;
  bool _draining = false;
  bool _authPaused = false;
  int _drainGenerations = 0;

  bool get isPaused => _paused || _authPaused;
  int get drainGeneration => _drainGenerations;

  Future<void> bindDriver(String driverId) async {
    if (driverId.isEmpty) return;
    if (_boundDriverId == driverId && _store.activeDriverId == driverId) {
      return;
    }
    await unbind();
    try {
      await _store.openForDriver(driverId);
    } catch (e) {
      // Never auto-delete queue DBs. Surface failure without crash-looping drain.
      debugPrint('[sync] openForDriver failed driver bound skipped');
      _boundDriverId = null;
      notifyListeners();
      rethrow;
    }
    _boundDriverId = driverId;
    _authPaused = false;
    await _store.recoverAfterStartup();
    await _recomputeBlockedFromResults();
    notifyListeners();
    wake();
  }

  Future<void> unbind({bool deleteQueue = false}) async {
    _boundDriverId = null;
    _paused = false;
    _authPaused = false;
    // Let in-flight drain finish before closing SQLite (no queue wipe).
    for (var i = 0; i < 50 && _draining; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 20));
    }
    await _store.close();
    notifyListeners();
  }

  void pause() {
    _paused = true;
    notifyListeners();
  }

  void resume() {
    _paused = false;
    _authPaused = false;
    notifyListeners();
    wake();
  }

  void wake() {
    unawaited(_drain());
  }

  Future<void> _drain() async {
    if (_draining) {
      _drainGenerations++;
      return;
    }
    if (isPaused) return;
    final driverId = _boundDriverId;
    if (driverId == null || _store.activeDriverId != driverId) return;

    _draining = true;
    _drainGenerations++;
    try {
      while (!isPaused &&
          _boundDriverId == driverId &&
          _store.activeDriverId == driverId) {
        final batch = await _store.listDispatchable(
          now: DateTime.now().toUtc(),
          limit: concurrencyLimit,
        );
        if (batch.isEmpty) break;

        for (final op in batch) {
          if (isPaused) break;
          if (op.driverId != driverId || _store.activeDriverId != driverId) {
            return;
          }
          await _processOne(op, driverId);
        }
      }
    } finally {
      _draining = false;
      notifyListeners();
    }
  }

  Future<void> _processOne(SyncOperation op, String driverId) async {
    if (op.dependencyOperationId != null) {
      final result =
          await _store.getDependencyResult(op.dependencyOperationId!);
      if (result == null) {
        await _store.markStatus(
          operationId: op.operationId,
          status: OperationStatus.blocked,
          errorCode: 'dependency_result_missing',
        );
        return;
      }
      if (op.payload['storagePath'] == null && result['storagePath'] != null) {
        await _store.applyDependencyResultToDependents(
          dependencyOperationId: op.dependencyOperationId!,
          result: result,
        );
        final refreshed = await _store.getById(op.operationId);
        if (refreshed == null) return;
        op = refreshed;
      }
    }

    await _store.markInFlight(op.operationId);
    final outcome = await _dispatcher.dispatch(op);

    if (_boundDriverId != driverId || _store.activeDriverId != driverId) {
      return;
    }

    try {
      switch (outcome.kind) {
        case DispatchOutcomeKind.success:
          // Order: save result → unblock dependents with payload merge → ACK → delete
          if (outcome.result != null && outcome.result!.isNotEmpty) {
            await _store.saveDependencyResult(
              dependencyOperationId: op.operationId,
              result: outcome.result!,
            );
            await _store.applyDependencyResultToDependents(
              dependencyOperationId: op.operationId,
              result: outcome.result!,
            );
          }
          await _store.markAcked(op.operationId);
          await _store.deleteAcked(op.operationId);
          break;
        case DispatchOutcomeKind.transientFailure:
          final decision = _retry.classify(
            errorCode: outcome.errorCode ?? 'transient',
            retryCount: op.retryCount,
          );
          await _store.markRetry(
            operationId: op.operationId,
            retryCount: op.retryCount + 1,
            nextRetryAt: DateTime.now().toUtc().add(
                  decision.nextDelay ?? _retry.backoffFor(op.retryCount),
                ),
            errorCode: decision.errorCode ?? outcome.errorCode ?? 'transient',
          );
          break;
        case DispatchOutcomeKind.authWait:
          _authPaused = true;
          await _store.markStatus(
            operationId: op.operationId,
            status: OperationStatus.ready,
            errorCode: outcome.errorCode ?? '401',
          );
          break;
        case DispatchOutcomeKind.permanentFailure:
          await _store.markStatus(
            operationId: op.operationId,
            status: OperationStatus.deadLetter,
            errorCode: outcome.errorCode ?? 'permanent',
          );
          break;
        case DispatchOutcomeKind.conflict:
          await _store.markStatus(
            operationId: op.operationId,
            status: OperationStatus.conflictNeedsAttention,
            errorCode: outcome.errorCode ?? 'conflict',
          );
          break;
      }
    } on StateError {
      // Store closed during logout — leave durable row for next bind recovery.
      return;
    }
    if (_boundDriverId != driverId || _store.activeDriverId != driverId) {
      return;
    }
    onOperationSettled?.call(op, outcome);
  }

  /// Only unblock from durable dependency_results — never from missing rows.
  Future<void> _recomputeBlockedFromResults() async {
    final blocked = await _store.listByStatuses([OperationStatus.blocked]);
    for (final op in blocked) {
      final depId = op.dependencyOperationId;
      if (depId == null) continue;
      final result = await _store.getDependencyResult(depId);
      if (result == null) continue;
      await _store.applyDependencyResultToDependents(
        dependencyOperationId: depId,
        result: result,
      );
    }
  }
}
