import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/models/map_spike_point.dart';
import 'package:delivery_shield_mobile/screens/complete_delivery_data.dart';
import 'package:delivery_shield_mobile/screens/complete_delivery_keys.dart';
import 'package:delivery_shield_mobile/screens/complete_delivery_screen.dart';
import 'package:delivery_shield_mobile/theme/app_theme.dart';
import 'package:delivery_shield_mobile/widgets/ds_primary_button.dart';

MapSpikePoint _point({
  String product = 'SYNTH-BLDG',
  int quantity = 4,
  String? contactValue,
  bool hasAccessInfo = false,
}) {
  return MapSpikePoint(
    geocodeProvider: 'kakao',
    pinAccuracy: 'building',
    latitude: 37.4,
    longitude: 126.7,
    carrier: '',
    customerName: 'must-not-render-customer',
    address: '',
    detailAddress: '',
    product: product,
    quantity: quantity,
    status: '미완료',
    statusCode: 'pending',
    pointId: 'pt-synth-1',
    jobId: 'job-synth-1',
    driverId: 'driver-uuid-must-not-render',
    piiMasked: false,
    contactType: contactValue == null ? 'none' : 'virtual_number',
    contactValue: contactValue,
    hasAccessInfo: hasAccessInfo,
  );
}

Future<void> _pumpComplete(
  WidgetTester tester, {
  required MapSpikePoint point,
  MapSpikePoint? nextPoint,
  CompleteDeliverySubmitHook? submitHook,
  List<int>? seedPhotoBytes,
  VoidCallback? onOpenMap,
  VoidCallback? onOpenList,
  int? shipmentCount,
}) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark(),
      home: CompleteDeliveryScreen(
        point: point,
        driverId: point.driverId,
        nextPoint: nextPoint,
        onOpenMap: onOpenMap,
        onOpenList: onOpenList,
        shipmentCount: shipmentCount,
        submitHook: submitHook ??
            (_) async => CompleteSubmitKind.confirmed,
        seedPhotoBytes: seedPhotoBytes,
      ),
    ),
  );
}

FilledButton _submitButton(WidgetTester tester) {
  return tester.widget<FilledButton>(
    find.descendant(
      of: find.byKey(CompleteDeliveryKeys.submit),
      matching: find.byType(FilledButton),
    ),
  );
}

void main() {
  testWidgets('COMPLETE_POINT_HEADER and COMPLETE_COUNTS', (tester) async {
    await _pumpComplete(
      tester,
      point: _point(),
      shipmentCount: 2,
    );
    expect(find.byKey(CompleteDeliveryKeys.header), findsOneWidget);
    expect(find.text('SYNTH-BLDG'), findsOneWidget);
    expect(find.text('배송 2건 · 물량 4'), findsOneWidget);
    expect(find.byKey(CompleteDeliveryKeys.quantity), findsOneWidget);
    expect(find.text('물량 4'), findsOneWidget);
    expect(find.text('must-not-render-customer'), findsNothing);
  });

  testWidgets('COMPLETE_SUBMIT_IDLE disables primary without photo', (
    tester,
  ) async {
    await _pumpComplete(tester, point: _point());
    expect(_submitButton(tester).onPressed, isNull);
    expect(find.byKey(CompleteDeliveryKeys.loading), findsNothing);
  });

  testWidgets('COMPLETE_SUBMIT_LOADING and COMPLETE_DOUBLE_SUBMIT_BLOCKED', (
    tester,
  ) async {
    var calls = 0;
    final gate = Completer<CompleteSubmitKind>();
    await _pumpComplete(
      tester,
      point: _point(),
      seedPhotoBytes: const [1, 2, 3],
      submitHook: (_) {
        calls += 1;
        return gate.future;
      },
    );
    expect(_submitButton(tester).onPressed, isNotNull);
    await tester.tap(find.byKey(CompleteDeliveryKeys.submit));
    await tester.pump();
    expect(find.byKey(CompleteDeliveryKeys.loading), findsOneWidget);
    expect(_submitButton(tester).onPressed, isNull);
    await tester.tap(find.byKey(CompleteDeliveryKeys.submit));
    await tester.pump();
    expect(calls, 1);
    gate.complete(CompleteSubmitKind.confirmed);
    await tester.pumpAndSettle();
    expect(find.byKey(CompleteDeliveryKeys.success), findsOneWidget);
  });

  testWidgets('COMPLETE_SUCCESS then NEXT_DELIVERY_AVAILABLE', (tester) async {
    await _pumpComplete(
      tester,
      point: _point(),
      nextPoint: _point(product: 'NEXT-STOP'),
      seedPhotoBytes: const [1],
      onOpenMap: () {},
      onOpenList: () {},
    );
    await tester.tap(find.byKey(CompleteDeliveryKeys.submit));
    await tester.pumpAndSettle();
    expect(find.byKey(CompleteDeliveryKeys.success), findsOneWidget);
    expect(find.text('배송을 완료했습니다'), findsOneWidget);
    expect(find.byKey(CompleteDeliveryKeys.nextDelivery), findsOneWidget);
    expect(find.text('다음 배송'), findsOneWidget);
    expect(find.text('지도 보기'), findsOneWidget);
    expect(find.text('배송 목록'), findsOneWidget);
  });

  testWidgets('NEXT_DELIVERY_NONE hides next action', (tester) async {
    await _pumpComplete(
      tester,
      point: _point(),
      seedPhotoBytes: const [1],
    );
    await tester.tap(find.byKey(CompleteDeliveryKeys.submit));
    await tester.pumpAndSettle();
    expect(find.byKey(CompleteDeliveryKeys.nextDelivery), findsNothing);
    expect(find.text('남은 다음 배송이 없습니다'), findsOneWidget);
  });

  testWidgets('COMPLETE_ERROR keeps photo and allows retry', (tester) async {
    var calls = 0;
    await _pumpComplete(
      tester,
      point: _point(),
      seedPhotoBytes: const [1],
      submitHook: (_) async {
        calls += 1;
        if (calls == 1) throw Exception('fail');
        return CompleteSubmitKind.confirmed;
      },
    );
    await tester.tap(find.byKey(CompleteDeliveryKeys.submit));
    await tester.pumpAndSettle();
    expect(find.byKey(CompleteDeliveryKeys.error), findsOneWidget);
    expect(find.text('완료 처리에 실패했습니다.'), findsOneWidget);
    expect(_submitButton(tester).onPressed, isNotNull);
    await tester.tap(find.byKey(CompleteDeliveryKeys.submit));
    await tester.pumpAndSettle();
    expect(find.byKey(CompleteDeliveryKeys.success), findsOneWidget);
  });

  testWidgets('OFFLINE_COMPLETION_PRESENTATION does not claim server complete', (
    tester,
  ) async {
    await _pumpComplete(
      tester,
      point: _point(),
      seedPhotoBytes: const [1],
      submitHook: (_) async => CompleteSubmitKind.queued,
    );
    await tester.tap(find.byKey(CompleteDeliveryKeys.submit));
    await tester.pumpAndSettle();
    expect(find.byKey(CompleteDeliveryKeys.offlineQueued), findsOneWidget);
    expect(find.text('오프라인 저장됨 / 연결 시 동기화'), findsOneWidget);
    expect(find.text('배송을 완료했습니다'), findsNothing);
    expect(find.textContaining('서버 완료 전'), findsOneWidget);
  });

  testWidgets('POD_ACTUAL_FIELDS_ONLY and POD_NO_FAKE_FIELDS', (tester) async {
    await _pumpComplete(tester, point: _point());
    expect(find.byKey(CompleteDeliveryKeys.podPhoto), findsOneWidget);
    expect(find.byKey(CompleteDeliveryKeys.podCamera), findsOneWidget);
    expect(find.byKey(CompleteDeliveryKeys.podGallery), findsOneWidget);
    expect(find.text('사진 촬영'), findsOneWidget);
    expect(find.text('앨범에서 선택'), findsOneWidget);
    expect(find.text('서명'), findsNothing);
    expect(find.text('수령인'), findsNothing);
    expect(find.text('배송위치'), findsNothing);
    expect(find.text('메모'), findsNothing);
  });

  testWidgets('POD_PRIVACY_SAFE and DRIVER_UUID_HIDDEN', (tester) async {
    await _pumpComplete(
      tester,
      point: _point(
        contactValue: '010-1234-5678',
        hasAccessInfo: true,
      ),
      shipmentCount: 1,
    );
    expect(find.textContaining('driver-uuid-must-not-render'), findsNothing);
    expect(find.textContaining('010-1234-5678'), findsNothing);
    expect(find.text('must-not-render-customer'), findsNothing);
    expect(find.textContaining('access'), findsNothing);
    expect(find.text('출입정보'), findsNothing);
  });

  testWidgets('complete primary is DsPrimaryButton', (tester) async {
    await _pumpComplete(tester, point: _point());
    expect(find.byType(DsPrimaryButton), findsOneWidget);
    expect(find.text('완료'), findsOneWidget);
    expect(find.text('배송 완료'), findsOneWidget);
    expect(find.text('오늘 배송 종료'), findsNothing);
  });
}
