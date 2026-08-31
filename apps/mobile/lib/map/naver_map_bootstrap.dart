import 'package:flutter/foundation.dart';
import 'package:flutter_naver_map/flutter_naver_map.dart';

import '../config/app_config.dart';
import 'naver_map_feature.dart';

/// Wires [NaverMapFeature] to flutter_naver_map init — only with a Client ID.
void registerNaverMapBootstrap() {
  naverMapBootstrapInit = () async {
    final clientId = AppConfig.instance.naverMapClientId;
    if (clientId == null || clientId.isEmpty) {
      return false;
    }
    try {
      await FlutterNaverMap().init(
        clientId: clientId,
        onAuthFailed: (ex) {
          // Never log Client ID / secrets — type only.
          debugPrint('naver-map auth failed: ${ex.runtimeType}');
        },
      );
      return true;
    } catch (e) {
      debugPrint('naver-map init failed: ${e.runtimeType}');
      return false;
    }
  };
}
