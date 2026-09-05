import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/map/today_workset_map_adapter.dart';
import 'package:delivery_shield_mobile/models/map_spike_point.dart';
import 'package:delivery_shield_mobile/models/today_workset.dart';

MapSpikePoint _mapPoint({
  required String id,
  required double lat,
  required double lng,
  String pinAccuracy = '',
}) {
  return MapSpikePoint(
    geocodeProvider: 'kakao',
    pinAccuracy: pinAccuracy,
    latitude: lat,
    longitude: lng,
    carrier: '',
    customerName: '',
    address: '',
    detailAddress: '',
    product: id,
    quantity: 1,
    status: '대기',
    statusCode: 'pending',
    pointId: id,
    jobId: 'job-1',
    driverId: 'driver-1',
    piiMasked: false,
  );
}

TodayWorkset _workset(List<Map<String, Object?>> points) {
  return TodayWorkset.fromJson({
    'serviceDate': '2026-09-05',
    'summary': {
      'totalPoints': points.length,
      'completedPoints': 0,
      'pendingPoints': points.length,
      'totalShipments': 0,
      'byCompany': const [],
      'bySource': const [],
    },
    'companies': const [],
    'sources': const [],
    'jobs': const [],
    'points': points,
    'shipments': const [],
  });
}

void main() {
  test('skips invalid points and keeps a valid manual pin', () {
    final workset = _workset([
      {
        'pointId': 'manual-ok',
        'jobId': 'job-a',
        'companyId': null,
        'sourceId': 'src-manual',
        'status': 'pending',
        'latitude': 37.11,
        'longitude': 126.11,
        'quantity': 1,
        'displayLabel': '수동 등록',
        'pinAccuracy': '',
        'piiMasked': false,
        'hasAccessInfo': false,
        'shipmentCount': 1,
        'contactAvailable': false,
      },
      {
        'pointId': 'no-coords',
        'jobId': 'job-b',
        'companyId': null,
        'sourceId': 'src-manual',
        'status': 'pending',
        'latitude': null,
        'longitude': null,
        'quantity': 1,
        'displayLabel': '좌표 없음',
        'pinAccuracy': 'address',
        'piiMasked': false,
        'hasAccessInfo': false,
        'shipmentCount': 1,
        'contactAvailable': false,
      },
      {
        'pointId': 'nan-point',
        'jobId': 'job-c',
        'companyId': null,
        'sourceId': 'src-a',
        'status': 'pending',
        'latitude': 0,
        'longitude': 0,
        'quantity': 1,
        'displayLabel': '0,0',
        'pinAccuracy': 'address',
        'piiMasked': false,
        'hasAccessInfo': false,
        'shipmentCount': 1,
        'contactAvailable': false,
      },
    ]);

    final mapped = TodayWorksetMapAdapter.toMapPoints(
      workset,
      driverId: 'driver-1',
    );
    expect(mapped.map((p) => p.pointId), ['manual-ok']);
    expect(mapped.single.latitude, 37.11);
    expect(mapped.single.longitude, 126.11);
  });

  test('retainRenderable keeps empty pinAccuracy and drops invalid coords', () {
    final kept = TodayWorksetMapAdapter.retainRenderableMapPoints([
      _mapPoint(id: 'ok', lat: 37.4, lng: 126.7, pinAccuracy: ''),
      _mapPoint(id: 'zero', lat: 0, lng: 0),
      _mapPoint(id: 'bad-lat', lat: 91, lng: 126.7),
    ]);
    expect(kept.map((p) => p.pointId), ['ok']);
  });

  test('workset point without coords is not renderable but still exists', () {
    final point = WorksetPoint.fromJson({
      'pointId': 'pending-1',
      'jobId': 'job-a',
      'status': 'pending',
      'latitude': null,
      'longitude': null,
      'quantity': 1,
      'displayLabel': '대기',
      'pinAccuracy': 'address',
      'piiMasked': false,
      'hasAccessInfo': false,
      'shipmentCount': 1,
      'contactAvailable': false,
    });
    expect(point.hasCoordinates, isFalse);
    expect(TodayWorksetMapAdapter.isRenderableWorksetPoint(point), isFalse);
  });
}
