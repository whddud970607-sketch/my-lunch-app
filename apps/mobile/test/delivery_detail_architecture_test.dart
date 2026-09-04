import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('MAP_DETAIL_REUSE and LIST_DETAIL_REUSE share DeliveryDetailPanel', () {
    final map = File('lib/screens/map_spike_screen.dart').readAsStringSync();
    final list =
        File('lib/screens/delivery_list_screen.dart').readAsStringSync();
    expect(map.contains('DeliveryDetailPanel'), isTrue);
    expect(list.contains('DeliveryDetailPanel'), isTrue);
    expect(list.contains('showModalBottomSheet'), isTrue);
  });

  test('COMPLETION_FLOW_REUSED does not complete locally', () {
    final flow =
        File('lib/screens/complete_delivery_flow.dart').readAsStringSync();
    final map = File('lib/screens/map_spike_screen.dart').readAsStringSync();
    final list =
        File('lib/screens/delivery_list_screen.dart').readAsStringSync();
    final panel =
        File('lib/widgets/delivery_detail_panel.dart').readAsStringSync();
    expect(flow.contains('CompleteDeliveryScreen'), isTrue);
    expect(map.contains('openCompleteDeliveryScreen'), isTrue);
    expect(list.contains('openCompleteDeliveryScreen'), isTrue);
    expect(panel.contains('point.copyWith'), isFalse);
    expect(panel.contains('statusCode:'), isFalse);
  });

  test('DRIVER_UUID_HIDDEN on detail chrome', () {
    final panel =
        File('lib/widgets/delivery_detail_panel.dart').readAsStringSync();
    expect(panel.contains('point.driverId'), isFalse);
    expect(panel.contains(r'${point.driverId}'), isFalse);
    expect(panel.contains('Text(point.driverId'), isFalse);
  });

  test('EXCEPTION_STATUS_ADDED is false', () {
    final panel =
        File('lib/widgets/delivery_detail_panel.dart').readAsStringSync();
    expect(panel.contains('부재'), isFalse);
    expect(panel.contains('주소 오류'), isFalse);
    expect(panel.contains('출입 불가'), isFalse);
    expect(panel.contains('배송 실패'), isFalse);
  });

  test('PHONE_DEFAULT_VISIBLE is not hardcoded into labels', () {
    final panel =
        File('lib/widgets/delivery_detail_panel.dart').readAsStringSync();
    expect(panel.contains('010'), isFalse);
    expect(panel.contains('access_secret'), isFalse);
  });
}
