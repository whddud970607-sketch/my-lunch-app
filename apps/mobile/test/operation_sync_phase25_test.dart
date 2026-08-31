import 'dart:io';
import 'dart:math';

import 'package:delivery_shield_mobile/sync/sync.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// P0-A Phase 2.5: failure injection / crash recovery / ownership / perf.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory tempRoot;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    tempRoot = await Directory.systemTemp.createTemp('ds_p25_');
  });

  tearDown(() async {
    if (await tempRoot.exists()) {
      await tempRoot.delete(recursive: true);
    }
  });

  Future<SqliteOperationStore> openStore(String driverId) async {
    final store = SqliteOperationStore(
      databaseFactory: databaseFactoryFfi,
      supportDirectory: () async => tempRoot,
    );
    await store.openForDriver(driverId);
    return store;
  }

  Future<void> settle([int ms = 150]) =>
      Future<void>.delayed(Duration(milliseconds: ms));

  group('1. Failure injection A–J', () {
    Future<SyncOperation> enqueueReadyComplete(
      OperationSyncEngine engine,
      String driverId,
    ) {
      return engine.queue.enqueue(
        driverId: driverId,
        operationType: OperationType.deliveryComplete,
        entityType: OperationEntityType.deliveryPoint,
        entityId: 'p1',
        payload: {
          'pointId': 'p1',
          'storagePath': '$driverId/p1/op_x.jpg',
        },
      );
    }

    Future<({SyncOperation op, OperationStatus status, int retry})> runOnce({
      required String driverId,
      required DispatchOutcome outcome,
      CompletionProjectionStore? projections,
    }) async {
      final store = await openStore(driverId);
      final fake = FakeOperationDispatcher(outcomeBuilder: (_) => outcome);
      final engine = OperationSyncEngine(
        store: store,
        dispatcher: fake,
        retryClassifier: RetryClassifier(random: Random(1)),
        onOperationSettled: projections == null
            ? null
            : (op, o) {
                if (op.operationType != OperationType.deliveryComplete) return;
                switch (o.kind) {
                  case DispatchOutcomeKind.success:
                    projections.markSynced(op.entityId);
                  case DispatchOutcomeKind.permanentFailure:
                    projections.markFailed(
                      op.entityId,
                      errorCode: o.errorCode,
                    );
                  case DispatchOutcomeKind.conflict:
                    projections.markFailed(
                      op.entityId,
                      errorCode: o.errorCode,
                      conflict: true,
                    );
                  case DispatchOutcomeKind.transientFailure:
                  case DispatchOutcomeKind.authWait:
                    break;
                }
              },
      );
      await engine.bindDriver(driverId);
      projections?.markPending('p1');
      final op = await enqueueReadyComplete(engine, driverId);
      engine.wake();
      await settle();
      final after = await store.getById(op.operationId);
      final status = after?.status ?? OperationStatus.acked;
      final retry = after?.retryCount ?? -1;
      await engine.unbind();
      return (op: op, status: status, retry: retry);
    }

    test('A network unavailable → ready + retry, not deadLetter', () async {
      final r = await runOnce(
        driverId: 'd-net',
        outcome: DispatchOutcome.fail(
          DispatchOutcomeKind.transientFailure,
          'network_unavailable',
        ),
      );
      expect(r.status, OperationStatus.ready);
      expect(r.retry, greaterThan(0));
    });

    test('B timeout → ready + retry', () async {
      final r = await runOnce(
        driverId: 'd-to',
        outcome: DispatchOutcome.fail(
          DispatchOutcomeKind.transientFailure,
          'timeout',
        ),
      );
      expect(r.status, OperationStatus.ready);
      expect(r.retry, greaterThan(0));
    });

    test('C HTTP 429 → ready + retry', () async {
      final r = await runOnce(
        driverId: 'd-429',
        outcome: DispatchOutcome.fail(
          DispatchOutcomeKind.transientFailure,
          '429',
        ),
      );
      expect(r.status, OperationStatus.ready);
      expect(r.retry, greaterThan(0));
    });

    test('D HTTP 500 → ready + retry', () async {
      final r = await runOnce(
        driverId: 'd-500',
        outcome: DispatchOutcome.fail(
          DispatchOutcomeKind.transientFailure,
          '500',
        ),
      );
      expect(r.status, OperationStatus.ready);
    });

    test('E HTTP 503 → ready + retry', () async {
      final r = await runOnce(
        driverId: 'd-503',
        outcome: DispatchOutcome.fail(
          DispatchOutcomeKind.transientFailure,
          '503',
        ),
      );
      expect(r.status, OperationStatus.ready);
    });

    test('F HTTP 401 → ready + auth pause (kept)', () async {
      final store = await openStore('d-401');
      final fake = FakeOperationDispatcher(
        outcomeBuilder: (_) =>
            DispatchOutcome.fail(DispatchOutcomeKind.authWait, '401'),
      );
      final engine = OperationSyncEngine(store: store, dispatcher: fake);
      await engine.bindDriver('d-401');
      final op = await enqueueReadyComplete(engine, 'd-401');
      engine.wake();
      await settle();
      expect(engine.isPaused, isTrue);
      expect((await store.getById(op.operationId))!.status, OperationStatus.ready);
      await engine.unbind();
    });

    test('G HTTP 403 → deadLetter + projection failed', () async {
      final proj = CompletionProjectionStore();
      final r = await runOnce(
        driverId: 'd-403',
        outcome: DispatchOutcome.fail(
          DispatchOutcomeKind.permanentFailure,
          '403',
        ),
        projections: proj,
      );
      expect(r.status, OperationStatus.deadLetter);
      expect(proj.forPoint('p1')!.phase, LocalCompletionSyncPhase.failed);
    });

    test('H HTTP 404 → deadLetter', () async {
      final r = await runOnce(
        driverId: 'd-404',
        outcome: DispatchOutcome.fail(
          DispatchOutcomeKind.permanentFailure,
          '404',
        ),
      );
      expect(r.status, OperationStatus.deadLetter);
    });

    test('I HTTP 409 state conflict → conflictNeedsAttention', () async {
      final proj = CompletionProjectionStore();
      final r = await runOnce(
        driverId: 'd-409',
        outcome: DispatchOutcome.fail(DispatchOutcomeKind.conflict, '409'),
        projections: proj,
      );
      expect(r.status, OperationStatus.conflictNeedsAttention);
      expect(proj.forPoint('p1')!.phase, LocalCompletionSyncPhase.conflict);
    });

    test('J idempotency_payload_mismatch → deadLetter + conflict UI', () async {
      final proj = CompletionProjectionStore();
      final r = await runOnce(
        driverId: 'd-mismatch',
        outcome: DispatchOutcome.fail(
          DispatchOutcomeKind.permanentFailure,
          'idempotency_payload_mismatch',
        ),
        projections: proj,
      );
      expect(r.status, OperationStatus.deadLetter);
      expect(proj.forPoint('p1')!.phase, LocalCompletionSyncPhase.failed);
    });

    test('transient never deadLetters by retry count alone', () {
      final c = RetryClassifier(random: Random(0));
      for (var i = 0; i < 50; i++) {
        expect(c.classify(errorCode: '503', retryCount: i).moveToDeadLetter, isFalse);
      }
    });
  });

  group('2. POD crash windows', () {
    test('1 staging exists, enqueue not yet → orphan file only', () async {
      final rel = await PodUploadDispatcher.stageBytes(
        driverId: 'd-cw1',
        pointId: 'p1',
        operationId: 'op-pod-1',
        bytes: [1, 2, 3],
        supportDirectory: () async => tempRoot,
      );
      expect(File(p.join(tempRoot.path, rel)).existsSync(), isTrue);
      final store = await openStore('d-cw1');
      expect(await store.listByStatuses(OperationStatus.values), isEmpty);
      await store.close();
    });

    test('2 POD enqueued, upload not run → restart keeps ready', () async {
      final store = await openStore('d-cw2');
      final queue = OperationQueue(store: store);
      final pod = await queue.enqueue(
        driverId: 'd-cw2',
        operationType: OperationType.podUpload,
        entityType: OperationEntityType.deliveryPoint,
        entityId: 'p1',
        payload: {
          'pointId': 'p1',
          'localFileRef': 'pod_staging/x.jpg',
          'byteSize': 1,
          'checksum': 'c',
        },
      );
      await store.markInFlight(pod.operationId);
      await store.close();
      final store2 = await openStore('d-cw2');
      await store2.recoverAfterStartup();
      expect(
        (await store2.getById(pod.operationId))!.status,
        OperationStatus.ready,
      );
      await store2.close();
    });

    test('3 upload ok, dependency_results missing → Complete stays blocked',
        () async {
      final store = await openStore('d-cw3');
      final queue = OperationQueue(store: store);
      final pod = await queue.enqueue(
        driverId: 'd-cw3',
        operationType: OperationType.podUpload,
        entityType: OperationEntityType.deliveryPoint,
        entityId: 'p1',
        payload: {
          'pointId': 'p1',
          'localFileRef': 'f',
          'byteSize': 1,
          'checksum': 'c',
        },
      );
      final complete = await queue.enqueue(
        driverId: 'd-cw3',
        operationType: OperationType.deliveryComplete,
        entityType: OperationEntityType.deliveryPoint,
        entityId: 'p1',
        dependencyOperationId: pod.operationId,
        payload: {'pointId': 'p1'},
      );
      expect(complete.status, OperationStatus.blocked);
      expect(await store.getDependencyResult(pod.operationId), isNull);
      // Missing dependency row must NOT unlock Complete.
      await store.close();
      final engine = OperationSyncEngine(store: await openStore('d-cw3'));
      await engine.bindDriver('d-cw3');
      final again = await engine.store.getById(complete.operationId);
      expect(again!.status, OperationStatus.blocked);
      expect(again.payload['storagePath'], isNull);
      await engine.unbind();
    });

    test('4 dependency_results present → merge/unblock on restart', () async {
      final store = await openStore('d-cw4');
      final queue = OperationQueue(store: store);
      final pod = await queue.enqueue(
        driverId: 'd-cw4',
        operationType: OperationType.podUpload,
        entityType: OperationEntityType.deliveryPoint,
        entityId: 'p1',
        payload: {
          'pointId': 'p1',
          'localFileRef': 'f',
          'byteSize': 1,
          'checksum': 'c',
        },
      );
      final complete = await queue.enqueue(
        driverId: 'd-cw4',
        operationType: OperationType.deliveryComplete,
        entityType: OperationEntityType.deliveryPoint,
        entityId: 'p1',
        dependencyOperationId: pod.operationId,
        payload: {'pointId': 'p1'},
      );
      await store.saveDependencyResult(
        dependencyOperationId: pod.operationId,
        result: {'storagePath': 'd-cw4/p1/op.jpg', 'pointId': 'p1'},
      );
      await store.close();
      final engine = OperationSyncEngine(store: await openStore('d-cw4'));
      await engine.bindDriver('d-cw4');
      final unblocked = await engine.store.getById(complete.operationId);
      expect(unblocked!.status, OperationStatus.ready);
      expect(unblocked.payload['storagePath'], 'd-cw4/p1/op.jpg');
      await engine.unbind();
    });

    test('5–7 merge done / POD deleted / Complete ready survives', () async {
      final store = await openStore('d-cw5');
      final queue = OperationQueue(store: store);
      final pod = await queue.enqueue(
        driverId: 'd-cw5',
        operationType: OperationType.podUpload,
        entityType: OperationEntityType.deliveryPoint,
        entityId: 'p1',
        payload: {
          'pointId': 'p1',
          'localFileRef': 'f',
          'byteSize': 1,
          'checksum': 'c',
        },
      );
      final complete = await queue.enqueue(
        driverId: 'd-cw5',
        operationType: OperationType.deliveryComplete,
        entityType: OperationEntityType.deliveryPoint,
        entityId: 'p1',
        dependencyOperationId: pod.operationId,
        payload: {'pointId': 'p1'},
      );
      await store.saveDependencyResult(
        dependencyOperationId: pod.operationId,
        result: {'storagePath': 'd-cw5/p1/op.jpg', 'pointId': 'p1'},
      );
      await store.applyDependencyResultToDependents(
        dependencyOperationId: pod.operationId,
        result: {'storagePath': 'd-cw5/p1/op.jpg', 'pointId': 'p1'},
      );
      await store.markAcked(pod.operationId);
      await store.deleteAcked(pod.operationId);
      expect(await store.getById(pod.operationId), isNull);
      expect(await store.getDependencyResult(pod.operationId), isNotNull);
      final ready = await store.getById(complete.operationId);
      expect(ready!.status, OperationStatus.ready);
      expect(ready.payload['storagePath'], isNotNull);
      await store.close();
    });
  });

  group('3. Complete crash windows (client)', () {
    test('inFlight Complete → recover to ready for idempotent retry', () async {
      final store = await openStore('d-cc1');
      final queue = OperationQueue(store: store);
      final op = await queue.enqueue(
        driverId: 'd-cc1',
        operationType: OperationType.deliveryComplete,
        entityType: OperationEntityType.deliveryPoint,
        entityId: 'p1',
        payload: {
          'pointId': 'p1',
          'storagePath': 'd-cc1/p1/x.jpg',
        },
      );
      await store.markInFlight(op.operationId);
      await store.recoverAfterStartup();
      expect((await store.getById(op.operationId))!.status, OperationStatus.ready);
      await store.close();
    });

    test('ACK then local delete → op gone; projection can mark synced', () async {
      final proj = CompletionProjectionStore()..markPending('p1');
      final store = await openStore('d-cc2');
      final fake = FakeOperationDispatcher(
        outcomeBuilder: (_) => DispatchOutcome.success(),
      );
      final engine = OperationSyncEngine(
        store: store,
        dispatcher: fake,
        onOperationSettled: (op, o) {
          if (o.kind == DispatchOutcomeKind.success) {
            proj.markSynced(op.entityId);
          }
        },
      );
      await engine.bindDriver('d-cc2');
      final op = await engine.queue.enqueue(
        driverId: 'd-cc2',
        operationType: OperationType.deliveryComplete,
        entityType: OperationEntityType.deliveryPoint,
        entityId: 'p1',
        payload: {
          'pointId': 'p1',
          'storagePath': 'd-cc2/p1/x.jpg',
        },
      );
      engine.wake();
      await settle();
      expect(await store.getById(op.operationId), isNull);
      expect(proj.forPoint('p1')!.phase, LocalCompletionSyncPhase.synced);
      await engine.unbind();
    });
  });

  group('6. Queue ownership A→B→A', () {
    test('B never reads or dispatches A queue; A resumes', () async {
      final storeA = await openStore('driver-a');
      final fake = FakeOperationDispatcher(
        outcomeBuilder: (_) => DispatchOutcome.fail(
          DispatchOutcomeKind.transientFailure,
          'network_unavailable',
        ),
      );
      final engine = OperationSyncEngine(
        store: storeA,
        dispatcher: fake,
        retryClassifier: RetryClassifier(random: Random(1)),
      );
      await engine.bindDriver('driver-a');
      engine.pause();
      final opA = await engine.queue.enqueue(
        driverId: 'driver-a',
        operationType: OperationType.deliveryComplete,
        entityType: OperationEntityType.deliveryPoint,
        entityId: 'pA',
        payload: {
          'pointId': 'pA',
          'storagePath': 'driver-a/pA/x.jpg',
        },
      );
      await engine.unbind(); // logout A — must NOT delete queue
      expect(
        File(p.join(tempRoot.path, 'op_queue', 'driver-a', 'operations.db'))
            .existsSync(),
        isTrue,
      );

      final storeB = await openStore('driver-b');
      final fakeB = FakeOperationDispatcher();
      final engineB = OperationSyncEngine(store: storeB, dispatcher: fakeB);
      await engineB.bindDriver('driver-b');
      expect(await storeB.getById(opA.operationId), isNull);
      engineB.wake();
      await settle(80);
      expect(fakeB.dispatchedOperationIds, isEmpty);
      await engineB.unbind();

      final storeA2 = await openStore('driver-a');
      expect(await storeA2.getById(opA.operationId), isNotNull);
      await storeA2.close();
    });
  });

  group('7. SQLite integrity', () {
    test('v1 → v2 migration adds dependency_results', () async {
      final dir = Directory(p.join(tempRoot.path, 'op_queue', 'mig'));
      await dir.create(recursive: true);
      final dbPath = p.join(dir.path, 'operations.db');
      final db = await databaseFactoryFfi.openDatabase(
        dbPath,
        options: OpenDatabaseOptions(
          version: 1,
          onCreate: (db, _) async {
            await db.execute('''
CREATE TABLE operations (
  operation_id TEXT PRIMARY KEY NOT NULL,
  driver_id TEXT NOT NULL,
  session_id TEXT,
  workset_id TEXT,
  operation_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  client_created_at TEXT NOT NULL,
  local_seq INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  last_error_code TEXT,
  server_ack_at TEXT,
  schema_version INTEGER NOT NULL,
  dependency_operation_id TEXT,
  company_id TEXT,
  source TEXT,
  UNIQUE(driver_id, idempotency_key)
);
''');
            await db.execute(
              'CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);',
            );
            await db.insert('meta', {'key': 'schema_version', 'value': '1'});
          },
        ),
      );
      await db.close();

      final store = await openStore('mig');
      final tables = await store.debugDatabase!.rawQuery(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='dependency_results'",
      );
      expect(tables, isNotEmpty);
      await store.saveDependencyResult(
        dependencyOperationId: 'dep1',
        result: {'storagePath': 'x'},
      );
      expect(await store.getDependencyResult('dep1'), isNotNull);
      await store.close();
    });

    test('malformed row does not crash listDispatchable', () async {
      final store = await openStore('d-mal');
      final db = store.debugDatabase!;
      await db.insert('operations', {
        'operation_id': 'bad',
        'driver_id': 'd-mal',
        'operation_type': 'NOT_A_TYPE',
        'entity_type': 'delivery_point',
        'entity_id': 'p1',
        'payload_json': '{',
        'payload_hash': 'x',
        'client_created_at': 'not-a-date',
        'local_seq': 1,
        'idempotency_key': 'bad',
        'status': 'ready',
        'retry_count': 0,
        'schema_version': 2,
      });
      expect(
        await store.listDispatchable(now: DateTime.now().toUtc()),
        isEmpty,
      );
      await store.close();
    });
  });

  group('8. Staging file', () {
    test('deterministic path + missing file permanent', () async {
      final bytes = [9, 9, 9];
      final rel = await PodUploadDispatcher.stageBytes(
        driverId: 'd-st',
        pointId: 'p1',
        operationId: 'op1',
        bytes: bytes,
        supportDirectory: () async => tempRoot,
      );
      expect(rel, contains('pod_staging/d-st/p1/op_op1.jpg'));
      final checksum = PodUploadDispatcher.checksumSha256(bytes);
      final store = await openStore('d-st');
      final fake = FakeOperationDispatcher(
        outcomeBuilder: (op) {
          // Simulate PodUploadDispatcher missing-file outcome.
          return DispatchOutcome.fail(
            DispatchOutcomeKind.permanentFailure,
            'pod_file_missing',
          );
        },
      );
      final engine = OperationSyncEngine(store: store, dispatcher: fake);
      await engine.bindDriver('d-st');
      File(p.join(tempRoot.path, rel)).deleteSync();
      final pod = await engine.queue.enqueue(
        driverId: 'd-st',
        operationType: OperationType.podUpload,
        entityType: OperationEntityType.deliveryPoint,
        entityId: 'p1',
        payload: {
          'pointId': 'p1',
          'localFileRef': rel,
          'byteSize': bytes.length,
          'checksum': checksum,
        },
      );
      engine.wake();
      await settle();
      expect(
        (await store.getById(pod.operationId))!.status,
        OperationStatus.deadLetter,
      );
      await engine.unbind();
    });
  });

  group('9. Optimistic projection', () {
    test('pending → synced on success; failed on 403', () async {
      final proj = CompletionProjectionStore()..markPending('p1');
      expect(proj.forPoint('p1')!.phase, LocalCompletionSyncPhase.syncPending);
      proj.markSynced('p1');
      expect(proj.forPoint('p1')!.phase, LocalCompletionSyncPhase.synced);
      proj.markPending('p2');
      proj.markFailed('p2', errorCode: '403');
      expect(proj.forPoint('p2')!.phase, LocalCompletionSyncPhase.failed);
    });
  });

  group('10. Feature flag OFF semantics', () {
    test('default COMPLETE_VIA_SYNC_QUEUE is false in .env.example', () async {
      final example = File(
        p.join(
          Directory.current.path,
          '.env.example',
        ),
      );
      // test cwd may be apps/mobile
      final candidates = [
        example,
        File(p.join(Directory.current.path, 'apps/mobile/.env.example')),
      ];
      final f = candidates.firstWhere((c) => c.existsSync());
      final text = await f.readAsString();
      expect(text, contains('COMPLETE_VIA_SYNC_QUEUE=false'));
    });
  });

  group('11. Privacy / logging', () {
    test('logMetadata excludes payload', () async {
      final store = await openStore('d-priv');
      final queue = OperationQueue(store: store);
      final op = await queue.enqueue(
        driverId: 'd-priv',
        operationType: OperationType.deliveryComplete,
        entityType: OperationEntityType.deliveryPoint,
        entityId: 'p1',
        payload: {'pointId': 'p1', 'storagePath': 'a/b.jpg'},
      );
      final meta = op.logMetadata();
      expect(meta.containsKey('operationId'), isTrue);
      expect(meta.values.join(' '), isNot(contains('storagePath')));
      expect(meta.values.join(' '), isNot(contains('a/b.jpg')));
      await store.close();
    });

    test('payload rules block secrets', () {
      expect(
        () => OperationPayloadRules.validateOrThrow({'password': 'x'}),
        throwsArgumentError,
      );
      expect(
        () => OperationPayloadRules.validateOrThrow({'refresh_token': 'x'}),
        throwsArgumentError,
      );
      expect(
        () => OperationPayloadRules.validateOrThrow({'latitude': 1.0}),
        throwsArgumentError,
      );
    });
  });

  group('12. Performance smoke 300 / 1000', () {
    Future<void> measure(int n) async {
      final store = await openStore('d-perf-$n');
      final queue = OperationQueue(store: store);
      final sw = Stopwatch()..start();
      for (var i = 0; i < n; i++) {
        await queue.enqueue(
          driverId: 'd-perf-$n',
          operationType: OperationType.deliveryComplete,
          entityType: OperationEntityType.deliveryPoint,
          entityId: 'p$i',
          payload: {
            'pointId': 'p$i',
            'storagePath': 'd/p$i/x.jpg',
          },
        );
      }
      final enqueueMs = sw.elapsedMilliseconds;
      sw.reset();
      final ready = await store.listDispatchable(
        now: DateTime.now().toUtc(),
        limit: 50,
      );
      final queryMs = sw.elapsedMilliseconds;
      expect(ready.length, 50);
      // Smoke thresholds — not production claims.
      expect(enqueueMs, lessThan(n == 300 ? 15000 : 60000));
      expect(queryMs, lessThan(2000));
      await store.close();
    }

    test('300 ops enqueue + ready query', () async {
      await measure(300);
    }, timeout: const Timeout(Duration(minutes: 2)));

    test('1000 ops enqueue + ready query', () async {
      await measure(1000);
    }, timeout: const Timeout(Duration(minutes: 3)));
  });
}
