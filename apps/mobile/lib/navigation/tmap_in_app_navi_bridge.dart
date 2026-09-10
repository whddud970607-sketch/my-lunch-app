import 'package:flutter/services.dart';

/// Product MethodChannel bridge for TMAP in-app [NavigationFragment] navigation.
///
/// Distinct from the debug-only PoC bridge channel.
class TmapInAppNaviBridge {
  TmapInAppNaviBridge._();

  static const MethodChannel _channel = MethodChannel(
    'delivery_shield/tmap_in_app_navi',
  );

  /// Starts native in-app navigation. Android only.
  ///
  /// Does not log API keys. Destination must already be validated by caller.
  static Future<void> startNavigation({
    required String apiKey,
    required String pointId,
    required double latitude,
    required double longitude,
    required String destinationName,
    String clientId = '',
    String userKey = '',
    String deviceKey = '',
  }) async {
    await _channel.invokeMethod<void>('startNavigation', {
      'apiKey': apiKey,
      'clientId': clientId,
      'userKey': userKey,
      'deviceKey': deviceKey,
      'pointId': pointId,
      'latitude': latitude,
      'longitude': longitude,
      'destinationName': destinationName,
    });
  }
}
