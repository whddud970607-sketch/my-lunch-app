import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'operation_dispatcher.dart';
import 'operation_type.dart';
import 'sync_operation.dart';

/// Uploads staged POD file to Supabase Storage (deterministic path per operation).
class PodUploadDispatcher implements OperationDispatcher {
  PodUploadDispatcher({
    Future<Directory> Function()? supportDirectory,
    SupabaseClient? supabase,
  })  : _supportDirectory =
            supportDirectory ?? getApplicationSupportDirectory,
        _supabase = supabase;

  final Future<Directory> Function() _supportDirectory;
  final SupabaseClient? _supabase;

  @override
  Future<DispatchOutcome> dispatch(SyncOperation operation) async {
    if (operation.operationType != OperationType.podUpload) {
      return DispatchOutcome.fail(
        DispatchOutcomeKind.permanentFailure,
        'wrong_type',
      );
    }
    final pointId = operation.payload['pointId'] as String?;
    final localFileRef = operation.payload['localFileRef'] as String?;
    final contentType =
        operation.payload['contentType'] as String? ?? 'image/jpeg';
    if (pointId == null || localFileRef == null) {
      return DispatchOutcome.fail(
        DispatchOutcomeKind.permanentFailure,
        'validation_missing_fields',
      );
    }

    try {
      final root = await _supportDirectory();
      final file = File(p.join(root.path, localFileRef));
      if (!await file.exists()) {
        return DispatchOutcome.fail(
          DispatchOutcomeKind.permanentFailure,
          'pod_file_missing',
        );
      }
      final bytes = await file.readAsBytes();
      final expectedSize = operation.payload['byteSize'];
      if (expectedSize is int && bytes.length != expectedSize) {
        return DispatchOutcome.fail(
          DispatchOutcomeKind.permanentFailure,
          'pod_byte_size_mismatch',
        );
      }
      final expectedChecksum = operation.payload['checksum'] as String?;
      if (expectedChecksum != null && expectedChecksum.isNotEmpty) {
        final actual = checksumSha256(bytes);
        if (actual != expectedChecksum) {
          return DispatchOutcome.fail(
            DispatchOutcomeKind.permanentFailure,
            'pod_checksum_mismatch',
          );
        }
      }
      final storagePath =
          '${operation.driverId}/$pointId/op_${operation.operationId}.jpg';

      final client = _supabase ?? Supabase.instance.client;
      await client.storage.from('delivery-proofs').uploadBinary(
            storagePath,
            bytes,
            fileOptions: FileOptions(
              contentType: contentType,
              upsert: true,
            ),
          );

      // Do not log path contents beyond type metadata.
      debugPrint(
        '[sync] POD_UPLOAD ok operationId=${operation.operationId}',
      );

      return DispatchOutcome.success(result: {
        'storagePath': storagePath,
        'pointId': pointId,
      });
    } on StorageException catch (e) {
      final status = e.statusCode;
      if (status == '401') {
        return DispatchOutcome.fail(DispatchOutcomeKind.authWait, '401');
      }
      if (status == '403') {
        return DispatchOutcome.fail(
          DispatchOutcomeKind.permanentFailure,
          '403',
        );
      }
      return DispatchOutcome.fail(
        DispatchOutcomeKind.transientFailure,
        'storage_${status ?? 'error'}',
      );
    } catch (_) {
      return DispatchOutcome.fail(
        DispatchOutcomeKind.transientFailure,
        'network_unavailable',
      );
    }
  }

  static Future<String> stageBytes({
    required String driverId,
    required String pointId,
    required String operationId,
    required List<int> bytes,
    Future<Directory> Function()? supportDirectory,
  }) async {
    final root =
        await (supportDirectory ?? getApplicationSupportDirectory)();
    final rel = p.join(
      'pod_staging',
      driverId,
      pointId,
      'op_$operationId.jpg',
    );
    final file = File(p.join(root.path, rel));
    await file.parent.create(recursive: true);
    await file.writeAsBytes(bytes, flush: true);
    return rel.replaceAll('\\', '/');
  }

  static String checksumSha256(List<int> bytes) =>
      sha256.convert(bytes).toString();
}
