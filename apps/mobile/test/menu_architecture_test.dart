import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('MENU_TAB_REAL_SCREEN replaces placeholder in AppShell', () {
    final shell = File('lib/screens/app_shell.dart').readAsStringSync();
    expect(shell.contains('MenuScreen'), isTrue);
    expect(shell.contains('FeaturePlaceholderScreen'), isFalse);
    expect(shell.contains('메뉴 준비 중'), isFalse);
    expect(shell.contains("label: '홈'"), isTrue);
    expect(shell.contains("label: '지도'"), isTrue);
    expect(shell.contains("label: '배송'"), isTrue);
    expect(shell.contains("label: '스캔'"), isTrue);
    expect(shell.contains("label: '메뉴'"), isTrue);
  });

  test('MENU_EXISTING_SETTINGS_ONLY uses MapSettingsScreen and AppInfo', () {
    final menu = File('lib/screens/menu_screen.dart').readAsStringSync();
    final shell = File('lib/screens/app_shell.dart').readAsStringSync();
    expect(menu.contains('지도 설정'), isTrue);
    expect(menu.contains('TMAP'), isFalse);
    expect(menu.contains('Kakao Navigation POC'), isFalse);
    expect(shell.contains('MapSettingsScreen'), isTrue);
    expect(shell.contains('AppInfo.userFacingVersion'), isTrue);
  });

  test('MENU_NO_INTERNAL_UUID on menu presentation', () {
    final files = [
      'lib/screens/menu_screen.dart',
      'lib/screens/menu_account_data.dart',
      'lib/screens/logout_confirm.dart',
    ];
    for (final path in files) {
      final src = File(path).readAsStringSync();
      expect(src.contains('userId'), isFalse, reason: path);
      expect(src.contains('person_id'), isFalse, reason: path);
      expect(src.contains('personId'), isFalse, reason: path);
      expect(src.contains('driver_id'), isFalse, reason: path);
      expect(src.contains('driverId'), isFalse, reason: path);
      expect(src.contains('access_token'), isFalse, reason: path);
      expect(src.contains('jwt'), isFalse, reason: path);
      expect(src.contains('me?.driver?.id'), isFalse, reason: path);
    }
  });

  test('LOGOUT_CONFIRM_EXISTING_PATH reuses session then auth signOut', () {
    final shell = File('lib/screens/app_shell.dart').readAsStringSync();
    final menu = File('lib/screens/menu_screen.dart').readAsStringSync();
    expect(menu.contains('showLogoutConfirmDialog'), isTrue);
    expect(menu.contains('shouldSignOut'), isTrue);
    expect(shell.contains('sessionController.onSignOut()'), isTrue);
    expect(shell.contains('controller.signOut()'), isTrue);
    expect(shell.contains('clearAppData'), isFalse);
  });

  test('DEBUG_TOOLS_NOT_PRODUCTION_PROMINENT on Home', () {
    final home = File('lib/screens/home_screen.dart').readAsStringSync();
    final menu = File('lib/screens/menu_screen.dart').readAsStringSync();
    final debug = File('lib/screens/menu_debug_tools.dart').readAsStringSync();
    expect(home.contains('개발자 도구'), isFalse);
    expect(home.contains('KakaoNaviPocBridge'), isFalse);
    expect(home.contains('TmapNaviPocBridge'), isFalse);
    expect(menu.contains('debugTools'), isTrue);
    expect(debug.contains('kDebugMode'), isFalse);
    expect(debug.contains('남동구 fixture 지도 (dev)'), isTrue);
    expect(debug.contains('KakaoNaviPocBridge'), isTrue);
    expect(debug.contains('TmapNaviPocBridge'), isTrue);
  });

  test('DEBUG_FIXTURE_PRESERVED on Menu debug tools', () {
    final debug = File('lib/screens/menu_debug_tools.dart').readAsStringSync();
    expect(debug.contains('namdong10'), isTrue);
    expect(debug.contains('DeliveryMapDataSource.namdong10'), isTrue);
    expect(debug.contains('DeliveryMapDataSource.singleSpike'), isTrue);
    expect(debug.contains('KakaoNaviPocBridge'), isTrue);
    expect(debug.contains('TmapNaviPocBridge'), isTrue);
    expect(debug.contains('개발자 도구'), isTrue);
  });
}
