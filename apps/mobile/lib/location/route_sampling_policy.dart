import '../location/driver_location_snapshot.dart';
import 'route_sampling_config.dart';

enum RouteSampleDecision { keep, skip }

/// Decides whether a GPS sample is a *candidate* for the route buffer.
/// Marker updates remain governed by [DriverLocationSnapshot.isSignificantMarkerChange].
class RouteSamplingPolicy {
  RouteSamplingPolicy({RouteSamplingConfig? config})
      : config = config ?? RouteSamplingConfig.defaults;

  final RouteSamplingConfig config;

  DriverLocationSnapshot? _lastKept;
  DateTime? _stoppedSince;

  void reset() {
    _lastKept = null;
    _stoppedSince = null;
  }

  DriverLocationSnapshot? get lastKept => _lastKept;

  RouteSampleDecision evaluate(DriverLocationSnapshot sample, {bool force = false}) {
    if (force || _lastKept == null) {
      _lastKept = sample;
      _stoppedSince = null;
      return RouteSampleDecision.keep;
    }

    final last = _lastKept!;
    final moved = sample.distanceMetersTo(last);
    final elapsed = sample.timestamp.difference(last.timestamp);

    // Track stop duration for pause suppression (applied after candidate).
    if (sample.speedMetersPerSecond < config.stopSpeedMps) {
      _stoppedSince ??= sample.timestamp;
    } else {
      _stoppedSince = null;
    }

    final distanceHit = moved >= config.minDistanceMeters;
    final timeHit = elapsed >= config.minInterval;
    final heartbeatHit = elapsed >= config.maxHeartbeat;

    if (!(distanceHit || timeHit || heartbeatHit)) {
      return RouteSampleDecision.skip;
    }

    // Long stop: suppress unless meaningfully moved.
    final stoppedFor = _stoppedSince == null
        ? Duration.zero
        : sample.timestamp.difference(_stoppedSince!);
    if (stoppedFor >= config.stopPauseAfter &&
        moved < config.minDistanceMeters) {
      return RouteSampleDecision.skip;
    }

    _lastKept = sample;
    return RouteSampleDecision.keep;
  }

  /// Call after noise filter rejects a candidate so time/distance anchors stay honest.
  void rejectKeep(DriverLocationSnapshot previousKept) {
    _lastKept = previousKept;
  }
}
