import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/map/delivery_location_pin.dart';
import 'package:delivery_shield_mobile/models/map_spike_point.dart';

MapSpikePoint _point({
  required String id,
  required double lat,
  required double lng,
  required int quantity,
}) {
  return MapSpikePoint(
    geocodeProvider: 'kakao',
    pinAccuracy: 'building',
    latitude: lat,
    longitude: lng,
    carrier: '쿠팡',
    customerName: 'A',
    address: 'addr',
    detailAddress: 'd',
    product: 'box',
    quantity: quantity,
    status: '배송중',
    statusCode: 'out_for_delivery',
    pointId: id,
    jobId: 'j-$id',
    driverId: 'driver',
    piiMasked: false,
  );
}

void main() {
  test('groups same location and sums quantity (not job count)', () {
    final pins = groupPointsByLocation([
      _point(id: 'a', lat: 37.427583, lng: 126.748783, quantity: 1),
      _point(id: 'b', lat: 37.427583, lng: 126.748783, quantity: 2),
      _point(id: 'c', lat: 37.5, lng: 126.9, quantity: 1),
    ]);

    expect(pins.length, 2);
    final clustered = pins.firstWhere((p) => p.isCluster);
    expect(clustered.totalQuantity, 3); // 1+2, not count=2
    expect(clustered.points.length, 2);
    expect(pins.firstWhere((p) => !p.isCluster).totalQuantity, 1);
  });

  test('single spike point shows quantity 1', () {
    final pins = groupPointsByLocation([
      _point(id: 'spike', lat: 37.427583, lng: 126.748783, quantity: 1),
    ]);
    expect(pins.single.totalQuantity, 1);
    expect(pins.single.markerId, 'spike');
  });

  test('completed points use gray visual status', () {
    final pending = _point(id: 'a', lat: 37.4, lng: 126.7, quantity: 1);
    final done = MapSpikePoint(
      geocodeProvider: 'kakao',
      pinAccuracy: 'building',
      latitude: 37.5,
      longitude: 126.8,
      carrier: '쿠팡',
      customerName: '****',
      address: '****',
      detailAddress: '****',
      product: '배송 완료',
      quantity: 2,
      status: '배송 완료',
      statusCode: 'completed',
      pointId: 'b',
      jobId: 'j-b',
      driverId: 'driver',
      piiMasked: true,
    );
    final pins = groupPointsByLocation([pending, done]);
    expect(
      pins.firstWhere((p) => p.markerId == 'a').visualStatus.name,
      'open',
    );
    expect(
      pins.firstWhere((p) => p.markerId == 'b').visualStatus.name,
      'completed',
    );
  });
}
