import '../config/app_config.dart';
import '../models/map_spike_point.dart';
import 'kakao_navi_poc_bridge.dart';
import 'point_external_navi.dart';

/// Product Kakao in-app navigation (KNSDK [KNNaviView]) — never external Navi.
abstract final class KakaoInAppNavi {
  /// WGS84: x = longitude, y = latitude (same semantics as map pins).
  static double navX(MapSpikePoint point) => point.longitude;

  static double navY(MapSpikePoint point) => point.latitude;

  static bool canNavigate(MapSpikePoint destination) =>
      PointExternalNavi.hasValidDestination(destination);

  /// Opens native in-app navigation with [destination] and all valid [worksetPoints].
  ///
  /// [worksetPoints] should follow current map visibility policy (filtered snapshot).
  /// Coordinates are taken from each [MapSpikePoint] as-is (MAP_NAV_COORD_MATCH).
  static Future<bool> open({
    required MapSpikePoint destination,
    required List<MapSpikePoint> worksetPoints,
    double? startLatitude,
    double? startLongitude,
    Future<void> Function(KakaoInAppNavSession session)? launch,
  }) async {
    if (!canNavigate(destination)) return false;

    final stops = <KakaoInAppNavStop>[];
    var number = 1;
    var destinationNumber = 1;
    for (final point in worksetPoints) {
      if (!PointExternalNavi.isValidCoordinate(
        point.latitude,
        point.longitude,
      )) {
        continue;
      }
      if (point.pointId == destination.pointId) {
        destinationNumber = number;
      }
      stops.add(
        KakaoInAppNavStop(
          deliveryNumber: number,
          pointId: point.pointId,
          name: PointExternalNavi.labelFor(point),
          product: point.product,
          quantity: point.quantity,
          address: point.address,
          detailAddress: point.detailAddress,
          customerName: point.customerName,
          latitude: point.latitude,
          longitude: point.longitude,
          statusCode: point.statusCode,
          isCompleted: point.isCompleted,
        ),
      );
      number++;
    }

    if (stops.isEmpty) {
      // Destination alone if workset snapshot had no other valid coords.
      stops.add(
        KakaoInAppNavStop(
          deliveryNumber: 1,
          pointId: destination.pointId,
          name: PointExternalNavi.labelFor(destination),
          product: destination.product,
          quantity: destination.quantity,
          address: destination.address,
          detailAddress: destination.detailAddress,
          customerName: destination.customerName,
          latitude: destination.latitude,
          longitude: destination.longitude,
          statusCode: destination.statusCode,
          isCompleted: destination.isCompleted,
        ),
      );
      destinationNumber = 1;
    } else if (!stops.any((s) => s.pointId == destination.pointId)) {
      destinationNumber = stops.length + 1;
      stops.add(
        KakaoInAppNavStop(
          deliveryNumber: destinationNumber,
          pointId: destination.pointId,
          name: PointExternalNavi.labelFor(destination),
          product: destination.product,
          quantity: destination.quantity,
          address: destination.address,
          detailAddress: destination.detailAddress,
          customerName: destination.customerName,
          latitude: destination.latitude,
          longitude: destination.longitude,
          statusCode: destination.statusCode,
          isCompleted: destination.isCompleted,
        ),
      );
    }

    final session = KakaoInAppNavSession(
      destinationPointId: destination.pointId,
      destinationNumber: destinationNumber,
      destinationName: PointExternalNavi.labelFor(destination),
      destinationLatitude: destination.latitude,
      destinationLongitude: destination.longitude,
      startLatitude: startLatitude,
      startLongitude: startLongitude,
      stops: List<KakaoInAppNavStop>.unmodifiable(stops),
    );

    // Coord invariant: nav x/y match map pin (longitude / latitude).
    assert(session.destinationLongitude == navX(destination));
    assert(session.destinationLatitude == navY(destination));

    final send = launch ??
        (KakaoInAppNavSession s) => KakaoNaviPocBridge.launch(
              appKey: AppConfig.instance.kakaoNativeAppKey,
              session: s,
            );
    try {
      await send(session);
      return true;
    } catch (_) {
      return false;
    }
  }
}
