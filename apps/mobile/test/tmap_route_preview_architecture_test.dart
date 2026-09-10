import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('TMAP_ROUTE_PREVIEW uses Vector findPathDataWithType CAR_PATH', () {
    final native = File(
      'android/app/src/main/kotlin/com/deliveryshield/delivery_shield_mobile/TmapVectorMapPlatformView.kt',
    ).readAsStringSync();
    expect(native.contains('findPathDataWithType'), isTrue);
    expect(native.contains('TMapPathType.CAR_PATH'), isTrue);
    expect(native.contains('OnFindPathDataWithTypeListener'), isTrue);
    expect(native.contains('addTMapPolyLine'), isTrue);
    expect(native.contains('requestCarRoutePreview'), isTrue);
    expect(native.contains('setRoutePolyline'), isTrue);
    expect(native.contains('clearRoutePolyline'), isTrue);
    expect(native.contains('routeGeneration'), isTrue);
    expect(native.contains('STALE_IGNORED'), isTrue);
    expect(native.contains('ROUTE_POLYLINE_ID'), isTrue);
    // No NavigationFragment / dual camera for preview.
    expect(native.contains('NavigationFragment'), isFalse);
    // No reflection into private Navi objects.
    expect(native.contains('java.lang.reflect'), isFalse);
  });

  test('TMAP_ROUTE_POLYLINE controller methods are wired', () {
    final dart = File('lib/map/tmap_delivery_map.dart').readAsStringSync();
    expect(dart.contains('setRoutePolyline'), isTrue);
    expect(dart.contains('clearRoutePolyline'), isTrue);
    expect(dart.contains('requestCarRoutePreview'), isTrue);
    expect(dart.contains("await _invoke('setRoutePolyline'"), isTrue);
    expect(dart.contains("await _invoke('requestCarRoutePreview'"), isTrue);
    // Must not remain deferred no-op.
    expect(dart.contains('MP-C3: not implemented (deferred)'), isFalse);
  });

  test('ROUTE_PREVIEW does not disable Follow on selection', () {
    final map = File('lib/screens/map_spike_screen.dart').readAsStringSync();
    expect(map.contains('_requestTmapRoutePreview'), isTrue);
    expect(map.contains('requestCarRoutePreview'), isTrue);
    // Selection path must not call disableFollow for preview.
    final pinTapIdx = map.indexOf('void _onPinTap');
    final navigateIdx = map.indexOf('Future<void> _navigateToPoint');
    expect(pinTapIdx, greaterThanOrEqualTo(0));
    expect(navigateIdx, greaterThan(pinTapIdx));
    final selectionBlock = map.substring(pinTapIdx, navigateIdx);
    expect(selectionBlock.contains('disableFollow('), isFalse);
    expect(selectionBlock.contains('_requestTmapRoutePreview'), isTrue);
  });

  test('TMAP_IN_APP_NAV remains NavigationFragment path', () {
    final map = File('lib/screens/map_spike_screen.dart').readAsStringSync();
    expect(map.contains('TmapInAppNavi.open'), isTrue);
    expect(map.contains('setCameraFollowSuppressed(true)'), isTrue);
    // External tmap deep link must not return as primary TMAP nav.
    final tmapBranch = RegExp(
      r'if \(_mapProviderId == MapProviderId\.tmap\) \{([\s\S]*?)return;',
    ).firstMatch(map);
    expect(tmapBranch, isNotNull);
    expect(tmapBranch!.group(1)!.contains('PointExternalNavi.open'), isFalse);
    expect(tmapBranch.group(1)!.contains('TmapInAppNavi.open'), isTrue);
  });

  test('KAKAO_NAVER requestCarRoutePreview remain no-ops', () {
    final kakao = File('lib/map/kakao_delivery_map.dart').readAsStringSync();
    final naver = File('lib/map/naver_delivery_map.dart').readAsStringSync();
    expect(kakao.contains('requestCarRoutePreview'), isTrue);
    expect(naver.contains('requestCarRoutePreview'), isTrue);
    expect(kakao.contains('findPathDataWithType'), isFalse);
    expect(naver.contains('findPathDataWithType'), isFalse);
  });

  test('NO_EXTERNAL_DIRECTIONS_SERVICE added for route preview', () {
    final native = File(
      'android/app/src/main/kotlin/com/deliveryshield/delivery_shield_mobile/TmapVectorMapPlatformView.kt',
    ).readAsStringSync();
    final dart = File('lib/map/tmap_delivery_map.dart').readAsStringSync();
    final map = File('lib/screens/map_spike_screen.dart').readAsStringSync();
    for (final src in [native, dart, map]) {
      expect(src.contains('openrouteservice'), isFalse);
      expect(src.contains('maps.googleapis.com/maps/api/directions'), isFalse);
      expect(src.contains('naveropenapi.apigw'), isFalse);
      expect(src.contains('dapi.kakao.com/v2/directions'), isFalse);
    }
  });
}
