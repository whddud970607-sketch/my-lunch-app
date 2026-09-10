import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show lerpDouble;

import '../location/driver_location_snapshot.dart';

/// Presentation-only linear interpolation for driver marker position.
///
/// GPS / [DriverLocationSnapshot] remain source of truth. This class never
/// invents GPS samples — it only eases the rendered lat/lng between accepted
/// targets (latest-wins, no backlog).
class DriverMarkerInterpolator {
  DriverMarkerInterpolator({
    this.duration = const Duration(milliseconds: 900),
    this.onTick,
  });

  /// Matches ~1s GPS cadence ([DriverLocationService.androidInterval]).
  final Duration duration;

  final void Function(
    double latitude,
    double longitude,
    double? headingDegrees,
  )?
  onTick;

  Timer? _timer;
  int _generation = 0;

  double? _visualLat;
  double? _visualLng;
  double? _visualHeading;

  double? get visualLatitude => _visualLat;
  double? get visualLongitude => _visualLng;

  bool get hasVisual => _visualLat != null && _visualLng != null;

  /// Seeds visual position without animation (first fix / restore).
  void snapTo({
    required double latitude,
    required double longitude,
    double? headingDegrees,
  }) {
    _cancelTimer();
    _generation++;
    _visualLat = latitude;
    _visualLng = longitude;
    _visualHeading = headingDegrees;
    onTick?.call(latitude, longitude, headingDegrees);
  }

  /// Retarget from current visual toward [latitude]/[longitude] (latest-wins).
  void animateTo({
    required double latitude,
    required double longitude,
    double? headingDegrees,
  }) {
    if (_visualLat == null || _visualLng == null) {
      snapTo(
        latitude: latitude,
        longitude: longitude,
        headingDegrees: headingDegrees,
      );
      return;
    }

    final fromLat = _visualLat!;
    final fromLng = _visualLng!;
    final fromHeading = _visualHeading;
    final dist = _haversineMeters(fromLat, fromLng, latitude, longitude);

    // Reuse shared significance floor for no-op coalesce (presentation only).
    if (dist < DriverLocationSnapshot.markerMinDistanceMeters &&
        !_headingChanged(fromHeading, headingDegrees)) {
      _visualHeading = headingDegrees ?? fromHeading;
      return;
    }

    _cancelTimer();
    final gen = ++_generation;
    final started = DateTime.now();
    final totalMs = duration.inMilliseconds.clamp(1, 5000);

    _timer = Timer.periodic(const Duration(milliseconds: 16), (timer) {
      if (gen != _generation) {
        timer.cancel();
        return;
      }
      final elapsed = DateTime.now().difference(started).inMilliseconds;
      final t = (elapsed / totalMs).clamp(0.0, 1.0);
      final eased = _easeInOut(t);
      final lat = lerpDouble(fromLat, latitude, eased)!;
      final lng = lerpDouble(fromLng, longitude, eased)!;
      final heading = _lerpHeading(fromHeading, headingDegrees, eased);
      _visualLat = lat;
      _visualLng = lng;
      _visualHeading = heading;
      onTick?.call(lat, lng, heading);
      if (t >= 1.0) {
        timer.cancel();
        _timer = null;
        _visualLat = latitude;
        _visualLng = longitude;
        _visualHeading = headingDegrees ?? heading;
      }
    });
  }

  void dispose() {
    _cancelTimer();
    _generation++;
    _visualLat = null;
    _visualLng = null;
    _visualHeading = null;
  }

  void _cancelTimer() {
    _timer?.cancel();
    _timer = null;
  }

  static double _easeInOut(double t) {
    return t < 0.5 ? 2 * t * t : 1 - math.pow(-2 * t + 2, 2) / 2;
  }

  static bool _headingChanged(double? a, double? b) {
    if (a == null || b == null) return a != b;
    var d = (a - b).abs() % 360;
    if (d > 180) d = 360 - d;
    return d >= DriverLocationSnapshot.markerMinHeadingDeltaDegrees;
  }

  static double? _lerpHeading(double? from, double? to, double t) {
    if (to == null) return from;
    if (from == null) return to;
    var delta = to - from;
    while (delta > 180) {
      delta -= 360;
    }
    while (delta < -180) {
      delta += 360;
    }
    var h = from + delta * t;
    h %= 360;
    if (h < 0) h += 360;
    return h;
  }

  static double _haversineMeters(
    double lat1,
    double lng1,
    double lat2,
    double lng2,
  ) {
    const earthRadius = 6371000.0;
    final dLat = _toRad(lat2 - lat1);
    final dLng = _toRad(lng2 - lng1);
    final a =
        math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(_toRad(lat1)) *
            math.cos(_toRad(lat2)) *
            math.sin(dLng / 2) *
            math.sin(dLng / 2);
    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return earthRadius * c;
  }

  static double _toRad(double deg) => deg * math.pi / 180.0;
}
