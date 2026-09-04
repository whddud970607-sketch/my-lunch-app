import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/models/today_workset.dart';
import 'package:delivery_shield_mobile/screens/home_dashboard_data.dart';
import 'package:delivery_shield_mobile/state/delivery_session_controller.dart';

void main() {
  test('workdayProgressPercent is zero when total is 0', () {
    expect(workdayProgressPercent(total: 0, completed: 0), 0);
    expect(workdayProgressPercent(total: 87, completed: 31), 36);
  });

  test('namedCompanyVolumes uses display names only', () {
    final ws = TodayWorkset.fromJson({
      'serviceDate': '2026-09-04',
      'summary': {
        'totalPoints': 2,
        'completedPoints': 0,
        'pendingPoints': 2,
        'totalShipments': 2,
        'byCompany': [
          {'companyId': 'co-a', 'totalPoints': 2, 'completedPoints': 0},
          {'companyId': 'missing', 'totalPoints': 4, 'completedPoints': 0},
        ],
        'bySource': const [],
      },
      'companies': [
        {'id': 'co-a', 'displayName': '컬리'},
      ],
      'sources': const [],
      'jobs': const [],
      'points': const [],
      'shipments': const [],
    });
    final rows = namedCompanyVolumes(ws);
    expect(rows.map((r) => r.label).toList(), ['컬리']);
    expect(rows.single.totalPoints, 2);
  });

  test('firstIncompletePoint skips completed points', () {
    final ws = TodayWorkset.fromJson({
      'serviceDate': '2026-09-04',
      'summary': {
        'totalPoints': 2,
        'completedPoints': 1,
        'pendingPoints': 1,
        'totalShipments': 2,
        'byCompany': const [],
        'bySource': const [],
      },
      'companies': const [],
      'sources': const [],
      'jobs': const [],
      'points': [
        {
          'pointId': 'done',
          'jobId': 'j',
          'status': 'completed',
          'displayLabel': '완료',
          'quantity': 1,
          'shipmentCount': 1,
        },
        {
          'pointId': 'next',
          'jobId': 'j',
          'status': 'pending',
          'displayLabel': '다음',
          'quantity': 1,
          'shipmentCount': 1,
        },
      ],
      'shipments': const [],
    });
    expect(firstIncompletePoint(ws)?.displayLabel, '다음');
    expect(completedPointsLimited(ws).single.displayLabel, '완료');
  });

  test('workdayBadgeView covers the three driver-facing labels', () {
    expect(
      workdayBadgeView(
        phase: DeliveryLifecyclePhase.idle,
        needsRecovery: false,
      ).label,
      '배송 전',
    );
    expect(
      workdayBadgeView(
        phase: DeliveryLifecyclePhase.active,
        needsRecovery: false,
      ).label,
      '배송 중',
    );
    expect(
      workdayBadgeView(
        phase: DeliveryLifecyclePhase.completed,
        needsRecovery: false,
      ).label,
      '배송 종료',
    );
  });

  test('pointCardTitle never falls back to point id', () {
    const point = WorksetPoint(
      pointId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      jobId: 'j',
      companyId: null,
      sourceId: null,
      status: 'pending',
      latitude: null,
      longitude: null,
      quantity: 1,
      displayLabel: '  ',
      pinAccuracy: 'address',
      piiMasked: false,
      hasAccessInfo: false,
      shipmentCount: 0,
      contactAvailable: false,
    );
    expect(pointCardTitle(point), '배송지');
  });
}
