import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import '../models/delivery_session.dart';

/// Session-scoped pending route buffer in app sandbox only.
///
/// Privacy MVP:
/// - No SharedPreferences for coordinates
/// - No coordinate logging
/// - ACK'd points removed immediately
/// - Owner (driverId) + sessionId validated on load
/// - Encryption-at-rest: production TODO (avoid weak custom crypto)
class LocalRouteBuffer {
  LocalRouteBuffer({
    required this.driverId,
    required this.sessionId,
  });

  final String driverId;
  final String sessionId;

  final List<DeliveryRoutePoint> _pending = [];
  int _nextSequence = 1;
  File? _file;

  List<DeliveryRoutePoint> get pending => List.unmodifiable(_pending);
  int get nextSequence => _nextSequence;
  bool get isEmpty => _pending.isEmpty;

  Future<void> open({int lastUploadedSequence = 0}) async {
    _nextSequence = lastUploadedSequence + 1;
    final dir = await _sessionDir();
    await dir.create(recursive: true);
    _file = File('${dir.path}/pending.jsonl');
    if (await _file!.exists()) {
      await _reloadFromDisk();
    }
  }

  Future<Directory> _sessionDir() async {
    final root = await getApplicationSupportDirectory();
    return Directory(
      '${root.path}/route_buffers/$driverId/$sessionId',
    );
  }

  Future<void> _reloadFromDisk() async {
    final file = _file;
    if (file == null || !await file.exists()) return;
    final lines = await file.readAsLines();
    _pending.clear();
    for (final line in lines) {
      if (line.trim().isEmpty) continue;
      try {
        final map = jsonDecode(line) as Map<String, dynamic>;
        if (map['driverId'] != driverId || map['sessionId'] != sessionId) {
          continue; // owner mismatch — discard
        }
        final point = DeliveryRoutePoint.fromJson(
          map['point'] as Map<String, dynamic>,
        );
        _pending.add(point);
        if (point.sequenceNo >= _nextSequence) {
          _nextSequence = point.sequenceNo + 1;
        }
      } catch (_) {
        // skip corrupt line
      }
    }
  }

  Future<DeliveryRoutePoint> append(DeliveryRoutePoint point) async {
    final assigned = DeliveryRoutePoint(
      sequenceNo: point.sequenceNo > 0 ? point.sequenceNo : _nextSequence,
      recordedAt: point.recordedAt,
      latitude: point.latitude,
      longitude: point.longitude,
      accuracyM: point.accuracyM,
      speedMps: point.speedMps,
      headingDeg: point.headingDeg,
      source: point.source,
    );
    if (assigned.sequenceNo >= _nextSequence) {
      _nextSequence = assigned.sequenceNo + 1;
    }
    _pending.add(assigned);
    await _persistLine(assigned);
    return assigned;
  }

  Future<void> _persistLine(DeliveryRoutePoint point) async {
    final file = _file;
    if (file == null) return;
    final payload = jsonEncode({
      'driverId': driverId,
      'sessionId': sessionId,
      'point': point.toJson(),
    });
    await file.writeAsString('$payload\n', mode: FileMode.append, flush: true);
  }

  /// Remove points that the server acknowledged (by sequence).
  Future<void> acknowledgeUpTo(int lastUploadedSequence) async {
    _pending.removeWhere((p) => p.sequenceNo <= lastUploadedSequence);
    await _rewriteFile();
  }

  Future<void> acknowledgeSequences(Iterable<int> sequences) async {
    final set = sequences.toSet();
    _pending.removeWhere((p) => set.contains(p.sequenceNo));
    await _rewriteFile();
  }

  Future<void> _rewriteFile() async {
    final file = _file;
    if (file == null) return;
    final sink = file.openWrite();
    for (final p in _pending) {
      sink.writeln(
        jsonEncode({
          'driverId': driverId,
          'sessionId': sessionId,
          'point': p.toJson(),
        }),
      );
    }
    await sink.flush();
    await sink.close();
  }

  Future<void> clearAll() async {
    _pending.clear();
    final file = _file;
    if (file != null && await file.exists()) {
      await file.delete();
    }
  }

  /// Drop orphan buffers for other drivers under route_buffers/.
  static Future<void> cleanupOrphans({
    required String currentDriverId,
    Set<String> keepSessionIds = const {},
  }) async {
    final root = await getApplicationSupportDirectory();
    final buffers = Directory('${root.path}/route_buffers');
    if (!await buffers.exists()) return;

    await for (final driverEntity in buffers.list()) {
      if (driverEntity is! Directory) continue;
      final driverFolder = driverEntity.path.split(Platform.pathSeparator).last;
      if (driverFolder != currentDriverId) {
        await driverEntity.delete(recursive: true);
        continue;
      }
      await for (final sessionEntity in driverEntity.list()) {
        if (sessionEntity is! Directory) continue;
        final sid = sessionEntity.path.split(Platform.pathSeparator).last;
        if (keepSessionIds.isNotEmpty && !keepSessionIds.contains(sid)) {
          // Keep only if pending.jsonl non-empty for open sessions; callers pass keep set.
          final pending = File('${sessionEntity.path}/pending.jsonl');
          if (!await pending.exists()) {
            await sessionEntity.delete(recursive: true);
          }
        }
      }
    }
  }
}
