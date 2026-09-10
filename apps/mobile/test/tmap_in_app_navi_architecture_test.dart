import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('product TMAP navi channel is wired in MainActivity', () {
    final main = File(
      'android/app/src/main/kotlin/com/deliveryshield/delivery_shield_mobile/MainActivity.kt',
    ).readAsStringSync();
    expect(main.contains('delivery_shield/tmap_in_app_navi'), isTrue);
    expect(main.contains('startNavigation'), isTrue);
    expect(main.contains('EXTRA_PRODUCT_MODE'), isTrue);
    expect(main.contains('invalid_destination'), isTrue);
  });

  test('product mode rejects fixture destination path', () {
    final activity = File(
      'android/app/src/main/kotlin/com/deliveryshield/delivery_shield_mobile/TmapNaviPocActivity.kt',
    ).readAsStringSync();
    expect(activity.contains('EXTRA_PRODUCT_MODE'), isTrue);
    expect(activity.contains('hasValidDestination'), isTrue);
    expect(activity.contains('MapPoint(destLongitude, destLatitude)'), isTrue);
    expect(activity.contains('NAV_ACTIVITY_CREATED'), isTrue);
    expect(activity.contains('ROUTE_REQUESTED'), isTrue);
  });

  test('Flutter product adapter is not PoC bridge', () {
    final adapter = File('lib/navigation/tmap_in_app_navi.dart').readAsStringSync();
    final bridge =
        File('lib/navigation/tmap_in_app_navi_bridge.dart').readAsStringSync();
    expect(adapter.contains('TmapInAppNaviBridge'), isTrue);
    expect(bridge.contains('delivery_shield/tmap_in_app_navi'), isTrue);
    expect(bridge.contains('tmap_navi_poc'), isFalse);
  });
}
