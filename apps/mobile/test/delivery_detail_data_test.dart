import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/models/delivery_shipment.dart';
import 'package:delivery_shield_mobile/models/map_spike_point.dart';
import 'package:delivery_shield_mobile/screens/delivery_detail_data.dart';
import 'package:delivery_shield_mobile/screens/delivery_list_data.dart';
import 'package:delivery_shield_mobile/models/today_workset.dart';

MapSpikePoint _point({
  String product = 'SYNTH-BLDG',
  String address = '',
  String detailAddress = '',
  int quantity = 4,
  bool completed = false,
  bool piiMasked = false,
  double lat = 37.4,
  double lng = 126.7,
  String? companyLabel,
  String? sourceLabel,
  String? contactValue,
  bool hasAccessInfo = false,
  List<DeliveryShipment> shipments = const [],
}) {
  return MapSpikePoint(
    geocodeProvider: 'kakao',
    pinAccuracy: 'building',
    latitude: lat,
    longitude: lng,
    carrier: '',
    customerName: piiMasked ? '****' : '',
    address: address,
    detailAddress: detailAddress,
    product: product,
    quantity: quantity,
    status: completed ? '완료' : '미완료',
    statusCode: completed ? 'completed' : 'pending',
    pointId: 'pt-synth-1',
    jobId: 'job-synth-1',
    driverId: 'driver-uuid-must-not-render',
    piiMasked: piiMasked,
    contactType: contactValue == null ? 'none' : 'virtual_number',
    contactValue: contactValue,
    hasAccessInfo: hasAccessInfo,
    shipments: shipments,
    companyLabel: companyLabel,
    sourceLabel: sourceLabel,
  );
}

void main() {
  test('DETAIL_POINT_HEADER uses display label not customer profile', () {
    expect(detailPointHeader(_point()), 'SYNTH-BLDG');
    expect(detailPointHeader(_point(product: '****')), '배송지');
  });

  test('DETAIL_STATUS_OPEN and DETAIL_STATUS_COMPLETED', () {
    expect(detailStatusLabel(_point()), '미완료');
    expect(detailStatusLabel(_point(completed: true)), '완료');
  });

  test('DETAIL_COUNTS prefers real shipment rows then shipmentCount', () {
    expect(
      detailDeliveryCount(point: _point(), shipmentCount: 3),
      3,
    );
    expect(
      detailDeliveryCount(
        point: _point(
          shipments: const [
            DeliveryShipment(
              shipmentId: 's1',
              sequenceNo: 1,
              trackingCode: 'TRK-SYNTH-1',
              status: 'pending',
              statusCode: 'pending',
            ),
            DeliveryShipment(
              shipmentId: 's2',
              sequenceNo: 2,
              trackingCode: 'TRK-SYNTH-2',
              status: 'pending',
              statusCode: 'pending',
            ),
          ],
        ),
        shipmentCount: 9,
      ),
      2,
    );
  });

  test('DETAIL_COMPANY_SOURCE stays separate and omits empty', () {
    final both = _point(companyLabel: 'Acme', sourceLabel: 'Acme Source');
    expect(detailCompanyLabel(both), 'Acme');
    expect(detailSourceLabel(both), 'Acme Source');
    expect(detailCompanyLabel(_point()), isNull);
    expect(detailSourceLabel(_point()), isNull);
  });

  test('DETAIL_ADDRESS_REAL_ONLY and DETAIL_NO_FAKE_ADDRESS', () {
    expect(detailAddressLine(_point(product: 'OO아파트 101동')), isNull);
    expect(detailAddressLine(_point(address: '****')), isNull);
    expect(
      detailAddressLine(_point(piiMasked: true, address: 'SYNTH-ADDR-1')),
      isNull,
    );
    expect(detailAddressLine(_point(address: 'SYNTH-ADDR-1')), 'SYNTH-ADDR-1');
  });

  test('NAVIGATE_VALID_COORDINATES and invalid hidden', () {
    expect(detailCanNavigate(_point()), isTrue);
    expect(detailCanNavigate(_point(lat: 0, lng: 0)), isFalse);
    expect(detailCanNavigate(_point(lat: double.nan, lng: 126.7)), isFalse);
  });

  test('COMPLETE_ACTION_OPEN_POINT and COMPLETED_HIDDEN', () {
    expect(detailShowComplete(_point()), isTrue);
    expect(detailShowComplete(_point(completed: true)), isFalse);
  });

  test('PHONE and ACCESS default hidden flags', () {
    final open = _point(
      contactValue: '00000000001',
      hasAccessInfo: true,
    );
    expect(detailShowPhoneActions(open), isTrue);
    expect(detailShowAccessReveal(open), isTrue);
    expect(
      detailShowAccessReveal(_point(completed: true, hasAccessInfo: true)),
      isFalse,
    );
    expect(
      detailShowPhoneActions(
        _point(completed: true, contactValue: '00000000001'),
      ),
      isFalse,
    );
  });

  test('SHIPMENT_PRESENTATION drops empty tracking rows', () {
    final point = _point(
      shipments: const [
        DeliveryShipment(
          shipmentId: 's0',
          sequenceNo: 0,
          trackingCode: '',
          status: 'pending',
          statusCode: 'pending',
        ),
        DeliveryShipment(
          shipmentId: 's1',
          sequenceNo: 1,
          trackingCode: 'TRK-SYNTH-1',
          status: 'pending',
          statusCode: 'pending',
        ),
      ],
    );
    expect(detailHasShipmentRows(point), isTrue);
    expect(detailShipments(point), hasLength(1));
  });

  test('list mapping does not invent address or phone', () {
    final ws = TodayWorkset.fromJson({
      'serviceDate': '2026-09-04',
      'summary': {
        'totalPoints': 1,
        'completedPoints': 0,
        'pendingPoints': 1,
        'totalShipments': 0,
        'byCompany': <Map<String, Object?>>[],
        'bySource': <Map<String, Object?>>[],
      },
      'companies': const [],
      'sources': const [],
      'jobs': const [],
      'points': [
        {
          'pointId': 'pt-1',
          'jobId': 'job-1',
          'status': 'pending',
          'latitude': 37.4,
          'longitude': 126.7,
          'quantity': 1,
          'displayLabel': 'OO아파트 101동',
          'pinAccuracy': 'building',
          'piiMasked': true,
          'hasAccessInfo': true,
          'shipmentCount': 1,
          'contactAvailable': true,
        },
      ],
      'shipments': const [],
    });
    final mapped = worksetPointToDetailPoint(
      workset: ws,
      point: ws.points.single,
      driverId: 'driver-uuid-hidden',
    );
    expect(mapped.address, isEmpty);
    expect(mapped.detailAddress, isEmpty);
    expect(mapped.contactValue, isNull);
    expect(detailAddressLine(mapped), isNull);
    expect(detailPointHeader(mapped), 'OO아파트 101동');
  });
}
