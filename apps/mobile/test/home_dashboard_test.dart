import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/models/today_workset.dart';
import 'package:delivery_shield_mobile/screens/app_shell_tabs.dart';
import 'package:delivery_shield_mobile/screens/home_dashboard.dart';
import 'package:delivery_shield_mobile/state/delivery_session_controller.dart';
import 'package:delivery_shield_mobile/theme/app_theme.dart';

TodayWorkset _sampleWorkset() {
  return TodayWorkset.fromJson({
    'serviceDate': '2026-09-04',
    'summary': {
      'totalPoints': 3,
      'completedPoints': 1,
      'pendingPoints': 2,
      'totalShipments': 3,
      'byCompany': [
        {'companyId': 'co-a', 'totalPoints': 2, 'completedPoints': 0},
        {'companyId': 'co-b', 'totalPoints': 1, 'completedPoints': 1},
      ],
      'bySource': [
        {'sourceId': 'src-a', 'totalPoints': 3, 'completedPoints': 1},
      ],
    },
    'companies': [
      {'id': 'co-a', 'displayName': 'Alpha'},
      {'id': 'co-b', 'displayName': 'Beta'},
    ],
    'sources': [
      {
        'id': 'src-a',
        'companyId': 'co-a',
        'ownerDriverId': 'driver-uuid-should-not-render',
        'sourceType': 'company_api',
        'sourceKey': 'a',
        'displayName': 'Alpha Source',
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
        'quantity': 2,
        'displayLabel': '인천 남동구 구월동 1',
        'pinAccuracy': 'building',
        'piiMasked': false,
        'hasAccessInfo': false,
        'shipmentCount': 1,
        'contactAvailable': false,
      },
      {
        'pointId': 'pt-done-1',
        'jobId': 'job-a',
        'companyId': 'co-b',
        'sourceId': 'src-a',
        'status': 'completed',
        'latitude': 37.4,
        'longitude': 126.7,
        'quantity': 1,
        'displayLabel': '완료 건물 A',
        'pinAccuracy': 'building',
        'piiMasked': true,
        'hasAccessInfo': false,
        'shipmentCount': 1,
        'contactAvailable': false,
      },
    ],
    'shipments': const [],
  });
}

TodayWorkset _emptyWorkset() {
  return const TodayWorkset(
    serviceDate: '2026-09-04',
    summary: WorksetSummary.empty,
    companies: [],
    sources: [],
    jobs: [],
    points: [],
    shipments: [],
  );
}

Future<void> _useTallSurface(WidgetTester tester) async {
  tester.view.physicalSize = const Size(1080, 4000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Future<void> _pumpDashboard(
  WidgetTester tester, {
  required HomeDashboard dashboard,
}) async {
  await _useTallSurface(tester);
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark(),
      home: Scaffold(body: dashboard),
    ),
  );
}

HomeDashboard _baseDashboard({
  String driverDisplayName = '영기사',
  DeliveryLifecyclePhase phase = DeliveryLifecyclePhase.idle,
  bool needsRecovery = false,
  bool inProgress = false,
  bool canStartDelivery = true,
  bool canEndDelivery = false,
  bool needsB2JobPicker = false,
  bool sessionBusy = false,
  HomeDashboardLoadState loadState = HomeDashboardLoadState.loaded,
  TodayWorkset? workset,
  bool hasWorkset = true,
  String? listError,
  VoidCallback? onStartDelivery,
  VoidCallback? onEndDelivery,
  VoidCallback? onOpenMapTab,
  VoidCallback? onOpenScanTab,
  VoidCallback? onRetryToday,
}) {
  return HomeDashboard(
    driverDisplayName: driverDisplayName,
    dateLabel: '2026년 9월 4일',
    phase: phase,
    needsRecovery: needsRecovery,
    inProgress: inProgress,
    canStartDelivery: canStartDelivery,
    canEndDelivery: canEndDelivery,
    needsB2JobPicker: needsB2JobPicker,
    sessionBusy: sessionBusy,
    loadState: loadState,
    elapsedLabel: '12:00',
    workset: hasWorkset ? (workset ?? _sampleWorkset()) : null,
    listError: listError,
    onStartDelivery: onStartDelivery ?? () {},
    onEndDelivery: onEndDelivery ?? () {},
    onOpenMapTab: onOpenMapTab,
    onOpenScanTab: onOpenScanTab,
    onRetryToday: onRetryToday,
  );
}

void main() {
  testWidgets('HOME_HEADER shows product, date, display name, not UUID',
      (tester) async {
    await _pumpDashboard(
      tester,
      dashboard: _baseDashboard(),
    );

    expect(find.byKey(HomeDashboardKeys.header), findsOneWidget);
    expect(find.text('Delivery Shield'), findsOneWidget);
    expect(find.text('오늘의 배송'), findsWidgets);
    expect(find.text('2026년 9월 4일'), findsOneWidget);
    expect(find.text('영기사'), findsOneWidget);
    expect(find.textContaining('driver-uuid-should-not-render'), findsNothing);
    expect(
      find.textContaining('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
      findsNothing,
    );
  });

  testWidgets('WORKDAY_STATUS maps idle / active / completed badges',
      (tester) async {
    await _pumpDashboard(
      tester,
      dashboard: _baseDashboard(phase: DeliveryLifecyclePhase.idle),
    );
    expect(find.byKey(HomeDashboardKeys.workdayStatus), findsOneWidget);
    expect(find.text('배송 전'), findsOneWidget);

    await _pumpDashboard(
      tester,
      dashboard: _baseDashboard(
        phase: DeliveryLifecyclePhase.active,
        inProgress: true,
        canStartDelivery: false,
        canEndDelivery: true,
      ),
    );
    expect(find.text('배송 중'), findsOneWidget);

    await _pumpDashboard(
      tester,
      dashboard: _baseDashboard(
        phase: DeliveryLifecyclePhase.completed,
        canStartDelivery: true,
      ),
    );
    expect(find.text('배송 종료'), findsOneWidget);
  });

  testWidgets('METRICS use TodayWorkset totals and percent', (tester) async {
    await _pumpDashboard(tester, dashboard: _baseDashboard());

    expect(find.byKey(HomeDashboardKeys.metrics), findsOneWidget);
    expect(find.text('전체'), findsOneWidget);
    expect(find.text('완료'), findsOneWidget);
    expect(find.text('남음'), findsOneWidget);
    expect(find.text('3'), findsWidgets);
    expect(find.text('1'), findsWidgets);
    expect(find.text('2'), findsWidgets);
    expect(find.text('33%'), findsOneWidget);
  });

  testWidgets('ZERO_STATE shows empty copy and zero metrics', (tester) async {
    await _pumpDashboard(
      tester,
      dashboard: _baseDashboard(
        loadState: HomeDashboardLoadState.empty,
        workset: _emptyWorkset(),
        phase: DeliveryLifecyclePhase.active,
        inProgress: true,
        canStartDelivery: false,
        canEndDelivery: true,
      ),
    );

    expect(find.byKey(HomeDashboardKeys.zeroState), findsOneWidget);
    expect(find.text('오늘 배정된 배송이 없습니다.'), findsOneWidget);
    expect(find.text('0'), findsWidgets);
    expect(find.text('0%'), findsOneWidget);
    expect(find.text('배송 종료'), findsWidgets);
  });

  testWidgets('QUICK_ACTION_MAP selects map tab without pushing a route',
      (tester) async {
    var selected = <int>[];
    final navObserver = _NavObserver();
    await _useTallSurface(tester);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        navigatorObservers: [navObserver],
        home: Scaffold(
          body: _baseDashboard(
            onOpenMapTab: () => selected.add(AppShellTabs.map),
            onOpenScanTab: () => selected.add(AppShellTabs.scan),
          ),
        ),
      ),
    );

    await tester.ensureVisible(find.byKey(HomeDashboardKeys.quickActionMap));
    await tester.tap(find.byKey(HomeDashboardKeys.quickActionMap));
    await tester.pump();

    expect(selected, [AppShellTabs.map]);
    expect(navObserver.pushed, 0);
    expect(find.text('통합 지도'), findsOneWidget);
  });

  testWidgets('QUICK_ACTION_SCAN selects scan tab without pushing a route',
      (tester) async {
    var selected = <int>[];
    final navObserver = _NavObserver();
    await _useTallSurface(tester);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        navigatorObservers: [navObserver],
        home: Scaffold(
          body: _baseDashboard(
            onOpenMapTab: () => selected.add(AppShellTabs.map),
            onOpenScanTab: () => selected.add(AppShellTabs.scan),
          ),
        ),
      ),
    );

    await tester.ensureVisible(find.byKey(HomeDashboardKeys.quickActionScan));
    await tester.tap(find.byKey(HomeDashboardKeys.quickActionScan));
    await tester.pump();

    expect(selected, [AppShellTabs.scan]);
    expect(navObserver.pushed, 0);
    expect(find.text('물량 스캔'), findsOneWidget);
  });

  testWidgets('DRIVER_UUID_HIDDEN does not render driver or point ids',
      (tester) async {
    await _pumpDashboard(
      tester,
      dashboard: _baseDashboard(
        driverDisplayName: '영기사',
      ),
    );

    expect(find.text('영기사'), findsOneWidget);
    expect(find.textContaining('driver-uuid-should-not-render'), findsNothing);
    expect(
      find.textContaining('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
      findsNothing,
    );
    expect(find.textContaining('co-a'), findsNothing);
    expect(find.text('Alpha'), findsOneWidget);
    expect(find.text('Beta'), findsOneWidget);
  });

  testWidgets('WORKDAY_ACTION_PRESERVED keeps start and end CTAs',
      (tester) async {
    var started = 0;
    var ended = 0;
    await _pumpDashboard(
      tester,
      dashboard: _baseDashboard(
        onStartDelivery: () => started++,
      ),
    );
    expect(find.byKey(HomeDashboardKeys.workdayActionStart), findsOneWidget);
    expect(find.text('오늘 배송 시작'), findsOneWidget);
    await tester.tap(find.byKey(HomeDashboardKeys.workdayActionStart));
    await tester.pump();
    expect(started, 1);

    await _pumpDashboard(
      tester,
      dashboard: _baseDashboard(
        phase: DeliveryLifecyclePhase.active,
        inProgress: true,
        canStartDelivery: false,
        canEndDelivery: true,
        onEndDelivery: () => ended++,
      ),
    );
    expect(find.byKey(HomeDashboardKeys.workdayActionEnd), findsOneWidget);
    expect(find.text('배송 종료'), findsOneWidget);
    expect(find.text('오늘 배송 시작'), findsNothing);
    await tester.ensureVisible(find.byKey(HomeDashboardKeys.workdayActionEnd));
    await tester.tap(find.byKey(HomeDashboardKeys.workdayActionEnd));
    await tester.pump();
    expect(ended, 1);
  });

  testWidgets('error state keeps retry', (tester) async {
    var retried = 0;
    await _pumpDashboard(
      tester,
      dashboard: _baseDashboard(
        loadState: HomeDashboardLoadState.error,
        hasWorkset: false,
        listError: '배송 목록을 불러오지 못했습니다',
        onRetryToday: () => retried++,
      ),
    );
    expect(find.byKey(HomeDashboardKeys.errorState), findsOneWidget);
    expect(find.text('다시 시도'), findsOneWidget);
    await tester.tap(find.text('다시 시도'));
    await tester.pump();
    expect(retried, 1);
  });

  testWidgets('next delivery hides distance and uses display label',
      (tester) async {
    await _pumpDashboard(tester, dashboard: _baseDashboard());
    expect(find.text('다음 배송'), findsOneWidget);
    expect(find.text('인천 남동구 구월동 1'), findsOneWidget);
    expect(find.text('지도에서 보기'), findsOneWidget);
    expect(find.textContaining('km'), findsNothing);
    expect(find.textContaining('ETA'), findsNothing);
    expect(find.text('최근 완료'), findsOneWidget);
    expect(find.text('완료 건물 A'), findsOneWidget);
  });
}

class _NavObserver extends NavigatorObserver {
  int pushed = 0;

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (previousRoute != null) pushed++;
  }
}
