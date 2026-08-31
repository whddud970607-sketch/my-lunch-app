import 'package:delivery_shield_mobile/location/delivery_route_recorder.dart';
import 'package:delivery_shield_mobile/location/driver_location_service.dart';
import 'package:delivery_shield_mobile/models/delivery_session.dart';
import 'package:delivery_shield_mobile/models/delivery_workday.dart';
import 'package:delivery_shield_mobile/services/api_exception.dart';
import 'package:delivery_shield_mobile/services/delivery_session_service.dart';
import 'package:delivery_shield_mobile/services/delivery_workday_repository.dart';
import 'package:delivery_shield_mobile/state/b3_execution_pending_store.dart';
import 'package:delivery_shield_mobile/state/delivery_session_controller.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

DeliveryWorkday _wd({
  String id = 'wd-1',
  String status = 'active',
  List<String> activeJobs = const ['job-1'],
  List<String> detachedJobs = const [],
  int? incompletePoints,
  DateTime? endedAt,
  String? executionSessionId,
}) {
  final now = DateTime.utc(2026, 8, 30, 1, 0);
  return DeliveryWorkday(
    id: id,
    driverId: 'drv-1',
    serviceDate: '2026-08-30',
    status: status,
    startedAt: now,
    endedAt: endedAt,
    membership: [
      for (final j in activeJobs)
        DeliveryWorkdayMembership(
          jobId: j,
          attachedAt: now,
          membershipSource: 'start_snapshot',
          active: true,
        ),
      for (final j in detachedJobs)
        DeliveryWorkdayMembership(
          jobId: j,
          attachedAt: now,
          detachedAt: now.add(const Duration(hours: 1)),
          membershipSource: 'reconcile',
          active: false,
        ),
    ],
    incompletePoints: incompletePoints,
    executionSessionId: executionSessionId,
  );
}

DeliverySession _sess({
  String id = 'sess-1',
  String status = 'active',
  String? workdayId = 'wd-1',
  String? jobId = 'job-1',
  String? sessionRole,
  DateTime? endedAt,
}) {
  final now = DateTime.utc(2026, 8, 30, 1, 5);
  final role = sessionRole ??
      (jobId == null ? 'workday_execution' : 'workday_job_slice');
  return DeliverySession(
    id: id,
    driverId: 'drv-1',
    deliveryJobId: jobId,
    workdayId: workdayId,
    sessionRole: role,
    status: status,
    startedAt: now,
    endedAt: endedAt,
  );
}

class FakeRouteRecording implements RouteRecording {
  int startCount = 0;
  int stopAcceptingCount = 0;
  int resumeCount = 0;
  int flushCount = 0;
  int stopCount = 0;
  bool accepting = true;
  String? sessionId;

  @override
  Future<void> start({
    required String sessionId,
    required String driverId,
    int lastUploadedSequence = 0,
  }) async {
    startCount++;
    this.sessionId = sessionId;
    accepting = true;
  }

  @override
  void stopAcceptingSamples() {
    stopAcceptingCount++;
    accepting = false;
  }

  @override
  void resumeAcceptingSamples() {
    resumeCount++;
    accepting = true;
  }

  @override
  Future<void> flushAfterEnd({required DateTime endedAt}) async {
    flushCount++;
    accepting = false;
  }

  @override
  Future<void> stop({bool flush = true}) async {
    stopCount++;
    accepting = false;
    sessionId = null;
  }
}

class FakeWorkdayApi implements DeliveryWorkdayApi {
  DeliveryWorkday? active;
  final List<String> startKeys = [];
  int startCalls = 0;
  int reconcileCalls = 0;
  int requestEndCalls = 0;
  int finalizeCalls = 0;
  ApiException? startError;
  ApiException? requestEndError;
  String? lastEndKey;

  @override
  Future<WorkdayStartResult> start({required String idempotencyKey}) async {
    startCalls++;
    startKeys.add(idempotencyKey);
    if (startError != null) throw startError!;
    active ??= _wd();
    return WorkdayStartResult(workday: active!, created: startCalls == 1);
  }

  @override
  Future<DeliveryWorkday?> getActive() async => active;

  @override
  Future<DeliveryWorkday> getById(String workdayId) async {
    if (active != null && active!.id == workdayId) return active!;
    throw ApiException(message: 'not found', statusCode: 404);
  }

  @override
  Future<WorkdayReconcileResult> reconcile(String workdayId) async {
    reconcileCalls++;
    return WorkdayReconcileResult(
      workday: active ?? _wd(id: workdayId),
      attached: 0,
      detached: 0,
    );
  }

  @override
  Future<WorkdayRequestEndResult> requestEnd({
    required String workdayId,
    bool forceIncomplete = false,
    String? endIdempotencyKey,
  }) async {
    requestEndCalls++;
    lastEndKey = endIdempotencyKey;
    if (requestEndError != null) throw requestEndError!;
    final ending = _wd(
      id: workdayId,
      status: 'ending',
      endedAt: DateTime.utc(2026, 8, 30, 12),
      incompletePoints: 0,
    );
    active = ending;
    return WorkdayRequestEndResult(
      workday: ending,
      requiresClientSessionEnd: true,
    );
  }

  @override
  Future<DeliveryWorkday> finalize(String workdayId) async {
    finalizeCalls++;
    final done = _wd(
      id: workdayId,
      status: 'completed',
      endedAt: DateTime.utc(2026, 8, 30, 12),
    );
    active = null;
    return done;
  }

  @override
  Future<Map<String, dynamic>> fetchReport(String workdayId) async => {
        'workdayId': workdayId,
        'progress': {
          'totalPoints': 3,
          'completedPoints': 2,
          'incompletePoints': 1,
        },
        'durationSeconds': 3600,
        'route': {'start': null, 'end': null},
      };

  @override
  Future<Map<String, dynamic>> fetchRoute(String workdayId) async => {
        'workdayId': workdayId,
        'segments': [],
      };
}

class FakeSessionApi implements DeliverySessionApi {
  DeliverySession? active;
  final List<Map<String, String?>> startCalls = [];
  int endCalls = 0;
  int finalizeCalls = 0;
  ApiException? endError;

  @override
  Future<DeliverySession?> fetchActive() async => active;

  @override
  Future<DeliverySession> start({
    required String idempotencyKey,
    String? deliveryJobId,
    String? workdayId,
  }) async {
    startCalls.add({
      'key': idempotencyKey,
      'jobId': deliveryJobId,
      'workdayId': workdayId,
    });
    if (deliveryJobId == null && workdayId != null) {
      active = _sess(
        workdayId: workdayId,
        jobId: null,
        sessionRole: 'workday_execution',
      );
    } else {
      active = _sess(
        workdayId: workdayId,
        jobId: deliveryJobId ?? 'job-1',
        sessionRole: 'workday_job_slice',
      );
    }
    return active!;
  }

  @override
  Future<DeliverySession> end({
    required String sessionId,
    bool forceIncomplete = false,
    bool finalize = false,
  }) async {
    endCalls++;
    if (endError != null) throw endError!;
    final prev = active;
    active = _sess(
      id: sessionId,
      status: 'ending',
      endedAt: DateTime.utc(2026, 8, 30, 12),
      workdayId: prev?.workdayId,
      jobId: prev?.deliveryJobId,
      sessionRole: prev?.sessionRole,
    );
    return active!;
  }

  @override
  Future<DeliverySession> finalize({required String sessionId}) async {
    finalizeCalls++;
    final prev = active;
    active = _sess(
      id: sessionId,
      status: 'completed',
      endedAt: DateTime.utc(2026, 8, 30, 12),
      workdayId: prev?.workdayId,
      jobId: prev?.deliveryJobId,
      sessionRole: prev?.sessionRole,
    );
    return active!;
  }

  @override
  Future<RouteBatchUploadResult> uploadRouteBatch({
    required String sessionId,
    required List<DeliveryRoutePoint> points,
  }) async {
    return RouteBatchUploadResult(accepted: points.length, inserted: points.length);
  }

  @override
  Future<Map<String, dynamic>> fetchReport(String sessionId) async => {};
}

DriverLocationService _noopLocation() {
  return DriverLocationService(
    isLocationServiceEnabled: () async => false,
    checkPermission: () async => LocationPermission.denied,
    requestPermission: () async => LocationPermission.denied,
    getCurrentPosition: (_) async => throw StateError('unused'),
    getPositionStream: (_) => const Stream.empty(),
  );
}

DeliverySessionController _ctrl({
  required FakeWorkdayApi workdays,
  required FakeSessionApi sessions,
  FakeRouteRecording? recorder,
  bool workdayExecutionSessionV1 = false,
}) {
  return DeliverySessionController(
    sessionService: sessions,
    workdayRepository: workdays,
    locationService: _noopLocation(),
    recorder: recorder ?? FakeRouteRecording(),
    workdayExecutionSessionV1: workdayExecutionSessionV1,
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('DeliveryWorkday model', () {
    test('parses membership and treats endedAt as end-confirm time field', () {
      final w = DeliveryWorkday.fromJson({
        'id': 'wd-1',
        'driverId': 'drv-1',
        'serviceDate': '2026-08-30',
        'status': 'ending',
        'startedAt': '2026-08-30T01:00:00.000Z',
        'endedAt': '2026-08-30T12:00:00.000Z',
        'startIdempotencyKey': 'k1',
        'summarySnapshot': {'totalPoints': 10},
        'membership': [
          {
            'jobId': 'job-1',
            'attachedAt': '2026-08-30T01:00:00.000Z',
            'detachedAt': null,
            'membershipSource': 'start_snapshot',
            'active': true,
          },
        ],
        'incompletePoints': 2,
      });
      expect(w.isEnding, isTrue);
      expect(w.endedAt, isNotNull);
      expect(w.activeJobIds, ['job-1']);
      expect(w.summarySnapshot.containsKey('totalPoints'), isTrue);
    });
  });

  group('DeliverySessionController orchestration', () {
    test('1. start one job → Workday + Session linked', () async {
      final workdays = FakeWorkdayApi();
      final sessions = FakeSessionApi();
      final recorder = FakeRouteRecording();
      final c = _ctrl(workdays: workdays, sessions: sessions, recorder: recorder);

      final outcome = await c.startTodayDelivery(
        driverId: 'drv-1',
        selectJob: (ids) async => ids.single,
      );

      expect(outcome, DeliveryStartOutcome.started);
      expect(c.phase, DeliveryLifecyclePhase.active);
      expect(sessions.startCalls.single['workdayId'], 'wd-1');
      expect(recorder.startCount, 1);
    });

    test('2. multi-job → picker receives membership ids', () async {
      final workdays = FakeWorkdayApi()
        ..active = _wd(activeJobs: ['job-a', 'job-b']);
      // Force start to return multi membership
      workdays.active = _wd(activeJobs: ['job-a', 'job-b']);
      final sessions = FakeSessionApi();
      final c = _ctrl(workdays: workdays, sessions: sessions);

      List<String>? seen;
      await c.startTodayDelivery(
        driverId: 'drv-1',
        selectJob: (ids) async {
          seen = ids;
          return 'job-b';
        },
      );
      expect(seen, ['job-a', 'job-b']);
      expect(sessions.startCalls.single['jobId'], 'job-b');
    });

    test('3. picker cancel → activeNoSession kept', () async {
      final workdays = FakeWorkdayApi();
      final sessions = FakeSessionApi();
      final c = _ctrl(workdays: workdays, sessions: sessions);

      final outcome = await c.startTodayDelivery(
        driverId: 'drv-1',
        selectJob: (_) async => null,
      );

      expect(outcome, DeliveryStartOutcome.cancelled);
      expect(c.phase, DeliveryLifecyclePhase.activeNoSession);
      expect(c.workday, isNotNull);
      expect(sessions.startCalls, isEmpty);
    });

    test('4. resume activeNoSession without new Workday start', () async {
      final workdays = FakeWorkdayApi()..active = _wd();
      final sessions = FakeSessionApi();
      final c = _ctrl(workdays: workdays, sessions: sessions);
      await c.restoreOnBootstrap(driverId: 'drv-1');
      expect(c.phase, DeliveryLifecyclePhase.activeNoSession);

      await c.startTodayDelivery(
        driverId: 'drv-1',
        selectJob: (ids) async => ids.first,
      );
      expect(workdays.startCalls, 0);
      expect(c.phase, DeliveryLifecyclePhase.active);
    });

    test('5. double start tap guarded by busy', () async {
      final workdays = FakeWorkdayApi();
      final sessions = FakeSessionApi();
      final c = _ctrl(workdays: workdays, sessions: sessions);

      late DeliveryStartOutcome second;
      final first = c.startTodayDelivery(
        driverId: 'drv-1',
        selectJob: (ids) async {
          second = await c.startTodayDelivery(
            driverId: 'drv-1',
            selectJob: (_) async => ids.first,
          );
          return ids.first;
        },
      );
      final firstOutcome = await first;
      expect(firstOutcome, DeliveryStartOutcome.started);
      expect(second, DeliveryStartOutcome.failed);
      expect(workdays.startCalls, 1);
    });

    test('6. start retry reuses same workday idempotency key', () async {
      final workdays = FakeWorkdayApi();
      var attempts = 0;
      workdays.startError = ApiException(
        message: 'timeout',
        statusCode: 500,
      );
      final sessions = FakeSessionApi();
      final c = _ctrl(workdays: workdays, sessions: sessions);

      await c.startTodayDelivery(
        driverId: 'drv-1',
        selectJob: (_) async => 'job-1',
      );
      expect(workdays.startKeys, hasLength(1));
      final key1 = workdays.startKeys.first;

      workdays.startError = null;
      attempts = workdays.startCalls;
      await c.startTodayDelivery(
        driverId: 'drv-1',
        selectJob: (_) async => 'job-1',
      );
      expect(workdays.startKeys.last, key1);
      expect(workdays.startCalls, attempts + 1);
    });

    test('7. no eligible jobs UX message', () async {
      final workdays = FakeWorkdayApi()
        ..startError = ApiException(
          message: 'No eligible jobs',
          statusCode: 409,
          body: {'code': 'no_eligible_jobs', 'message': 'No eligible jobs'},
        );
      final c = _ctrl(workdays: workdays, sessions: FakeSessionApi());
      final outcome = await c.startTodayDelivery(
        driverId: 'drv-1',
        selectJob: (_) async => 'x',
      );
      expect(outcome, DeliveryStartOutcome.failed);
      expect(c.errorMessage, contains('시작할 수 있는 배송이 없습니다'));
      expect(c.phase, DeliveryLifecyclePhase.idle);
    });

    test('8. restore Workday+Session', () async {
      final workdays = FakeWorkdayApi()..active = _wd();
      final sessions = FakeSessionApi()..active = _sess();
      final recorder = FakeRouteRecording();
      final c = _ctrl(workdays: workdays, sessions: sessions, recorder: recorder);
      await c.restoreOnBootstrap(driverId: 'drv-1');
      expect(c.phase, DeliveryLifecyclePhase.active);
      expect(recorder.startCount, 1);
    });

    test('9. restore active Workday/no Session', () async {
      final workdays = FakeWorkdayApi()..active = _wd();
      final c = _ctrl(workdays: workdays, sessions: FakeSessionApi());
      await c.restoreOnBootstrap(driverId: 'drv-1');
      expect(c.phase, DeliveryLifecyclePhase.activeNoSession);
    });

    test('10. restore legacy Session/no Workday', () async {
      final sessions = FakeSessionApi()..active = _sess(workdayId: null);
      final recorder = FakeRouteRecording();
      final c = _ctrl(
        workdays: FakeWorkdayApi(),
        sessions: sessions,
        recorder: recorder,
      );
      await c.restoreOnBootstrap(driverId: 'drv-1');
      expect(c.phase, DeliveryLifecyclePhase.active);
      expect(c.workday, isNull);
      expect(recorder.startCount, 1);
    });

    test('11. restore ending Workday+active Session → endRetryable', () async {
      final workdays = FakeWorkdayApi()
        ..active = _wd(status: 'ending', endedAt: DateTime.utc(2026, 8, 30));
      final sessions = FakeSessionApi()..active = _sess();
      final c = _ctrl(workdays: workdays, sessions: sessions);
      await c.restoreOnBootstrap(driverId: 'drv-1');
      expect(c.phase, DeliveryLifecyclePhase.endRetryable);
      expect(c.canStartDelivery, isFalse);
    });

    test('12. restore ending Workday+completed Session → finalize', () async {
      final workdays = FakeWorkdayApi()
        ..active = _wd(status: 'ending', endedAt: DateTime.utc(2026, 8, 30));
      final sessions = FakeSessionApi();
      final c = _ctrl(workdays: workdays, sessions: sessions);
      await c.restoreOnBootstrap(driverId: 'drv-1');
      expect(workdays.finalizeCalls, 1);
      expect(c.phase, DeliveryLifecyclePhase.idle);
    });

    test('13. mismatch safe handling', () async {
      final workdays = FakeWorkdayApi()..active = _wd(id: 'wd-a');
      final sessions = FakeSessionApi()..active = _sess(workdayId: 'wd-b');
      final c = _ctrl(workdays: workdays, sessions: sessions);
      await c.restoreOnBootstrap(driverId: 'drv-1');
      expect(c.stateMismatch, isTrue);
      expect(c.phase, DeliveryLifecyclePhase.endRetryable);
    });

    test('14. reconcile mid-day', () async {
      final workdays = FakeWorkdayApi()..active = _wd();
      final c = _ctrl(workdays: workdays, sessions: FakeSessionApi());
      await c.restoreOnBootstrap(driverId: 'drv-1');
      await c.reconcileAfterTodayRefresh();
      expect(workdays.reconcileCalls, greaterThanOrEqualTo(1));
    });

    test('15. detached Job not in selectableMembershipJobIds', () async {
      final workdays = FakeWorkdayApi()
        ..active = _wd(activeJobs: ['job-1'], detachedJobs: ['job-old']);
      final c = _ctrl(workdays: workdays, sessions: FakeSessionApi());
      await c.restoreOnBootstrap(driverId: 'drv-1');
      expect(c.selectableMembershipJobIds, ['job-1']);
      expect(c.selectableMembershipJobIds, isNot(contains('job-old')));
    });

    test('19-20. request-end incomplete warning', () async {
      final workdays = FakeWorkdayApi()..active = _wd();
      workdays.requestEndError = ApiException(
        message: 'Incomplete',
        statusCode: 409,
        body: {
          'code': 'incomplete_deliveries',
          'incompletePoints': 5,
          'requiresConfirmation': true,
        },
      );
      final sessions = FakeSessionApi()..active = _sess();
      final c = _ctrl(workdays: workdays, sessions: sessions);
      await c.restoreOnBootstrap(driverId: 'drv-1');

      final need = await c.endTodayDelivery(forceIncomplete: false);
      expect(need, 5);
      expect(c.phase, DeliveryLifecyclePhase.active);
    });

    test('22-26. end flow request-end → session → finalize', () async {
      final workdays = FakeWorkdayApi()..active = _wd();
      final sessions = FakeSessionApi()..active = _sess();
      final recorder = FakeRouteRecording();
      final c = _ctrl(workdays: workdays, sessions: sessions, recorder: recorder);
      await c.restoreOnBootstrap(driverId: 'drv-1');

      final result = await c.endTodayDelivery(forceIncomplete: true);
      expect(result, isNull);
      expect(workdays.requestEndCalls, 1);
      expect(sessions.endCalls, 1);
      expect(sessions.finalizeCalls, 1);
      expect(workdays.finalizeCalls, 1);
      expect(recorder.stopAcceptingCount, greaterThan(0));
      expect(recorder.flushCount, 1);
      expect(c.phase, DeliveryLifecyclePhase.idle);
    });

    test('23. ending blocks start', () async {
      final workdays = FakeWorkdayApi()
        ..active = _wd(status: 'ending', endedAt: DateTime.utc(2026, 8, 30));
      final sessions = FakeSessionApi()..active = _sess();
      final c = _ctrl(workdays: workdays, sessions: sessions);
      await c.restoreOnBootstrap(driverId: 'drv-1');
      final outcome = await c.startTodayDelivery(
        driverId: 'drv-1',
        selectJob: (_) async => 'job-1',
      );
      expect(outcome, DeliveryStartOutcome.blocked);
    });

    test('27. finalize retry after endRetryable', () async {
      final workdays = FakeWorkdayApi()
        ..active = _wd(status: 'ending', endedAt: DateTime.utc(2026, 8, 30));
      final sessions = FakeSessionApi()
        ..active = _sess(status: 'completed', endedAt: DateTime.utc(2026, 8, 30));
      // fetchActive returns completed? treat as no open — use null active
      sessions.active = null;
      final c = _ctrl(workdays: workdays, sessions: sessions);
      await c.restoreOnBootstrap(driverId: 'drv-1');
      expect(workdays.finalizeCalls, 1);
    });

    test('28. app kill after request-end → recovery UI', () async {
      final workdays = FakeWorkdayApi()
        ..active = _wd(status: 'ending', endedAt: DateTime.utc(2026, 8, 30));
      final sessions = FakeSessionApi()..active = _sess();
      final c = _ctrl(workdays: workdays, sessions: sessions);
      await c.restoreOnBootstrap(driverId: 'drv-1');
      expect(c.needsEndRecovery, isTrue);
      expect(c.canStartDelivery, isFalse);
    });

    test('31. same-day new Workday after completed (idle)', () async {
      final workdays = FakeWorkdayApi();
      final sessions = FakeSessionApi();
      final c = _ctrl(workdays: workdays, sessions: sessions);
      expect(c.canStartDelivery, isTrue);
      await c.startTodayDelivery(
        driverId: 'drv-1',
        selectJob: (ids) async => ids.first,
      );
      expect(c.phase, DeliveryLifecyclePhase.active);
    });

    test('32. logout clears local Workday/Session state', () async {
      final workdays = FakeWorkdayApi()..active = _wd();
      final sessions = FakeSessionApi()..active = _sess();
      final c = _ctrl(workdays: workdays, sessions: sessions);
      await c.restoreOnBootstrap(driverId: 'drv-1');
      await c.onSignOut();
      expect(c.workday, isNull);
      expect(c.session, isNull);
      expect(c.phase, DeliveryLifecyclePhase.idle);
      // Server workday not finalized by logout
      expect(workdays.finalizeCalls, 0);
    });

    test('legacy end without Workday', () async {
      final sessions = FakeSessionApi()..active = _sess(workdayId: null);
      final recorder = FakeRouteRecording();
      final workdays = FakeWorkdayApi();
      final c = _ctrl(workdays: workdays, sessions: sessions, recorder: recorder);
      await c.restoreOnBootstrap(driverId: 'drv-1');
      final r = await c.endTodayDelivery(forceIncomplete: true);
      expect(r, isNull);
      expect(workdays.requestEndCalls, 0);
      expect(sessions.finalizeCalls, 1);
      expect(recorder.flushCount, 1);
    });
  });

  group('B3 execution orchestration', () {
    test('flag OFF keeps B2 picker start', () async {
      final workdays = FakeWorkdayApi()
        ..active = _wd(activeJobs: ['job-a', 'job-b']);
      final sessions = FakeSessionApi();
      final c = _ctrl(
        workdays: workdays,
        sessions: sessions,
        workdayExecutionSessionV1: false,
      );

      var pickerCalled = false;
      await c.startTodayDelivery(
        driverId: 'drv-1',
        selectJob: (ids) async {
          pickerCalled = true;
          return ids.first;
        },
      );
      expect(pickerCalled, isTrue);
      expect(sessions.startCalls.single['jobId'], isNotNull);
    });

    test('flag ON new Workday skips picker and ensures execution', () async {
      final workdays = FakeWorkdayApi()
        ..active = _wd(activeJobs: ['job-a', 'job-b']);
      final sessions = FakeSessionApi();
      final recorder = FakeRouteRecording();
      final c = _ctrl(
        workdays: workdays,
        sessions: sessions,
        recorder: recorder,
        workdayExecutionSessionV1: true,
      );

      var pickerCalled = false;
      final outcome = await c.startTodayDelivery(
        driverId: 'drv-1',
        selectJob: (_) async {
          pickerCalled = true;
          return 'job-a';
        },
      );
      expect(outcome, DeliveryStartOutcome.started);
      expect(pickerCalled, isFalse);
      expect(sessions.startCalls.single['jobId'], isNull);
      expect(sessions.startCalls.single['workdayId'], 'wd-1');
      expect(c.session?.isExecutionSession, isTrue);
      expect(recorder.startCount, 1);
    });

    test(
      'regression: new B3 Workday with null executionSessionId is not B2',
      () async {
        final workdays = FakeWorkdayApi()
          ..active = _wd(
            activeJobs: ['job-a'],
            executionSessionId: null,
          );
        final sessions = FakeSessionApi();
        final c = _ctrl(
          workdays: workdays,
          sessions: sessions,
          workdayExecutionSessionV1: true,
        );

        var pickerCalled = false;
        final outcome = await c.startTodayDelivery(
          driverId: 'drv-1',
          selectJob: (_) async {
            pickerCalled = true;
            return 'job-a';
          },
        );
        expect(outcome, DeliveryStartOutcome.started);
        expect(pickerCalled, isFalse);
        expect(c.session?.isExecutionSession, isTrue);
        expect(sessions.startCalls.single['jobId'], isNull);
      },
    );

    test('duplicate B3 start does not create second session', () async {
      final workdays = FakeWorkdayApi()..active = _wd();
      final sessions = FakeSessionApi();
      final c = _ctrl(
        workdays: workdays,
        sessions: sessions,
        workdayExecutionSessionV1: true,
      );
      await c.startTodayDelivery(
        driverId: 'drv-1',
        selectJob: (_) async => throw StateError('picker'),
      );
      final firstId = c.session?.id;
      final outcome = await c.startTodayDelivery(
        driverId: 'drv-1',
        selectJob: (_) async => throw StateError('picker'),
      );
      expect(outcome, DeliveryStartOutcome.alreadyActive);
      expect(c.session?.id, firstId);
    });

    test('restore execution session from executionSessionId', () async {
      final workdays = FakeWorkdayApi()
        ..active = _wd(executionSessionId: 'sess-exec');
      final sessions = FakeSessionApi()
        ..active = _sess(
          id: 'sess-exec',
          jobId: null,
          sessionRole: 'workday_execution',
        );
      final recorder = FakeRouteRecording();
      final c = _ctrl(
        workdays: workdays,
        sessions: sessions,
        recorder: recorder,
        workdayExecutionSessionV1: true,
      );
      await c.restoreOnBootstrap(driverId: 'drv-1');
      expect(c.phase, DeliveryLifecyclePhase.active);
      expect(c.session?.isExecutionSession, isTrue);
      expect(recorder.startCount, 1);
    });

    test('restore auto-ensures when executionSessionId but no session', () async {
      final workdays = FakeWorkdayApi()
        ..active = _wd(executionSessionId: 'sess-exec');
      final sessions = FakeSessionApi();
      final recorder = FakeRouteRecording();
      final c = _ctrl(
        workdays: workdays,
        sessions: sessions,
        recorder: recorder,
        workdayExecutionSessionV1: true,
      );
      await c.restoreOnBootstrap(driverId: 'drv-1');
      expect(c.phase, DeliveryLifecyclePhase.active);
      expect(sessions.startCalls, hasLength(1));
      expect(sessions.startCalls.single['jobId'], isNull);
      expect(recorder.startCount, 1);
    });

    test('active B2 slice session is not converted when flag ON', () async {
      final workdays = FakeWorkdayApi()..active = _wd();
      final sessions = FakeSessionApi()
        ..active = _sess(
          jobId: 'job-1',
          sessionRole: 'workday_job_slice',
        );
      final c = _ctrl(
        workdays: workdays,
        sessions: sessions,
        workdayExecutionSessionV1: true,
      );
      await c.restoreOnBootstrap(driverId: 'drv-1');
      expect(c.session?.isJobBoundSession, isTrue);
      expect(c.session?.isExecutionSession, isFalse);
    });

    test('B2 activeNoSession without executionSessionId keeps picker', () async {
      final workdays = FakeWorkdayApi()..active = _wd();
      final c = _ctrl(
        workdays: workdays,
        sessions: FakeSessionApi(),
        workdayExecutionSessionV1: true,
      );
      await c.restoreOnBootstrap(driverId: 'drv-1');
      expect(c.phase, DeliveryLifecyclePhase.activeNoSession);
      expect(c.needsB2JobPicker, isTrue);
    });

    test('B3 end sets preferWorkdayReport', () async {
      final workdays = FakeWorkdayApi()..active = _wd();
      final sessions = FakeSessionApi()
        ..active = _sess(jobId: null, sessionRole: 'workday_execution');
      final c = _ctrl(
        workdays: workdays,
        sessions: sessions,
        workdayExecutionSessionV1: true,
      );
      await c.restoreOnBootstrap(driverId: 'drv-1');
      await c.endTodayDelivery(forceIncomplete: true);
      expect(c.preferWorkdayReport, isTrue);
      expect(c.lastCompletedWorkdayId, 'wd-1');
    });

    test('route recorder resumes same execution session id', () async {
      final workdays = FakeWorkdayApi()..active = _wd();
      final sessions = FakeSessionApi();
      final recorder = FakeRouteRecording();
      final c = _ctrl(
        workdays: workdays,
        sessions: sessions,
        recorder: recorder,
        workdayExecutionSessionV1: true,
      );
      await c.startTodayDelivery(
        driverId: 'drv-1',
        selectJob: (_) async => throw StateError('no picker'),
      );
      final sid = recorder.sessionId;
      await c.restoreOnBootstrap(driverId: 'drv-1');
      expect(recorder.sessionId, sid);
    });

    test('B3 session ensure sends workdayId without deliveryJobId', () async {
      final workdays = FakeWorkdayApi()..active = _wd();
      final sessions = FakeSessionApi();
      final c = _ctrl(
        workdays: workdays,
        sessions: sessions,
        workdayExecutionSessionV1: true,
      );
      await c.startTodayDelivery(
        driverId: 'drv-1',
        selectJob: (_) async => throw StateError('no picker'),
      );
      expect(sessions.startCalls.single.containsKey('workdayId'), isTrue);
      expect(sessions.startCalls.single['jobId'], isNull);
    });

    test(
      'cold restore: pending B3 marker ensures execution after process death',
      () async {
        SharedPreferences.setMockInitialValues({});
        await B3ExecutionPendingStore.mark('wd-1');
        final workdays = FakeWorkdayApi()
          ..active = _wd(
            executionSessionId: null,
            activeJobs: ['job-a'],
          );
        final sessions = FakeSessionApi();
        final recorder = FakeRouteRecording();
        final c = _ctrl(
          workdays: workdays,
          sessions: sessions,
          recorder: recorder,
          workdayExecutionSessionV1: true,
        );
        await c.restoreOnBootstrap(driverId: 'drv-1');
        expect(c.phase, DeliveryLifecyclePhase.active);
        expect(c.session?.isExecutionSession, isTrue);
        expect(c.needsB2JobPicker, isFalse);
        expect(recorder.startCount, 1);
        expect(sessions.startCalls.single['jobId'], isNull);
      },
    );

    test(
      'cold restore: no pending marker keeps B2 activeNoSession picker path',
      () async {
        SharedPreferences.setMockInitialValues({});
        final workdays = FakeWorkdayApi()
          ..active = _wd(
            executionSessionId: null,
            activeJobs: ['job-a'],
          );
        final sessions = FakeSessionApi();
        final c = _ctrl(
          workdays: workdays,
          sessions: sessions,
          workdayExecutionSessionV1: true,
        );
        await c.restoreOnBootstrap(driverId: 'drv-1');
        expect(c.phase, DeliveryLifecyclePhase.activeNoSession);
        expect(c.needsB2JobPicker, isTrue);
        expect(sessions.startCalls, isEmpty);
      },
    );
  });
}
