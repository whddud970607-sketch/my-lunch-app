import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/screens/app_shell_tabs.dart';

void main() {
  test('SCANNER_TAB_REPLACES_PLACEHOLDER in AppShell', () {
    final shell = File('lib/screens/app_shell.dart').readAsStringSync();
    expect(shell.contains('ScannerScreen'), isTrue);
    expect(shell.contains('스캔 기능 준비 중'), isFalse);
    expect(shell.contains("label: '스캔'"), isTrue);
    expect(shell.contains("label: '홈'"), isTrue);
    expect(shell.contains("label: '지도'"), isTrue);
    expect(shell.contains("label: '배송'"), isTrue);
    expect(shell.contains("label: '메뉴'"), isTrue);
  });

  test('SCANNER_APP_SHELL_INDEX stays at existing scan tab', () {
    expect(AppShellTabs.scan, 3);
    expect(AppShellTabs.home, 0);
    expect(AppShellTabs.map, 1);
    expect(AppShellTabs.delivery, 2);
    expect(AppShellTabs.menu, 4);
    final shell = File('lib/screens/app_shell.dart').readAsStringSync();
    expect(shell.contains('scanTabIndex: AppShellTabs.scan'), isTrue);
    expect(shell.contains('Navigator.push'), isFalse);
  });

  test('SCANNER_RAW_VALUE_NOT_LOGGED in scanner sources', () {
    const paths = [
      'lib/screens/scanner_session.dart',
      'lib/screens/scanner_screen.dart',
      'lib/screens/scanner_mobile_camera.dart',
      'lib/screens/scanner_camera_host.dart',
      'lib/screens/scanner_keys.dart',
    ];
    for (final path in paths) {
      final source = File(path).readAsStringSync();
      expect(source.contains('debugPrint'), isFalse, reason: path);
      expect(source.contains('print('), isFalse, reason: path);
      expect(source.contains('log('), isFalse, reason: path);
    }
  });

  test('SCANNER_NO_FAKE_DELIVERY_CREATION in scanner sources', () {
    const paths = [
      'lib/screens/scanner_session.dart',
      'lib/screens/scanner_screen.dart',
      'lib/screens/scanner_mobile_camera.dart',
      'lib/screens/scanner_camera_host.dart',
    ];
    for (final path in paths) {
      final source = File(path).readAsStringSync();
      expect(source.contains('postJson'), isFalse, reason: path);
      expect(source.contains('SCAN_RECORDED'), isFalse, reason: path);
      expect(source.contains('scanRecorded'), isFalse, reason: path);
      expect(source.contains('createDelivery'), isFalse, reason: path);
      expect(source.contains('ImportEngine'), isFalse, reason: path);
      expect(source.contains('openCompleteDeliveryScreen'), isFalse,
          reason: path);
    }
  });

  test('MANUAL_REGISTER_DOES_NOT_USE_PHASE_B_SEARCH', () {
    final repo =
        File('lib/services/manual_address_repository.dart').readAsStringSync();
    expect(repo.contains('/delivery/today/search'), isFalse);
    expect(repo.contains('/delivery/manual/address/suggest'), isTrue);
    expect(repo.contains('/delivery/manual/register'), isTrue);
  });

  test('CAMERA permission is declared without extra scanner permissions', () {
    final manifest =
        File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
    expect(manifest.contains('android.permission.CAMERA'), isTrue);
    expect(manifest.contains('android.permission.RECORD_AUDIO'), isFalse);
    expect(manifest.contains('android.permission.READ_CONTACTS'), isFalse);
    expect(manifest.contains('android.permission.READ_EXTERNAL_STORAGE'),
        isFalse);
  });
}
