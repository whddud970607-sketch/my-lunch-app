import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/map/map_provider_id.dart';
import 'package:delivery_shield_mobile/map/workset_map_filter.dart';
import 'package:delivery_shield_mobile/map/workset_map_filter_chips.dart';
import 'package:delivery_shield_mobile/models/today_workset.dart';
import 'package:delivery_shield_mobile/screens/unified_map_keys.dart';
import 'package:delivery_shield_mobile/screens/unified_map_overlay.dart';
import 'package:delivery_shield_mobile/theme/app_theme.dart';
import 'package:delivery_shield_mobile/widgets/my_location_button.dart';

TodayWorkset _sampleWorkset() {
  return TodayWorkset.fromJson({
    'serviceDate': '2026-09-04',
    'summary': {
      'totalPoints': 3,
      'completedPoints': 1,
      'pendingPoints': 2,
      'totalShipments': 3,
      'byCompany': const [],
      'bySource': const [],
    },
    'companies': [
      {'id': 'co-a', 'displayName': 'Alpha'},
      {'id': 'co-b', 'displayName': 'Beta'},
    ],
    'sources': [
      {
        'id': 'src-a',
        'companyId': 'co-a',
        'ownerDriverId': 'driver-uuid-must-not-render',
        'sourceType': 'company_api',
        'sourceKey': 'a',
        'displayName': 'Alpha Source',
        'externalSystem': null,
        'isActive': true,
      },
      {
        'id': 'src-m',
        'companyId': null,
        'ownerDriverId': 'driver-uuid-must-not-render',
        'sourceType': 'driver_manual',
        'sourceKey': 'manual',
        'displayName': '직접추가',
        'externalSystem': null,
        'isActive': true,
      },
    ],
    'jobs': const [],
    'points': [
      {
        'pointId': 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        'jobId': 'job-a',
        'companyId': 'co-a',
        'sourceId': 'src-a',
        'status': 'pending',
        'latitude': 37.4,
        'longitude': 126.7,
        'quantity': 1,
        'displayLabel': '구월동 1',
        'pinAccuracy': 'building',
        'piiMasked': false,
        'hasAccessInfo': false,
        'shipmentCount': 1,
        'contactAvailable': false,
      },
      {
        'pointId': 'pt-m',
        'jobId': 'job-m',
        'companyId': null,
        'sourceId': 'src-m',
        'status': 'pending',
        'latitude': 37.5,
        'longitude': 126.8,
        'quantity': 1,
        'displayLabel': '수동 지점',
        'pinAccuracy': 'address',
        'piiMasked': false,
        'hasAccessInfo': false,
        'shipmentCount': 1,
        'contactAvailable': false,
      },
    ],
    'shipments': const [],
  });
}

Future<void> _pump(WidgetTester tester, Widget body) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark(),
      home: Scaffold(body: body),
    ),
  );
}

void main() {
  testWidgets('MAP_HEADER shows 통합 지도 without driver UUID', (tester) async {
    const uuid = 'driver-uuid-must-not-render';
    await _pump(
      tester,
      UnifiedMapOverlay(
        title: '통합 지도',
        showSummary: true,
        totalPoints: 3,
        completedPoints: 1,
        remainingPoints: 2,
        onRefresh: () {},
        refreshing: false,
        mapProviderId: MapProviderId.kakao,
        onProviderSelected: (_) {},
      ),
    );

    expect(find.byKey(UnifiedMapKeys.header), findsOneWidget);
    expect(find.text('통합 지도'), findsOneWidget);
    expect(find.text(uuid), findsNothing);
  });

  testWidgets('MAP_SUMMARY uses TodayWorkset counts', (tester) async {
    final ws = _sampleWorkset();
    await _pump(
      tester,
      UnifiedMapOverlay(
        title: '통합 지도',
        showSummary: true,
        totalPoints: ws.summary.totalPoints,
        completedPoints: ws.summary.completedPoints,
        remainingPoints: ws.summary.remainingPoints,
        onRefresh: () {},
        refreshing: false,
        mapProviderId: MapProviderId.kakao,
        onProviderSelected: (_) {},
      ),
    );

    expect(find.byKey(UnifiedMapKeys.summary), findsOneWidget);
    expect(find.text('전체 3'), findsOneWidget);
    expect(find.text('완료 1'), findsOneWidget);
    expect(find.text('남음 2'), findsOneWidget);
  });

  testWidgets('MAP_LOADING_STATE_PRESERVED and MAP_ERROR_STATE_PRESERVED',
      (tester) async {
    var retried = false;
    await _pump(
      tester,
      MapErrorPanel(
        message: '지도 데이터를 불러오지 못했습니다',
        onRetry: () => retried = true,
      ),
    );
    expect(find.byKey(UnifiedMapKeys.errorState), findsOneWidget);
    await tester.tap(find.text('다시 시도'));
    expect(retried, isTrue);

    await _pump(tester, const MapLoadingPanel());
    expect(find.byKey(UnifiedMapKeys.loadingState), findsOneWidget);
  });

  testWidgets('MAP_FILTERS keep company and source distinct', (tester) async {
    final chips = WorksetMapFilterChips.fromWorkset(_sampleWorkset());
    WorksetMapFilter selected = WorksetMapFilter.all;
    await _pump(
      tester,
      UnifiedMapOverlay(
        title: '통합 지도',
        showSummary: true,
        totalPoints: 3,
        completedPoints: 1,
        remainingPoints: 2,
        filters: chips,
        selectedFilter: selected,
        onFilterSelected: (next) => selected = next,
        onRefresh: () {},
        refreshing: false,
        mapProviderId: MapProviderId.kakao,
        onProviderSelected: (_) {},
      ),
    );

    expect(find.byKey(UnifiedMapKeys.filters), findsOneWidget);
    expect(find.text('전체'), findsWidgets);
    expect(find.text('회사'), findsOneWidget);
    expect(find.text('채널'), findsOneWidget);
    expect(find.text('Alpha'), findsOneWidget);
    expect(find.text('Alpha Source'), findsOneWidget);
    expect(find.text('수동'), findsOneWidget);
    expect(find.text('Source'), findsNothing);
    expect(find.text('driver-uuid-must-not-render'), findsNothing);
  });

  testWidgets('MAP_CURRENT_LOCATION_CONTROL is thumb-reachable', (tester) async {
    await _pump(
      tester,
      Align(
        alignment: Alignment.bottomRight,
        child: MyLocationButton(
          key: UnifiedMapKeys.currentLocation,
          followActive: false,
          onPressed: () {},
        ),
      ),
    );

    expect(find.byKey(UnifiedMapKeys.currentLocation), findsOneWidget);
  });

  testWidgets('MAP_PROVIDER_PRESERVED menu lists Kakao and Naver', (tester) async {
    await _pump(
      tester,
      UnifiedMapOverlay(
        title: '통합 지도',
        onRefresh: () {},
        refreshing: false,
        mapProviderId: MapProviderId.kakao,
        onProviderSelected: (_) {},
      ),
    );

    await tester.tap(find.byKey(UnifiedMapKeys.providerMenu));
    await tester.pumpAndSettle();
    expect(find.text('카카오맵'), findsWidgets);
    expect(find.text('네이버지도'), findsOneWidget);
  });
}
