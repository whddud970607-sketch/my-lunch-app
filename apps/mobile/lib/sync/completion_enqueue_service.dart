import 'package:uuid/uuid.dart';

import 'completion_projection_store.dart';
import 'operation_entity_type.dart';
import 'operation_sync_engine.dart';
import 'operation_type.dart';
import 'pod_upload_dispatcher.dart';
import 'sync_operation.dart';

/// Enqueues POD_UPLOAD + DELIVERY_COMPLETE with durable dependency linkage.
class CompletionEnqueueService {
  CompletionEnqueueService({
    required OperationSyncEngine syncEngine,
    required CompletionProjectionStore projections,
    Uuid? uuid,
  })  : _engine = syncEngine,
        _projections = projections,
        _uuid = uuid ?? const Uuid();

  final OperationSyncEngine _engine;
  final CompletionProjectionStore _projections;
  final Uuid _uuid;

  /// Stages photo, enqueues POD then blocked Complete. Returns immediately after durable write.
  Future<({SyncOperation pod, SyncOperation complete})> enqueueCompletion({
    required String driverId,
    required String pointId,
    required List<int> imageBytes,
    String contentType = 'image/jpeg',
  }) async {
    if (_engine.boundDriverId != driverId) {
      throw StateError('sync engine not bound to driver');
    }

    final podId = _uuid.v4();
    final completeId = _uuid.v4();
    final localFileRef = await PodUploadDispatcher.stageBytes(
      driverId: driverId,
      pointId: pointId,
      operationId: podId,
      bytes: imageBytes,
    );
    final checksum = PodUploadDispatcher.checksumSha256(imageBytes);

    final pod = await _engine.queue.enqueue(
      driverId: driverId,
      operationId: podId,
      operationType: OperationType.podUpload,
      entityType: OperationEntityType.deliveryPoint,
      entityId: pointId,
      idempotencyKey: podId,
      payload: {
        'pointId': pointId,
        'localFileRef': localFileRef,
        'contentType': contentType,
        'byteSize': imageBytes.length,
        'checksum': checksum,
      },
    );

    final complete = await _engine.queue.enqueue(
      driverId: driverId,
      operationId: completeId,
      operationType: OperationType.deliveryComplete,
      entityType: OperationEntityType.deliveryPoint,
      entityId: pointId,
      idempotencyKey: completeId,
      dependencyOperationId: pod.operationId,
      payload: {
        'pointId': pointId,
        // storagePath filled after POD dependency_results
      },
    );

    _projections.markPending(pointId);
    _engine.wake();
    return (pod: pod, complete: complete);
  }
}
