import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('DELIVERY_LIST_HEADER title is 배송 목록', () {
    final screen =
        File('lib/screens/delivery_list_screen.dart').readAsStringSync();
    expect(screen.contains("title: const Text('배송 목록')"), isTrue);
  });

  test('APP_SHELL_DELIVERY_TAB replaces placeholder', () {
    final shell = File('lib/screens/app_shell.dart').readAsStringSync();
    expect(shell.contains('DeliveryListScreen'), isTrue);
    expect(shell.contains('AppShellTabs.delivery'), isTrue);
    expect(shell.contains('배송 목록 준비 중'), isFalse);
    expect(shell.contains("label: '배송'"), isTrue);
    expect(shell.contains('DeliveryListScreen'), isTrue);
  });

  test('DRIVER_UUID_HIDDEN on delivery list chrome', () {
    final view = File('lib/screens/delivery_list_view.dart').readAsStringSync();
    final data = File('lib/screens/delivery_list_data.dart').readAsStringSync();
    expect(view.contains('driverId'), isFalse);
    expect(view.contains('ownerDriverId'), isFalse);
    expect(view.contains('contactValue'), isFalse);
    expect(data.contains('Text('), isFalse);
  });

  test('PHONE_DEFAULT_VISIBLE and ACCESS_SECRET stay off the card', () {
    final view = File('lib/screens/delivery_list_view.dart').readAsStringSync();
    expect(view.contains('contactValue'), isFalse);
    expect(view.contains('출입정보'), isFalse);
    expect(view.contains('accessInfo'), isFalse);
    expect(view.contains('access_secret'), isFalse);
    expect(view.contains('010'), isFalse);
  });

  test('LARGE_LIST_LAZY_BUILD uses ListView.builder', () {
    final view = File('lib/screens/delivery_list_view.dart').readAsStringSync();
    expect(view.contains('ListView.builder'), isTrue);
    expect(view.contains('itemBuilder:'), isTrue);
  });

  test('SEARCH_IS_LOCAL without network or schema expansion', () {
    final data = File('lib/screens/delivery_list_data.dart').readAsStringSync();
    final screen =
        File('lib/screens/delivery_list_screen.dart').readAsStringSync();
    final view = File('lib/screens/delivery_list_view.dart').readAsStringSync();
    expect(data.contains('deliveryPointMatchesSearch'), isTrue);
    expect(data.contains('normalizeDeliverySearchQuery'), isTrue);
    expect(data.contains('fetchToday'), isFalse);
    expect(data.contains('http://'), isFalse);
    expect(data.contains('https://'), isFalse);
    expect(data.contains('Supabase'), isFalse);
    expect(data.contains('debugPrint'), isFalse);
    expect(data.contains('print('), isFalse);
    expect(data.contains('buildingName'), isFalse);
    expect(data.contains('roadAddress'), isFalse);
    expect(data.contains('jibun'), isFalse);
    expect(screen.contains('_setSearchQuery'), isTrue);
    expect(screen.contains('debugPrint'), isFalse);
    expect(screen.contains('print('), isFalse);
    expect(screen.contains("print('"), isFalse);
    expect(view.contains('deliveryListSearchHint'), isTrue);
    expect(view.contains('주소·표시명 검색'), isFalse);
    expect(view.contains('건물·표시명 검색'), isFalse);
    expect(File('lib/screens/delivery_list_data.dart').readAsStringSync()
        .contains("deliveryListSearchHint = '주소·표시명 검색'"), isTrue);
    expect(screen.contains('searchToday'), isTrue);
    expect(screen.contains('_runAddressSearch'), isTrue);
    expect(view.contains('ListView.builder'), isTrue);
  });

  test('DELIVERY_SEARCH_QUERY_NOT_LOGGED', () {
    final screen =
        File('lib/screens/delivery_list_screen.dart').readAsStringSync();
    expect(screen.contains('_clearSearch'), isTrue);
    expect(screen.contains('_loadToday'), isTrue);
    final clearFn = screen.substring(
      screen.indexOf('void _clearSearch()'),
      screen.indexOf('String? get _serviceDateOverride'),
    );
    expect(clearFn.contains('_loadToday'), isFalse);
    expect(clearFn.contains('fetchToday'), isFalse);
    final setFn = screen.substring(
      screen.indexOf('void _setSearchQuery'),
      screen.indexOf('void _clearSearch()'),
    );
    expect(setFn.contains('_loadToday'), isFalse);
    expect(setFn.contains('debugPrint'), isFalse);
    expect(setFn.contains('print('), isFalse);
    expect(screen.contains('debugPrint'), isFalse);
    expect(screen.contains('print('), isFalse);
    final runFn = screen.substring(
      screen.indexOf('Future<void> _runAddressSearch'),
      screen.indexOf('String? get _serviceDateOverride'),
    );
    expect(runFn.contains('debugPrint'), isFalse);
    expect(runFn.contains('print('), isFalse);
  });

  test('SEARCH_MODEL_SCHEMA_EXPANSION is not on WorksetPoint', () {
    final model = File('lib/models/today_workset.dart').readAsStringSync();
    expect(model.contains('displayLabel: json[\'displayLabel\']'), isTrue);
    expect(model.contains('buildingName'), isFalse);
    expect(model.contains('roadAddress'), isFalse);
    expect(model.contains('jibunAddress'), isFalse);
    expect(model.contains('rawAddress'), isFalse);
  });

  test('DETAIL_PATH_REUSED without new detail domain', () {
    final screen =
        File('lib/screens/delivery_list_screen.dart').readAsStringSync();
    expect(screen.contains('DeliveryDetailPanel'), isTrue);
    expect(screen.contains('TodayWorksetRepository'), isTrue);
    expect(screen.contains('openCompleteDeliveryScreen'), isTrue);
    expect(
      screen.contains('builder: (_) => CompleteDeliveryScreen'),
      isFalse,
    );
  });

  test('KEYBOARD_OVERFLOW uses scroll inset not clipping', () {
    final view = File('lib/screens/delivery_list_view.dart').readAsStringSync();
    expect(view.contains('_KeyboardSafeCentered'), isTrue);
    expect(view.contains('SingleChildScrollView'), isTrue);
    expect(view.contains('ClipRect'), isFalse);
    expect(view.contains('clipBehavior: Clip.hardEdge'), isFalse);
    expect(view.contains('Clip.hardEdge'), isFalse);
  });

  test('EMPTY_TODAY_SEARCH_STATE_PRIORITY outranks Today-empty copy', () {
    final view = File('lib/screens/delivery_list_view.dart').readAsStringSync();
    expect(view.contains('final showEmpty = todayEmpty && !queryActive;'), isTrue);
    expect(view.contains('addressSearching && points.isEmpty'), isTrue);
    expect(view.contains('addressFailed && points.isEmpty'), isTrue);
    expect(view.contains('showZeroMatch'), isTrue);
  });
}
