/// Map host must mount independently of workset / pin validation.
abstract final class MapHostPolicy {
  static const defaultCamera = (latitude: 37.5665, longitude: 126.9780);
  static const nativeReadyTimeout = Duration(milliseconds: 1500);
  static const maxNativeReadyRetries = 2;

  static bool worksetBlocksSurface() => false;

  static bool bumpGenerationAfterWorkset() => false;

  static bool bumpGenerationOnProviderChange() => true;

  static bool keepSurfaceOnLoading() => true;

  static bool keepSurfaceOnError() => true;

  static bool keepSurfaceOnInvalidPins() => true;

  static bool shouldRecreateAfterOffstage({
    required bool becameVisible,
    required bool nativeReady,
  }) {
    // IndexedStack offstage blanks Kakao/Naver PlatformViews even if previously ready.
    // nativeReady is informational; blank surfaces happen regardless.
    return becameVisible;
  }

  /// Surface must paint on the first map-tab frame, before workset completes.
  static bool mountSurfaceBeforeWorkset() => true;

  static bool shouldRetryNativeReady({
    required bool nativeReady,
    required int retries,
  }) {
    return !nativeReady && retries < maxNativeReadyRetries;
  }
}
