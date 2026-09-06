import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/models/map_spike_point.dart';
import 'package:delivery_shield_mobile/navigation/kakao_in_app_navi.dart';
import 'package:delivery_shield_mobile/navigation/kakao_navi_poc_bridge.dart';

MapSpikePoint _point({
  required String id,
  required double lat,
  required double lng,
  String product = '배송',
  String statusCode = 'pending',
}) {
  return MapSpikePoint(
    geocodeProvider: 'kakao',
    pinAccuracy: 'building',
    latitude: lat,
    longitude: lng,
    carrier: '',
    customerName: '',
    address: '주소',
    detailAddress: '',
    product: product,
    quantity: 1,
    status: statusCode == 'completed' ? '완료' : '대기',
    statusCode: statusCode,
    pointId: id,
    jobId: 'job-1',
    driverId: 'driver-uuid-must-not-render',
    piiMasked: false,
  );
}

void main() {
  test('A: product Kakao 길찾기 builds in-app session', () async {
    KakaoInAppNavSession? seen;
    final dest = _point(
      id: 'dest',
      lat: 37.42829218537658,
      lng: 126.74861487206365,
      product: '503동',
    );
    final ok = await KakaoInAppNavi.open(
      destination: dest,
      worksetPoints: [dest],
      launch: (session) async {
        seen = session;
      },
    );
    expect(ok, isTrue);
    expect(seen, isNotNull);
    expect(seen!.destinationPointId, 'dest');
    expect(seen!.destinationLatitude, dest.latitude);
    expect(seen!.destinationLongitude, dest.longitude);
  });

  test('D/E: nav x=longitude y=latitude', () {
    final point = _point(
      id: 'p1',
      lat: 37.42829218537658,
      lng: 126.74861487206365,
    );
    expect(KakaoInAppNavi.navX(point), point.longitude);
    expect(KakaoInAppNavi.navY(point), point.latitude);
  });

  test('F: invalid destination blocks navigation', () async {
    var launched = false;
    final ok = await KakaoInAppNavi.open(
      destination: _point(id: 'bad', lat: 0, lng: 0),
      worksetPoints: const [],
      launch: (_) async {
        launched = true;
      },
    );
    expect(ok, isFalse);
    expect(launched, isFalse);
  });

  test('G: selected exact pin coordinate preserved in session', () async {
    const lat = 37.42829218537658;
    const lng = 126.74861487206365;
    final dest = _point(id: 'exact', lat: lat, lng: lng, product: '503동');
    late KakaoInAppNavSession session;
    await KakaoInAppNavi.open(
      destination: dest,
      worksetPoints: [dest],
      launch: (s) async {
        session = s;
      },
    );
    expect(session.destinationLatitude, lat);
    expect(session.destinationLongitude, lng);
    expect(session.stops.single.latitude, lat);
    expect(session.stops.single.longitude, lng);
  });

  test('H: multiple delivery pins passed to Kakao nav overlay', () async {
    final dest = _point(id: 'd2', lat: 37.43, lng: 126.75, product: '2');
    final points = [
      _point(id: 'd1', lat: 37.42, lng: 126.74, product: '1'),
      dest,
      _point(id: 'd3', lat: 37.44, lng: 126.76, product: '3'),
      _point(id: 'bad', lat: 0, lng: 0, product: 'skip'),
    ];
    late KakaoInAppNavSession session;
    await KakaoInAppNavi.open(
      destination: dest,
      worksetPoints: points,
      launch: (s) async {
        session = s;
      },
    );
    expect(session.stops.length, 3);
    expect(session.stops.map((s) => s.pointId), ['d1', 'd2', 'd3']);
    expect(session.destinationNumber, 2);
    expect(session.destinationPointId, 'd2');
  });

  test('session JSON uses WGS84 lat/lng fields (native converts to KATEC)', () {
    final session = KakaoInAppNavSession(
      destinationPointId: 'p',
      destinationNumber: 1,
      destinationName: '배송지',
      destinationLatitude: 37.4,
      destinationLongitude: 126.7,
      stops: [
        KakaoInAppNavStop(
          deliveryNumber: 1,
          pointId: 'p',
          name: '배송지',
          product: '배송지',
          quantity: 1,
          address: '',
          detailAddress: '',
          customerName: '',
          latitude: 37.4,
          longitude: 126.7,
          statusCode: 'pending',
          isCompleted: false,
        ),
      ],
    );
    final json = session.toJson();
    expect(json['destinationLatitude'], 37.4);
    expect(json['destinationLongitude'], 126.7);
    final stop = (json['stops'] as List).single as Map<String, Object?>;
    expect(stop['latitude'], 37.4);
    expect(stop['longitude'], 126.7);
  });
}
