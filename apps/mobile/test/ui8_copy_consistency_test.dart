import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/config/app_info.dart';

void main() {
  test('APP_INFO matches pubspec version and is not invented', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    expect(pubspec.contains('version: ${AppInfo.versionName}+${AppInfo.buildNumber}'),
        isTrue);
    expect(AppInfo.userFacingVersion, '버전 ${AppInfo.versionName}');
    expect(AppInfo.userFacingVersion.contains('http'), isFalse);
    expect(AppInfo.userFacingVersion.contains('supabase'), isFalse);
  });

  test('HOME_COPY_CONSISTENT', () {
    final home = File('lib/screens/home_dashboard.dart').readAsStringSync();
    expect(home.contains('오늘의 배송'), isTrue);
    expect(home.contains('오늘 배송 시작'), isTrue);
    expect(home.contains('배송 종료'), isTrue);
    expect(home.contains('DriverChromeCopy.viewOnMap'), isTrue);
    expect(home.contains('DriverChromeCopy.emptyToday'), isTrue);
    expect(home.contains("'Workday'"), isFalse);
    expect(home.contains('Execution Session'), isFalse);
  });

  test('MAP_COPY_CONSISTENT', () {
    final overlay = File('lib/screens/unified_map_overlay.dart').readAsStringSync();
    final map = File('lib/screens/map_spike_screen.dart').readAsStringSync();
    expect(map.contains('통합 지도'), isTrue);
    expect(overlay.contains('DriverChromeCopy.sourceGroup'), isTrue);
    expect(overlay.contains("'소스'"), isFalse);
    expect(map.contains('Point ID'), isFalse);
    expect(map.contains('Shipment ID'), isFalse);
  });

  test('DELIVERY_COPY_CONSISTENT', () {
    final list = File('lib/screens/delivery_list_view.dart').readAsStringSync();
    final screen = File('lib/screens/delivery_list_screen.dart').readAsStringSync();
    expect(screen.contains('배송 목록'), isTrue);
    expect(list.contains('DriverChromeCopy.viewOnMap'), isTrue);
    expect(list.contains('DriverChromeCopy.emptyToday'), isTrue);
    expect(list.contains('UUID'), isFalse);
  });

  test('SCANNER_COPY_CONSISTENT', () {
    final scanner = File('lib/screens/scanner_screen.dart').readAsStringSync();
    expect(scanner.contains("'스캔'"), isTrue);
    expect(scanner.contains('다시 스캔'), isTrue);
    expect(scanner.contains('DriverChromeCopy.registerByAddress'), isTrue);
    expect(scanner.contains('sync queue'), isFalse);
    expect(scanner.contains('Shipment ID'), isFalse);
  });

  test('COMPLETE_COPY_CONSISTENT', () {
    final complete =
        File('lib/screens/complete_delivery_screen.dart').readAsStringSync();
    expect(complete.contains('배송 완료'), isTrue);
    expect(complete.contains("'Workday'"), isFalse);
    expect(complete.contains("'Point ID'"), isFalse);
  });

  test('WORKDAY_END_COPY_CONSISTENT', () {
    final confirm = File('lib/screens/workday_end_confirm.dart').readAsStringSync();
    expect(confirm.contains('오늘 배송 종료'), isTrue);
    expect(confirm.contains('계속 배송하기'), isTrue);
    expect(confirm.contains("'Workday'"), isFalse);
  });

  test('MAJOR_EMPTY_STATES and MAJOR_ERROR_STATES remain on major tabs', () {
    final home = File('lib/screens/home_dashboard.dart').readAsStringSync();
    final overlay = File('lib/screens/unified_map_overlay.dart').readAsStringSync();
    final list = File('lib/screens/delivery_list_view.dart').readAsStringSync();
    final scanner = File('lib/screens/scanner_screen.dart').readAsStringSync();
    expect(home.contains('HomeDashboardKeys.zeroState'), isTrue);
    expect(home.contains('HomeDashboardKeys.errorState'), isTrue);
    expect(home.contains('HomeDashboardKeys.loadingState'), isTrue);
    expect(overlay.contains('MapEmptyPanel'), isFalse);
    expect(overlay.contains('MapErrorPanel'), isTrue);
    expect(overlay.contains('MapLoadingPanel'), isTrue);
    expect(list.contains('DeliveryListKeys.emptyState'), isTrue);
    expect(list.contains('DeliveryListKeys.zeroMatchState'), isTrue);
    expect(list.contains('DeliveryListKeys.errorState'), isTrue);
    expect(list.contains('DeliveryListKeys.loadingState'), isTrue);
    expect(scanner.contains('ScannerKeys.permissionDenied'), isTrue);
    expect(scanner.contains('ScannerKeys.initializing'), isTrue);
    expect(scanner.contains('ScannerKeys.error'), isTrue);
    expect(scanner.contains('ScannerKeys.detected'), isTrue);
  });

  test('SCANNER_INTEGRATION_REQUIREMENT_PRESERVED as next-phase boundary', () {
    final session = File('lib/screens/scanner_session.dart').readAsStringSync();
    expect(session.contains('Shipment'), isTrue);
    expect(session.contains('delivery address'), isTrue);
    expect(session.contains('fake local production mappings'), isTrue);
    final scanner = File('lib/screens/scanner_screen.dart').readAsStringSync();
    expect(scanner.contains('createDelivery'), isFalse);
  });
}
