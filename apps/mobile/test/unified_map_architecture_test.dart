import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('DRIVER_UUID_HIDDEN on unified map chrome', () {
    final overlay =
        File('lib/screens/unified_map_overlay.dart').readAsStringSync();
    final card =
        File('lib/widgets/map_selected_point_card.dart').readAsStringSync();
    final map =
        File('lib/screens/map_spike_screen.dart').readAsStringSync();

    expect(overlay.contains('driverId'), isFalse);
    expect(card.contains('driverId'), isFalse);
    expect(card.contains('contactValue'), isFalse);
    expect(map.contains("Text(widget.driverId"), isFalse);
    expect(map.contains(r'${widget.driverId}'), isFalse);
    expect(map.contains('통합 지도'), isTrue);
  });

  test('ACCESS_SECRET_DEFAULT_VISIBLE is not on compact card', () {
    final card =
        File('lib/widgets/map_selected_point_card.dart').readAsStringSync();
    expect(card.contains('출입정보'), isFalse);
    expect(card.contains('fetchAccessInfo'), isFalse);
    expect(card.contains('onRevealAccessInfo'), isFalse);
    expect(card.contains('accessPlaintext'), isFalse);
    expect(card.contains('access_secret'), isFalse);
  });

  test('MAP_PROVIDER_PRESERVED keeps Kakao/Naver surface switch', () {
    final surface =
        File('lib/map/delivery_map_surface.dart').readAsStringSync();
    final overlay =
        File('lib/screens/unified_map_overlay.dart').readAsStringSync();
    final map =
        File('lib/screens/map_spike_screen.dart').readAsStringSync();
    expect(surface.contains('KakaoDeliveryMap'), isTrue);
    expect(surface.contains('NaverDeliveryMap'), isTrue);
    expect(map.contains('DeliveryMapSurface'), isTrue);
    expect(overlay.contains('PopupMenuButton<MapProviderId>'), isTrue);
    expect(File('lib/map/kakao_delivery_map.dart').existsSync(), isTrue);
    expect(File('lib/map/naver_delivery_map.dart').existsSync(), isTrue);
  });

  test('MAP_CURRENT_LOCATION_CONTROL still uses coordinator', () {
    final map =
        File('lib/screens/map_spike_screen.dart').readAsStringSync();
    expect(map.contains('MyLocationButton'), isTrue);
    expect(map.contains('onMyLocationPressed'), isTrue);
    expect(map.contains('MapLocationCoordinator'), isTrue);
  });

  test('MAP_ZERO_POINTS_SHOWS_MAP', () {
    final map = File('lib/screens/map_spike_screen.dart').readAsStringSync();
    expect(map.contains('DeliveryMapSurface'), isTrue);
    expect(map.contains('MyLocationButton'), isTrue);
  });

  test('MAP_ZERO_POINTS_NO_EMPTY_OVERLAY', () {
    final map = File('lib/screens/map_spike_screen.dart').readAsStringSync();
    final overlay =
        File('lib/screens/unified_map_overlay.dart').readAsStringSync();
    expect(map.contains('MapEmptyPanel'), isFalse);
    expect(map.contains('emptyToday'), isFalse);
    expect(map.contains('오늘 배정된 배송이 없습니다'), isFalse);
    expect(overlay.contains('MapEmptyPanel'), isFalse);
  });

  test('MAP_ZERO_POINTS_NO_REFRESH_OVERLAY', () {
    final map = File('lib/screens/map_spike_screen.dart').readAsStringSync();
    final overlay =
        File('lib/screens/unified_map_overlay.dart').readAsStringSync();
    expect(map.contains('MapEmptyPanel'), isFalse);
    expect(overlay.contains('label: DriverChromeCopy.refresh'), isFalse);
    expect(overlay.contains('UnifiedMapKeys.refresh'), isTrue);
  });

  test('MAP_OFFSTAGE_RECREATE_SUBSCRIBES_TICKER', () {
    final map = File('lib/screens/map_spike_screen.dart').readAsStringSync();
    expect(map.contains('TickerMode.valuesOf(context)'), isTrue);
    expect(map.contains("recreateNativeMap('offstage')"), isTrue);
    expect(map.contains("recreateNativeMap('app_resume')"), isTrue);
    // Projections must not short-circuit visibility handling.
    final deps = map.split('void didChangeDependencies()')[1].split('@override')[0];
    final tickerIdx = deps.indexOf('TickerMode.valuesOf');
    final earlyReturnIdx = deps.indexOf('identical(projections');
    expect(tickerIdx, greaterThanOrEqualTo(0));
    expect(earlyReturnIdx, greaterThan(tickerIdx));
  });

  test('MAP_LOADING_STATE_PRESERVED', () {
    final map = File('lib/screens/map_spike_screen.dart').readAsStringSync();
    expect(map.contains('MapLoadingPanel'), isTrue);
    expect(map.contains('_loading && _pointsById.isEmpty'), isTrue);
    expect(map.contains('if (!isRefresh) _mapHostGeneration++'), isFalse);
    expect(map.contains('Positioned.fill'), isTrue);
  });

  test('MAP_ERROR_STATE_PRESERVED', () {
    final map = File('lib/screens/map_spike_screen.dart').readAsStringSync();
    expect(map.contains('MapErrorPanel'), isTrue);
    expect(map.contains('_error != null && _pointsById.isEmpty'), isTrue);
  });

  test('NAVIGATE_CTA_WIRING uses Kakao in-app nav for Kakao map', () {
    final map =
        File('lib/screens/map_spike_screen.dart').readAsStringSync();
    expect(map.contains('KakaoInAppNavi'), isTrue);
    expect(map.contains('TmapInAppNavi'), isTrue);
    expect(map.contains('_navigateToPoint'), isTrue);
    expect(map.contains('onNavigate:'), isTrue);
    expect(map.contains('TmapNaviPocBridge'), isFalse);
    expect(map.contains('NaviApi'), isFalse);
    expect(map.contains('kakaonavi://'), isFalse);
  });

  test('TMAP_IN_APP_NAV_WIRING uses product adapter not external deep link', () {
    final map =
        File('lib/screens/map_spike_screen.dart').readAsStringSync();
    expect(map.contains('TmapInAppNavi.open'), isTrue);
    expect(map.contains('MapProviderId.tmap'), isTrue);
    // Product path must not call PointExternalNavi for tmap branch as primary.
    expect(map.contains('setCameraFollowSuppressed(true)'), isTrue);
    expect(map.contains('_tmapInAppNaviActive'), isTrue);
    expect(map.contains('disableFollow()'), isTrue); // session end only
  });

  test('DELIVERY_LIST_NAVIGATE uses Kakao in-app nav', () {
    final list =
        File('lib/screens/delivery_list_screen.dart').readAsStringSync();
    expect(list.contains('KakaoInAppNavi'), isTrue);
    expect(list.contains('TmapInAppNavi'), isTrue);
    expect(list.contains('NaviApi'), isFalse);
    expect(list.contains('kakaonavi://'), isFalse);
  });

  test('EXTERNAL_KAKAO_NAVI_SDK not in product navigation sources', () {
    final navi =
        File('lib/navigation/point_external_navi.dart').readAsStringSync();
    final main = File('lib/main.dart').readAsStringSync();
    final pubspec = File('pubspec.yaml').readAsStringSync();
    expect(navi.contains('kakao_flutter_sdk_navi'), isFalse);
    expect(navi.contains('NaviApi'), isFalse);
    expect(main.contains('kakao_flutter_sdk_navi'), isFalse);
    expect(main.contains('KakaoSdk.init'), isFalse);
    expect(pubspec.contains('kakao_flutter_sdk_navi'), isFalse);
  });

  test('APP_SHELL_BOTTOM_NAV_PRESERVED keeps map tab inside shell', () {
    final shell = File('lib/screens/app_shell.dart').readAsStringSync();
    expect(shell.contains("label: '홈'"), isTrue);
    expect(shell.contains("label: '지도'"), isTrue);
    expect(shell.contains("label: '배송'"), isTrue);
    expect(shell.contains("label: '스캔'"), isTrue);
    expect(shell.contains("label: '메뉴'"), isTrue);
    expect(shell.contains('MapSpikeScreen'), isTrue);
    expect(shell.contains('DeliveryMapDataSource.today'), isTrue);
    expect(shell.contains('MenuScreen'), isTrue);
  });

  test('DEBUG_FIXTURE_PRESERVED on Menu developer tools', () {
    final debug = File('lib/screens/menu_debug_tools.dart').readAsStringSync();
    expect(debug.contains('namdong10'), isTrue);
    expect(debug.contains('DeliveryMapDataSource.namdong10'), isTrue);
    expect(debug.contains('KakaoNaviPocBridge'), isTrue);
    expect(debug.contains('TmapNaviPocBridge'), isTrue);
    expect(debug.contains('개발자 도구'), isTrue);
    final home = File('lib/screens/home_screen.dart').readAsStringSync();
    expect(home.contains('개발자 도구'), isFalse);
  });

  test('DETAIL_ACTION still opens DeliveryDetailPanel', () {
    final map =
        File('lib/screens/map_spike_screen.dart').readAsStringSync();
    expect(map.contains('DeliveryDetailPanel'), isTrue);
    expect(map.contains('onRevealAccessInfo'), isTrue);
    expect(map.contains('MapSelectedPointCard'), isTrue);
    expect(map.contains('_detailOpen'), isTrue);
  });
}
