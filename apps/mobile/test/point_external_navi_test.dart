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
  test('invalid coordinate blocks navigation candidates', () {
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

  test('Kakao preferred has no external candidates (in-app only)', () {
    final uris = PointExternalNavi.buildCandidates(
      latitude: 37.4483,
      longitude: 126.731,
      name: '구월동 1',
      preferredProvider: MapProviderId.kakao,
    );
    expect(uris, isEmpty);
    expect(uris.any(PointExternalNavi.isHandcraftedKakaoNaviUri), isFalse);
  });

  test('Kakao preferred open never launches external URIs', () async {
    var launched = false;
    final ok = await PointExternalNavi.open(
      latitude: 37.4483,
      longitude: 126.731,
      name: '구월동 1',
      preferredProvider: MapProviderId.kakao,
      launch: (_) async {
        launched = true;
        return true;
      },
    );
    expect(ok, isFalse);
    expect(launched, isFalse);
  });

  test('kakaonavi://navigate never in any provider candidates', () {
    for (final provider in MapProviderId.values) {
      final uris = PointExternalNavi.buildCandidates(
        latitude: 37.4483,
        longitude: 126.731,
        name: '구월동 1',
        preferredProvider: provider,
      );
      expect(uris.any((u) => u.scheme == 'kakaonavi'), isFalse);
      expect(uris.any(PointExternalNavi.isHandcraftedKakaoNaviUri), isFalse);
    }
  });

  test('TMAP preferred still uses tmap deep link (unchanged)', () async {
    final seen = <Uri>[];
    final ok = await PointExternalNavi.open(
      latitude: 37.4483,
      longitude: 126.731,
      name: '구월동 1',
      preferredProvider: MapProviderId.tmap,
      launch: (uri) async {
        seen.add(uri);
        return uri.scheme == 'tmap';
      },
    );
    expect(ok, isTrue);
    expect(seen.first.scheme, 'tmap');
    expect(seen.first.queryParameters['goalx'], '126.731');
    expect(seen.first.queryParameters['goaly'], '37.4483');
  });

  test('Naver preferred still uses nmap deep link (unchanged)', () async {
    final seen = <Uri>[];
    final ok = await PointExternalNavi.open(
      latitude: 37.4483,
      longitude: 126.731,
      name: '구월동 1',
      preferredProvider: MapProviderId.naver,
      launch: (uri) async {
        seen.add(uri);
        return uri.scheme == 'nmap';
      },
    );
    expect(ok, isTrue);
    expect(seen.first.scheme, 'nmap');
  });

  test('labelFor never returns UUID', () {
    expect(
      PointExternalNavi.labelFor(_point(lat: 37.4, lng: 126.7)),
      '구월동 1',
    );
  });
}
