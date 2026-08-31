import 'driver_location_snapshot.dart';

/// Stabilizes GPS heading and filters noisy low-speed updates.
class DriverLocationFilter {
  double? _lastValidHeadingDegrees;

  /// Resolves heading: hold last valid bearing when slow or GPS heading invalid.
  double? resolveHeading({
    required double rawHeading,
    required double speedMetersPerSecond,
  }) {
    final hasValidRaw = rawHeading >= 0 && rawHeading <= 360;
    if (hasValidRaw && speedMetersPerSecond >= DriverLocationSnapshot.lowSpeedThresholdMps) {
      _lastValidHeadingDegrees = rawHeading;
      return rawHeading;
    }
    return _lastValidHeadingDegrees;
  }

  void reset() => _lastValidHeadingDegrees = null;
}
