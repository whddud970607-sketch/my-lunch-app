import '../services/api_client.dart';
import '../services/api_exception.dart';
import 'operation_dispatcher.dart';
import 'operation_type.dart';
import 'sync_operation.dart';

/// Calls Nest idempotent complete API.
class DeliveryCompleteDispatcher implements OperationDispatcher {
  DeliveryCompleteDispatcher(this._api);

  final ApiClient _api;

  @override
  Future<DispatchOutcome> dispatch(SyncOperation operation) async {
    if (operation.operationType != OperationType.deliveryComplete) {
      return DispatchOutcome.fail(
        DispatchOutcomeKind.permanentFailure,
        'wrong_type',
      );
    }
    final pointId = operation.payload['pointId'] as String? ?? operation.entityId;
    final storagePath = operation.payload['storagePath'] as String?;
    if (storagePath == null || storagePath.isEmpty) {
      return DispatchOutcome.fail(
        DispatchOutcomeKind.permanentFailure,
        'validation_missing_storage_path',
      );
    }

    try {
      await _api.postJson('/delivery/points/$pointId/complete', {
        'idempotencyKey': operation.idempotencyKey,
        'payloadHash': operation.payloadHash,
        'storagePath': storagePath,
      });
      return DispatchOutcome.success();
    } on ApiException catch (e) {
      final code = e.statusCode;
      if (code == 401) {
        return DispatchOutcome.fail(DispatchOutcomeKind.authWait, '401');
      }
      if (code == 403) {
        return DispatchOutcome.fail(
          DispatchOutcomeKind.permanentFailure,
          '403',
        );
      }
      if (code == 404) {
        return DispatchOutcome.fail(
          DispatchOutcomeKind.permanentFailure,
          '404',
        );
      }
      if (code == 409) {
        final msg = e.message.toLowerCase();
        if (msg.contains('idempotency')) {
          return DispatchOutcome.fail(
            DispatchOutcomeKind.permanentFailure,
            'idempotency_payload_mismatch',
          );
        }
        return DispatchOutcome.fail(DispatchOutcomeKind.conflict, '409');
      }
      if (code != null && code >= 500) {
        return DispatchOutcome.fail(
          DispatchOutcomeKind.transientFailure,
          '$code',
        );
      }
      if (code == 429) {
        return DispatchOutcome.fail(
          DispatchOutcomeKind.transientFailure,
          '429',
        );
      }
      if (code == 400) {
        return DispatchOutcome.fail(
          DispatchOutcomeKind.permanentFailure,
          'validation_failure',
        );
      }
      return DispatchOutcome.fail(
        DispatchOutcomeKind.transientFailure,
        'network_unavailable',
      );
    } catch (_) {
      return DispatchOutcome.fail(
        DispatchOutcomeKind.transientFailure,
        'network_unavailable',
      );
    }
  }
}
