import 'dart:async';

import 'package:flutter/foundation.dart';

import '../location/driver_location_icon_factory.dart';
import '../location/driver_location_marker_state.dart';
import '../location/driver_location_service.dart';
import '../location/driver_location_snapshot.dart';
import '../location/driver_vehicle_settings.dart';
import '../location/driver_vehicle_type.dart';
import 'delivery_map_controller.dart';

/// Bridges [DriverLocationService] and map SDK driver-marker APIs.
class MapLocationCoordinator extends ChangeNotifier {
  MapLocationCoordinator({
    DriverLocationService? locationService,
  }) : _locationService = locationService ?? DriverLocationService();

  final DriverLocationService _locationService;

  DeliveryMapController? _mapController;
  DriverVehicleType _vehicle = DriverVehicleSettings.defaultVehicle;
  bool _followEnabled = false;
  bool _permissionDenied = false;
  DateTime? _lastCameraFollowAt;
  DriverLocationMarkerState? _lastMarkerState;
  StreamSubscription<DriverLocationSnapshot>? _positionSub;

  static const cameraFollowThrottle = Duration(seconds: 1);
  static const followZoom = 17.0;

  DriverLocationService get locationService => _locationService;

  bool get followEnabled => _followEnabled;

  bool get hasLocation => _locationService.lastSnapshot != null;

  bool get permissionDenied => _permissionDenied;

  bool get locationEnabled =>
      _locationService.hasPermission && _locationService.lastSnapshot != null;

  DriverVehicleType get vehicle => _vehicle;

  void attachMap(DeliveryMapController controller) {
    _mapController = controller;
    controller.setUserGestureListener(_onUserMapGesture);
    final snapshot = _locationService.lastSnapshot;
    if (snapshot != null) {
      _syncDriverMarker(
        DriverLocationMarkerState(snapshot: snapshot, vehicle: _vehicle),
        force: true,
      );
    }
  }

  void detachMap() {
    _mapController?.setUserGestureListener(null);
    _mapController = null;
  }

  Future<void> loadVehicleType() async {
    final next = await DriverVehicleSettings.load();
    final changed = next != _vehicle;
    _vehicle = next;
    if (changed) {
      DriverLocationIconFactory.clearCache();
    }
    notifyListeners();
    if (changed && _locationService.lastSnapshot != null) {
      await refreshVehicleIcon();
    }
  }

  Future<void> refreshVehicleIcon() async {
    final snapshot = _locationService.lastSnapshot;
    if (snapshot == null) return;
    await _syncDriverMarker(
      DriverLocationMarkerState(snapshot: snapshot, vehicle: _vehicle),
      force: true,
    );
  }

  Future<bool> startTracking() async {
    _permissionDenied = false;
    final ok = await _locationService.start();
    if (!ok) {
      _permissionDenied = true;
      notifyListeners();
      return false;
    }
    _permissionDenied = false;
    notifyListeners();
    return true;
  }

  Future<void> stopTracking() async {
    await _locationService.stop();
    await _mapController?.removeDriverMarker();
    _lastMarkerState = null;
    notifyListeners();
  }

  void bindPositionStream() {
    _positionSub ??= _locationService.positions.listen(_onPosition);
  }

  void _onPosition(DriverLocationSnapshot snapshot) {
    _syncDriverMarker(
      DriverLocationMarkerState(snapshot: snapshot, vehicle: _vehicle),
    );
    if (_followEnabled) {
      _maybeFollowCamera(snapshot.latitude, snapshot.longitude);
    }
    notifyListeners();
  }

  Future<void> onMyLocationPressed() async {
    if (!_locationService.hasPermission) {
      final ok = await _locationService.start();
      if (!ok) {
        _permissionDenied = true;
        notifyListeners();
        return;
      }
      _permissionDenied = false;
    }
    final snapshot = _locationService.lastSnapshot;
    if (snapshot == null) return;
    _followEnabled = true;
    notifyListeners();
    await _mapController?.moveCamera(
      DeliveryLatLng(
        latitude: snapshot.latitude,
        longitude: snapshot.longitude,
      ),
      zoom: followZoom,
      programmatic: true,
    );
  }

  void disableFollow() {
    if (!_followEnabled) return;
    _followEnabled = false;
    notifyListeners();
  }

  void _onUserMapGesture() => disableFollow();

  Future<void> _maybeFollowCamera(double lat, double lng) async {
    final now = DateTime.now();
    if (_lastCameraFollowAt != null &&
        now.difference(_lastCameraFollowAt!) < cameraFollowThrottle) {
      return;
    }
    _lastCameraFollowAt = now;
    await _mapController?.moveCamera(
      DeliveryLatLng(latitude: lat, longitude: lng),
      zoom: followZoom,
      programmatic: true,
    );
  }

  Future<void> _syncDriverMarker(
    DriverLocationMarkerState state, {
    bool force = false,
  }) async {
    final controller = _mapController;
    if (controller == null) return;

    if (!force &&
        _lastMarkerState != null &&
        _lastMarkerState!.vehicle == state.vehicle &&
        _lastMarkerState!.sessionActive == state.sessionActive &&
        DriverGpsAccuracyVisual.fromMeters(_lastMarkerState!.accuracyMeters) ==
            DriverGpsAccuracyVisual.fromMeters(state.accuracyMeters) &&
        !_lastMarkerState!.snapshot.isSignificantMarkerChange(state.snapshot)) {
      return;
    }

    _lastMarkerState = state;
    await controller.upsertDriverMarker(state);
  }

  @override
  void dispose() {
    _positionSub?.cancel();
    detachMap();
    _locationService.dispose();
    super.dispose();
  }
}
