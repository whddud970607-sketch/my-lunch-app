import 'operation_entity_type.dart';
import 'operation_payload_rules.dart';
import 'operation_status.dart';
import 'operation_type.dart';

/// Current local operation row schema version (SQLite migrations).
const int kOperationSchemaVersion = 2;

/// Durable sync operation (client-owned until server ACK).
///
/// [companyId] / [source] are optional metadata hints only.
/// Server authorization must re-validate via entity assignment — never trust
/// these fields as permission proof.
class SyncOperation {
  const SyncOperation({
    required this.operationId,
    required this.driverId,
    required this.operationType,
    required this.entityType,
    required this.entityId,
    required this.payload,
    required this.payloadHash,
    required this.clientCreatedAt,
    required this.localSeq,
    required this.idempotencyKey,
    required this.status,
    required this.schemaVersion,
    this.sessionId,
    this.worksetId,
    this.retryCount = 0,
    this.nextRetryAt,
    this.lastErrorCode,
    this.serverAckAt,
    this.dependencyOperationId,
    this.companyId,
    this.source,
  });

  final String operationId;
  final String driverId;
  final String? sessionId;
  final String? worksetId;
  final OperationType operationType;
  final OperationEntityType entityType;
  final String entityId;
  final Map<String, dynamic> payload;
  final String payloadHash;
  final DateTime clientCreatedAt;
  final int localSeq;
  final String idempotencyKey;
  final OperationStatus status;
  final int retryCount;
  final DateTime? nextRetryAt;
  final String? lastErrorCode;
  final DateTime? serverAckAt;
  final int schemaVersion;
  final String? dependencyOperationId;

  /// Optional metadata only — NOT an authorization claim.
  final String? companyId;

  /// Optional provenance hint (e.g. driver_app) — NOT an authorization claim.
  final String? source;

  SyncOperation copyWith({
    OperationStatus? status,
    int? retryCount,
    DateTime? nextRetryAt,
    String? lastErrorCode,
    DateTime? serverAckAt,
    int? localSeq,
    Map<String, dynamic>? payload,
    String? payloadHash,
    bool clearNextRetryAt = false,
    bool clearLastErrorCode = false,
    bool clearServerAckAt = false,
  }) {
    return SyncOperation(
      operationId: operationId,
      driverId: driverId,
      sessionId: sessionId,
      worksetId: worksetId,
      operationType: operationType,
      entityType: entityType,
      entityId: entityId,
      payload: payload ?? this.payload,
      payloadHash: payloadHash ?? this.payloadHash,
      clientCreatedAt: clientCreatedAt,
      localSeq: localSeq ?? this.localSeq,
      idempotencyKey: idempotencyKey,
      status: status ?? this.status,
      retryCount: retryCount ?? this.retryCount,
      nextRetryAt: clearNextRetryAt ? null : (nextRetryAt ?? this.nextRetryAt),
      lastErrorCode:
          clearLastErrorCode ? null : (lastErrorCode ?? this.lastErrorCode),
      serverAckAt: clearServerAckAt ? null : (serverAckAt ?? this.serverAckAt),
      schemaVersion: schemaVersion,
      dependencyOperationId: dependencyOperationId,
      companyId: companyId,
      source: source,
    );
  }

  /// Safe metadata for logs — never includes payload contents.
  Map<String, String?> logMetadata() => {
        'operationId': operationId,
        'type': operationType.wireName,
        'status': status.name,
        'errorCode': lastErrorCode,
      };

  factory SyncOperation.create({
    required String operationId,
    required String driverId,
    required OperationType operationType,
    required OperationEntityType entityType,
    required String entityId,
    required Map<String, dynamic> payload,
    required int localSeq,
    String? sessionId,
    String? worksetId,
    String? idempotencyKey,
    String? dependencyOperationId,
    String? companyId,
    String? source,
    DateTime? clientCreatedAt,
    OperationStatus status = OperationStatus.ready,
  }) {
    OperationPayloadRules.validateOrThrow(payload);
    final created = clientCreatedAt ?? DateTime.now().toUtc();
    final hash = OperationPayloadRules.hashPayload(payload);
    return SyncOperation(
      operationId: operationId,
      driverId: driverId,
      sessionId: sessionId,
      worksetId: worksetId,
      operationType: operationType,
      entityType: entityType,
      entityId: entityId,
      payload: Map<String, dynamic>.from(payload),
      payloadHash: hash,
      clientCreatedAt: created,
      localSeq: localSeq,
      idempotencyKey: idempotencyKey ?? operationId,
      status: status,
      schemaVersion: kOperationSchemaVersion,
      dependencyOperationId: dependencyOperationId,
      companyId: companyId,
      source: source ?? 'driver_app',
    );
  }
}
