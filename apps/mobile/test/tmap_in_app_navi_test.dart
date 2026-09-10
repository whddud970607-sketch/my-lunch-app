import 'package:delivery_shield_mobile/models/map_spike_point.dart';
import 'package:delivery_shield_mobile/navigation/tmap_in_app_navi.dart';
import 'package:flutter_test/flutter_test.dart';

MapSpikePoint _point({
  required double lat,
  required double lng,
  String id = 'p1',
}) {
  return MapSpikePoint(
    geocodeProvider: 'kakao',
    pinAccuracy: 'building',
    latitude: lat,
    longitude: lng,
    carrier: '',
    customerName: '',
    address: '테스트 주소',
    detailAddress: '',
    product: '택배',
    quantity: 1,
    status: '대기',
    statusCode: 'pending',
    pointId: id,
    jobId: 'job-1',
    driverId: 'driver-1',
    piiMasked: false,
  );
}

void main() {
  test('invalid destination does not launch native', () async {
    var launched = false;
    final ok = await TmapInAppNavi.open(
      destination: _point(lat: 0, lng: 0),
      apiKey: 'test-tmap-key',
      launch:
          ({
            required apiKey,
            required pointId,
            required latitude,
            required longitude,
            required destinationName,
            clientId = '',
            userKey = '',
            deviceKey = '',
          }) async {
            launched = true;
          },
    );
    expect(ok, isFalse);
    expect(launched, isFalse);
  });

  test('missing API key does not launch native', () async {
    var launched = false;
    final ok = await TmapInAppNavi.open(
      destination: _point(lat: 37.4, lng: 126.7),
      apiKey: '',
      launch:
          ({
            required apiKey,
            required pointId,
            required latitude,
            required longitude,
            required destinationName,
            clientId = '',
            userKey = '',
            deviceKey = '',
          }) async {
            launched = true;
          },
    );
    expect(ok, isFalse);
    expect(launched, isFalse);
  });

  test('valid destination sends lon/lat and pointId correctly', () async {
    String? gotPointId;
    double? gotLat;
    double? gotLng;
    String? gotName;
    String? gotKey;

    final ok = await TmapInAppNavi.open(
      destination: _point(lat: 37.401, lng: 126.702, id: 'deliv-9'),
      apiKey: 'test-tmap-key',
      clientId: 'cid',
      launch:
          ({
            required apiKey,
            required pointId,
            required latitude,
            required longitude,
            required destinationName,
            clientId = '',
            userKey = '',
            deviceKey = '',
          }) async {
            gotKey = apiKey;
            gotPointId = pointId;
            gotLat = latitude;
            gotLng = longitude;
            gotName = destinationName;
          },
    );

    expect(ok, isTrue);
    expect(gotKey, 'test-tmap-key');
    expect(gotPointId, 'deliv-9');
    expect(gotLat, closeTo(37.401, 0.0001));
    expect(gotLng, closeTo(126.702, 0.0001));
    expect(gotName, isNotEmpty);
    // Flutter passes WGS84 lat/lng; native MapPoint(lon, lat) uses longitude first.
    expect(
      TmapInAppNavi.navLongitude(_point(lat: 37.401, lng: 126.702)),
      126.702,
    );
    expect(
      TmapInAppNavi.navLatitude(_point(lat: 37.401, lng: 126.702)),
      37.401,
    );
  });

  test('canNavigate mirrors coordinate validation', () {
    expect(TmapInAppNavi.canNavigate(_point(lat: 37.4, lng: 126.7)), isTrue);
    expect(TmapInAppNavi.canNavigate(_point(lat: 0, lng: 0)), isFalse);
  });
}
