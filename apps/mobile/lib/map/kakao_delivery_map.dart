import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kakao_maps_flutter/kakao_maps_flutter.dart';

import '../location/driver_location_icon_factory.dart';
import '../location/driver_location_marker_state.dart';
import 'delivery_location_pin.dart';
import 'delivery_map_controller.dart';
import 'kakao_driver_marker_styles.dart';
import 'quantity_pin_icon.dart';

/// Kakao Maps SDK host — existing spike behavior preserved.
class KakaoDeliveryMap extends StatefulWidget {
  const KakaoDeliveryMap({
    super.key,
    required this.initialTarget,
    required this.pins,
    required this.onPinTap,
    required this.onReady,
  });

  final DeliveryLatLng initialTarget;
  final List<DeliveryLocationPin> pins;
  final DeliveryPinTapCallback onPinTap;
  final DeliveryMapReadyCallback onReady;

  @override
  State<KakaoDeliveryMap> createState() => _KakaoDeliveryMapState();
}

class _KakaoDeliveryMapState extends State<KakaoDeliveryMap>
    implements DeliveryMapController {
  late final Key _mapKey = ValueKey('delivery-kakao-map-$hashCode');

  StreamSubscription<LabelClickEvent>? _labelSub;
  StreamSubscription<CameraMoveEndEvent>? _cameraSub;
  bool _markersPlaced = false;
  bool _driverLayerReady = false;
  bool _programmaticCameraMove = false;
  /// After pin styles settle — concurrent registerMarkerStyles crashes Kakao GL
  /// (SIGSEGV LabelPerLevelStyle / MapLabelManager.addStyle).
  bool _labelStyleSurfaceReady = false;
  Future<void>? _labelStyleChain;
  DriverLocationMarkerState? _pendingDriverMarker;
  final KakaoMapHostGuard<KakaoMapController> _host = KakaoMapHostGuard();
  void Function()? _onUserGesture;
  final KakaoDriverMarkerStyleCache _driverStyles =
      KakaoDriverMarkerStyleCache();
  String? _driverMarkerStyleId;
  double? _driverMarkerLat;
  double? _driverMarkerLng;
  List<DeliveryLocationPin> _pins = const [];

  KakaoMapController? get _controller => _host.attached;

  bool get _disposed => _host.disposed;

  bool _isCurrentController(KakaoMapController controller) =>
      _host.isCurrent(controller);

  @override
  void initState() {
    super.initState();
    _pins = List<DeliveryLocationPin>.unmodifiable(widget.pins);
  }

  @override
  void didUpdateWidget(covariant KakaoDeliveryMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    _pins = List<DeliveryLocationPin>.unmodifiable(widget.pins);
  }

  @override
  void dispose() {
    _labelSub?.cancel();
    _cameraSub?.cancel();
    _host.dispose();
    _driverStyles.reset();
    super.dispose();
  }

  @override
  void setUserGestureListener(void Function()? onUserGesture) {
    _onUserGesture = onUserGesture;
  }

  Future<void> _onMapCreated(KakaoMapController controller) async {
    if (_host.disposed) return;
    _host.attach(controller);
    _driverStyles.reset();
    _driverMarkerStyleId = null;
    _driverMarkerLat = null;
    _driverMarkerLng = null;
    _driverLayerReady = false;
    _markersPlaced = false;
    _labelStyleSurfaceReady = false;
    _pendingDriverMarker = null;
    await _labelSub?.cancel();
    if (!_isCurrentController(controller)) return;
    _labelSub = controller.onLabelClickedStream.listen((event) {
      if (event.labelId == DriverLocationMarkerIds.markerId) return;
      widget.onPinTap(event.labelId);
    });
    _cameraSub?.cancel();
    _cameraSub = controller.onCameraMoveEndStream.listen((_) {
      if (_disposed) return;
      if (_programmaticCameraMove) {
        _programmaticCameraMove = false;
        return;
      }
      _onUserGesture?.call();
    });
    // Register delivery pin styles BEFORE exposing controller for driver GPS
    // marker styles — concurrent Kakao registerMarkerStyles SIGSEGVs GLThread.
    if (_pins.isNotEmpty) {
      await syncPins(_pins);
    } else {
      await Future<void>.delayed(const Duration(milliseconds: 600));
      if (!_isCurrentController(controller)) return;
      _labelStyleSurfaceReady = true;
    }
    if (!_isCurrentController(controller)) return;
    widget.onReady(this);
    await _flushPendingDriverMarker();
  }

  /// Serialize Kakao label-style registration — concurrent calls SIGSEGV on GLThread.
  Future<T> _runLabelStyleOp<T>(Future<T> Function() op) {
    final previous = _labelStyleChain;
    final gate = Completer<void>();
    _labelStyleChain = gate.future;
    return () async {
      try {
        if (previous != null) {
          try {
            await previous;
          } catch (_) {}
        }
        return await op();
      } finally {
        if (!gate.isCompleted) gate.complete();
      }
    }();
  }

  Future<void> _registerQuantityStyles(
    KakaoMapController controller,
    Iterable<DeliveryLocationPin> pins,
  ) async {
    final styles = <MarkerStyle>[];
    final seen = <String>{};
    for (final pin in pins) {
      final styleId = QuantityPinIconFactory.styleIdForQuantity(
        pin.totalQuantity,
        status: pin.visualStatus,
      );
      if (!seen.add(styleId)) continue;
      final bytes = await QuantityPinIconFactory.bytesForQuantity(
        pin.totalQuantity,
        status: pin.visualStatus,
      );
      if (bytes.isEmpty) continue;
      styles.add(
        MarkerStyle(
          styleId: styleId,
          perLevels: [
            MarkerPerLevelStyle.fromBytes(bytes: bytes, level: 0),
          ],
        ),
      );
    }
    if (styles.isEmpty) return;
    await _runLabelStyleOp(() async {
      if (!_isCurrentController(controller)) return;
      await controller.registerMarkerStyles(styles: styles);
    });
  }

  @override
  Future<DeliveryLatLng?> getCenter() async {
    final c = await _controller?.getCenter();
    if (c == null) return null;
    return DeliveryLatLng(latitude: c.latitude, longitude: c.longitude);
  }

  @override
  Future<void> syncPins(List<DeliveryLocationPin> pins) async {
    final controller = _controller;
    if (controller == null || pins.isEmpty || _disposed) return;
    _pins = List<DeliveryLocationPin>.unmodifiable(pins);

    if (!_markersPlaced) {
      await Future<void>.delayed(const Duration(milliseconds: 600));
      if (!_isCurrentController(controller)) return;

      final focus = pins.first;
      debugPrint(
        'kakao-map syncPins pinCount=${pins.length} qty=${focus.totalQuantity}',
      );

      try {
        await controller.addMarkerLayer(
          layerId: KakaoMapController.defaultLabelLayerId,
          zOrder: 1000,
          clickable: true,
        );
      } catch (e) {
        debugPrint('kakao-map addMarkerLayer FAIL: ${e.runtimeType}');
        rethrow;
      }
      if (!_isCurrentController(controller)) return;

      await _registerQuantityStyles(controller, pins);
      if (!_isCurrentController(controller)) return;

      final options = pins
          .map(
            (pin) => MarkerOption(
              id: pin.markerId,
              latLng: LatLng(
                latitude: pin.latitude,
                longitude: pin.longitude,
              ),
              styleId: QuantityPinIconFactory.styleIdForQuantity(
                pin.totalQuantity,
                status: pin.visualStatus,
              ),
              rank: 1000,
            ),
          )
          .toList(growable: false);

      if (options.length == 1) {
        await controller.addMarker(markerOption: options.first);
      } else {
        await controller.addMarkers(markerOptions: options);
      }
      if (!_isCurrentController(controller)) return;

      // Multi-stop: use parent initialTarget (namdong cluster), never fit Incheon+Seoul.
      final zoomLevel = pins.length > 1 ? 11 : 17;
      await controller.moveCamera(
        cameraUpdate: CameraUpdate(
          position: LatLng(
            latitude: widget.initialTarget.latitude,
            longitude: widget.initialTarget.longitude,
          ),
          zoomLevel: zoomLevel,
          type: 0,
        ),
        animation: const CameraAnimation(
          duration: 800,
          autoElevation: true,
          isConsecutive: false,
        ),
      );
      _markersPlaced = true;
      _labelStyleSurfaceReady = true;
      await _flushPendingDriverMarker();
      return;
    }

    // Subsequent sync: re-register styles and replace markers one by one.
    await _registerQuantityStyles(controller, pins);
    if (!_isCurrentController(controller)) return;
    for (final pin in pins) {
      try {
        await controller.removeMarker(id: pin.markerId);
      } catch (_) {}
      await controller.addMarker(
        markerOption: MarkerOption(
          id: pin.markerId,
          latLng: LatLng(latitude: pin.latitude, longitude: pin.longitude),
          styleId: QuantityPinIconFactory.styleIdForQuantity(
            pin.totalQuantity,
            status: pin.visualStatus,
          ),
          rank: 1000,
        ),
      );
    }
    _labelStyleSurfaceReady = true;
    await _flushPendingDriverMarker();
  }

  @override
  Future<void> removePin(String markerId) async {
    if (_disposed) return;
    await _controller?.removeMarker(id: markerId);
  }

  @override
  Future<void> upsertPin(DeliveryLocationPin pin) async {
    final controller = _controller;
    if (controller == null || _disposed) return;
    await _registerQuantityStyles(controller, [pin]);
    try {
      await controller.removeMarker(id: pin.markerId);
    } catch (_) {}
    await controller.addMarker(
      markerOption: MarkerOption(
        id: pin.markerId,
        latLng: LatLng(latitude: pin.latitude, longitude: pin.longitude),
        styleId: QuantityPinIconFactory.styleIdForQuantity(
          pin.totalQuantity,
          status: pin.visualStatus,
        ),
        rank: 1000,
      ),
    );
  }

  Future<void> _ensureDriverLayer(KakaoMapController controller) async {
    if (_driverLayerReady || _disposed) return;
    try {
      await controller.addMarkerLayer(
        layerId: DriverLocationMarkerIds.kakaoLayerId,
        zOrder: 2000,
        clickable: false,
      );
      _driverLayerReady = true;
    } catch (e) {
      debugPrint('kakao-map driver layer FAIL: ${e.runtimeType}');
    }
  }

  Future<void> _flushPendingDriverMarker() async {
    final pending = _pendingDriverMarker;
    if (pending == null) return;
    _pendingDriverMarker = null;
    await upsertDriverMarker(pending);
  }

  @override
  Future<void> upsertDriverMarker(DriverLocationMarkerState state) async {
    final controller = _controller;
    if (controller == null || _disposed) return;
    if (!_labelStyleSurfaceReady) {
      // Defer until pin styles / GL settle — avoids LabelPerLevelStyle SIGSEGV.
      _pendingDriverMarker = state;
      return;
    }
    if (!state.latitude.isFinite ||
        !state.longitude.isFinite ||
        (state.latitude == 0 && state.longitude == 0)) {
      return;
    }
    await _ensureDriverLayer(controller);
    if (!_isCurrentController(controller)) return;

    final styleId = KakaoDriverMarkerStyles.styleIdForState(state);
    if (KakaoDriverMarkerStyles.sameBucketAndPosition(
      lastStyleId: _driverMarkerStyleId,
      styleId: styleId,
      lastLatitude: _driverMarkerLat,
      lastLongitude: _driverMarkerLng,
      latitude: state.latitude,
      longitude: state.longitude,
    )) {
      return;
    }

    if (!_driverStyles.isRegistered(styleId)) {
      final bytes = await DriverLocationIconFactory.rotatedBytesFor(
        vehicle: state.vehicle,
        headingDegrees: state.headingDegrees,
        accuracyMeters: state.accuracyMeters,
        sessionActive: state.sessionActive,
      );
      if (bytes.isEmpty) return;
      if (!_isCurrentController(controller)) return;
      await _runLabelStyleOp(() async {
        if (!_isCurrentController(controller)) return;
        await controller.registerMarkerStyles(
          styles: [
            MarkerStyle(
              styleId: styleId,
              perLevels: [
                MarkerPerLevelStyle.fromBytes(bytes: bytes, level: 0),
              ],
            ),
          ],
        );
      });
      if (!_isCurrentController(controller)) return;
      _driverStyles.markRegistered(styleId);
    }

    // Plugin has no moveMarker; remove/add is allowed once the style exists.
    try {
      await controller.removeMarker(
        id: DriverLocationMarkerIds.markerId,
        layerId: DriverLocationMarkerIds.kakaoLayerId,
      );
    } catch (_) {}
    if (!_isCurrentController(controller)) return;
    await controller.addMarker(
      markerOption: MarkerOption(
        id: DriverLocationMarkerIds.markerId,
        latLng: LatLng(
          latitude: state.latitude,
          longitude: state.longitude,
        ),
        styleId: styleId,
        rank: 2000,
      ),
      layerId: DriverLocationMarkerIds.kakaoLayerId,
    );
    if (!_isCurrentController(controller)) return;
    _driverMarkerStyleId = styleId;
    _driverMarkerLat = state.latitude;
    _driverMarkerLng = state.longitude;
  }

  @override
  Future<void> removeDriverMarker() async {
    final controller = _controller;
    if (controller == null || _disposed) return;
    try {
      await controller.removeMarker(
        id: DriverLocationMarkerIds.markerId,
        layerId: DriverLocationMarkerIds.kakaoLayerId,
      );
    } catch (_) {}
    _driverMarkerStyleId = null;
    _driverMarkerLat = null;
    _driverMarkerLng = null;
  }

  static const _routeLayerId = 'delivery-route-trail';
  static const _routeStartId = 'session-start';
  static const _routeEndId = 'session-end';
  final List<String> _routeTrailIds = [];

  @override
  Future<void> setRoutePolyline(List<DeliveryLatLng> points) async {
    // kakao_maps_flutter 0.2.2 has no polyline API — approximate with
    // downsampled trail markers (start/end handled separately).
    final controller = _controller;
    if (controller == null) return;
    await clearRoutePolyline();
    if (points.length < 2) return;
    final step = (points.length / 40).ceil().clamp(1, 50);
    for (var i = 0; i < points.length; i += step) {
      final id = 'route-trail-$i';
      _routeTrailIds.add(id);
      try {
        await controller.addMarker(
          markerOption: MarkerOption(
            id: id,
            latLng: LatLng(
              latitude: points[i].latitude,
              longitude: points[i].longitude,
            ),
            rank: 100,
          ),
          layerId: _routeLayerId,
        );
      } catch (_) {}
    }
  }

  @override
  Future<void> clearRoutePolyline() async {
    final controller = _controller;
    if (controller == null) return;
    for (final id in _routeTrailIds) {
      try {
        await controller.removeMarker(id: id, layerId: _routeLayerId);
      } catch (_) {}
    }
    _routeTrailIds.clear();
  }

  @override
  Future<void> requestCarRoutePreview({
    required DeliveryLatLng start,
    required DeliveryLatLng destination,
  }) async {
    // Kakao Maps spike has no native car-path geometry API in this app path.
  }

  @override
  Future<void> setSessionEndpoints({
    DeliveryLatLng? start,
    DeliveryLatLng? end,
  }) async {
    final controller = _controller;
    if (controller == null) return;
    for (final id in [_routeStartId, _routeEndId]) {
      try {
        await controller.removeMarker(id: id, layerId: _routeLayerId);
      } catch (_) {}
    }
    if (start != null) {
      await controller.addMarker(
        markerOption: MarkerOption(
          id: _routeStartId,
          latLng: LatLng(latitude: start.latitude, longitude: start.longitude),
          rank: 1500,
        ),
        layerId: _routeLayerId,
      );
    }
    if (end != null) {
      await controller.addMarker(
        markerOption: MarkerOption(
          id: _routeEndId,
          latLng: LatLng(latitude: end.latitude, longitude: end.longitude),
          rank: 1500,
        ),
        layerId: _routeLayerId,
      );
    }
  }

  @override
  Future<void> moveCamera(
    DeliveryLatLng target, {
    double? zoom,
    bool programmatic = false,
    bool followUpdate = false,
  }) async {
    final controller = _controller;
    if (controller == null || _disposed) return;
    if (programmatic) {
      _programmaticCameraMove = true;
    }
    // Follow GPS without zoom: keep current level so pinch/zoom is preserved.
    final int zoomLevel;
    if (zoom != null) {
      zoomLevel = zoom.round();
    } else if (followUpdate) {
      zoomLevel = await controller.getZoomLevel() ??
          (widget.pins.length > 1 ? 14 : 17);
    } else {
      zoomLevel = widget.pins.length > 1 ? 14 : 17;
    }
    if (!_isCurrentController(controller)) return;
    await controller.moveCamera(
      cameraUpdate: CameraUpdate(
        position: LatLng(
          latitude: target.latitude,
          longitude: target.longitude,
        ),
        zoomLevel: zoomLevel,
        type: 0,
      ),
      animation: CameraAnimation(
        // Follow GPS: short consecutive updates; avoid 500ms queue lag.
        duration: followUpdate ? 100 : 500,
        autoElevation: !followUpdate,
        isConsecutive: followUpdate,
      ),
    );
  }
  @override
  Widget build(BuildContext context) {
    debugPrint('[MAP] kakao widget created');
    return KakaoMap(
      key: _mapKey,
      onMapCreated: _onMapCreated,
      initialPosition: LatLng(
        latitude: widget.initialTarget.latitude,
        longitude: widget.initialTarget.longitude,
      ),
      initialLevel: widget.pins.length > 1 ? 11 : 17,
    );
  }
}
