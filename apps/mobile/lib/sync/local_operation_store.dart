import 'sync_operation.dart';
import 'operation_status.dart';

/// Durable operation persistence.
///
/// Implementations may later swap in encrypted SQLite (SQLCipher) without
/// changing callers — see TODO on [OperationPayloadRules].
abstract class LocalOperationStore {
  /// Opens (or creates) the store for a single [driverId]. Never opens another driver's DB.
  Future<void> openForDriver(String driverId);

  /// Closes DB handle; does not delete files.
  Future<void> close();

  String? get activeDriverId;

  /// Crash recovery: inFlight → ready (or blocked if dependency unmet).
  Future<int> recoverAfterStartup();

  Future<SyncOperation> enqueue(SyncOperation operation);

  Future<int> nextLocalSeq();

  Future<SyncOperation?> getById(String operationId);

  Future<List<SyncOperation>> listByStatuses(
    Iterable<OperationStatus> statuses, {
    int? limit,
  });

  /// Ready ops whose nextRetryAt is null or <= now, FIFO by localSeq.
  Future<List<SyncOperation>> listDispatchable({
    required DateTime now,
    int limit = 20,
  });

  Future<SyncOperation?> findDependency(String dependencyOperationId);

  Future<void> markInFlight(String operationId);

  Future<void> markRetry({
    required String operationId,
    required int retryCount,
    required DateTime nextRetryAt,
    required String errorCode,
  });

  Future<void> markStatus({
    required String operationId,
    required OperationStatus status,
    String? errorCode,
    DateTime? serverAckAt,
    bool clearNextRetryAt = false,
  });

  Future<void> markAcked(String operationId, {DateTime? serverAckAt});

  Future<void> deleteAcked(String operationId);

  Future<int> deleteAllAcked();

  Future<int> countForDriver();

  /// Durable proof that [dependencyOperationId] succeeded (e.g. storagePath).
  /// Missing row must NEVER be treated as success.
  Future<void> saveDependencyResult({
    required String dependencyOperationId,
    required Map<String, dynamic> result,
  });

  Future<Map<String, dynamic>?> getDependencyResult(String dependencyOperationId);

  /// Merge [result] into blocked dependents' payloads and set them ready.
  /// Must run BEFORE deleting the dependency operation row.
  Future<int> applyDependencyResultToDependents({
    required String dependencyOperationId,
    required Map<String, dynamic> result,
  });
}
