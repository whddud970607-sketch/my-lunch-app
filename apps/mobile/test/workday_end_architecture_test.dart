import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('WORKDAY_END_AUTHORITATIVE still uses endTodayDelivery', () {
    final home = File('lib/screens/home_screen.dart').readAsStringSync();
    expect(home.contains('endTodayDelivery'), isTrue);
    expect(home.contains('showWorkdayEndConfirmDialog'), isTrue);
    expect(home.contains('shouldCallEndTodayDelivery'), isTrue);
    expect(home.contains('WorkdayEndHint.resolveIncompleteHint'), isTrue);
    expect(home.contains('DeliveryReportScreen'), isTrue);
    expect(home.contains('showDialog<bool>'), isFalse);
  });

  test('WORKDAY_END_CONTINUE_DOES_NOT_CALL_END at Home call site', () {
    final home = File('lib/screens/home_screen.dart').readAsStringSync();
    expect(home.contains('if (!shouldCallEndTodayDelivery(decision)) return;'),
        isTrue);
    expect(home.contains('if (!shouldCallEndTodayDelivery(second)) return;'),
        isTrue);
  });

  test('WORKDAY_END_NO_AUTO_COMPLETE does not mark Points complete', () {
    final home = File('lib/screens/home_screen.dart').readAsStringSync();
    expect(home.contains('completeSpike'), isFalse);
    expect(home.contains('enqueueCompletion'), isFalse);
    expect(home.contains("statusCode: 'completed'"), isFalse);
    expect(home.contains('openCompleteDeliveryScreen'), isFalse);
  });

  test('ENDED_AT is not derived from last completed Point on Home', () {
    final home = File('lib/screens/home_screen.dart').readAsStringSync();
    expect(home.contains('lastCompletedPoint'), isFalse);
    expect(home.contains('endedAt ='), isFalse);
  });

  test('POINT_COMPLETION_UNCHANGED and WORKDAY_END_DISTINCT_FROM_POINT_COMPLETE',
      () {
    final complete =
        File('lib/screens/complete_delivery_screen.dart').readAsStringSync();
    final confirm =
        File('lib/screens/workday_end_confirm.dart').readAsStringSync();
    expect(complete.contains('endTodayDelivery'), isFalse);
    expect(complete.contains('오늘 배송 종료'), isFalse);
    expect(confirm.contains('CompleteDeliveryScreen'), isFalse);
    expect(confirm.contains('배송 완료'), isFalse);
    expect(confirm.contains('WorkdayEndDecision.endWorkday'), isTrue);
    expect(confirm.contains('WorkdayEndDecision.continueDelivery'), isTrue);
  });

  test('UNSAFE_CALL_SITE_FOUND is false for bool-true end', () {
    final home = File('lib/screens/home_screen.dart').readAsStringSync();
    expect(home.contains('if (confirmed != true) return'), isFalse);
    expect(home.contains('if (confirmed == true)'), isFalse);
  });
}

