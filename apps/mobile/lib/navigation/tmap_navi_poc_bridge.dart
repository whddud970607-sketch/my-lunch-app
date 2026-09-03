import 'package:flutter/services.dart';

/// Dev-only bridge to Android TMAP Navi UI SDK PoC.
class TmapNaviPocBridge {
  TmapNaviPocBridge._();

  static const MethodChannel _channel = MethodChannel(
    'delivery_shield/tmap_navi_poc',
  );

  /// Opens native [TmapNaviPocActivity]. Android only.
  static Future<void> launch({
    required String apiKey,
    String clientId = '',
    String userKey = '',
    String deviceKey = '',
  }) async {
    await _channel.invokeMethod<void>('launch', {
      'apiKey': apiKey,
      'clientId': clientId,
      'userKey': userKey,
      'deviceKey': deviceKey,
    });
  }
}
