import '../config/app_config.dart';
import '../models/map_spike_point.dart';
import 'point_external_navi.dart';
import 'tmap_in_app_navi_bridge.dart';

/// Product TMAP in-app navigation ([NavigationFragment]) — not external TMAP app.
abstract final class TmapInAppNavi {
  /// WGS84: engine [MapPoint] is (lon, lat) — Flutter passes lat/lng separately.
  static double navLatitude(MapSpikePoint point) => point.latitude;

  static double navLongitude(MapSpikePoint point) => point.longitude;

  static bool canNavigate(MapSpikePoint destination) =>
      PointExternalNavi.hasValidDestination(destination);

  /// Opens native in-app TMAP navigation for [destination].
  ///
  /// Returns false when destination/keys are invalid — does not launch native.
  /// Does not call [MapLocationCoordinator.disableFollow]; callers must not either.
  ///
  /// Provide [launch] in tests to avoid touching [AppConfig] / platform channels.
  static Future<bool> open({
    required MapSpikePoint destination,
    String? apiKey,
    String? clientId,
    String? userKey,
    String? deviceKey,
    Future<void> Function({
      required String apiKey,
      required String pointId,
      required double latitude,
      required double longitude,
      required String destinationName,
      String clientId,
      String userKey,
      String deviceKey,
    })?
    launch,
  }) async {
    if (!canNavigate(destination)) return false;

    late final String resolvedKey;
    late final String resolvedClient;
    late final String resolvedUser;
    late final String resolvedDevice;

    if (launch == null) {
      resolvedKey = (apiKey ?? AppConfig.instance.tmapApiKey).trim();
      if (resolvedKey.isEmpty) return false;
      resolvedClient = (clientId ?? AppConfig.instance.tmapClientId).trim();
      resolvedUser = (userKey ?? AppConfig.instance.tmapUserKey).trim();
      resolvedDevice = (deviceKey ?? AppConfig.instance.tmapDeviceKey).trim();
    } else {
      resolvedKey = (apiKey ?? '').trim();
      if (resolvedKey.isEmpty) return false;
      resolvedClient = (clientId ?? '').trim();
      resolvedUser = (userKey ?? '').trim();
      resolvedDevice = (deviceKey ?? '').trim();
    }

    final send =
        launch ??
        ({
          required String apiKey,
          required String pointId,
          required double latitude,
          required double longitude,
          required String destinationName,
          String clientId = '',
          String userKey = '',
          String deviceKey = '',
        }) => TmapInAppNaviBridge.startNavigation(
          apiKey: apiKey,
          pointId: pointId,
          latitude: latitude,
          longitude: longitude,
          destinationName: destinationName,
          clientId: clientId,
          userKey: userKey,
          deviceKey: deviceKey,
        );

    try {
      await send(
        apiKey: resolvedKey,
        pointId: destination.pointId,
        latitude: navLatitude(destination),
        longitude: navLongitude(destination),
        destinationName: PointExternalNavi.labelFor(destination),
        clientId: resolvedClient,
        userKey: resolvedUser,
        deviceKey: resolvedDevice,
      );
      return true;
    } catch (_) {
      return false;
    }
  }
}
