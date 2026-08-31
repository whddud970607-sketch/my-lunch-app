import 'dart:math' as math;

/// Immutable GPS sample for map display and future navigation (TMAP) reuse.
class DriverLocationSnapshot {
  const DriverLocationSnapshot({
    required this.latitude,
    required this.longitude,
    required this.headingDegrees,
    required this.speedMetersPerSecond,
    required this.accuracyMeters,
    required this.timestamp,
  });

  final double latitude;
  final double longitude;

  /// 0–360 when known; null when heading should not rotate the icon.
  final double? headingDegrees;

  final double speedMetersPerSecond;
  final double accuracyMeters;
  final DateTime timestamp;

  static const invalidHeading = -1.0;
  static const lowSpeedThresholdMps = 1.0;
  static const markerMinDistanceMeters = 5.0;
  static const markerMinHeadingDeltaDegrees = 10.0;

  /// Haversine distance in meters.
  double distanceMetersTo(DriverLocationSnapshot other) {
    const earthRadius = 6371000.0;
    final dLat = _toRad(other.latitude - latitude);
    final dLng = _toRad(other.longitude - longitude);
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(_toRad(latitude)) *
            math.cos(_toRad(other.latitude)) *
            math.sin(dLng / 2) *
            math.sin(dLng / 2);
    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return earthRadius * c;
  }

  double _toRad(double deg) => deg * math.pi / 180.0;

  /// Whether map marker should be updated vs [previous].
  bool isSignificantMarkerChange(DriverLocationSnapshot? previous) {
    if (previous == null) return true;
    final moved = distanceMetersTo(previous) >= markerMinDistanceMeters;
    if (moved) return true;
    final h1 = headingDegrees;
    final h2 = previous.headingDegrees;
    if (h1 == null || h2 == null) return false;
    final delta = _headingDeltaDegrees(h1, h2);
    return delta >= markerMinHeadingDeltaDegrees;
  }

  static double _headingDeltaDegrees(double a, double b) {
    var d = (a - b).abs() % 360;
    if (d > 180) d = 360 - d;
    return d;
  }
}
