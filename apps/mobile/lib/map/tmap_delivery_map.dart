import 'package:flutter/material.dart';

import '../config/app_config.dart';
import '../location/driver_location_marker_state.dart';
import '../navigation/point_external_navi.dart';
import '../navigation/tmap_navi_poc_bridge.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import 'delivery_location_pin.dart';
import 'delivery_map_controller.dart';
import 'map_provider_id.dart';
import 'tmap_map_feature.dart';

/// TMAP host for the delivery map tab.
///
/// Uses the installed TMAP Navi SDK / TMAP app for a selected pin.
/// There is no Vector Map / TMapView widget in this project, so pins are
/// listed here and opened with the existing TMAP renderer.
class TmapDeliveryMap extends StatefulWidget {
  const TmapDeliveryMap({
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
  State<TmapDeliveryMap> createState() => _TmapDeliveryMapState();
}

class _TmapDeliveryMapState extends State<TmapDeliveryMap> {
  late final _TmapHostController _controller = _TmapHostController(
    onOpenPin: _openPin,
  );

  @override
  void initState() {
    super.initState();
    _controller.pins = widget.pins;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onReady(_controller);
    });
  }

  @override
  void didUpdateWidget(TmapDeliveryMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    _controller.pins = widget.pins;
  }

  Future<void> _openPin(DeliveryLocationPin pin) async {
    widget.onPinTap(pin.markerId);
    if (!PointExternalNavi.isValidCoordinate(pin.latitude, pin.longitude)) {
      return;
    }
    final name = PointExternalNavi.labelFor(pin.primaryPoint);
    if (TmapMapFeature.isConfigured) {
      final cfg = AppConfig.instance;
      try {
        await TmapNaviPocBridge.launch(
          apiKey: cfg.tmapApiKey,
          clientId: cfg.tmapClientId,
          userKey: cfg.tmapUserKey,
          deviceKey: cfg.tmapDeviceKey,
          destLatitude: pin.latitude,
          destLongitude: pin.longitude,
          destName: name,
        );
        return;
      } catch (_) {
        // Fall through to installed TMAP app.
      }
    }
    await PointExternalNavi.open(
      latitude: pin.latitude,
      longitude: pin.longitude,
      name: name,
      preferredProvider: MapProviderId.tmap,
    );
  }

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Theme.of(context).colorScheme.surface,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Text(
              TmapMapFeature.isConfigured
                  ? '티맵으로 선택한 배송지를 엽니다.'
                  : '티맵 앱으로 선택한 배송지를 엽니다. 인앱 지도 SDK 키는 아직 없습니다.',
              style: AppTypography.textTheme.bodyMedium,
            ),
          ),
          Expanded(
            child: widget.pins.isEmpty
                ? const Center(child: Text('표시할 배송 위치가 없습니다'))
                : ListView.separated(
                    itemCount: widget.pins.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final pin = widget.pins[index];
                      final label = PointExternalNavi.labelFor(pin.primaryPoint);
                      return ListTile(
                        leading: CircleAvatar(
                          child: Text('${pin.totalQuantity}'),
                        ),
                        title: Text(label),
                        subtitle: Text(
                          PointExternalNavi.isValidCoordinate(
                            pin.latitude,
                            pin.longitude,
                          )
                              ? '티맵으로 열기'
                              : '좌표 대기 · 목록에는 등록됨',
                        ),
                        onTap: () => _openPin(pin),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _TmapHostController implements DeliveryMapController {
  _TmapHostController({required this.onOpenPin});

  final Future<void> Function(DeliveryLocationPin pin) onOpenPin;
  List<DeliveryLocationPin> pins = const [];

  @override
  Future<DeliveryLatLng?> getCenter() async => null;

  @override
  Future<void> syncPins(List<DeliveryLocationPin> next) async {
    pins = next;
  }

  @override
  Future<void> removePin(String markerId) async {
    pins = pins.where((p) => p.markerId != markerId).toList();
  }

  @override
  Future<void> upsertPin(DeliveryLocationPin pin) async {
    pins = [...pins.where((p) => p.markerId != pin.markerId), pin];
  }

  @override
  Future<void> moveCamera(
    DeliveryLatLng target, {
    double? zoom,
    bool programmatic = false,
  }) async {}

  @override
  Future<void> upsertDriverMarker(DriverLocationMarkerState state) async {}

  @override
  Future<void> removeDriverMarker() async {}

  @override
  Future<void> setRoutePolyline(List<DeliveryLatLng> points) async {}

  @override
  Future<void> clearRoutePolyline() async {}

  @override
  Future<void> setSessionEndpoints({
    DeliveryLatLng? start,
    DeliveryLatLng? end,
  }) async {}

  @override
  void setUserGestureListener(void Function()? onUserGesture) {}
}
