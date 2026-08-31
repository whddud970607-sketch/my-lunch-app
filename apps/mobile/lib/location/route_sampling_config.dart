/// Tunable GPS route sampling — independent of map marker updates.
///
/// Defaults chosen for urban delivery alleyways:
/// - OR(time, distance) so slow turns still leave points
/// - noise/stop filters decide actual keep
/// Adjust after device E2E; keep in one place.
class RouteSamplingConfig {
  const RouteSamplingConfig({
    this.minDistanceMeters = 25,
    this.minInterval = const Duration(seconds: 15),
    this.maxHeartbeat = const Duration(seconds: 90),
    this.maxAccuracyMeters = 35,
    this.maxImpliedSpeedMps = 35,
    this.duplicateDistanceMeters = 5,
    this.stopSpeedMps = 1.0,
    this.stopPauseAfter = const Duration(minutes: 5),
  });

  /// Candidate when moved at least this far since last kept point.
  final double minDistanceMeters;

  /// Candidate when this much time passed since last kept point.
  final Duration minInterval;

  /// Force candidate after this gap (if noise filter passes) to avoid gaps.
  final Duration maxHeartbeat;

  final double maxAccuracyMeters;
  final double maxImpliedSpeedMps;
  final double duplicateDistanceMeters;
  final double stopSpeedMps;
  final Duration stopPauseAfter;

  static const defaults = RouteSamplingConfig();
}
