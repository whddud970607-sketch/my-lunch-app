import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/models/map_spike_point.dart';
import 'package:delivery_shield_mobile/models/today_workset.dart';
import 'package:delivery_shield_mobile/screens/complete_delivery_data.dart';

MapSpikePoint _simple({
  required String id,
  String product = 'SYNTH-BLDG',
  int quantity = 3,
  bool completed = false,
}) {
  return MapSpikePoint(
    geocodeProvider: 'kakao',
    pinAccuracy: 'building',
    latitude: 37.4,
    longitude: 126.7,
    carrier: '',
    customerName: 'must-not-copy-customer',
    address: '',
    detailAddress: '',
    product: product,
    quantity: quantity,
    status: completed ? '완료' : '미완료',
    statusCode: completed ? 'completed' : 'pending',
    pointId: id,
    jobId: 'job-1',
    driverId: 'driver-uuid-must-not-render',
    piiMasked: false,
  );
}

void main() {
  test('COMPLETE_POINT_HEADER uses display label not customer', () {
    expect(completePointHeader(_simple(id: 'a')), 'SYNTH-BLDG');
    expect(completePointHeader(_simple(id: 'a', product: '****')), '배송지');
  });

  test('COMPLETE_COUNTS includes delivery count and quantity', () {
    expect(
      completeCountsLine(point: _simple(id: 'a', quantity: 4), shipmentCount: 2),
      '배송 2건 · 물량 4',
    );
  });

  test('POD_ACTUAL_FIELDS_ONLY and POD_NO_FAKE_FIELDS', () {
    expect(PodFieldInventory.capabilities, ['photo']);
    expect(PodFieldInventory.requiredFields, ['photo']);
    expect(PodFieldInventory.optionalFields, isEmpty);
    expect(PodFieldInventory.unsupportedFakeFields, contains('signature'));
    expect(PodFieldInventory.unsupportedFakeFields, contains('note'));
  });

  test('NEXT_DELIVERY_AVAILABLE is the next open Point in order', () {
    final a = _simple(id: 'a');
    final b = _simple(id: 'b', completed: true);
    final c = _simple(id: 'c');
    expect(
      nextOpenPointAfter(ordered: [a, b, c], currentPointId: 'a')?.pointId,
      'c',
    );
  });

  test('NEXT_DELIVERY_NONE does not wrap around', () {
    final a = _simple(id: 'a');
    final b = _simple(id: 'b', completed: true);
    expect(
      nextOpenPointAfter(ordered: [a, b], currentPointId: 'a'),
      isNull,
    );
    expect(
      nextOpenPointAfter(ordered: [a, b], currentPointId: 'missing'),
      isNull,
    );
  });

  test('nextOpenWorksetPointAfter follows TodayWorkset order', () {
    final points = [
      WorksetPoint(
        pointId: 'p1',
        jobId: 'j',
        companyId: null,
        sourceId: null,
        status: 'pending',
        latitude: 1,
        longitude: 1,
        quantity: 1,
        displayLabel: 'A',
        pinAccuracy: 'building',
        piiMasked: false,
        hasAccessInfo: false,
        shipmentCount: 1,
        contactAvailable: false,
      ),
      WorksetPoint(
        pointId: 'p2',
        jobId: 'j',
        companyId: null,
        sourceId: null,
        status: 'pending',
        latitude: 1,
        longitude: 1,
        quantity: 1,
        displayLabel: 'B',
        pinAccuracy: 'building',
        piiMasked: false,
        hasAccessInfo: false,
        shipmentCount: 1,
        contactAvailable: false,
      ),
    ];
    expect(
      nextOpenWorksetPointAfter(ordered: points, currentPointId: 'p1')?.pointId,
      'p2',
    );
  });

  test('completeSubmitBlocked prevents duplicate submit phases', () {
    expect(completeSubmitBlocked(CompleteUiPhase.idle), isFalse);
    expect(completeSubmitBlocked(CompleteUiPhase.error), isFalse);
    expect(completeSubmitBlocked(CompleteUiPhase.submitting), isTrue);
    expect(completeSubmitBlocked(CompleteUiPhase.success), isTrue);
    expect(completeSubmitBlocked(CompleteUiPhase.offlineQueued), isTrue);
  });

  test('parseCompleteFlowResult keeps queued vs confirmed distinct', () {
    expect(parseCompleteFlowResult(true)?.confirmed, isTrue);
    expect(parseCompleteFlowResult(true)?.queued, isFalse);
    expect(
      parseCompleteFlowResult({'optimistic': true, 'pointId': 'p'})?.queued,
      isTrue,
    );
    expect(parseCompleteFlowResult(null), isNull);
  });
}
