import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/map/workset_map_filter.dart';
import 'package:delivery_shield_mobile/models/today_workset.dart';
import 'package:delivery_shield_mobile/screens/delivery_list_data.dart';
import 'package:delivery_shield_mobile/screens/delivery_list_keys.dart';
import 'package:delivery_shield_mobile/screens/delivery_list_view.dart';
import 'package:delivery_shield_mobile/screens/home_dashboard.dart';
import 'package:delivery_shield_mobile/theme/app_theme.dart';
import 'package:delivery_shield_mobile/widgets/delivery_detail_panel.dart';

TodayWorkset _sampleWorkset() {
  return TodayWorkset.fromJson({
    'serviceDate': '2026-09-04',
    'summary': {
      'totalPoints': 2,
      'completedPoints': 1,
      'pendingPoints': 1,
      'totalShipments': 4,
      'byCompany': [
        {'companyId': 'co-a', 'totalPoints': 1, 'completedPoints': 0},
        {'companyId': 'co-b', 'totalPoints': 1, 'completedPoints': 1},
      ],
      'bySource': [
        {'sourceId': 'src-a', 'totalPoints': 2, 'completedPoints': 1},
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
        'pointId': 'pt-open-1',
        'jobId': 'job-a',
        'companyId': 'co-a',
        'sourceId': 'src-a',
        'status': 'pending',
        'latitude': 37.4,
        'longitude': 126.7,
        'quantity': 5,
        'displayLabel': 'OO아파트 101동',
        'pinAccuracy': 'building',
        'piiMasked': false,
        'hasAccessInfo': false,
        'shipmentCount': 3,
        'contactAvailable': false,
      },
      {
        'pointId': 'pt-done-1',
        'jobId': 'job-b',
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

TodayWorkset _searchWorkset() {
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
        {'sourceId': 'src-a', 'totalPoints': 2, 'completedPoints': 0},
        {'sourceId': 'src-b', 'totalPoints': 1, 'completedPoints': 1},
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
      {
        'id': 'src-b',
        'companyId': 'co-b',
        'ownerDriverId': null,
        'sourceType': 'excel_import',
        'sourceKey': 'b',
        'displayName': 'Beta Source',
        'externalSystem': null,
        'isActive': true,
      },
    ],
    'jobs': const [],
    'points': [
      {
        'pointId': 'pt-search-1',
        'jobId': 'job-a',
        'companyId': 'co-a',
        'sourceId': 'src-a',
        'status': 'pending',
        'latitude': 37.4,
        'longitude': 126.7,
        'quantity': 2,
        'displayLabel': '서창센트럴푸르지오 504동 2003호',
        'pinAccuracy': 'building',
        'piiMasked': false,
        'hasAccessInfo': false,
        'shipmentCount': 1,
        'contactAvailable': false,
      },
      {
        'pointId': 'pt-search-latin',
        'jobId': 'job-a',
        'companyId': 'co-a',
        'sourceId': 'src-a',
        'status': 'pending',
        'latitude': 37.4,
        'longitude': 126.7,
        'quantity': 1,
        'displayLabel': 'Central Apt',
        'pinAccuracy': 'address',
        'piiMasked': false,
        'hasAccessInfo': false,
        'shipmentCount': 1,
        'contactAvailable': false,
      },
      {
        'pointId': 'pt-search-done',
        'jobId': 'job-b',
        'companyId': 'co-b',
        'sourceId': 'src-b',
        'status': 'completed',
        'latitude': 37.4,
        'longitude': 126.7,
        'quantity': 1,
        'displayLabel': '서창테스트상가',
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

class _SearchHarness extends StatefulWidget {
  const _SearchHarness({
    required this.workset,
    this.onRefresh,
  });

  final TodayWorkset workset;
  final VoidCallback? onRefresh;

  @override
  State<_SearchHarness> createState() => _SearchHarnessState();
}

class _SearchHarnessState extends State<_SearchHarness> {
  DeliveryListStatusFilter status = DeliveryListStatusFilter.all;
  WorksetMapFilter mapFilter = WorksetMapFilter.all;
  String search = '';

  @override
  Widget build(BuildContext context) {
    return DeliveryListView(
      loadState: HomeDashboardLoadState.loaded,
      workset: widget.workset,
      statusFilter: status,
      mapFilter: mapFilter,
      searchQuery: search,
      onStatusFilterSelected: (next) => setState(() => status = next),
      onMapFilterSelected: (next) => setState(() => mapFilter = next),
      onSearchChanged: (next) => setState(() => search = next),
      onSearchSubmitted: (next) => setState(() => search = next),
      onSearchClear: () => setState(() => search = ''),
      onRefresh: widget.onRefresh ?? () {},
    );
  }
}

TodayWorkset _emptyWorkset() {
  return TodayWorkset.fromJson({
    'serviceDate': '2026-09-04',
    'summary': {
      'totalPoints': 0,
      'completedPoints': 0,
      'pendingPoints': 0,
      'totalShipments': 0,
      'byCompany': const [],
      'bySource': const [],
    },
    'companies': const [],
    'sources': const [],
    'jobs': const [],
    'points': const [],
    'shipments': const [],
  });
}

TodayWorkset _largeWorkset(int count) {
  return TodayWorkset.fromJson({
    'serviceDate': '2026-09-04',
    'summary': {
      'totalPoints': count,
      'completedPoints': 0,
      'pendingPoints': count,
      'totalShipments': count,
      'byCompany': const [],
      'bySource': const [],
    },
    'companies': const [],
    'sources': const [],
    'jobs': const [],
    'points': [
      for (var i = 0; i < count; i++)
        {
          'pointId': 'pt-$i',
          'jobId': 'job-a',
          'companyId': null,
          'sourceId': null,
          'status': 'pending',
          'latitude': 37.4,
          'longitude': 126.7,
          'quantity': 1,
          'displayLabel': '배송지 $i',
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

Future<void> _pump(
  WidgetTester tester,
  DeliveryListView view,
) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark(),
      home: Scaffold(body: view),
    ),
  );
}

DeliveryListView _view({
  required HomeDashboardLoadState loadState,
  TodayWorkset? workset,
  String? listError,
  DeliveryListStatusFilter status = DeliveryListStatusFilter.all,
  WorksetMapFilter mapFilter = WorksetMapFilter.all,
  String search = '',
  TextEditingController? searchController,
  ValueChanged<DeliveryListStatusFilter>? onStatus,
  ValueChanged<WorksetMapFilter>? onMap,
  ValueChanged<String>? onSearch,
  ValueChanged<String>? onSearchSubmitted,
  VoidCallback? onSearchClear,
  Set<String> addressMatchPointIds = const {},
  DeliveryAddressSearchPhase addressSearchPhase =
      DeliveryAddressSearchPhase.idle,
  VoidCallback? onRefresh,
  VoidCallback? onRetry,
  ValueChanged<WorksetPoint>? onPointTap,
  VoidCallback? onViewOnMap,
}) {
  return DeliveryListView(
    loadState: loadState,
    workset: workset,
    listError: listError,
    statusFilter: status,
    mapFilter: mapFilter,
    searchQuery: search,
    searchController: searchController,
    onStatusFilterSelected: onStatus ?? (_) {},
    onMapFilterSelected: onMap ?? (_) {},
    onSearchChanged: onSearch ?? (_) {},
    onSearchSubmitted: onSearchSubmitted,
    onSearchClear: onSearchClear,
    addressMatchPointIds: addressMatchPointIds,
    addressSearchPhase: addressSearchPhase,
    onRefresh: onRefresh ?? () {},
    onRetry: onRetry,
    onPointTap: onPointTap,
    onViewOnMap: onViewOnMap,
  );
}

void main() {
  testWidgets('DELIVERY_LIST_HEADER and DELIVERY_LIST_SUMMARY', (tester) async {
    await _pump(
      tester,
      _view(
        loadState: HomeDashboardLoadState.loaded,
        workset: _sampleWorkset(),
      ),
    );
    expect(find.byKey(DeliveryListKeys.header), findsOneWidget);
    expect(find.byKey(DeliveryListKeys.summary), findsOneWidget);
    expect(find.text('전체 2'), findsOneWidget);
    expect(find.text('완료 1'), findsOneWidget);
    expect(find.text('남음 1'), findsOneWidget);
    expect(find.text('배송 목록 준비 중'), findsNothing);
  });

  testWidgets('DELIVERY_LIST_ZERO_STATE', (tester) async {
    var refreshed = false;
    await _pump(
      tester,
      _view(
        loadState: HomeDashboardLoadState.empty,
        workset: _emptyWorkset(),
        onRefresh: () => refreshed = true,
      ),
    );
    expect(find.text('오늘 배정된 배송이 없습니다.'), findsOneWidget);
    expect(find.byKey(DeliveryListKeys.emptyState), findsOneWidget);
    await tester.tap(find.text('새로고침'));
    expect(refreshed, isTrue);
  });

  testWidgets('POINT_CARD_REAL_DATA and POINT_CARD_PRIVACY', (tester) async {
    await _pump(
      tester,
      _view(
        loadState: HomeDashboardLoadState.loaded,
        workset: _sampleWorkset(),
      ),
    );
    expect(find.text('OO아파트 101동'), findsOneWidget);
    expect(find.text('배송 3건 · 물량 5'), findsOneWidget);
    expect(find.text('미완료'), findsWidgets);
    expect(find.text('완료 건물 A'), findsOneWidget);
    expect(find.text('완료'), findsWidgets);
    expect(find.text('driver-uuid-should-not-render'), findsNothing);
    expect(find.textContaining('010'), findsNothing);
    expect(find.textContaining('access'), findsNothing);
    expect(find.text('출입정보'), findsNothing);
  });

  testWidgets('FILTER_ALL FILTER_OPEN FILTER_COMPLETED', (tester) async {
    var status = DeliveryListStatusFilter.all;
    await _pump(
      tester,
      _view(
        loadState: HomeDashboardLoadState.loaded,
        workset: _sampleWorkset(),
        status: status,
        onStatus: (next) => status = next,
      ),
    );
    expect(find.text('OO아파트 101동'), findsOneWidget);
    expect(find.text('완료 건물 A'), findsOneWidget);

    await tester.tap(find.byKey(DeliveryListKeys.filterOpen));
    await tester.pump();
    expect(status, DeliveryListStatusFilter.open);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(
          body: _view(
            loadState: HomeDashboardLoadState.loaded,
            workset: _sampleWorkset(),
            status: DeliveryListStatusFilter.open,
          ),
        ),
      ),
    );
    expect(find.text('OO아파트 101동'), findsOneWidget);
    expect(find.text('완료 건물 A'), findsNothing);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(
          body: _view(
            loadState: HomeDashboardLoadState.loaded,
            workset: _sampleWorkset(),
            status: DeliveryListStatusFilter.completed,
          ),
        ),
      ),
    );
    expect(find.text('완료 건물 A'), findsOneWidget);
    expect(find.text('OO아파트 101동'), findsNothing);
  });

  testWidgets('POINT_TAP reuses DeliveryDetailPanel', (tester) async {
    WorksetPoint? tapped;
    await _pump(
      tester,
      _view(
        loadState: HomeDashboardLoadState.loaded,
        workset: _sampleWorkset(),
        onPointTap: (p) => tapped = p,
      ),
    );
    await tester.tap(find.byKey(DeliveryListKeys.pointCard('pt-open-1')));
    expect(tapped?.pointId, 'pt-open-1');

    final mapped = worksetPointToDetailPoint(
      workset: _sampleWorkset(),
      point: tapped!,
      driverId: '',
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: DeliveryDetailPanel(
          point: mapped,
          totalQuantity: mapped.quantity,
          clusteredJobCount: 1,
          onClose: () {},
        ),
      ),
    );
    expect(find.text('OO아파트 101동'), findsWidgets);
  });

  testWidgets('MAP_ACTION switches via callback only', (tester) async {
    var map = 0;
    await _pump(
      tester,
      _view(
        loadState: HomeDashboardLoadState.loaded,
        workset: _sampleWorkset(),
        onViewOnMap: () => map++,
      ),
    );
    await tester.tap(find.byKey(DeliveryListKeys.mapAction));
    expect(map, 1);
    await tester.tap(find.byKey(DeliveryListKeys.pointMapAction('pt-open-1')));
    expect(map, 2);
  });

  testWidgets('error and stale reuse Home/Map copy', (tester) async {
    var retried = false;
    await _pump(
      tester,
      _view(
        loadState: HomeDashboardLoadState.error,
        listError: '네트워크를 확인해 주세요',
        onRetry: () => retried = true,
      ),
    );
    expect(find.byKey(DeliveryListKeys.errorState), findsOneWidget);
    expect(find.text('네트워크를 확인해 주세요'), findsOneWidget);
    await tester.tap(find.text('다시 시도'));
    expect(retried, isTrue);

    await _pump(
      tester,
      _view(
        loadState: HomeDashboardLoadState.loaded,
        workset: _sampleWorkset(),
        listError: 'timeout',
      ),
    );
    expect(find.byKey(DeliveryListKeys.staleBanner), findsOneWidget);
    expect(find.text('최신 정보를 가져오지 못했습니다 · 이전 데이터 표시 중'), findsOneWidget);
  });

  testWidgets('LARGE_LIST_LAZY_BUILD does not mount every row', (tester) async {
    tester.view.physicalSize = const Size(1080, 1920);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await _pump(
      tester,
      _view(
        loadState: HomeDashboardLoadState.loaded,
        workset: _largeWorkset(80),
      ),
    );
    expect(find.byKey(DeliveryListKeys.lazyList), findsOneWidget);
    expect(find.text('배송지 0'), findsOneWidget);
    expect(find.text('배송지 79'), findsNothing);
    final built = find.byType(DeliveryPointCard).evaluate().length;
    expect(built, greaterThan(0));
    expect(built, lessThan(80));
  });

  testWidgets('DELIVERY_LIST_LAZY_RENDERING_PRESERVED', (tester) async {
    tester.view.physicalSize = const Size(1080, 1920);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await _pump(
      tester,
      _view(
        loadState: HomeDashboardLoadState.loaded,
        workset: _largeWorkset(80),
        search: '배송지 0',
      ),
    );
    expect(find.byKey(DeliveryListKeys.lazyList), findsOneWidget);
    expect(find.byType(ListView), findsWidgets);
  });

  testWidgets('DELIVERY_SEARCH_LIVE_FILTER', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(body: _SearchHarness(workset: _searchWorkset())),
      ),
    );
    expect(find.text('서창센트럴푸르지오 504동 2003호'), findsOneWidget);
    expect(find.text('Central Apt'), findsOneWidget);
    await tester.enterText(find.byKey(DeliveryListKeys.search), '센트럴');
    await tester.pump();
    expect(find.text('서창센트럴푸르지오 504동 2003호'), findsOneWidget);
    expect(find.text('Central Apt'), findsNothing);
    expect(find.text('서창테스트상가'), findsNothing);
  });

  testWidgets('DELIVERY_SEARCH_KEYBOARD_SUBMIT', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(body: _SearchHarness(workset: _searchWorkset())),
      ),
    );
    await tester.enterText(find.byKey(DeliveryListKeys.search), 'central');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pump();
    expect(find.text('Central Apt'), findsOneWidget);
    expect(find.text('서창센트럴푸르지오 504동 2003호'), findsNothing);
  });

  testWidgets('DELIVERY_SEARCH_ALL_FILTER widget', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(body: _SearchHarness(workset: _searchWorkset())),
      ),
    );
    await tester.enterText(find.byKey(DeliveryListKeys.search), '서창');
    await tester.pump();
    expect(find.text('서창센트럴푸르지오 504동 2003호'), findsOneWidget);
    expect(find.text('서창테스트상가'), findsOneWidget);
    expect(find.text('Central Apt'), findsNothing);
  });

  testWidgets('DELIVERY_SEARCH_OPEN_FILTER widget', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(body: _SearchHarness(workset: _searchWorkset())),
      ),
    );
    await tester.enterText(find.byKey(DeliveryListKeys.search), '서창');
    await tester.pump();
    await tester.tap(find.byKey(DeliveryListKeys.filterOpen));
    await tester.pump();
    expect(find.text('서창센트럴푸르지오 504동 2003호'), findsOneWidget);
    expect(find.text('서창테스트상가'), findsNothing);
    final field = tester.widget<TextField>(find.byKey(DeliveryListKeys.search));
    expect(field.controller?.text, '서창');
  });

  testWidgets('DELIVERY_SEARCH_COMPLETED_FILTER widget', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(body: _SearchHarness(workset: _searchWorkset())),
      ),
    );
    await tester.tap(find.byKey(DeliveryListKeys.filterCompleted));
    await tester.pump();
    await tester.enterText(find.byKey(DeliveryListKeys.search), '서창');
    await tester.pump();
    expect(find.text('서창테스트상가'), findsOneWidget);
    expect(find.text('서창센트럴푸르지오 504동 2003호'), findsNothing);
  });

  testWidgets('DELIVERY_SEARCH_CHANNEL_FILTER_COMPOSES widget', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(body: _SearchHarness(workset: _searchWorkset())),
      ),
    );
    await tester.tap(find.text('Alpha'));
    await tester.pump();
    await tester.enterText(find.byKey(DeliveryListKeys.search), '서창');
    await tester.pump();
    expect(find.text('서창센트럴푸르지오 504동 2003호'), findsOneWidget);
    expect(find.text('서창테스트상가'), findsNothing);
  });

  testWidgets('DELIVERY_SEARCH_ZERO_MATCH_COPY', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(body: _SearchHarness(workset: _searchWorkset())),
      ),
    );
    await tester.enterText(find.byKey(DeliveryListKeys.search), '없는표시명XYZ');
    await tester.pump();
    expect(find.byKey(DeliveryListKeys.zeroMatchState), findsOneWidget);
    expect(find.text('검색 결과가 없습니다'), findsOneWidget);
    expect(find.text('다른 주소나 표시명으로 검색해 보세요.'), findsOneWidget);
    expect(find.text('오늘 배정된 배송이 없습니다.'), findsNothing);
    expect(find.byKey(DeliveryListKeys.emptyState), findsNothing);
  });

  testWidgets('EMPTY_TODAY_NO_SEARCH still uses Today-empty copy', (tester) async {
    await _pump(
      tester,
      _view(
        loadState: HomeDashboardLoadState.empty,
        workset: _emptyWorkset(),
      ),
    );
    expect(find.text('오늘 배정된 배송이 없습니다.'), findsOneWidget);
    expect(find.byKey(DeliveryListKeys.emptyState), findsOneWidget);
    expect(find.text('검색 결과가 없습니다'), findsNothing);
    expect(find.text('검색 중'), findsNothing);
    expect(find.text('검색 실패'), findsNothing);
  });

  testWidgets('EMPTY_TODAY_ACTIVE_SEARCH_ZERO_STATE', (tester) async {
    await _pump(
      tester,
      _view(
        loadState: HomeDashboardLoadState.empty,
        workset: _emptyWorkset(),
        search: '없는표시명XYZ',
      ),
    );
    expect(find.text('검색 결과가 없습니다'), findsOneWidget);
    expect(find.byKey(DeliveryListKeys.zeroMatchState), findsOneWidget);
    expect(find.text('오늘 배정된 배송이 없습니다.'), findsNothing);
    expect(find.byKey(DeliveryListKeys.emptyState), findsNothing);
  });

  testWidgets('EMPTY_TODAY_ACTIVE_SEARCH_LOADING_STATE', (tester) async {
    await _pump(
      tester,
      _view(
        loadState: HomeDashboardLoadState.empty,
        workset: _emptyWorkset(),
        search: '서창남순환로',
        addressSearchPhase: DeliveryAddressSearchPhase.loading,
      ),
    );
    expect(find.text('검색 중'), findsOneWidget);
    expect(find.byKey(DeliveryListKeys.searchLoading), findsOneWidget);
    expect(find.text('오늘 배정된 배송이 없습니다.'), findsNothing);
    expect(find.text('검색 결과가 없습니다'), findsNothing);
  });

  testWidgets('EMPTY_TODAY_ACTIVE_SEARCH_ERROR_STATE', (tester) async {
    await _pump(
      tester,
      _view(
        loadState: HomeDashboardLoadState.empty,
        workset: _emptyWorkset(),
        search: '서창남순환로',
        addressSearchPhase: DeliveryAddressSearchPhase.error,
      ),
    );
    expect(find.text('검색 실패'), findsOneWidget);
    expect(find.byKey(DeliveryListKeys.searchFailed), findsOneWidget);
    expect(find.text('오늘 배정된 배송이 없습니다.'), findsNothing);
    expect(find.text('검색 결과가 없습니다'), findsNothing);
  });

  testWidgets('DELIVERY_EMPTY_KEYBOARD_INSET_NO_OVERFLOW', (tester) async {
    tester.view.physicalSize = const Size(1080, 1920);
    tester.view.devicePixelRatio = 3;
    tester.view.viewInsets = const FakeViewPadding(bottom: 960);
    tester.view.padding = const FakeViewPadding(top: 72, bottom: 144);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(
          resizeToAvoidBottomInset: true,
          bottomNavigationBar: NavigationBar(
            selectedIndex: 2,
            destinations: const [
              NavigationDestination(icon: Icon(Icons.home), label: '홈'),
              NavigationDestination(icon: Icon(Icons.map), label: '지도'),
              NavigationDestination(
                icon: Icon(Icons.local_shipping),
                label: '배송',
              ),
              NavigationDestination(icon: Icon(Icons.qr_code), label: '스캔'),
              NavigationDestination(icon: Icon(Icons.menu), label: '메뉴'),
            ],
          ),
          appBar: AppBar(title: const Text('배송 목록')),
          body: SafeArea(
            child: _view(
              loadState: HomeDashboardLoadState.empty,
              workset: _emptyWorkset(),
              onViewOnMap: () {},
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(find.text('오늘 배정된 배송이 없습니다.'), findsOneWidget);
    expect(find.byType(SingleChildScrollView), findsWidgets);
  });

  testWidgets('DELIVERY_SEARCH_CLEAR', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(body: _SearchHarness(workset: _searchWorkset())),
      ),
    );
    await tester.enterText(find.byKey(DeliveryListKeys.search), '센트럴');
    await tester.pump();
    expect(find.text('Central Apt'), findsNothing);
    await tester.tap(find.byKey(DeliveryListKeys.searchClear));
    await tester.pump();
    expect(find.text('서창센트럴푸르지오 504동 2003호'), findsOneWidget);
    expect(find.text('Central Apt'), findsOneWidget);
    expect(find.text('서창테스트상가'), findsOneWidget);
  });

  testWidgets('DELIVERY_SEARCH_CLEAR_PRESERVES_FILTERS', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(body: _SearchHarness(workset: _searchWorkset())),
      ),
    );
    await tester.tap(find.byKey(DeliveryListKeys.filterOpen));
    await tester.pump();
    await tester.enterText(find.byKey(DeliveryListKeys.search), '센트럴');
    await tester.pump();
    await tester.tap(find.byKey(DeliveryListKeys.searchClear));
    await tester.pump();
    expect(find.text('서창센트럴푸르지오 504동 2003호'), findsOneWidget);
    expect(find.text('Central Apt'), findsOneWidget);
    expect(find.text('서창테스트상가'), findsNothing);
  });

  testWidgets('DELIVERY_SEARCH_NO_NETWORK_REQUEST', (tester) async {
    var refreshes = 0;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(
          body: _SearchHarness(
            workset: _searchWorkset(),
            onRefresh: () => refreshes++,
          ),
        ),
      ),
    );
    await tester.enterText(find.byKey(DeliveryListKeys.search), '센트럴');
    await tester.pump();
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pump();
    await tester.tap(find.byKey(DeliveryListKeys.searchAction));
    await tester.pump();
    await tester.tap(find.byKey(DeliveryListKeys.searchClear));
    await tester.pump();
    expect(refreshes, 0);
  });

  testWidgets('ADDRESS_SEARCH_ERROR and ADDRESS_SEARCH_ZERO_MATCH_NOT_TODAY_EMPTY',
      (tester) async {
    await _pump(
      tester,
      _view(
        loadState: HomeDashboardLoadState.loaded,
        workset: _searchWorkset(),
        search: '없는주소XYZ',
        addressSearchPhase: DeliveryAddressSearchPhase.error,
      ),
    );
    expect(find.text('검색 실패'), findsOneWidget);
    expect(find.byKey(DeliveryListKeys.searchFailed), findsOneWidget);
    expect(find.text('오늘 배정된 배송이 없습니다.'), findsNothing);

    await _pump(
      tester,
      _view(
        loadState: HomeDashboardLoadState.loaded,
        workset: _searchWorkset(),
        search: '없는주소XYZ',
      ),
    );
    expect(find.text('검색 결과가 없습니다'), findsOneWidget);
    expect(find.text('오늘 배정된 배송이 없습니다.'), findsNothing);
  });

  testWidgets('ADDRESS_SEARCH_LOADING', (tester) async {
    await _pump(
      tester,
      _view(
        loadState: HomeDashboardLoadState.loaded,
        workset: _searchWorkset(),
        search: '서창남순환로',
        addressSearchPhase: DeliveryAddressSearchPhase.loading,
      ),
    );
    expect(find.text('검색 중'), findsOneWidget);
    expect(find.byKey(DeliveryListKeys.searchLoading), findsOneWidget);
    expect(find.text('오늘 배정된 배송이 없습니다.'), findsNothing);
  });

  testWidgets('ADDRESS_SEARCH_RESULT_OPENS_EXISTING_POINT', (tester) async {
    WorksetPoint? tapped;
    await _pump(
      tester,
      _view(
        loadState: HomeDashboardLoadState.loaded,
        workset: _searchWorkset(),
        search: '서창남순환로',
        addressMatchPointIds: {'pt-search-1'},
        onPointTap: (p) => tapped = p,
      ),
    );
    expect(find.text('서창센트럴푸르지오 504동 2003호'), findsOneWidget);
    await tester.tap(find.byKey(DeliveryListKeys.pointCard('pt-search-1')));
    expect(tapped?.pointId, 'pt-search-1');
  });

  testWidgets('search hint is displayLabel-only', (tester) async {
    await _pump(
      tester,
      _view(
        loadState: HomeDashboardLoadState.loaded,
        workset: _searchWorkset(),
      ),
    );
    expect(find.text(deliveryListSearchHint), findsOneWidget);
    expect(find.text('건물·표시명 검색'), findsNothing);
    expect(find.text('건물·주소·표시명 검색'), findsNothing);
  });
}
