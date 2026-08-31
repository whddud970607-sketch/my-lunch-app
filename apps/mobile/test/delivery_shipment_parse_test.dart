import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/models/map_spike_point.dart';

void main() {
  test('parses shipments and matches quantity', () {
    final point = MapSpikePoint.fromJson({
      'geocodeProvider': 'kakao',
      'latitude': 37.45,
      'longitude': 126.71,
      'totalQuantity': 5,
      'status': '배송 대기',
      'statusCode': 'pending',
      'pointId': 'p9',
      'jobId': 'j',
      'driverId': 'd',
      'customerName': '임민준',
      'shipments': [
        {
          'shipmentId': 's1',
          'sequenceNo': 1,
          'trackingCode': 'CP-TEST-09-01',
          'status': '대기',
          'statusCode': 'pending',
        },
        {
          'shipmentId': 's2',
          'sequenceNo': 2,
          'trackingCode': 'CP-TEST-09-02',
          'status': '대기',
          'statusCode': 'pending',
        },
        {
          'shipmentId': 's3',
          'sequenceNo': 3,
          'trackingCode': 'CP-TEST-09-03',
          'status': '대기',
          'statusCode': 'pending',
        },
        {
          'shipmentId': 's4',
          'sequenceNo': 4,
          'trackingCode': 'CP-TEST-09-04',
          'status': '대기',
          'statusCode': 'pending',
        },
        {
          'shipmentId': 's5',
          'sequenceNo': 5,
          'trackingCode': 'CP-TEST-09-05',
          'status': '대기',
          'statusCode': 'pending',
        },
      ],
    });

    expect(point.quantity, 5);
    expect(point.shipments.length, 5);
    expect(point.shipments.map((s) => s.trackingCode).toList(), [
      'CP-TEST-09-01',
      'CP-TEST-09-02',
      'CP-TEST-09-03',
      'CP-TEST-09-04',
      'CP-TEST-09-05',
    ]);
  });
}
