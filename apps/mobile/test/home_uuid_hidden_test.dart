import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Home presentation does not print driver UUID', () {
    final src = File('lib/screens/home_screen.dart').readAsStringSync();
    expect(src.contains(r'driver: ${me?.driver?.id'), isFalse);
    expect(src.contains(r'role: ${me?.role'), isFalse);
    expect(src.contains('displayName'), isTrue);
  });

  test('WORKDAY_ACTION_PRESERVED keeps start/end/report wiring', () {
    final src = File('lib/screens/home_screen.dart').readAsStringSync();
    expect(src.contains('_onStartDelivery'), isTrue);
    expect(src.contains('_onEndDelivery'), isTrue);
    expect(src.contains('startTodayDelivery'), isTrue);
    expect(src.contains('endTodayDelivery'), isTrue);
    expect(src.contains('DeliveryReportScreen'), isTrue);
  });
}
