import 'package:flutter/material.dart';

import 'delivery_location_pin.dart';
import 'delivery_map_controller.dart';
import 'kakao_delivery_map.dart';
import 'map_provider_id.dart';
import 'naver_delivery_map.dart';
import 'tmap_delivery_map.dart';

/// Picks the map SDK host for the selected [MapProviderId].
class DeliveryMapSurface extends StatelessWidget {
  const DeliveryMapSurface({
    super.key,
    required this.providerId,
    required this.initialTarget,
    required this.pins,
    required this.onPinTap,
    required this.onReady,
    this.selectedMarkerId,
  });

  final MapProviderId providerId;
  final DeliveryLatLng initialTarget;
  final List<DeliveryLocationPin> pins;
  final DeliveryPinTapCallback onPinTap;
  final DeliveryMapReadyCallback onReady;

  /// Optional Flutter-owned selection (used by TMAP pin chrome restore).
  final String? selectedMarkerId;

  @override
  Widget build(BuildContext context) {
    switch (providerId) {
      case MapProviderId.kakao:
        return KakaoDeliveryMap(
          key: const ValueKey('map-host-kakao'),
          initialTarget: initialTarget,
          pins: pins,
          onPinTap: onPinTap,
          onReady: onReady,
        );
      case MapProviderId.naver:
        return NaverDeliveryMap(
          key: const ValueKey('map-host-naver'),
          initialTarget: initialTarget,
          pins: pins,
          onPinTap: onPinTap,
          onReady: onReady,
        );
      case MapProviderId.tmap:
        return TmapDeliveryMap(
          key: const ValueKey('map-host-tmap'),
          initialTarget: initialTarget,
          pins: pins,
          onPinTap: onPinTap,
          onReady: onReady,
          selectedMarkerId: selectedMarkerId,
        );
    }
  }
}
