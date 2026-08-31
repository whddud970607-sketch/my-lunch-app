import 'package:uuid/uuid.dart';

import 'local_operation_store.dart';
import 'operation_entity_type.dart';
import 'operation_payload_rules.dart';
import 'operation_status.dart';
import 'operation_type.dart';
import 'sqlite_operation_store.dart';
import 'sync_operation.dart';

/// Enqueues durable operations for the active driver only.
class OperationQueue {
  OperationQueue({
    required LocalOperationStore this._store,
    Uuid? uuid,
  }) : _uuid = uuid ?? const Uuid();

  final LocalOperationStore _store;
  final Uuid _uuid;

  String? get activeDriverId => _store.activeDriverId;

  Future<SyncOperation> enqueue({
    required String driverId,
    required OperationType operationType,
    required OperationEntityType entityType,
    required String entityId,
    required Map<String, dynamic> payload,
    String? sessionId,
    String? worksetId,
    String? idempotencyKey,
    String? dependencyOperationId,
    String? companyId,
    String? source,
    String? operationId,
  }) async {
    final active = _store.activeDriverId;
    if (active == null) {
      throw StateError('queue store not open');
    }
    if (active != driverId) {
      throw StateError('refusing enqueue: driver ownership mismatch');
    }
    OperationPayloadRules.validateOrThrow(payload);

    var status = OperationStatus.ready;
    if (dependencyOperationId != null) {
      // Strict: only unblock when durable dependency_results exists (or payload
      // already has required result fields). Missing op row alone is NOT success.
      final result =
          await _store.getDependencyResult(dependencyOperationId);
      if (result == null) {
        status = OperationStatus.blocked;
      }
    }

    final seq = await _store.nextLocalSeq();
    final op = SyncOperation.create(
      operationId: operationId ?? _uuid.v4(),
      driverId: driverId,
      operationType: operationType,
      entityType: entityType,
      entityId: entityId,
      payload: payload,
      localSeq: seq,
      sessionId: sessionId,
      worksetId: worksetId,
      idempotencyKey: idempotencyKey,
      dependencyOperationId: dependencyOperationId,
      companyId: companyId,
      source: source,
      status: status,
    );

    final store = _store;
    if (store is SqliteOperationStore) {
      return store.runInTransaction((txn) async {
        return store.enqueueInTransaction(txn, op);
      });
    }
    return _store.enqueue(op);
  }
}
