import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

import 'local_operation_store.dart';
import 'operation_entity_type.dart';
import 'operation_payload_rules.dart';
import 'operation_status.dart';
import 'operation_type.dart';
import 'sync_operation.dart';

/// SQLite-backed [LocalOperationStore] under app sandbox.
///
/// Path: `{support}/op_queue/{driverId}/operations.db`
/// No SharedPreferences. No POD binaries in DB.
class SqliteOperationStore implements LocalOperationStore {
  SqliteOperationStore({
    DatabaseFactory? this._databaseFactory,
    Future<Directory> Function()? supportDirectory,
  }) : _supportDirectory =
            supportDirectory ?? getApplicationSupportDirectory;

  final DatabaseFactory? _databaseFactory;
  final Future<Directory> Function() _supportDirectory;

  Database? _db;
  String? _driverId;

  @override
  String? get activeDriverId => _driverId;

  DatabaseFactory get _factory => _databaseFactory ?? databaseFactory;

  @override
  Future<void> openForDriver(String driverId) async {
    if (driverId.isEmpty) {
      throw ArgumentError('driverId required');
    }
    if (_db != null && _driverId == driverId) return;
    await close();

    final root = await _supportDirectory();
    final dir = Directory(p.join(root.path, 'op_queue', driverId));
    await dir.create(recursive: true);
    final dbPath = p.join(dir.path, 'operations.db');

    _db = await _factory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: kOperationSchemaVersion,
        onCreate: (db, version) async {
          await _createV1(db);
          await _createV2(db);
          await db.insert('meta', {
            'key': 'schema_version',
            'value': '$kOperationSchemaVersion',
          });
        },
        onUpgrade: (db, oldVersion, newVersion) async {
          if (oldVersion < 2) {
            await _createV2(db);
            await db.insert(
              'meta',
              {'key': 'schema_version', 'value': '2'},
              conflictAlgorithm: ConflictAlgorithm.replace,
            );
          }
        },
      ),
    );
    _driverId = driverId;
  }

  Future<void> _createV1(Database db) async {
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
      'CREATE INDEX idx_ops_driver_status_seq ON operations(driver_id, status, local_seq);',
    );
    await db.execute(
      'CREATE INDEX idx_ops_driver_retry ON operations(driver_id, next_retry_at);',
    );
    await db.execute('''
CREATE TABLE meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
''');
  }

  Future<void> _createV2(Database db) async {
    await db.execute('''
CREATE TABLE IF NOT EXISTS dependency_results (
  dependency_operation_id TEXT PRIMARY KEY NOT NULL,
  driver_id TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
''');
  }

  Database get _requireDb {
    final db = _db;
    final driverId = _driverId;
    if (db == null || driverId == null) {
      throw StateError('LocalOperationStore not open');
    }
    return db;
  }

  /// Test/diagnostics only — never auto-delete on failure.
  @visibleForTesting
  Database? get debugDatabase => _db;

  void _assertOwner(String driverId) {
    if (_driverId != driverId) {
      throw StateError('owner mismatch: store driver differs from operation');
    }
  }

  @override
  Future<void> close() async {
    final db = _db;
    _db = null;
    _driverId = null;
    if (db != null) {
      await db.close();
    }
  }

  @override
  Future<int> recoverAfterStartup() async {
    final db = _requireDb;
    final driverId = _driverId!;
    // inFlight at crash → ready so drain can retry (server idempotent later).
    return db.update(
      'operations',
      {
        'status': OperationStatus.ready.name,
        'last_error_code': 'recovered_inflight',
      },
      where: 'driver_id = ? AND status = ?',
      whereArgs: [driverId, OperationStatus.inFlight.name],
    );
  }

  @override
  Future<int> nextLocalSeq() async {
    final db = _requireDb;
    final rows = await db.rawQuery(
      'SELECT MAX(local_seq) AS m FROM operations WHERE driver_id = ?',
      [_driverId],
    );
    final max = rows.first['m'] as int?;
    return (max ?? 0) + 1;
  }

  @override
  Future<SyncOperation> enqueue(SyncOperation operation) async {
    _assertOwner(operation.driverId);
    final db = _requireDb;
    await db.insert('operations', _toRow(operation));
    return operation;
  }

  /// Enqueue inside an explicit transaction (caller may batch).
  Future<T> runInTransaction<T>(Future<T> Function(Transaction txn) action) {
    return _requireDb.transaction(action);
  }

  Future<SyncOperation> enqueueInTransaction(
    Transaction txn,
    SyncOperation operation,
  ) async {
    _assertOwner(operation.driverId);
    await txn.insert('operations', _toRow(operation));
    return operation;
  }

  @override
  Future<SyncOperation?> getById(String operationId) async {
    final db = _requireDb;
    final rows = await db.query(
      'operations',
      where: 'operation_id = ? AND driver_id = ?',
      whereArgs: [operationId, _driverId],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return _fromRow(rows.first);
  }

  @override
  Future<List<SyncOperation>> listByStatuses(
    Iterable<OperationStatus> statuses, {
    int? limit,
  }) async {
    final db = _requireDb;
    final list = statuses.toList();
    if (list.isEmpty) return [];
    final placeholders = List.filled(list.length, '?').join(',');
    final rows = await db.query(
      'operations',
      where: 'driver_id = ? AND status IN ($placeholders)',
      whereArgs: [_driverId, ...list.map((s) => s.name)],
      orderBy: 'local_seq ASC',
      limit: limit,
    );
    return _mapRowsSafe(rows);
  }

  @override
  Future<List<SyncOperation>> listDispatchable({
    required DateTime now,
    int limit = 20,
  }) async {
    final db = _requireDb;
    final nowIso = now.toUtc().toIso8601String();
    final rows = await db.rawQuery(
      '''
SELECT * FROM operations
WHERE driver_id = ?
  AND status = ?
  AND (next_retry_at IS NULL OR next_retry_at <= ?)
ORDER BY local_seq ASC
LIMIT ?
''',
      [
        _driverId,
        OperationStatus.ready.name,
        nowIso,
        limit,
      ],
    );
    return _mapRowsSafe(rows);
  }

  @override
  Future<SyncOperation?> findDependency(String dependencyOperationId) {
    return getById(dependencyOperationId);
  }

  @override
  Future<void> markInFlight(String operationId) async {
    await markStatus(
      operationId: operationId,
      status: OperationStatus.inFlight,
      clearNextRetryAt: true,
    );
  }

  @override
  Future<void> markRetry({
    required String operationId,
    required int retryCount,
    required DateTime nextRetryAt,
    required String errorCode,
  }) async {
    final db = _requireDb;
    final n = await db.update(
      'operations',
      {
        'status': OperationStatus.ready.name,
        'retry_count': retryCount,
        'next_retry_at': nextRetryAt.toUtc().toIso8601String(),
        'last_error_code': errorCode,
      },
      where: 'operation_id = ? AND driver_id = ?',
      whereArgs: [operationId, _driverId],
    );
    if (n == 0) {
      throw StateError('operation not found for markRetry');
    }
  }

  @override
  Future<void> markStatus({
    required String operationId,
    required OperationStatus status,
    String? errorCode,
    DateTime? serverAckAt,
    bool clearNextRetryAt = false,
  }) async {
    final db = _requireDb;
    final map = <String, Object?>{
      'status': status.name,
    };
    if (errorCode != null) map['last_error_code'] = errorCode;
    if (serverAckAt != null) {
      map['server_ack_at'] = serverAckAt.toUtc().toIso8601String();
    }
    if (clearNextRetryAt) map['next_retry_at'] = null;
    final n = await db.update(
      'operations',
      map,
      where: 'operation_id = ? AND driver_id = ?',
      whereArgs: [operationId, _driverId],
    );
    if (n == 0) {
      throw StateError('operation not found for markStatus');
    }
  }

  @override
  Future<void> markAcked(String operationId, {DateTime? serverAckAt}) async {
    await markStatus(
      operationId: operationId,
      status: OperationStatus.acked,
      serverAckAt: serverAckAt ?? DateTime.now().toUtc(),
      clearNextRetryAt: true,
    );
  }

  @override
  Future<void> deleteAcked(String operationId) async {
    final db = _requireDb;
    await db.delete(
      'operations',
      where: 'operation_id = ? AND driver_id = ? AND status = ?',
      whereArgs: [operationId, _driverId, OperationStatus.acked.name],
    );
  }

  @override
  Future<int> deleteAllAcked() async {
    final db = _requireDb;
    return db.delete(
      'operations',
      where: 'driver_id = ? AND status = ?',
      whereArgs: [_driverId, OperationStatus.acked.name],
    );
  }

  @override
  Future<int> countForDriver() async {
    final db = _requireDb;
    final rows = await db.rawQuery(
      'SELECT COUNT(*) AS c FROM operations WHERE driver_id = ?',
      [_driverId],
    );
    return Sqflite.firstIntValue(rows) ?? 0;
  }

  @override
  Future<void> saveDependencyResult({
    required String dependencyOperationId,
    required Map<String, dynamic> result,
  }) async {
    OperationPayloadRules.validateOrThrow(result);
    final db = _requireDb;
    await db.insert(
      'dependency_results',
      {
        'dependency_operation_id': dependencyOperationId,
        'driver_id': _driverId,
        'result_json': jsonEncode(result),
        'created_at': DateTime.now().toUtc().toIso8601String(),
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  @override
  Future<Map<String, dynamic>?> getDependencyResult(
    String dependencyOperationId,
  ) async {
    final db = _requireDb;
    final rows = await db.query(
      'dependency_results',
      where: 'dependency_operation_id = ? AND driver_id = ?',
      whereArgs: [dependencyOperationId, _driverId],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return jsonDecode(rows.first['result_json'] as String)
        as Map<String, dynamic>;
  }

  @override
  Future<int> applyDependencyResultToDependents({
    required String dependencyOperationId,
    required Map<String, dynamic> result,
  }) async {
    OperationPayloadRules.validateOrThrow(result);
    final db = _requireDb;
    final dependents = await db.query(
      'operations',
      where: 'driver_id = ? AND dependency_operation_id = ? AND status = ?',
      whereArgs: [
        _driverId,
        dependencyOperationId,
        OperationStatus.blocked.name,
      ],
    );
    var updated = 0;
    for (final row in dependents) {
      final payload =
          jsonDecode(row['payload_json'] as String) as Map<String, dynamic>;
      final merged = {...payload, ...result};
      OperationPayloadRules.validateOrThrow(merged);
      final hash = OperationPayloadRules.hashPayload(merged);
      final n = await db.update(
        'operations',
        {
          'payload_json': jsonEncode(merged),
          'payload_hash': hash,
          'status': OperationStatus.ready.name,
          'next_retry_at': null,
          'last_error_code': null,
        },
        where: 'operation_id = ? AND driver_id = ?',
        whereArgs: [row['operation_id'], _driverId],
      );
      updated += n;
    }
    return updated;
  }

  Map<String, Object?> _toRow(SyncOperation op) => {
        'operation_id': op.operationId,
        'driver_id': op.driverId,
        'session_id': op.sessionId,
        'workset_id': op.worksetId,
        'operation_type': op.operationType.name,
        'entity_type': op.entityType.wireName,
        'entity_id': op.entityId,
        'payload_json': jsonEncode(op.payload),
        'payload_hash': op.payloadHash,
        'client_created_at': op.clientCreatedAt.toUtc().toIso8601String(),
        'local_seq': op.localSeq,
        'idempotency_key': op.idempotencyKey,
        'status': op.status.name,
        'retry_count': op.retryCount,
        'next_retry_at': op.nextRetryAt?.toUtc().toIso8601String(),
        'last_error_code': op.lastErrorCode,
        'server_ack_at': op.serverAckAt?.toUtc().toIso8601String(),
        'schema_version': op.schemaVersion,
        'dependency_operation_id': op.dependencyOperationId,
        'company_id': op.companyId,
        'source': op.source,
      };

  SyncOperation _fromRow(Map<String, Object?> row) {
    final payloadRaw = row['payload_json'] as String;
    final payload = jsonDecode(payloadRaw) as Map<String, dynamic>;
    return SyncOperation(
      operationId: row['operation_id'] as String,
      driverId: row['driver_id'] as String,
      sessionId: row['session_id'] as String?,
      worksetId: row['workset_id'] as String?,
      operationType: OperationType.parse(row['operation_type'] as String),
      entityType: OperationEntityType.parse(row['entity_type'] as String),
      entityId: row['entity_id'] as String,
      payload: payload,
      payloadHash: row['payload_hash'] as String,
      clientCreatedAt: DateTime.parse(row['client_created_at'] as String),
      localSeq: row['local_seq'] as int,
      idempotencyKey: row['idempotency_key'] as String,
      status: OperationStatus.parse(row['status'] as String),
      retryCount: row['retry_count'] as int? ?? 0,
      nextRetryAt: row['next_retry_at'] != null
          ? DateTime.parse(row['next_retry_at'] as String)
          : null,
      lastErrorCode: row['last_error_code'] as String?,
      serverAckAt: row['server_ack_at'] != null
          ? DateTime.parse(row['server_ack_at'] as String)
          : null,
      schemaVersion: row['schema_version'] as int? ?? kOperationSchemaVersion,
      dependencyOperationId: row['dependency_operation_id'] as String?,
      companyId: row['company_id'] as String?,
      source: row['source'] as String?,
    );
  }

  /// Skip corrupt rows so one bad row cannot crash the drain loop.
  List<SyncOperation> _mapRowsSafe(List<Map<String, Object?>> rows) {
    final out = <SyncOperation>[];
    for (final row in rows) {
      try {
        out.add(_fromRow(row));
      } catch (_) {
        // Intentionally skip; do not delete the DB.
      }
    }
    return out;
  }
}
