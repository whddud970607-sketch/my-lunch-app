import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kakao_maps_flutter/kakao_maps_flutter.dart';

import '../location/driver_location_icon_factory.dart';
import '../location/driver_location_marker_state.dart';
import 'delivery_location_pin.dart';
import 'delivery_map_controller.dart';
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
  static const _mapKey = ValueKey('delivery-spike-kakao-map');

  KakaoMapController? _controller;
  StreamSubscription<LabelClickEvent>? _labelSub;
  StreamSubscription<CameraMoveEndEvent>? _cameraSub;
  bool _markersPlaced = false;
  bool _driverLayerReady = false;
  bool _programmaticCameraMove = false;
  void Function()? _onUserGesture;
  String? _driverStyleKey;
  List<DeliveryLocationPin> _pins = const [];
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
    super.dispose();
  }

  @override
  void setUserGestureListener(void Function()? onUserGesture) {
    _onUserGesture = onUserGesture;
  }
  Future<void> _onMapCreated(KakaoMapController controller) async {
    _controller = controller;
    await _labelSub?.cancel();
    _labelSub = controller.onLabelClickedStream.listen((event) {
      if (event.labelId == DriverLocationMarkerIds.markerId) return;
      widget.onPinTap(event.labelId);
    });
    _cameraSub?.cancel();
    _cameraSub = controller.onCameraMoveEndStream.listen((_) {
      if (_programmaticCameraMove) {
        _programmaticCameraMove = false;
        return;
      }
      _onUserGesture?.call();
    });    widget.onReady(this);
    if (_pins.isNotEmpty) {
      await syncPins(_pins);
    }
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
      styles.add(
        MarkerStyle(
          styleId: styleId,
          perLevels: [
            MarkerPerLevelStyle.fromBytes(bytes: bytes, level: 0),
          ],
        ),
      );
    }
    if (styles.isNotEmpty) {
      await controller.registerMarkerStyles(styles: styles);
    }
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
    if (controller == null || pins.isEmpty) return;
    _pins = List<DeliveryLocationPin>.unmodifiable(pins);

    if (!_markersPlaced) {
      await Future<void>.delayed(const Duration(milliseconds: 600));
      if (!mounted || _controller != controller) return;

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

      await _registerQuantityStyles(controller, pins);

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
      return;
    }

    // Subsequent sync: re-register styles and replace markers one by one.
    await _registerQuantityStyles(controller, pins);
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
  }

  @override
  Future<void> removePin(String markerId) async {
    await _controller?.removeMarker(id: markerId);
  }

  @override
  Future<void> upsertPin(DeliveryLocationPin pin) async {
    final controller = _controller;
    if (controller == null) return;
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
    if (_driverLayerReady) return;
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

  @override
  Future<void> upsertDriverMarker(DriverLocationMarkerState state) async {
    final controller = _controller;
    if (controller == null) return;
    await _ensureDriverLayer(controller);

    final styleKey = DriverLocationIconFactory.cacheKey(
      vehicle: state.vehicle,
      headingBucket: DriverLocationIconFactory.bucketHeading(
        state.headingDegrees,
      ),
      accuracy: DriverGpsAccuracyVisual.fromMeters(state.accuracyMeters),
      sessionActive: state.sessionActive,
    );
    if (_driverStyleKey != styleKey) {
      final bytes = await DriverLocationIconFactory.rotatedBytesFor(
        vehicle: state.vehicle,
        headingDegrees: state.headingDegrees,
        accuracyMeters: state.accuracyMeters,
        sessionActive: state.sessionActive,
      );
      try {
        await controller.removeMarkerStyles(
          styleIds: [DriverLocationMarkerIds.kakaoStyleId],
        );
      } catch (_) {}
      await controller.registerMarkerStyles(
        styles: [
          MarkerStyle(
            styleId: DriverLocationMarkerIds.kakaoStyleId,
            perLevels: [
              MarkerPerLevelStyle.fromBytes(bytes: bytes, level: 0),
            ],
          ),
        ],
      );
      _driverStyleKey = styleKey;
    }

    try {
      await controller.removeMarker(
        id: DriverLocationMarkerIds.markerId,
        layerId: DriverLocationMarkerIds.kakaoLayerId,
      );
    } catch (_) {}
    await controller.addMarker(
      markerOption: MarkerOption(
        id: DriverLocationMarkerIds.markerId,
        latLng: LatLng(
          latitude: state.latitude,
          longitude: state.longitude,
        ),
        styleId: DriverLocationMarkerIds.kakaoStyleId,
        rank: 2000,
      ),
      layerId: DriverLocationMarkerIds.kakaoLayerId,
    );
  }

  @override
  Future<void> removeDriverMarker() async {
    final controller = _controller;
    if (controller == null) return;
    try {
      await controller.removeMarker(
        id: DriverLocationMarkerIds.markerId,
        layerId: DriverLocationMarkerIds.kakaoLayerId,
      );
    } catch (_) {}
    _driverStyleKey = null;
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
  }) async {
    final controller = _controller;
    if (controller == null) return;
    if (programmatic) _programmaticCameraMove = true;
    await controller.moveCamera(
      cameraUpdate: CameraUpdate(
        position: LatLng(
          latitude: target.latitude,
          longitude: target.longitude,
        ),
        zoomLevel: zoom?.round() ?? (widget.pins.length > 1 ? 14 : 17),
        type: 0,
      ),
      animation: const CameraAnimation(
        duration: 500,
        autoElevation: true,
        isConsecutive: false,
      ),
    );
  }
  @override
  Widget build(BuildContext context) {
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
