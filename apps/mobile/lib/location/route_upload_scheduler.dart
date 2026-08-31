import 'dart:async';

import '../services/delivery_session_service.dart';
import 'local_route_buffer.dart';

/// Uploads pending route points in batches with retry + sequence dedup on server.
class RouteUploadScheduler {
  RouteUploadScheduler({
    required DeliverySessionApi api,
    required LocalRouteBuffer buffer,
    required String sessionId,
    this.batchSize = 20,
    this.flushInterval = const Duration(seconds: 60),
  })  : _api = api,
        _buffer = buffer,
        _sessionId = sessionId;

  final DeliverySessionApi _api;
  final LocalRouteBuffer _buffer;
  final String _sessionId;
  final int batchSize;
  final Duration flushInterval;

  Timer? _timer;
  bool _flushing = false;
  DateTime? _endedAtCutoff;

  void start() {
    _timer?.cancel();
    _timer = Timer.periodic(flushInterval, (_) {
      unawaited(flush());
    });
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  /// When session is ending, only upload points with recordedAt <= endedAt.
  void setEndedAtCutoff(DateTime? endedAt) {
    _endedAtCutoff = endedAt?.toUtc();
  }

  Future<int> flush({int maxAttempts = 3}) async {
    if (_flushing) return 0;
    _flushing = true;
    var uploaded = 0;
    try {
      for (var attempt = 0; attempt < maxAttempts; attempt++) {
        final pending = _buffer.pending.where((p) {
          if (_endedAtCutoff == null) return true;
          return !p.recordedAt.toUtc().isAfter(_endedAtCutoff!);
        }).toList();
        if (pending.isEmpty) break;

        final batch = pending.take(batchSize).toList();
        try {
          final result = await _api.uploadRouteBatch(
            sessionId: _sessionId,
            points: batch,
          );
          final acked = batch.map((p) => p.sequenceNo);
          await _buffer.acknowledgeSequences(acked);
          if (result.lastUploadedSequence != null) {
            await _buffer.acknowledgeUpTo(result.lastUploadedSequence!);
          }
          uploaded += batch.length;
        } catch (_) {
          await Future<void>.delayed(Duration(seconds: 2 << attempt));
        }
      }
    } finally {
      _flushing = false;
    }
    return uploaded;
  }
}
