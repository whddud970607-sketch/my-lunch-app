import 'dart:async';

import '../location/driver_location_service.dart';
import '../location/driver_location_snapshot.dart';
import '../location/local_route_buffer.dart';
import '../location/route_noise_filter.dart';
import '../location/route_sampling_policy.dart';
import '../location/route_upload_scheduler.dart';
import '../models/delivery_session.dart';
import '../services/delivery_session_service.dart';

/// Session-scoped route recording surface (fakeable in unit tests).
abstract class RouteRecording {
  Future<void> start({
    required String sessionId,
    required String driverId,
    int lastUploadedSequence = 0,
  });
  void stopAcceptingSamples();
  void resumeAcceptingSamples();
  Future<void> flushAfterEnd({required DateTime endedAt});
  Future<void> stop({bool flush = true});
}

/// App/session-scoped GPS route recorder.
/// Owned by [DeliverySessionController], NOT by MapSpikeScreen.
class DeliveryRouteRecorder implements RouteRecording {
  DeliveryRouteRecorder({
    required DriverLocationService locationService,
    required DeliverySessionApi api,
    RouteSamplingPolicy? samplingPolicy,
    RouteNoiseFilter? noiseFilter,
  })  : _location = locationService,
        _api = api,
        _sampling = samplingPolicy ?? RouteSamplingPolicy(),
        _noise = noiseFilter ?? RouteNoiseFilter();

  final DriverLocationService _location;
  final DeliverySessionApi _api;
  final RouteSamplingPolicy _sampling;
  final RouteNoiseFilter _noise;

  static DeliveryRouteRecorder? _activeInstance;
  static String? _activeSessionId;

  LocalRouteBuffer? _buffer;
  RouteUploadScheduler? _uploader;
  StreamSubscription<DriverLocationSnapshot>? _sub;
  String? _sessionId;
  bool _acceptingSamples = false;

  bool get isRecording => _acceptingSamples && _sessionId != null;
  String? get sessionId => _sessionId;

  /// Idempotent start / restore for a session. Prevents duplicate recorders.
  @override
  Future<void> start({
    required String sessionId,
    required String driverId,
    int lastUploadedSequence = 0,
  }) async {
    if (_activeInstance != null &&
        _activeSessionId == sessionId &&
        _activeInstance != this) {
      // Another instance already owns this session — no-op.
      return;
    }
    if (_sessionId == sessionId && _acceptingSamples) {
      return;
    }

    await stop(flush: false);

    _sessionId = sessionId;
    _activeInstance = this;
    _activeSessionId = sessionId;
    _sampling.reset();
    _acceptingSamples = true;

    final buffer = LocalRouteBuffer(driverId: driverId, sessionId: sessionId);
    await buffer.open(lastUploadedSequence: lastUploadedSequence);
    _buffer = buffer;

    final uploader = RouteUploadScheduler(
      api: _api,
      buffer: buffer,
      sessionId: sessionId,
    );
    uploader.start();
    _uploader = uploader;

    // Ensure foreground GPS is running (no new background permission).
    await _location.start();

    _sub?.cancel();
    _sub = _location.positions.listen(_onPosition);

    final last = _location.lastSnapshot;
    if (last != null) {
      _onPosition(last, force: true);
    }

    await LocalRouteBuffer.cleanupOrphans(
      currentDriverId: driverId,
      keepSessionIds: {sessionId},
    );
  }

  void _onPosition(DriverLocationSnapshot sample, {bool force = false}) {
    if (!_acceptingSamples) return;
    final buffer = _buffer;
    if (buffer == null) return;

    final previousKept = _sampling.lastKept;
    final decision = _sampling.evaluate(sample, force: force);
    if (decision != RouteSampleDecision.keep) return;

    if (!_noise.shouldAccept(sample: sample, previousKept: previousKept)) {
      if (previousKept != null) {
        _sampling.rejectKeep(previousKept);
      }
      return;
    }

    final point = DeliveryRoutePoint.fromSnapshot(
      sequenceNo: 0,
      snapshot: sample,
    );
    unawaited(buffer.append(point));
  }

  /// Immediately stop accepting new GPS samples (before/during server end).
  @override
  void stopAcceptingSamples() {
    _acceptingSamples = false;
  }

  /// Resume accepting samples if end was cancelled (e.g. incomplete warning).
  @override
  void resumeAcceptingSamples() {
    if (_sessionId != null && _buffer != null) {
      _acceptingSamples = true;
    }
  }

  @override
  Future<void> flushAfterEnd({required DateTime endedAt}) async {
    stopAcceptingSamples();
    _uploader?.setEndedAtCutoff(endedAt);
    await _uploader?.flush(maxAttempts: 4);
  }

  @override
  Future<void> stop({bool flush = true}) async {
    stopAcceptingSamples();
    _sub?.cancel();
    _sub = null;
    if (flush) {
      await _uploader?.flush(maxAttempts: 3);
    }
    _uploader?.stop();
    _uploader = null;
    if (flush) {
      await _buffer?.clearAll();
    }
    _buffer = null;

    if (_activeInstance == this) {
      _activeInstance = null;
      _activeSessionId = null;
    }
    _sessionId = null;
  }
}
