import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('COMPLETE_SCREEN_REUSED keeps existing CompleteDeliveryScreen path', () {
    final flow =
        File('lib/screens/complete_delivery_flow.dart').readAsStringSync();
    final screen =
        File('lib/screens/complete_delivery_screen.dart').readAsStringSync();
    final map = File('lib/screens/map_spike_screen.dart').readAsStringSync();
    final list =
        File('lib/screens/delivery_list_screen.dart').readAsStringSync();
    expect(flow.contains('CompleteDeliveryScreen'), isTrue);
    expect(flow.contains('point.isCompleted'), isTrue);
    expect(screen.contains('completeSpike'), isTrue);
    expect(screen.contains('enqueueCompletion'), isTrue);
    expect(screen.contains('delivery-proofs'), isTrue);
    expect(map.contains('openCompleteDeliveryScreen'), isTrue);
    expect(list.contains('openCompleteDeliveryScreen'), isTrue);
    expect(list.contains('builder: (_) => CompleteDeliveryScreen'), isFalse);
  });

  test('COMPLETION_FLOW_REUSED does not set local completed for UI only', () {
    final flow =
        File('lib/screens/complete_delivery_flow.dart').readAsStringSync();
    expect(flow.contains('statusCode:'), isFalse);
    expect(flow.contains('copyWith'), isFalse);
    final screen =
        File('lib/screens/complete_delivery_screen.dart').readAsStringSync();
    expect(screen.contains("statusCode: 'completed'"), isFalse);
    expect(screen.contains('point.copyWith'), isFalse);
  });

  test('POD_ACTUAL_FIELDS_ONLY has no invented POD inputs', () {
    final screen =
        File('lib/screens/complete_delivery_screen.dart').readAsStringSync();
    expect(screen.contains('서명'), isFalse);
    expect(screen.contains('signature'), isFalse);
    expect(screen.contains('recipientType'), isFalse);
    expect(screen.contains('placementType'), isFalse);
    expect(screen.contains('gpsProof'), isFalse);
    expect(screen.contains('ImageSource.camera'), isTrue);
    expect(screen.contains('ImageSource.gallery'), isTrue);
  });

  test('POD_PRIVACY_SAFE does not print secrets or copy phone', () {
    final screen =
        File('lib/screens/complete_delivery_screen.dart').readAsStringSync();
    expect(screen.contains('debugPrint'), isFalse);
    expect(screen.contains('print('), isFalse);
    expect(screen.contains('contactValue'), isFalse);
    expect(screen.contains('access_secret'), isFalse);
    expect(screen.contains('Text(widget.driverId'), isFalse);
  });

  test('COMPLETED_POINT_NO_DUPLICATE_ACTION on map and list', () {
    final map = File('lib/screens/map_spike_screen.dart').readAsStringSync();
    final list =
        File('lib/screens/delivery_list_screen.dart').readAsStringSync();
    final panel =
        File('lib/widgets/delivery_detail_panel.dart').readAsStringSync();
    expect(map.contains('onComplete: point.isCompleted'), isTrue);
    expect(list.contains('onComplete: mapped.isCompleted'), isTrue);
    expect(panel.contains('detailShowComplete(point)'), isTrue);
  });

  test('DRIVER_UUID_HIDDEN on complete chrome', () {
    final screen =
        File('lib/screens/complete_delivery_screen.dart').readAsStringSync();
    expect(screen.contains(r'${widget.driverId}'), isTrue);
    expect(screen.contains('Text(widget.driverId'), isFalse);
    expect(screen.contains('Text(point.driverId'), isFalse);
  });
}
