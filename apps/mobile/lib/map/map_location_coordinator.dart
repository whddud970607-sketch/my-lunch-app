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
///
/// Follow Mode is for the Delivery Shield map host only — never drives
/// Kakao KNSDK [KNNaviView] navigation camera.
class MapLocationCoordinator extends ChangeNotifier {
  MapLocationCoordinator({
    DriverLocationService? locationService,
  }) : _locationService = locationService ?? DriverLocationService();

  final DriverLocationService _locationService;

  DeliveryMapController? _mapController;
  DriverVehicleType _vehicle = DriverVehicleSettings.defaultVehicle;
  bool _followEnabled = false;
  bool _permissionDenied = false;
  DriverLocationMarkerState? _lastMarkerState;
  StreamSubscription<DriverLocationSnapshot>? _positionSub;

  /// Latest-wins camera generation — older in-flight moves are superseded.
  int _cameraFollowGeneration = 0;

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
    // Gestures must not disable Follow — only delivery-session end does.
    controller.setUserGestureListener(null);
    // Do not sync driver marker synchronously on attach — Kakao pin style
    // registration is still in flight and concurrent addStyle SIGSEGVs.
    final snapshot = _locationService.lastSnapshot;
    if (snapshot == null) return;
    unawaited(
      Future<void>.delayed(const Duration(milliseconds: 750), () {
        if (_mapController != controller) return;
        _syncDriverMarker(
          DriverLocationMarkerState(snapshot: snapshot, vehicle: _vehicle),
          force: true,
        );
      }),
    );
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
      _followEnabled = false;
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
    _followEnabled = false;
    notifyListeners();
  }

  void bindPositionStream() {
    _positionSub ??= _locationService.positions.listen(_onPosition);
  }

  void _onPosition(DriverLocationSnapshot snapshot) {
    final previous = _lastMarkerState?.snapshot;
    if (previous != null && snapshot.isStaleRelativeTo(previous)) {
      return;
    }

    _syncDriverMarker(
      DriverLocationMarkerState(snapshot: snapshot, vehicle: _vehicle),
    );
    if (_followEnabled) {
      _followCameraLatest(snapshot.latitude, snapshot.longitude);
    }
    notifyListeners();
  }

  /// Enables Follow Mode and centers on latest known GPS (if any).
  Future<void> onMyLocationPressed() async {
    if (!_locationService.hasPermission || !_locationService.isTracking) {
      final ok = await startTracking();
      if (!ok) {
        _permissionDenied = true;
        _followEnabled = false;
        notifyListeners();
        return;
      }
      _permissionDenied = false;
    }

    _followEnabled = true;
    notifyListeners();

    final snapshot = _locationService.lastSnapshot;
    if (snapshot == null) return;

    await _syncDriverMarker(
      DriverLocationMarkerState(snapshot: snapshot, vehicle: _vehicle),
      force: true,
    );
    _followCameraLatest(
      snapshot.latitude,
      snapshot.longitude,
      awaitCompletion: true,
      applyDefaultZoom: true,
    );
  }

  void disableFollow() {
    if (!_followEnabled) return;
    _followEnabled = false;
    _cameraFollowGeneration++;
    notifyListeners();
  }

  /// Latest GPS wins — does not queue multi-second camera animations.
  ///
  /// When [applyDefaultZoom] is false (ongoing GPS follow), zoom is omitted so
  /// the map keeps the user's pinch/zoom level while recentering on the driver.
  void _followCameraLatest(
    double lat,
    double lng, {
    bool awaitCompletion = false,
    bool applyDefaultZoom = false,
  }) {
    final controller = _mapController;
    if (controller == null) return;
    final gen = ++_cameraFollowGeneration;
    final future = controller.moveCamera(
      DeliveryLatLng(latitude: lat, longitude: lng),
      zoom: applyDefaultZoom ? followZoom : null,
      programmatic: true,
      followUpdate: true,
    );
    if (awaitCompletion) {
      unawaited(future.then((_) {
        // Ignore if superseded while awaiting first center.
        if (gen != _cameraFollowGeneration) return;
      }));
      return;
    }
    unawaited(future);
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
