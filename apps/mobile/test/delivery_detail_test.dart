import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/models/delivery_shipment.dart';
import 'package:delivery_shield_mobile/models/map_spike_point.dart';
import 'package:delivery_shield_mobile/screens/delivery_detail_keys.dart';
import 'package:delivery_shield_mobile/theme/app_theme.dart';
import 'package:delivery_shield_mobile/widgets/delivery_detail_panel.dart';

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
  String driverId = 'driver-uuid-must-not-render',
}) {
  return MapSpikePoint(
    geocodeProvider: 'kakao',
    pinAccuracy: 'building',
    latitude: lat,
    longitude: lng,
    carrier: '',
    customerName: piiMasked ? '****' : 'must-not-render-customer',
    address: address,
    detailAddress: detailAddress,
    product: product,
    quantity: quantity,
    status: completed ? '완료' : '미완료',
    statusCode: completed ? 'completed' : 'pending',
    pointId: 'pt-synth-1',
    jobId: 'job-synth-1',
    driverId: driverId,
    piiMasked: piiMasked,
    contactType: contactValue == null ? 'none' : 'virtual_number',
    contactValue: contactValue,
    hasAccessInfo: hasAccessInfo,
    shipments: shipments,
    companyLabel: companyLabel,
    sourceLabel: sourceLabel,
  );
}

Future<void> _pumpPanel(
  WidgetTester tester, {
  required MapSpikePoint point,
  VoidCallback? onNavigate,
  VoidCallback? onComplete,
  Future<String> Function(String pointId)? onRevealAccessInfo,
  Future<MapSpikePoint> Function(String pointId)? onHydratePoint,
  int? shipmentCount,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark(),
      home: Scaffold(
        body: DeliveryDetailPanel(
          point: point,
          totalQuantity: point.quantity,
          clusteredJobCount: 1,
          shipmentCount: shipmentCount,
          onClose: () {},
          onNavigate: onNavigate,
          onComplete: onComplete,
          onRevealAccessInfo: onRevealAccessInfo,
          onHydratePoint: onHydratePoint,
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  testWidgets('DETAIL_POINT_HEADER and DETAIL_STATUS_OPEN', (tester) async {
    await _pumpPanel(tester, point: _point(), shipmentCount: 2);
    expect(find.byKey(DeliveryDetailKeys.header), findsOneWidget);
    expect(find.text('SYNTH-BLDG'), findsOneWidget);
    expect(find.text('미완료'), findsOneWidget);
    expect(find.text('배송 2건 · 물량 4'), findsOneWidget);
    expect(find.text('must-not-render-customer'), findsNothing);
  });

  testWidgets('DETAIL_STATUS_COMPLETED hides duplicate complete', (
    tester,
  ) async {
    var complete = 0;
    await _pumpPanel(
      tester,
      point: _point(completed: true, piiMasked: true),
      onComplete: () => complete++,
      onNavigate: () {},
    );
    expect(find.text('완료'), findsOneWidget);
    expect(find.byKey(DeliveryDetailKeys.complete), findsNothing);
    expect(find.text('배송 완료'), findsNothing);
    expect(complete, 0);
  });

  testWidgets('DETAIL_COMPANY_SOURCE shown only when labels exist', (
    tester,
  ) async {
    await _pumpPanel(tester, point: _point());
    expect(find.byKey(DeliveryDetailKeys.company), findsNothing);
    expect(find.byKey(DeliveryDetailKeys.source), findsNothing);

    await _pumpPanel(
      tester,
      point: _point(companyLabel: 'Acme', sourceLabel: 'Acme Source'),
    );
    expect(find.text('회사  Acme'), findsOneWidget);
    expect(find.text('소스  Acme Source'), findsOneWidget);
  });

  testWidgets('DETAIL_NO_FAKE_ADDRESS does not invent from displayLabel', (
    tester,
  ) async {
    await _pumpPanel(
      tester,
      point: _point(product: 'OO아파트 101동', address: ''),
    );
    expect(find.byKey(DeliveryDetailKeys.address), findsNothing);
    expect(find.byKey(DeliveryDetailKeys.addressCopy), findsNothing);
    expect(find.text('OO아파트 101동'), findsOneWidget);
  });

  testWidgets('DETAIL_ADDRESS_REAL_ONLY copy uses address field', (
    tester,
  ) async {
    await _pumpPanel(
      tester,
      point: _point(address: 'SYNTH-ADDR-1', detailAddress: 'SYNTH-UNIT-1'),
    );
    expect(find.byKey(DeliveryDetailKeys.address), findsOneWidget);
    expect(find.text('SYNTH-ADDR-1'), findsOneWidget);
    expect(find.byKey(DeliveryDetailKeys.addressCopy), findsOneWidget);
  });

  testWidgets('NAVIGATE_VALID_COORDINATES shows 길찾기', (tester) async {
    var nav = 0;
    await _pumpPanel(
      tester,
      point: _point(),
      onNavigate: () => nav++,
    );
    expect(find.byKey(DeliveryDetailKeys.navigate), findsOneWidget);
    await tester.tap(find.byKey(DeliveryDetailKeys.navigate));
    expect(nav, 1);
  });

  testWidgets('NAVIGATE_INVALID_COORDINATES_HIDDEN', (tester) async {
    await _pumpPanel(
      tester,
      point: _point(lat: 0, lng: 0),
      onNavigate: () {},
    );
    expect(find.byKey(DeliveryDetailKeys.navigate), findsNothing);
    expect(find.text('길찾기'), findsNothing);
  });

  testWidgets('PHONE_HIDDEN_DEFAULT and PHONE_ACTION without value', (
    tester,
  ) async {
    const synthetic = '00000000001';
    await _pumpPanel(
      tester,
      point: _point(contactValue: synthetic),
    );
    expect(find.byKey(DeliveryDetailKeys.callAction), findsOneWidget);
    expect(find.byKey(DeliveryDetailKeys.smsAction), findsOneWidget);
    expect(find.text('전화'), findsOneWidget);
    expect(find.text('문자'), findsOneWidget);
    expect(find.text(synthetic), findsNothing);
    expect(find.byKey(DeliveryDetailKeys.phoneValue), findsNothing);
  });

  testWidgets('PRIVACY_REVEAL then PRIVACY_TTL for phone and access', (
    tester,
  ) async {
    const phone = '00000000001';
    const access = 'synth-access-token';
    await _pumpPanel(
      tester,
      point: _point(contactValue: phone, hasAccessInfo: true),
      onRevealAccessInfo: (_) async => access,
    );
    expect(find.text(phone), findsNothing);
    expect(find.text(access), findsNothing);

    await tester.tap(find.byKey(DeliveryDetailKeys.phoneReveal));
    await tester.pump();
    expect(find.text(phone), findsOneWidget);

    await tester.tap(find.byKey(DeliveryDetailKeys.accessReveal));
    await tester.pump();
    await tester.pump();
    expect(find.text(access), findsOneWidget);

    await tester.pump(const Duration(seconds: 30));
    expect(find.text(phone), findsNothing);
    expect(find.text(access), findsNothing);
  });

  testWidgets('ACCESS_SECRET_HIDDEN_DEFAULT and COMPLETED_PRIVACY_POLICY', (
    tester,
  ) async {
    await _pumpPanel(
      tester,
      point: _point(hasAccessInfo: true),
      onRevealAccessInfo: (_) async => 'synth-access-token',
    );
    expect(find.text('synth-access-token'), findsNothing);
    expect(find.byKey(DeliveryDetailKeys.accessReveal), findsOneWidget);

    await _pumpPanel(
      tester,
      point: _point(
        completed: true,
        piiMasked: true,
        hasAccessInfo: true,
        contactValue: '00000000001',
      ),
      onRevealAccessInfo: (_) async => 'synth-access-token',
    );
    expect(find.byKey(DeliveryDetailKeys.accessReveal), findsNothing);
    expect(find.byKey(DeliveryDetailKeys.phoneReveal), findsNothing);
    expect(find.text('synth-access-token'), findsNothing);
    expect(find.text('00000000001'), findsNothing);
    expect(find.text('완료 배송지는 출입정보를 표시하지 않습니다'), findsOneWidget);
  });

  testWidgets('COMPLETE_ACTION_OPEN_POINT reuses callback only', (tester) async {
    var complete = 0;
    await _pumpPanel(
      tester,
      point: _point(),
      onComplete: () => complete++,
    );
    expect(find.byKey(DeliveryDetailKeys.complete), findsOneWidget);
    await tester.tap(find.byKey(DeliveryDetailKeys.complete));
    expect(complete, 1);
    expect(find.text('미완료'), findsOneWidget);
  });

  testWidgets('SHIPMENT_PRESENTATION shows real tracking only', (tester) async {
    await _pumpPanel(
      tester,
      point: _point(),
      shipmentCount: 3,
    );
    expect(find.byKey(DeliveryDetailKeys.shipments), findsNothing);
    expect(find.text('배송 3건 · 물량 4'), findsOneWidget);

    await _pumpPanel(
      tester,
      point: _point(
        shipments: const [
          DeliveryShipment(
            shipmentId: 's1',
            sequenceNo: 1,
            trackingCode: 'TRK-SYNTH-1',
            status: 'pending',
            statusCode: 'pending',
          ),
        ],
      ),
    );
    expect(find.byKey(DeliveryDetailKeys.shipments), findsOneWidget);
    expect(find.text('TRK-SYNTH-1'), findsOneWidget);
  });

  testWidgets('DRIVER_UUID_HIDDEN and no fake building access', (tester) async {
    await _pumpPanel(
      tester,
      point: _point(driverId: 'driver-uuid-must-not-render'),
    );
    expect(find.text('driver-uuid-must-not-render'), findsNothing);
    expect(find.text('공동현관 비밀번호'), findsNothing);
    expect(find.text('주차 위치'), findsNothing);
    expect(find.text('입구'), findsNothing);
  });
}
