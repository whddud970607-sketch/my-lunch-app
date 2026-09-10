import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('AppShell does not keep map tab alive off-selection', () {
    final shell = File('lib/screens/app_shell.dart').readAsStringSync();
    expect(shell.contains('keepAliveForIndex'), isTrue);
    expect(shell.contains('AppShellTabs.map'), isTrue);
    expect(shell.contains('i != AppShellTabs.map'), isTrue);
    expect(shell.contains('static const _tabCount = 5'), isTrue);
  });

  test('AppShellTabs indexes remain stable', () {
    final tabs = File('lib/screens/app_shell_tabs.dart').readAsStringSync();
    expect(tabs.contains('home = 0'), isTrue);
    expect(tabs.contains('map = 1'), isTrue);
    expect(tabs.contains('delivery = 2'), isTrue);
    expect(tabs.contains('scan = 3'), isTrue);
    expect(tabs.contains('menu = 4'), isTrue);
  });

  test('scanner still receives tabIndex ValueNotifier from AppShell', () {
    final shell = File('lib/screens/app_shell.dart').readAsStringSync();
    expect(shell.contains('tabIndex: _tabIndex'), isTrue);
    expect(shell.contains('scanTabIndex: AppShellTabs.scan'), isTrue);
    expect(shell.contains("_tabIndex.value = index"), isTrue);
  });
}
