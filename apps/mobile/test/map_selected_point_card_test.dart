import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/models/delivery_shipment.dart';
import 'package:delivery_shield_mobile/models/map_spike_point.dart';
import 'package:delivery_shield_mobile/screens/unified_map_keys.dart';
import 'package:delivery_shield_mobile/theme/app_theme.dart';
import 'package:delivery_shield_mobile/widgets/map_selected_point_card.dart';

MapSpikePoint _point({
  required String pointId,
  String address = '인천 남동구 구월동 1',
  String product = '구월동 1',
  int quantity = 2,
  bool completed = false,
  bool piiMasked = false,
  String? contactValue,
  bool hasAccessInfo = false,
  List<DeliveryShipment> shipments = const [],
}) {
  return MapSpikePoint(
    geocodeProvider: 'kakao',
    pinAccuracy: 'building',
    latitude: 37.4483,
    longitude: 126.731,
    carrier: '',
    customerName: piiMasked ? '****' : '홍길동',
    address: piiMasked ? '****' : address,
    detailAddress: piiMasked ? '****' : '101호',
    product: product,
    quantity: quantity,
    status: completed ? '배송 완료' : '대기',
    statusCode: completed ? 'completed' : 'pending',
    pointId: pointId,
    jobId: 'job-1',
    driverId: 'driver-uuid-must-not-render',
    piiMasked: piiMasked,
    contactType: contactValue == null ? 'none' : 'virtual_number',
    contactValue: contactValue,
    hasAccessInfo: hasAccessInfo,
    shipments: shipments,
  );
}

Future<void> _pumpCard(
  WidgetTester tester, {
  required MapSpikePoint point,
  VoidCallback? onNavigate,
  VoidCallback? onOpenDetail,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark(),
      home: Scaffold(
        body: Align(
          alignment: Alignment.bottomCenter,
          child: MapSelectedPointCard(
            point: point,
            onClose: () {},
            onNavigate: onNavigate,
            onOpenDetail: onOpenDetail ?? () {},
          ),
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('MAP_POINT_SELECTION shows selected-point card', (tester) async {
    var selected = false;
    final point = _point(
      pointId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: StatefulBuilder(
          builder: (context, setState) {
            return Scaffold(
              body: selected
                  ? MapSelectedPointCard(
                      point: point,
                      onClose: () {},
                      onNavigate: () {},
                      onOpenDetail: () {},
                    )
                  : TextButton(
                      onPressed: () => setState(() => selected = true),
                      child: const Text('select-pin'),
                    ),
            );
          },
        ),
      ),
    );

    expect(find.byKey(UnifiedMapKeys.selectedPointCard), findsNothing);
    await tester.tap(find.text('select-pin'));
    await tester.pump();
    expect(find.byKey(UnifiedMapKeys.selectedPointCard), findsOneWidget);
  });

  testWidgets('SELECTED_POINT_CARD shows operational fields only', (tester) async {
    const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    await _pumpCard(
      tester,
      point: _point(
        pointId: uuid,
        contactValue: '010-9999-0000',
        hasAccessInfo: true,
        shipments: const [
          DeliveryShipment(
            shipmentId: 'sh-1',
            sequenceNo: 1,
            trackingCode: 'TRK-1',
            status: 'pending',
            statusCode: 'pending',
          ),
        ],
      ),
      onNavigate: () {},
    );

    expect(find.byKey(UnifiedMapKeys.selectedPointCard), findsOneWidget);
    expect(find.text('인천 남동구 구월동 1'), findsOneWidget);
    expect(find.text('물량 2 · 송장 1건'), findsOneWidget);
    expect(find.text('미완료'), findsOneWidget);
    expect(find.text(uuid), findsNothing);
    expect(find.text('driver-uuid-must-not-render'), findsNothing);
    expect(find.text('010-9999-0000'), findsNothing);
    expect(find.text('출입정보'), findsNothing);
    expect(find.text('홍길동'), findsNothing);
  });

  testWidgets('NAVIGATE_CTA_WIRING and DETAIL_ACTION', (tester) async {
    var navigated = false;
    var openedDetail = false;
    await _pumpCard(
      tester,
      point: _point(pointId: 'pt-1'),
      onNavigate: () => navigated = true,
      onOpenDetail: () => openedDetail = true,
    );

    expect(find.byKey(UnifiedMapKeys.navigateCta), findsOneWidget);
    expect(find.text('길찾기'), findsOneWidget);
    await tester.tap(find.text('길찾기'));
    expect(navigated, isTrue);

    expect(find.byKey(UnifiedMapKeys.detailAction), findsOneWidget);
    await tester.tap(find.text('상세'));
    expect(openedDetail, isTrue);
  });

  testWidgets('hide navigate CTA when callback is absent', (tester) async {
    await _pumpCard(
      tester,
      point: _point(pointId: 'pt-1'),
    );
    expect(find.text('길찾기'), findsNothing);
    expect(find.text('상세'), findsOneWidget);
  });
}
