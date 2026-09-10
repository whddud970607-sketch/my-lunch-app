import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('TMAP_HUD_MAP_SETTINGS_ACTION wired to Flutter provider menu', () {
    final kotlin = File(
      'android/app/src/main/kotlin/com/deliveryshield/delivery_shield_mobile/'
      'TmapVectorMapPlatformView.kt',
    ).readAsStringSync();
    final map = File('lib/screens/map_spike_screen.dart').readAsStringSync();
    final tmap = File('lib/map/tmap_delivery_map.dart').readAsStringSync();
    final controller = File('lib/map/delivery_map_controller.dart')
        .readAsStringSync();

    expect(kotlin.contains('onProviderMenuPressed'), isTrue);
    expect(kotlin.contains('지도 제공자'), isTrue);
    expect(kotlin.contains('ic_ds_layers'), isTrue);
    expect(kotlin.contains('hudPopupsSuppressed'), isTrue);
    expect(kotlin.contains('setHudPopupsVisible'), isTrue);
    expect(kotlin.contains('PopupWindow'), isTrue);

    expect(tmap.contains("case 'onProviderMenuPressed'"), isTrue);
    expect(tmap.contains('setHudPopupsVisible'), isTrue);
    expect(controller.contains('setHudPopupsVisible'), isTrue);

    expect(map.contains('onProviderMenu: _showTmapProviderPicker'), isTrue);
    expect(map.contains('setHudPopupsVisible(false)'), isTrue);
    expect(map.contains('WidgetsBinding.instance.endOfFrame'), isTrue);
    expect(map.contains('showMenu<MapProviderId>'), isTrue);
    expect(map.contains('CheckedPopupMenuItem<MapProviderId>'), isTrue);
    expect(map.contains('_changeMapProvider'), isTrue);
    expect(map.contains('MapProviderSettings.save'), isTrue);
    // Do not invent a second provider store in Kotlin.
    expect(kotlin.contains('SharedPreferences'), isFalse);
    expect(kotlin.contains('hudTouchActive'), isTrue);
    expect(kotlin.contains('MotionEvent.ACTION_DOWN'), isTrue);
    expect(kotlin.contains('lastHudFingerprint'), isTrue);
    expect(kotlin.contains('summaryChanged'), isTrue);
    expect(kotlin.contains('lastSummaryPopupX'), isTrue);
    expect(
      map.contains(
        "addPostFrameCallback((_) {\n        if (mounted) _pushTmapNativeHud();",
      ),
      isFalse,
    );
  });

  test('TMAP_PROVIDER_TAP_PATH uses matching callback name', () {
    final kotlin = File(
      'android/app/src/main/kotlin/com/deliveryshield/delivery_shield_mobile/'
      'TmapVectorMapPlatformView.kt',
    ).readAsStringSync();
    final tmap = File('lib/map/tmap_delivery_map.dart').readAsStringSync();
    final map = File('lib/screens/map_spike_screen.dart').readAsStringSync();
    expect(kotlin.contains('emit("onProviderMenuPressed"'), isTrue);
    expect(tmap.contains("case 'onProviderMenuPressed'"), isTrue);
    expect(tmap.contains('_onProviderMenuPressed = onProviderMenu'), isTrue);
    expect(map.contains('onProviderMenu: _showTmapProviderPicker'), isTrue);
  });

  test(
    'TMAP_HUD_TOKENS mirror Flutter UnifiedMapOverlay / MyLocationButton',
    () {
      final style = File(
        'android/app/src/main/kotlin/com/deliveryshield/delivery_shield_mobile/'
        'TmapHudStyle.kt',
      ).readAsStringSync();
      expect(style.contains('#152235'), isTrue);
      expect(style.contains('#F8FAFC'), isTrue);
      expect(style.contains('#94A3B8'), isTrue);
      expect(style.contains('#3B82F6'), isTrue);
      expect(style.contains('cardCornerRadiusDp = radiusMd'), isTrue);
      expect(style.contains('cardMarginDp = 4f'), isTrue);
      expect(style.contains('headerIconButtonSizeDp = 48f'), isTrue);
      expect(style.contains('locationElevationDp = 4f'), isTrue);
      expect(style.contains('DEFAULT_TITLE = "통합 지도"'), isTrue);
    },
  );

  test('TMAP_ZERO_COUNT_SUMMARY and Follow location controls preserved', () {
    final map = File('lib/screens/map_spike_screen.dart').readAsStringSync();
    final shell = File('lib/screens/app_shell.dart').readAsStringSync();
    final tabs = File('lib/widgets/lazy_indexed_tabs.dart').readAsStringSync();

    expect(
      map.contains('showSummary = today && _workset != null && !_loading'),
      isTrue,
    );
    expect(map.contains("if (!isTmap)"), isTrue);
    expect(map.contains('setShieldHudPresentation'), isTrue);
    expect(map.contains('followEnabled'), isTrue);
    expect(map.contains('onMyLocationPressed'), isTrue);

    expect(shell.contains('keepAliveForIndex'), isTrue);
    expect(shell.contains('AppShellTabs.map'), isTrue);
    expect(tabs.contains('keepAliveForIndex'), isTrue);
  });

  test('PROVIDER_SETTINGS_COPY matches intended product wording', () {
    final settings = File('lib/screens/map_settings_screen.dart')
        .readAsStringSync();
    expect(settings.contains('카카오 지도와 앱 내 길안내를 사용합니다.'), isTrue);
    expect(settings.contains('네이버 지도를 사용합니다.'), isTrue);
    expect(settings.contains('TMAP 지도와 앱 내 길안내를 사용합니다.'), isTrue);
    expect(settings.contains('선택 시 티맵 내비게이션으로 배송지를 엽니다'), isFalse);
    expect(settings.contains('티맵 앱으로 배송지를 엽니다'), isFalse);
  });

  test('TMAP_NAV_IN_APP production path has no external tmap app launch', () {
    final map = File('lib/screens/map_spike_screen.dart').readAsStringSync();
    final navi = File('lib/navigation/tmap_in_app_navi.dart')
        .readAsStringSync();
    expect(map.contains('TmapInAppNavi.open'), isTrue);
    expect(navi.contains('TmapInAppNaviBridge.startNavigation'), isTrue);
    expect(
      map.contains('// In-app NavigationFragment — not external tmap://'),
      isTrue,
    );
    expect(navi.contains('launchUrl'), isFalse);
    expect(navi.contains('tmap://'), isFalse);
  });

  test('KAKAO_NAVER_TOP_RIGHT_ACTIONS include refresh and provider menu', () {
    final overlay = File('lib/screens/unified_map_overlay.dart')
        .readAsStringSync();
    expect(overlay.contains('Icons.refresh'), isTrue);
    expect(overlay.contains('Icons.layers_outlined'), isTrue);
    expect(overlay.contains("tooltip: '지도 제공자'"), isTrue);
    expect(overlay.contains('PopupMenuButton<MapProviderId>'), isTrue);
  });
}
