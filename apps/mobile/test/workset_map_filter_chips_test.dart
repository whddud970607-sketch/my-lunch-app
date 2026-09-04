import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/map/workset_map_filter.dart';
import 'package:delivery_shield_mobile/map/workset_map_filter_chips.dart';
import 'package:delivery_shield_mobile/models/today_workset.dart';

TodayWorkset _workset() {
  return TodayWorkset.fromJson({
    'serviceDate': '2026-08-27',
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
      {'id': 'co-b', 'displayName': ''},
    ],
    'sources': [
      {
        'id': 'src-a',
        'companyId': 'co-a',
        'ownerDriverId': 'driver-uuid-must-not-render',
        'sourceType': 'company_api',
        'sourceKey': 'a',
        'displayName': 'SameName',
        'externalSystem': null,
        'isActive': true,
      },
      {
        'id': 'src-empty',
        'companyId': 'co-b',
        'ownerDriverId': null,
        'sourceType': 'excel_import',
        'sourceKey': 'b',
        'displayName': '',
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
        'pointId': 'pt-a',
        'jobId': 'job-a',
        'companyId': 'co-a',
        'sourceId': 'src-a',
        'status': 'pending',
        'latitude': 37.4,
        'longitude': 126.7,
        'quantity': 1,
        'displayLabel': 'A',
        'pinAccuracy': 'building',
        'piiMasked': false,
        'hasAccessInfo': false,
        'shipmentCount': 1,
        'contactAvailable': false,
      },
      {
        'pointId': 'pt-b',
        'jobId': 'job-b',
        'companyId': 'co-b',
        'sourceId': 'src-empty',
        'status': 'pending',
        'latitude': 37.5,
        'longitude': 126.8,
        'quantity': 1,
        'displayLabel': 'B',
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
        'latitude': 37.6,
        'longitude': 126.9,
        'quantity': 1,
        'displayLabel': 'M',
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

void main() {
  test('MAP_FILTERS identity stays on companyId/sourceId', () {
    final chips = WorksetMapFilterChips.fromWorkset(_workset());
    expect(chips.first.filter, WorksetMapFilter.all);
    expect(chips.where((c) => c.kind == MapFilterChipKind.company).length, 2);
    expect(
      chips.any(
        (c) =>
            c.kind == MapFilterChipKind.company &&
            c.filter == const WorksetMapFilterCompany(null),
      ),
      isTrue,
    );
    expect(
      chips.any(
        (c) =>
            c.kind == MapFilterChipKind.company &&
            c.label == 'Alpha' &&
            c.filter == const WorksetMapFilterCompany('co-a'),
      ),
      isTrue,
    );
    expect(chips.any((c) => c.label == '회사'), isFalse);
    expect(chips.any((c) => c.label == 'Source'), isFalse);

    final sources = chips.where((c) => c.kind == MapFilterChipKind.source);
    expect(sources.map((c) => c.label), ['SameName', '직접추가']);
    expect(
      sources.every((c) => c.filter is WorksetMapFilterSource),
      isTrue,
    );
    expect(
      chips.any((c) => c.kind == MapFilterChipKind.manual && c.label == '수동'),
      isTrue,
    );
  });
}
