import 'package:flutter/services.dart';

/// Dev-only bridge to Android Kakao Mobility in-app navigation POC.
class KakaoNaviPocBridge {
  KakaoNaviPocBridge._();

  static const MethodChannel _channel = MethodChannel(
    'delivery_shield/kakao_navi_poc',
  );

  /// Opens native [KNNaviView] activity. Android only; no-op on other platforms.
  static Future<void> launch({required String appKey}) async {
    await _channel.invokeMethod<void>('launch', {'appKey': appKey});
  }
}
