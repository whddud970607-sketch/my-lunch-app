import '../config/app_config.dart';

/// Feature guard for Naver Map SDK.
///
/// Never call [FlutterNaverMap.init] when Client ID is missing — that path
/// must not crash the app. Init is performed only when [isConfigured] is true.
class NaverMapFeature {
  NaverMapFeature._();

  static bool _initialized = false;

  /// True when `NAVER_MAP_CLIENT_ID` is present in mobile env (value not logged).
  static bool get isConfigured {
    final id = AppConfig.instance.naverMapClientId;
    return id != null && id.isNotEmpty;
  }

  static bool get isReady => _initialized && isConfigured;

  /// Call once from [main] only if [isConfigured]. Safe no-op otherwise.
  static Future<void> tryInitialize() async {
    if (!isConfigured) {
      _initialized = false;
      return;
    }
    // Deferred: actual FlutterNaverMap().init runs only when Client ID exists.
    // Imported lazily inside this method after package is wired.
    await _initSdk();
  }

  static Future<void> _initSdk() async {
    // Implemented in naver_map_bootstrap.dart to keep unused-import clean
    // when Client ID is absent at compile time — still safe either way.
    final ok = await naverMapBootstrapInit();
    _initialized = ok;
  }
}

/// Injected by bootstrap file; default fails closed without crashing.
Future<bool> Function() naverMapBootstrapInit = () async => false;
