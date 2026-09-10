import 'package:kakao_maps_flutter/kakao_maps_flutter.dart';

import '../config/app_config.dart';
import '../config/device_abi.dart';
import '../debug/startup_timing.dart';
import 'naver_map_bootstrap.dart';
import 'naver_map_feature.dart';

/// Lazy map-provider SDK init (Kakao Maps + Naver). Safe to call many times.
///
/// PlatformView factory registration stays in MainActivity; this only runs
/// SDK auth/init when first needed (or post-frame from main).
class MapSdkBootstrap {
  MapSdkBootstrap._();

  static Future<void>? _inflight;

  static Future<void> ensureInitialized() {
    return _inflight ??= _initialize();
  }

  static Future<void> _initialize() async {
    registerNaverMapBootstrap();
    final kakaoNativeOk = await DeviceAbi.isKakaoMapNativeSupported();
    if (kakaoNativeOk) {
      await StartupTiming.mark('MAP_SDK_KAKAO_INIT_START');
      await KakaoMapsFlutter.init(AppConfig.instance.kakaoNativeAppKey);
      await StartupTiming.mark('MAP_SDK_KAKAO_INIT_END');
    }
    await StartupTiming.mark('MAP_SDK_NAVER_INIT_START');
    await NaverMapFeature.tryInitialize();
    await StartupTiming.mark('MAP_SDK_NAVER_INIT_END');
  }
}
