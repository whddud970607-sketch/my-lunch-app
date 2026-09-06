import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import 'driver_location_filter.dart';
import 'driver_location_snapshot.dart';

/// Foreground-only GPS source shared by map UI (not Kakao KNSDK nav camera).
class DriverLocationService {
  DriverLocationService({
    DriverLocationFilter? filter,
    Future<bool> Function()? isLocationServiceEnabled,
    Future<LocationPermission> Function()? checkPermission,
    Future<LocationPermission> Function()? requestPermission,
    Future<Position> Function(LocationSettings settings)? getCurrentPosition,
    Stream<Position> Function(LocationSettings settings)? getPositionStream,
  })  : _filter = filter ?? DriverLocationFilter(),
        _isLocationServiceEnabled =
            isLocationServiceEnabled ?? Geolocator.isLocationServiceEnabled,
        _checkPermission = checkPermission ?? Geolocator.checkPermission,
        _requestPermission = requestPermission ?? Geolocator.requestPermission,
        _getCurrentPosition = getCurrentPosition ??
            ((settings) =>
                Geolocator.getCurrentPosition(locationSettings: settings)),
        _getPositionStream = getPositionStream ??
            ((settings) =>
                Geolocator.getPositionStream(locationSettings: settings));

  /// Light OS-side filter — prefer continuous driving updates over sparse fixes.
  static const distanceFilterMeters = 1;

  /// Android delivery interval (was 3s — multi-second lag for vehicle UI).
  static const androidInterval = Duration(milliseconds: 1000);

  final DriverLocationFilter _filter;
  final Future<bool> Function() _isLocationServiceEnabled;
  final Future<LocationPermission> Function() _checkPermission;
  final Future<LocationPermission> Function() _requestPermission;
  final Future<Position> Function(LocationSettings settings) _getCurrentPosition;
  final Stream<Position> Function(LocationSettings settings) _getPositionStream;

  final StreamController<DriverLocationSnapshot> _controller =
      StreamController<DriverLocationSnapshot>.broadcast();

  StreamSubscription<Position>? _subscription;
  DriverLocationSnapshot? _lastEmitted;
  int _emitSequence = 0;
  bool _permissionGranted = false;

  /// Broadcast stream of location samples (no logging of coordinates).
  Stream<DriverLocationSnapshot> get positions => _controller.stream;

  DriverLocationSnapshot? get lastSnapshot => _lastEmitted;

  bool get isTracking => _subscription != null;

  bool get hasPermission => _permissionGranted;

  LocationSettings get _settings => const LocationSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        distanceFilter: distanceFilterMeters,
      );

  LocationSettings get _settingsWithAndroidInterval {
    if (defaultTargetPlatform == TargetPlatform.android) {
      return AndroidSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        distanceFilter: distanceFilterMeters,
        intervalDuration: androidInterval,
      );
    }
    return _settings;
  }

  /// Request permission, emit immediate fix, then start stream.
  Future<bool> start() async {
    if (_subscription != null) return _permissionGranted;

    final enabled = await _isLocationServiceEnabled();
    if (!enabled) {
      _permissionGranted = false;
      return false;
    }

    var permission = await _checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await _requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      _permissionGranted = false;
      return false;
    }

    _permissionGranted = true;
    _filter.reset();

    try {
      final current = await _getCurrentPosition(_settingsWithAndroidInterval);
      _emitFromPosition(current, force: true);
    } catch (_) {
      // Stream may still deliver; do not fail start entirely.
    }

    _subscription = _getPositionStream(_settingsWithAndroidInterval).listen(
      (position) => _emitFromPosition(position),
      onError: (_) {},
    );
    return true;
  }

  Future<void> stop() async {
    await _subscription?.cancel();
    _subscription = null;
  }

  void dispose() {
    stop();
    _controller.close();
  }

  void _emitFromPosition(Position position, {bool force = false}) {
    final timestamp = position.timestamp;
    // Newest wins — discard delayed older GPS callbacks.
    if (!force &&
        _lastEmitted != null &&
        timestamp.isBefore(_lastEmitted!.timestamp)) {
      return;
    }

    final heading = _filter.resolveHeading(
      rawHeading: position.heading,
      speedMetersPerSecond: position.speed,
    );
    final sequence = ++_emitSequence;
    final snapshot = DriverLocationSnapshot(
      latitude: position.latitude,
      longitude: position.longitude,
      headingDegrees: heading,
      speedMetersPerSecond: position.speed,
      accuracyMeters: position.accuracy,
      timestamp: timestamp,
      sequence: sequence,
    );

    if (!force &&
        _lastEmitted != null &&
        !_lastEmitted!.isSignificantMarkerChange(snapshot)) {
      // Still refresh lastSnapshot timestamp/coords for follow when tiny move?
      // Keep light gate: insignificant → skip UI noise, but allow sub-threshold
      // only when force. Driving updates usually exceed 1m.
      return;
    }

    _lastEmitted = snapshot;
    if (!_controller.isClosed) {
      _controller.add(snapshot);
    }
  }
}
