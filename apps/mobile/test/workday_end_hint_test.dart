import 'package:flutter_test/flutter_test.dart';
import 'package:delivery_shield_mobile/models/delivery_session.dart';
import 'package:delivery_shield_mobile/models/delivery_workday.dart';
import 'package:delivery_shield_mobile/utils/workday_end_hint.dart';

DeliveryWorkday _openWorkday({int? incompletePoints, int? progressIncomplete}) {
  return DeliveryWorkday(
    id: 'wd-1',
    driverId: 'drv-1',
    serviceDate: '2026-08-30',
    status: 'active',
    startedAt: DateTime.utc(2026, 8, 30),
    progress: progressIncomplete != null
        ? DeliveryProgressCounts(
            totalPoints: 10,
            completedPoints: 10 - progressIncomplete,
            incompletePoints: progressIncomplete,
          )
        : null,
    incompletePoints: incompletePoints,
  );
}

void main() {
  group('WorkdayEndHint', () {
    test('B3 path ignores Today remaining when Workday count unknown', () {
      expect(
        WorkdayEndHint.resolveIncompleteHint(
          b3ExecutionEnabled: true,
          workday: _openWorkday(),
          todayRemainingPoints: 5,
        ),
        isNull,
      );
    });

    test('B3 path uses Workday incompletePoints', () {
      expect(
        WorkdayEndHint.resolveIncompleteHint(
          b3ExecutionEnabled: true,
          workday: _openWorkday(incompletePoints: 3),
          todayRemainingPoints: 99,
        ),
        3,
      );
    });

    test('B3 path falls back to Workday progress incompletePoints', () {
      expect(
        WorkdayEndHint.resolveIncompleteHint(
          b3ExecutionEnabled: true,
          workday: _openWorkday(progressIncomplete: 2),
          todayRemainingPoints: 99,
        ),
        2,
      );
    });

    test('B2 path keeps Today fallback when Workday count absent', () {
      expect(
        WorkdayEndHint.resolveIncompleteHint(
          b3ExecutionEnabled: false,
          workday: null,
          todayRemainingPoints: 4,
        ),
        4,
      );
    });

    test('legacy path defaults to 0 when no Workday or Today', () {
      expect(
        WorkdayEndHint.resolveIncompleteHint(
          b3ExecutionEnabled: false,
          workday: null,
          todayRemainingPoints: null,
        ),
        0,
      );
    });

    test('B2 Workday with incompletePoints beats Today', () {
      expect(
        WorkdayEndHint.resolveIncompleteHint(
          b3ExecutionEnabled: false,
          workday: _openWorkday(incompletePoints: 1),
          todayRemainingPoints: 8,
        ),
        1,
      );
    });

    test('ending Workday still counts as B3 path', () {
      final ending = DeliveryWorkday(
        id: 'wd-1',
        driverId: 'drv-1',
        serviceDate: '2026-08-30',
        status: 'ending',
        startedAt: DateTime.utc(2026, 8, 30),
        endedAt: DateTime.utc(2026, 8, 30, 12),
      );
      expect(
        WorkdayEndHint.isB3WorkdayPath(
          b3ExecutionEnabled: true,
          workday: ending,
        ),
        isTrue,
      );
    });

    test('flag OFF with open Workday is not B3 path', () {
      expect(
        WorkdayEndHint.isB3WorkdayPath(
          b3ExecutionEnabled: false,
          workday: _openWorkday(incompletePoints: 2),
        ),
        isFalse,
      );
      expect(
        WorkdayEndHint.resolveIncompleteHint(
          b3ExecutionEnabled: false,
          workday: _openWorkday(incompletePoints: 2),
          todayRemainingPoints: 7,
        ),
        2,
      );
    });
  });
}
