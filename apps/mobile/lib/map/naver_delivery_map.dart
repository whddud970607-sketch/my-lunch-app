import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_naver_map/flutter_naver_map.dart';

import '../location/driver_location_icon_factory.dart';
import '../location/driver_location_marker_state.dart';
import 'delivery_location_pin.dart';
import 'delivery_map_controller.dart';
import 'naver_map_feature.dart';
import 'quantity_pin_icon.dart';

/// Naver Maps SDK host — same DeliveryPoint coords / quantity pins as Kakao.
class NaverDeliveryMap extends StatefulWidget {
  const NaverDeliveryMap({
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
  State<NaverDeliveryMap> createState() => _NaverDeliveryMapState();
}

class _NaverDeliveryMapState extends State<NaverDeliveryMap>
    implements DeliveryMapController {
  NaverMapController? _controller;
  final Map<String, NMarker> _markers = {};
  NMarker? _driverMarker;
  void Function()? _onUserGesture;
  bool _programmaticCameraMove = false;
  List<DeliveryLocationPin> _pins = const [];
  final Map<String, NOverlayImage> _iconCache = {};
  @override
  void initState() {
    super.initState();
    _pins = List<DeliveryLocationPin>.unmodifiable(widget.pins);
  }

  @override
  void didUpdateWidget(covariant NaverDeliveryMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    _pins = List<DeliveryLocationPin>.unmodifiable(widget.pins);
  }

  @override
  void setUserGestureListener(void Function()? onUserGesture) {
    _onUserGesture = onUserGesture;
  }

  @override
  Future<void> setShieldHudPresentation({
    required String title,
    required bool showSummary,
    required int totalPoints,
    required int completedPoints,
    required int remainingPoints,
    required bool followActive,
    required bool myLocationEnabled,
    bool refreshing = false,
  }) async {}

  @override
  void setMyLocationButtonListener(void Function()? onPressed) {}

  @override
  void setHudActionListener({
    void Function()? onRefresh,
    void Function()? onProviderMenu,
  }) {}

  @override
  Future<Map<String, dynamic>?> setHudPopupsVisible(bool visible) async => null;

  @override
  Future<Map<String, dynamic>?> getProviderButtonScreenCoords() async => null;

  void _onCameraChange(NCameraUpdateReason reason, bool animated) {
    if (_programmaticCameraMove) {
      if (reason != NCameraUpdateReason.location) {
        _programmaticCameraMove = false;
      }
      return;
    }
    if (reason == NCameraUpdateReason.gesture ||
        reason == NCameraUpdateReason.control) {
      _onUserGesture?.call();
    }
  }

  Future<NOverlayImage> _driverIconFor(DriverLocationMarkerState state) async {
    final accuracy = DriverGpsAccuracyVisual.fromMeters(state.accuracyMeters);
    final key = DriverLocationIconFactory.cacheKey(
      vehicle: state.vehicle,
      headingBucket: -1,
      accuracy: accuracy,
      sessionActive: state.sessionActive,
    );
    final cached = _iconCache[key];
    if (cached != null) return cached;
    final bytes = await DriverLocationIconFactory.baseBytesFor(
      state.vehicle,
      accuracyMeters: state.accuracyMeters,
      sessionActive: state.sessionActive,
    );
    final image = await NOverlayImage.fromByteArray(
      Uint8List.fromList(bytes),
      cacheKey: key,
    );
    _iconCache[key] = image;
    return image;
  }

  @override
  Future<void> upsertDriverMarker(DriverLocationMarkerState state) async {
    final controller = _controller;
    if (controller == null) return;

    final icon = await _driverIconFor(state);
    final position = NLatLng(state.latitude, state.longitude);
    // Asset/compose faces north; Naver angle is clockwise degrees from north.
    final angle = state.headingDegrees ?? 0;

    if (_driverMarker == null) {
      final marker = NMarker(
        id: DriverLocationMarkerIds.markerId,
        position: position,
        icon: icon,
        size: const Size(46, 46),
        anchor: const NPoint(0.5, 0.5),
        angle: angle,
      );
      marker.setGlobalZIndex(250000);
      marker.setZIndex(1);
      _driverMarker = marker;
      await controller.addOverlay(marker);
      return;
    }

    _driverMarker!
      ..setPosition(position)
      ..setIcon(icon)
      ..setAngle(angle);
  }

  @override
  Future<void> removeDriverMarker() async {
    final controller = _controller;
    final marker = _driverMarker;
    if (controller == null || marker == null) return;
    try {
      await controller.deleteOverlay(marker.info);
    } catch (_) {}
    _driverMarker = null;
  }

  Future<NOverlayImage> _iconForPin(DeliveryLocationPin pin) async {
    final key = QuantityPinIconFactory.styleIdForQuantity(
      pin.totalQuantity,
      status: pin.visualStatus,
    );
    final cached = _iconCache[key];
    if (cached != null) return cached;
    final bytes = await QuantityPinIconFactory.bytesForQuantity(
      pin.totalQuantity,
      status: pin.visualStatus,
    );
    final image = await NOverlayImage.fromByteArray(
      Uint8List.fromList(bytes),
      cacheKey: key,
    );
    _iconCache[key] = image;
    return image;
  }

  Future<NMarker> _buildMarker(DeliveryLocationPin pin) async {
    final icon = await _iconForPin(pin);
    final marker = NMarker(
      id: pin.markerId,
      position: NLatLng(pin.latitude, pin.longitude),
      icon: icon,
      size: const Size(48, 48),
      anchor: const NPoint(0.5, 1.0),
    );
    marker.setOnTapListener((_) {
      widget.onPinTap(pin.markerId);
    });
    return marker;
  }

  Future<void> _onMapReady(NaverMapController controller) async {
    _controller = controller;
    widget.onReady(this);
    if (_pins.isNotEmpty) {
      await syncPins(_pins);
    }
  }

  @override
  Future<DeliveryLatLng?> getCenter() async {
    final controller = _controller;
    if (controller == null) return null;
    final pos = await controller.getCameraPosition();
    return DeliveryLatLng(
      latitude: pos.target.latitude,
      longitude: pos.target.longitude,
    );
  }

  @override
  Future<void> syncPins(List<DeliveryLocationPin> pins) async {
    final controller = _controller;
    if (controller == null) return;
    _pins = List<DeliveryLocationPin>.unmodifiable(pins);

    // Remove existing delivery markers only.
    for (final marker in _markers.values) {
      try {
        await controller.deleteOverlay(marker.info);
      } catch (_) {}
    }
    _markers.clear();

    if (pins.isEmpty) return;

    final overlays = <NAddableOverlay>{};
    for (final pin in pins) {
      final marker = await _buildMarker(pin);
      _markers[pin.markerId] = marker;
      overlays.add(marker);
    }
    await controller.addOverlayAll(overlays);

    final focus = pins.first;
    final zoom = pins.length > 1 ? 11.0 : 17.0;
    debugPrint(
      'naver-map syncPins pinCount=${pins.length} qty=${focus.totalQuantity} zoom=$zoom',
    );
    await controller.updateCamera(
      NCameraUpdate.scrollAndZoomTo(
        target: NLatLng(
          widget.initialTarget.latitude,
          widget.initialTarget.longitude,
        ),
        zoom: zoom,
      ),
    );
  }

  @override
  Future<void> removePin(String markerId) async {
    final controller = _controller;
    final marker = _markers.remove(markerId);
    if (controller == null || marker == null) return;
    try {
      await controller.deleteOverlay(marker.info);
    } catch (_) {}
  }

  @override
  Future<void> upsertPin(DeliveryLocationPin pin) async {
    final controller = _controller;
    if (controller == null) return;
    await removePin(pin.markerId);
    final marker = await _buildMarker(pin);
    _markers[pin.markerId] = marker;
    await controller.addOverlay(marker);
  }

  NPolylineOverlay? _routePolyline;
  NMarker? _sessionStartMarker;
  NMarker? _sessionEndMarker;

  @override
  Future<void> setRoutePolyline(List<DeliveryLatLng> points) async {
    final controller = _controller;
    if (controller == null) return;
    await clearRoutePolyline();
    if (points.length < 2) return;
    final coords = points
        .map((p) => NLatLng(p.latitude, p.longitude))
        .toList(growable: false);
    final polyline = NPolylineOverlay(
      id: 'delivery-route',
      coords: coords,
      color: const Color(0xFF0F6B4C),
      width: 4,
    );
    await controller.addOverlay(polyline);
    _routePolyline = polyline;
  }

  @override
  Future<void> clearRoutePolyline() async {
    final controller = _controller;
    final existing = _routePolyline;
    if (controller == null || existing == null) {
      _routePolyline = null;
      return;
    }
    await controller.deleteOverlay(existing.info);
    _routePolyline = null;
  }

  @override
  Future<void> requestCarRoutePreview({
    required DeliveryLatLng start,
    required DeliveryLatLng destination,
  }) async {
    // NAVER map adapter does not request TMAP Vector path geometry.
  }

  @override
  Future<void> setSessionEndpoints({
    DeliveryLatLng? start,
    DeliveryLatLng? end,
  }) async {
    final controller = _controller;
    if (controller == null) return;
    if (_sessionStartMarker != null) {
      await controller.deleteOverlay(_sessionStartMarker!.info);
      _sessionStartMarker = null;
    }
    if (_sessionEndMarker != null) {
      await controller.deleteOverlay(_sessionEndMarker!.info);
      _sessionEndMarker = null;
    }
    if (start != null) {
      final m = NMarker(
        id: 'session-start',
        position: NLatLng(start.latitude, start.longitude),
        caption: const NOverlayCaption(text: '시작'),
      );
      await controller.addOverlay(m);
      _sessionStartMarker = m;
    }
    if (end != null) {
      final m = NMarker(
        id: 'session-end',
        position: NLatLng(end.latitude, end.longitude),
        caption: const NOverlayCaption(text: '종료'),
      );
      await controller.addOverlay(m);
      _sessionEndMarker = m;
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
    if (controller == null) return;
    if (programmatic) _programmaticCameraMove = true;
    // followUpdate + null zoom → omit zoom so user pinch level is preserved.
    final double? resolvedZoom;
    if (zoom != null) {
      resolvedZoom = zoom;
    } else if (followUpdate) {
      resolvedZoom = null;
    } else {
      resolvedZoom = widget.pins.length > 1 ? 14.0 : 17.0;
    }
    final update = NCameraUpdate.scrollAndZoomTo(
      target: NLatLng(target.latitude, target.longitude),
      zoom: resolvedZoom,
    );
    if (followUpdate) {
      update.setAnimation(
        animation: NCameraAnimation.linear,
        duration: const Duration(milliseconds: 100),
      );
    }
    await controller.updateCamera(update);
  }

  @override
  Widget build(BuildContext context) {
    if (!NaverMapFeature.isConfigured) {
      return const _NaverUnavailablePanel(
        title: '네이버지도 준비 중',
        message:
            'Naver Client ID가 아직 설정되지 않았습니다.\n'
            'apps/mobile/.env 의 NAVER_MAP_CLIENT_ID 를 설정한 뒤\n'
            '앱을 다시 실행해 주세요.\n\n'
            '지금은 카카오맵을 계속 사용할 수 있습니다.',
      );
    }
    if (!NaverMapFeature.isReady) {
      return const _NaverUnavailablePanel(
        title: '네이버지도 초기화 실패',
        message:
            'Client ID는 있으나 SDK 초기화에 실패했습니다.\n'
            'NCP 패키지명/Bundle ID 등록을 확인해 주세요.\n\n'
            'Android: com.deliveryshield.delivery_shield_mobile\n'
            'iOS: com.deliveryshield.deliveryShieldMobile',
      );
    }

    final target = NLatLng(
      widget.initialTarget.latitude,
      widget.initialTarget.longitude,
    );
    final initialZoom = widget.pins.length > 1 ? 11.0 : 17.0;

    debugPrint('[MAP] naver widget created');
    return NaverMap(
      key: ValueKey('delivery-naver-map-$hashCode'),
      options: NaverMapViewOptions(
        initialCameraPosition: NCameraPosition(
          target: target,
          zoom: initialZoom,
        ),
        locale: const Locale('ko'),
      ),
      onMapReady: _onMapReady,
      onCameraChange: _onCameraChange,
    );
  }
}

class _NaverUnavailablePanel extends StatelessWidget {
  const _NaverUnavailablePanel({required this.title, required this.message});

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.map_outlined,
                size: 48,
                color: Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(height: 12),
              Text(title, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
              Text(
                message,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
