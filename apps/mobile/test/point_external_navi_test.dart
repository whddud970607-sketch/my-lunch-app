import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/map/map_provider_id.dart';
import 'package:delivery_shield_mobile/models/map_spike_point.dart';
import 'package:delivery_shield_mobile/navigation/point_external_navi.dart';

MapSpikePoint _point({required double lat, required double lng}) {
  return MapSpikePoint(
    geocodeProvider: 'kakao',
    pinAccuracy: 'building',
    latitude: lat,
    longitude: lng,
    carrier: '',
    customerName: '',
    address: '인천 남동구 구월동 1',
    detailAddress: '',
    product: '구월동 1',
    quantity: 1,
    status: '대기',
    statusCode: 'pending',
    pointId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    jobId: 'job-1',
    driverId: 'driver-uuid-must-not-render',
    piiMasked: false,
  );
}

void main() {
  test('NAVIGATE_CTA_WIRING rejects missing coordinates', () {
    expect(
      PointExternalNavi.hasValidDestination(_point(lat: 0, lng: 0)),
      isFalse,
    );
    expect(
      PointExternalNavi.buildCandidates(
        latitude: 0,
        longitude: 0,
        name: '배송지',
      ),
      isEmpty,
    );
  });

  test('NAVIGATE_CTA_WIRING uses real Point coordinates', () {
    const lat = 37.4483;
    const lng = 126.731;
    expect(
      PointExternalNavi.hasValidDestination(_point(lat: lat, lng: lng)),
      isTrue,
    );

    final uris = PointExternalNavi.buildCandidates(
      latitude: lat,
      longitude: lng,
      name: '구월동 1',
      preferredProvider: MapProviderId.kakao,
    );
    expect(uris, isNotEmpty);
    expect(uris.first.scheme, 'kakaonavi');
    final tmapFirst = PointExternalNavi.buildCandidates(
      latitude: lat,
      longitude: lng,
      name: '구월동 1',
      preferredProvider: MapProviderId.tmap,
    );
    expect(tmapFirst.first.scheme, 'tmap');
    expect(
      uris.any((u) => u.toString().contains('$lat') && u.toString().contains('$lng')),
      isTrue,
    );
    expect(
      uris.any((u) => u.toString().contains('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')),
      isFalse,
    );
  });

  test('labelFor never returns UUID', () {
    expect(
      PointExternalNavi.labelFor(_point(lat: 37.4, lng: 126.7)),
      '구월동 1',
    );
  });

  test('open returns false when every launch candidate fails', () async {
    final ok = await PointExternalNavi.open(
      latitude: 37.4483,
      longitude: 126.731,
      name: '구월동 1',
      launch: (_) async => false,
    );
    expect(ok, isFalse);
  });

  test('open uses first successful candidate with real coords', () async {
    final seen = <Uri>[];
    final ok = await PointExternalNavi.open(
      latitude: 37.4483,
      longitude: 126.731,
      name: '구월동 1',
      launch: (uri) async {
        seen.add(uri);
        return uri.scheme == 'kakaonavi';
      },
    );
    expect(ok, isTrue);
    expect(seen, isNotEmpty);
    expect(seen.first.scheme, 'kakaonavi');
    expect(seen.first.queryParameters['y'], '37.4483');
    expect(seen.first.queryParameters['x'], '126.731');
  });
}
