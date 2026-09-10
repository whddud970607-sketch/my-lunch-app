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
  MapLocationCoordinator({DriverLocationService? locationService})
    : _locationService = locationService ?? DriverLocationService();

  final DriverLocationService _locationService;

  DeliveryMapController? _mapController;
  DriverVehicleType _vehicle = DriverVehicleSettings.defaultVehicle;
  bool _followEnabled = false;
  bool _cameraFollowSuppressed = false;
  bool _permissionDenied = false;
  DriverLocationMarkerState? _lastMarkerState;
  StreamSubscription<DriverLocationSnapshot>? _positionSub;

  /// Latest-wins camera generation — older in-flight moves are superseded.
  int _cameraFollowGeneration = 0;

  static const followZoom = 17.0;

  DriverLocationService get locationService => _locationService;

  bool get followEnabled => _followEnabled;

  /// When true (e.g. pin-adjust), Follow stays ON but GPS does not recenter.
  bool get cameraFollowSuppressed => _cameraFollowSuppressed;

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
        // Provider remount / resume: Follow stays logically ON; camera must
        // resume automatically once the new controller is ready — no button.
        if (_followEnabled && !_cameraFollowSuppressed) {
          debugPrint('[FOLLOW] attachMap auto-resume camera');
          _followCameraLatest(snapshot.latitude, snapshot.longitude);
        }
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
      // Temporary GPS / service loss must NOT clear Follow. Only session end,
      // stopTracking, or a failed user attempt to enable Follow may turn it OFF.
      notifyListeners();
      return false;
    }
    _permissionDenied = false;
    notifyListeners();
    // Resume marker + camera after background pause while Follow stays ON.
    if (_followEnabled && !_cameraFollowSuppressed) {
      final snapshot = _locationService.lastSnapshot;
      if (snapshot != null && _mapController != null) {
        await _syncDriverMarker(
          DriverLocationMarkerState(snapshot: snapshot, vehicle: _vehicle),
          force: true,
        );
        _followCameraLatest(snapshot.latitude, snapshot.longitude);
      }
    }
    return true;
  }

  /// Stops GPS stream, removes driver marker, and turns Follow OFF.
  ///
  /// Prefer [disableFollow] when only Follow must end (delivery-session end).
  /// Prefer [pauseTracking] for app background — Follow must survive pause.
  Future<void> stopTracking() async {
    await _locationService.stop();
    await _mapController?.removeDriverMarker();
    _lastMarkerState = null;
    _followEnabled = false;
    _cameraFollowSuppressed = false;
    notifyListeners();
  }

  /// Pauses GPS updates without clearing Follow or the last valid marker.
  ///
  /// Locked policy: background/resume must NOT turn Follow OFF.
  Future<void> pauseTracking() async {
    await _locationService.stop();
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
    if (_followEnabled && !_cameraFollowSuppressed) {
      // Reuse shared significance floor — skip negligible camera spam.
      if (previous == null || snapshot.isSignificantMarkerChange(previous)) {
        _followCameraLatest(snapshot.latitude, snapshot.longitude);
      }
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
    // Explicit user action may recenter even during pin-adjust suppression.
    _followCameraLatest(
      snapshot.latitude,
      snapshot.longitude,
      awaitCompletion: true,
      applyDefaultZoom: true,
    );
  }

  /// Suppress automatic Follow camera recenters without turning Follow OFF.
  ///
  /// Used by pin-adjust so the user can pan freely while Follow remains ON.
  void setCameraFollowSuppressed(bool suppressed) {
    if (_cameraFollowSuppressed == suppressed) return;
    _cameraFollowSuppressed = suppressed;
    if (suppressed) {
      _cameraFollowGeneration++;
    }
    notifyListeners();
  }

  void disableFollow() {
    if (!_followEnabled && !_cameraFollowSuppressed) return;
    _followEnabled = false;
    _cameraFollowSuppressed = false;
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
      unawaited(
        future.then((_) {
          // Ignore if superseded while awaiting first center.
          if (gen != _cameraFollowGeneration) return;
        }),
      );
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
