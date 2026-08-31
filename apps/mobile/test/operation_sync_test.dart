import 'dart:io';
import 'dart:math';

import 'package:delivery_shield_mobile/sync/sync.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory tempRoot;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    tempRoot = await Directory.systemTemp.createTemp('ds_op_queue_');
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

  group('OperationPayloadRules', () {
    test('rejects prohibited secret/PII/GPS/POD keys', () {
      expect(
        () => OperationPayloadRules.validateOrThrow({'access_token': 'x'}),
        throwsArgumentError,
      );
      expect(
        () => OperationPayloadRules.validateOrThrow({'latitude': 1}),
        throwsArgumentError,
      );
    });

    test('allows reference-only payload', () {
      expect(
        () => OperationPayloadRules.validateOrThrow({
          'pointId': 'p1',
          'storagePath': 'driver/p1/a.jpg',
          'localFileRef': 'pod_staging/d/p/op.jpg',
        }),
        returnsNormally,
      );
    });
  });

  group('RetryClassifier', () {
    test('transient never deadLetters by count', () {
      final c = RetryClassifier(random: Random(1));
      final d = c.classify(errorCode: '503', retryCount: 99);
      expect(d.moveToDeadLetter, isFalse);
    });

    test('permanent and 401', () {
      final c = RetryClassifier(random: Random(1));
      expect(c.classify(errorCode: '403').moveToDeadLetter, isTrue);
      expect(c.classify(errorCode: '401').pauseSync, isTrue);
    });
  });

  group('dependency results (Phase 2 semantics)', () {
    test('missing dependency row is NOT treated as success', () async {
      final store = await openStore('driver-a');
      final queue = OperationQueue(store: store);
      final complete = await queue.enqueue(
        driverId: 'driver-a',
        operationType: OperationType.deliveryComplete,
        entityType: OperationEntityType.deliveryPoint,
        entityId: 'p1',
        payload: {'pointId': 'p1'},
        dependencyOperationId: 'missing-dep-id',
      );
      expect(complete.status, OperationStatus.blocked);
      expect(await store.getDependencyResult('missing-dep-id'), isNull);
      await store.close();
    });

    test('POD result unlocks Complete with storagePath before cleanup', () async {
      final store = await openStore('driver-a');
      final fake = FakeOperationDispatcher(
        outcomeBuilder: (op) {
          if (op.operationType == OperationType.podUpload) {
            return DispatchOutcome.success(result: {
              'storagePath': 'driver-a/p1/op_${op.operationId}.jpg',
              'pointId': 'p1',
            });
          }
          expect(op.payload['storagePath'], isNotNull);
          return DispatchOutcome.success();
        },
      );
      final engine = OperationSyncEngine(store: store, dispatcher: fake);
      await engine.bindDriver('driver-a');

      final pod = await engine.queue.enqueue(
        driverId: 'driver-a',
        operationType: OperationType.podUpload,
        entityType: OperationEntityType.deliveryPoint,
        entityId: 'p1',
        payload: {
          'pointId': 'p1',
          'localFileRef': 'pod_staging/x.jpg',
          'contentType': 'image/jpeg',
          'byteSize': 1,
          'checksum': 'abc',
        },
      );
      final complete = await engine.queue.enqueue(
        driverId: 'driver-a',
        operationType: OperationType.deliveryComplete,
        entityType: OperationEntityType.deliveryPoint,
        entityId: 'p1',
        dependencyOperationId: pod.operationId,
        payload: {'pointId': 'p1'},
      );
      expect(complete.status, OperationStatus.blocked);

      // Simulate durable result path without real upload file:
      await store.saveDependencyResult(
        dependencyOperationId: pod.operationId,
        result: {
          'storagePath': 'driver-a/p1/op_${pod.operationId}.jpg',
          'pointId': 'p1',
        },
      );
      await store.applyDependencyResultToDependents(
        dependencyOperationId: pod.operationId,
        result: {
          'storagePath': 'driver-a/p1/op_${pod.operationId}.jpg',
          'pointId': 'p1',
        },
      );
      final unblocked = await store.getById(complete.operationId);
      expect(unblocked!.status, OperationStatus.ready);
      expect(unblocked.payload['storagePath'], contains('driver-a/p1/'));

      // After apply, POD may be ACKed/deleted; Complete still has storagePath.
      await store.markAcked(pod.operationId);
      await store.deleteAcked(pod.operationId);
      expect(await store.getById(pod.operationId), isNull);
      expect(
        await store.getDependencyResult(pod.operationId),
        isNotNull,
        reason: 'dependency_results must survive op cleanup',
      );

      await engine.unbind();
    });

    test('engine success path writes result before deleting POD', () async {
      final store = await openStore('driver-b');
      final fake = FakeOperationDispatcher(
        outcomeBuilder: (op) => DispatchOutcome.success(result: {
          'storagePath': 'driver-b/p1/op_x.jpg',
          'pointId': 'p1',
        }),
      );
      final engine = OperationSyncEngine(store: store, dispatcher: fake);
      await engine.bindDriver('driver-b');
      final pod = await engine.queue.enqueue(
        driverId: 'driver-b',
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
      await engine.queue.enqueue(
        driverId: 'driver-b',
        operationType: OperationType.deliveryComplete,
        entityType: OperationEntityType.deliveryPoint,
        entityId: 'p1',
        dependencyOperationId: pod.operationId,
        payload: {'pointId': 'p1'},
      );
      engine.wake();
      await Future<void>.delayed(const Duration(milliseconds: 120));
      expect(await store.getDependencyResult(pod.operationId), isNotNull);
      await engine.unbind();
    });
  });

  group('SqliteOperationStore + Queue basics', () {
    test('enqueue persists and survives reopen', () async {
      final store = await openStore('driver-a');
      final queue = OperationQueue(store: store);
      final op = await queue.enqueue(
        driverId: 'driver-a',
        operationType: OperationType.deliveryComplete,
        entityType: OperationEntityType.deliveryPoint,
        entityId: 'point-1',
        payload: {'pointId': 'point-1', 'storagePath': 'driver-a/point-1/x.jpg'},
      );
      await store.close();
      final store2 = await openStore('driver-a');
      expect(await store2.getById(op.operationId), isNotNull);
      await store2.close();
    });

    test('inFlight crash recovery', () async {
      final store = await openStore('driver-a');
      final queue = OperationQueue(store: store);
      final op = await queue.enqueue(
        driverId: 'driver-a',
        operationType: OperationType.podUpload,
        entityType: OperationEntityType.deliveryPoint,
        entityId: 'p1',
        payload: {'pointId': 'p1', 'localFileRef': 'f', 'byteSize': 1, 'checksum': 'c'},
      );
      await store.markInFlight(op.operationId);
      await store.recoverAfterStartup();
      expect((await store.getById(op.operationId))!.status, OperationStatus.ready);
      await store.close();
    });

    test('owner mismatch and isolation', () async {
      final store = await openStore('driver-a');
      final queue = OperationQueue(store: store);
      expect(
        () => queue.enqueue(
          driverId: 'driver-b',
          operationType: OperationType.podUpload,
          entityType: OperationEntityType.deliveryPoint,
          entityId: 'p1',
          payload: {'pointId': 'p1', 'localFileRef': 'f', 'byteSize': 1, 'checksum': 'c'},
        ),
        throwsStateError,
      );
      await store.close();
      final pathA = p.join(tempRoot.path, 'op_queue', 'driver-a', 'operations.db');
      expect(File(pathA).existsSync(), isTrue);
    });
  });

  group('OperationSyncEngine', () {
    test('pause/resume and other driver not dispatched', () async {
      final fake = FakeOperationDispatcher();
      final store = await openStore('driver-a');
      final engine = OperationSyncEngine(store: store, dispatcher: fake);
      await engine.bindDriver('driver-a');
      engine.pause();
      await engine.queue.enqueue(
        driverId: 'driver-a',
        operationType: OperationType.podUpload,
        entityType: OperationEntityType.deliveryPoint,
        entityId: 'p1',
        payload: {'pointId': 'p1', 'localFileRef': 'f', 'byteSize': 1, 'checksum': 'c'},
      );
      engine.wake();
      await Future<void>.delayed(const Duration(milliseconds: 40));
      expect(fake.dispatchedOperationIds, isEmpty);
      engine.resume();
      await Future<void>.delayed(const Duration(milliseconds: 80));
      expect(fake.dispatchedOperationIds, isNotEmpty);
      await engine.unbind();
    });
  });

  group('CompletionProjectionStore', () {
    test('optimistic phases', () {
      final store = CompletionProjectionStore();
      store.markPending('p1');
      expect(store.forPoint('p1')!.phase, LocalCompletionSyncPhase.syncPending);
      store.markSynced('p1');
      expect(store.forPoint('p1')!.phase, LocalCompletionSyncPhase.synced);
      store.markFailed('p1', conflict: true);
      expect(store.forPoint('p1')!.phase, LocalCompletionSyncPhase.conflict);
    });
  });
}
