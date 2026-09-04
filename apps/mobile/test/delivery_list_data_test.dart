import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/map/workset_map_filter.dart';
import 'package:delivery_shield_mobile/models/today_workset.dart';
import 'package:delivery_shield_mobile/screens/delivery_list_data.dart';

TodayWorkset _sample() {
  return TodayWorkset.fromJson({
    'serviceDate': '2026-09-04',
    'summary': {
      'totalPoints': 3,
      'completedPoints': 1,
      'pendingPoints': 2,
      'totalShipments': 4,
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
        'ownerDriverId': 'driver-uuid-hidden',
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
        'hasAccessInfo': true,
        'shipmentCount': 3,
        'contactAvailable': true,
      },
      {
        'pointId': 'pt-done-1',
        'jobId': 'job-b',
        'companyId': 'co-b',
        'sourceId': 'src-b',
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
      {
        'pointId': 'pt-open-2',
        'jobId': 'job-a',
        'companyId': 'co-a',
        'sourceId': 'src-a',
        'status': 'pending',
        'latitude': 37.5,
        'longitude': 126.8,
        'quantity': 2,
        'displayLabel': '서창 상가',
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

TodayWorkset _searchSample() {
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
        'ownerDriverId': 'driver-uuid-hidden',
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

void main() {
  test('FILTER_ALL keeps TodayWorkset point order', () {
    final ws = _sample();
    final visible = visibleDeliveryPoints(workset: ws);
    expect(visible.map((p) => p.pointId).toList(), [
      'pt-open-1',
      'pt-done-1',
      'pt-open-2',
    ]);
  });

  test('FILTER_OPEN hides completed points only', () {
    final visible = visibleDeliveryPoints(
      workset: _sample(),
      status: DeliveryListStatusFilter.open,
    );
    expect(visible.every((p) => !p.isCompleted), isTrue);
    expect(visible.map((p) => p.pointId).toList(), [
      'pt-open-1',
      'pt-open-2',
    ]);
  });

  test('FILTER_COMPLETED keeps completed only', () {
    final visible = visibleDeliveryPoints(
      workset: _sample(),
      status: DeliveryListStatusFilter.completed,
    );
    expect(visible, hasLength(1));
    expect(visible.single.pointId, 'pt-done-1');
  });

  test('company filter does not mix source identity', () {
    final visible = visibleDeliveryPoints(
      workset: _sample(),
      mapFilter: const WorksetMapFilterCompany('co-a'),
    );
    expect(visible.map((p) => p.pointId).toList(), [
      'pt-open-1',
      'pt-open-2',
    ]);
  });

  test('search uses displayLabel only', () {
    final visible = visibleDeliveryPoints(
      workset: _sample(),
      searchQuery: '101동',
    );
    expect(visible, hasLength(1));
    expect(visible.single.displayLabel, 'OO아파트 101동');
  });

  test('DELIVERY_SEARCH_DISPLAY_LABEL_EXACT', () {
    final visible = visibleDeliveryPoints(
      workset: _searchSample(),
      searchQuery: '서창센트럴푸르지오 504동',
    );
    expect(visible.map((p) => p.pointId).toList(), ['pt-search-1']);
  });

  test('DELIVERY_SEARCH_DISPLAY_LABEL_PARTIAL', () {
    final visible = visibleDeliveryPoints(
      workset: _searchSample(),
      searchQuery: '센트럴',
    );
    expect(visible.map((p) => p.pointId).toList(), ['pt-search-1']);
  });

  test('DELIVERY_SEARCH_KOREAN_SUBSTRING', () {
    final visible = visibleDeliveryPoints(
      workset: _searchSample(),
      searchQuery: '푸르지오',
    );
    expect(visible.single.pointId, 'pt-search-1');
  });

  test('DELIVERY_SEARCH_LATIN_CASE_INSENSITIVE', () {
    final visible = visibleDeliveryPoints(
      workset: _searchSample(),
      searchQuery: 'central',
    );
    expect(visible.single.pointId, 'pt-search-latin');
    expect(
      visibleDeliveryPoints(workset: _searchSample(), searchQuery: 'CENTRAL')
          .single
          .pointId,
      'pt-search-latin',
    );
  });

  test('DELIVERY_SEARCH_TRIM', () {
    final visible = visibleDeliveryPoints(
      workset: _searchSample(),
      searchQuery: '  센트럴  ',
    );
    expect(visible.single.pointId, 'pt-search-1');
  });

  test('DELIVERY_SEARCH_INTERNAL_WHITESPACE', () {
    final visible = visibleDeliveryPoints(
      workset: _searchSample(),
      searchQuery: '서창센트럴푸르지오  504동',
    );
    expect(visible.single.pointId, 'pt-search-1');
  });

  test('DELIVERY_SEARCH_EMPTY_SHOWS_ALL', () {
    final ws = _searchSample();
    final visible = visibleDeliveryPoints(workset: ws, searchQuery: '');
    expect(visible.map((p) => p.pointId).toList(), [
      'pt-search-1',
      'pt-search-latin',
      'pt-search-done',
    ]);
  });

  test('DELIVERY_SEARCH_WHITESPACE_ONLY_SHOWS_ALL', () {
    final ws = _searchSample();
    final visible = visibleDeliveryPoints(workset: ws, searchQuery: '   ');
    expect(visible, hasLength(ws.points.length));
  });

  test('DELIVERY_SEARCH_ALL_FILTER', () {
    final visible = visibleDeliveryPoints(
      workset: _searchSample(),
      status: DeliveryListStatusFilter.all,
      searchQuery: '서창',
    );
    expect(visible.map((p) => p.pointId).toList(), [
      'pt-search-1',
      'pt-search-done',
    ]);
  });

  test('DELIVERY_SEARCH_OPEN_FILTER', () {
    final visible = visibleDeliveryPoints(
      workset: _searchSample(),
      status: DeliveryListStatusFilter.open,
      searchQuery: '서창',
    );
    expect(visible.map((p) => p.pointId).toList(), ['pt-search-1']);
  });

  test('DELIVERY_SEARCH_COMPLETED_FILTER', () {
    final visible = visibleDeliveryPoints(
      workset: _searchSample(),
      status: DeliveryListStatusFilter.completed,
      searchQuery: '서창',
    );
    expect(visible.single.pointId, 'pt-search-done');
  });

  test('DELIVERY_SEARCH_CHANNEL_FILTER_COMPOSES', () {
    final visible = visibleDeliveryPoints(
      workset: _searchSample(),
      mapFilter: const WorksetMapFilterCompany('co-a'),
      searchQuery: '서창',
    );
    expect(visible.single.pointId, 'pt-search-1');
  });

  test('DELIVERY_SEARCH_ZERO_MATCH', () {
    final visible = visibleDeliveryPoints(
      workset: _searchSample(),
      searchQuery: '없는표시명XYZ',
    );
    expect(visible, isEmpty);
  });

  test('DELIVERY_SEARCH_ORDER_PRESERVED', () {
    final visible = visibleDeliveryPoints(
      workset: _searchSample(),
      searchQuery: '서창',
    );
    expect(visible.map((p) => p.pointId).toList(), [
      'pt-search-1',
      'pt-search-done',
    ]);
  });

  test('DELIVERY_SEARCH does not match pointId or companyId', () {
    final visible = visibleDeliveryPoints(
      workset: _searchSample(),
      searchQuery: 'pt-search-1',
    );
    expect(visible, isEmpty);
  });

  test('ADDRESS_SEARCH_RESULT_OPENS_EXISTING_POINT via address match ids', () {
    final visible = visibleDeliveryPoints(
      workset: _searchSample(),
      searchQuery: '서창남순환로 55',
      addressMatchPointIds: {'pt-search-1'},
    );
    expect(visible.map((p) => p.pointId).toList(), ['pt-search-1']);
  });

  test('POINT_CARD_REAL_DATA meta and status', () {
    final point = _sample().points.first;
    expect(deliveryPointTitle(point), 'OO아파트 101동');
    expect(deliveryPointMeta(point), '배송 3건 · 물량 5');
    expect(deliveryPointStatusLabel(point), '미완료');
    expect(
      deliveryPointStatusLabel(_sample().points[1]),
      '완료',
    );
  });

  test('POINT_CARD_PRIVACY detail mapping does not copy phone', () {
    final ws = _sample();
    final mapped = worksetPointToDetailPoint(
      workset: ws,
      point: ws.points.first,
      driverId: 'driver-uuid-hidden',
    );
    expect(mapped.contactValue, isNull);
    expect(mapped.customerName, isEmpty);
    expect(mapped.address, isEmpty);
  });
}
