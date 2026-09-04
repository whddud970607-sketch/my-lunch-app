import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/copy/delivery_report_copy.dart';
import 'package:delivery_shield_mobile/screens/workday_end_confirm.dart';
import 'package:delivery_shield_mobile/screens/workday_end_keys.dart';
import 'package:delivery_shield_mobile/theme/app_theme.dart';

class _DecisionCapture {
  WorkdayEndDecision? value;
}

Future<_DecisionCapture> _openDialog(
  WidgetTester tester, {
  int remainingHint = 3,
  bool warnRemaining = true,
}) async {
  final captured = _DecisionCapture();
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark(),
      home: Builder(
        builder: (context) {
          return Scaffold(
            body: FilledButton(
              onPressed: () async {
                captured.value = await showWorkdayEndConfirmDialog(
                  context: context,
                  message: WorkdayEndConfirmCopy.body(
                    remainingHint: remainingHint,
                    b3Unknown: false,
                  ),
                  warnRemaining: warnRemaining,
                );
              },
              child: const Text('open'),
            ),
          );
        },
      ),
    ),
  );
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  return captured;
}

void main() {
  test('WORKDAY_END_UNKNOWN_RESULT_FAILS_CLOSED', () {
    expect(shouldCallEndTodayDelivery(null), isFalse);
    expect(
      shouldCallEndTodayDelivery(WorkdayEndDecision.continueDelivery),
      isFalse,
    );
    expect(shouldCallEndTodayDelivery(WorkdayEndDecision.endWorkday), isTrue);
    expect(coerceWorkdayEndDecision(null), WorkdayEndDecision.continueDelivery);
    expect(coerceWorkdayEndDecision(true), WorkdayEndDecision.continueDelivery);
    expect(coerceWorkdayEndDecision(false), WorkdayEndDecision.continueDelivery);
    expect(
      coerceWorkdayEndDecision(WorkdayEndDecision.continueDelivery),
      WorkdayEndDecision.continueDelivery,
    );
    expect(
      coerceWorkdayEndDecision(WorkdayEndDecision.endWorkday),
      WorkdayEndDecision.endWorkday,
    );
  });

  test('WORKDAY_END_CONFIRM copy is distinct from Point completion', () {
    expect(WorkdayEndConfirmCopy.title, '오늘 배송 종료');
    expect(WorkdayEndConfirmCopy.endLabel, '오늘 배송 종료');
    expect(WorkdayEndConfirmCopy.continueLabel, '계속 배송하기');
    expect(WorkdayEndConfirmCopy.endLabel, isNot('배송 완료'));
    expect(
      WorkdayEndConfirmCopy.body(remainingHint: 0, b3Unknown: false),
      contains('오늘 배송을 종료할까요'),
    );
    expect(
      WorkdayEndConfirmCopy.body(remainingHint: 0, b3Unknown: false),
      isNot(contains('마지막 완료')),
    );
  });

  test('WORKDAY_END_REMAINING_WARNING_PRESERVED', () {
    expect(WorkdayEndConfirmCopy.shouldWarnRemaining(2), isTrue);
    expect(WorkdayEndConfirmCopy.shouldWarnRemaining(0), isFalse);
    expect(
      WorkdayEndConfirmCopy.body(remainingHint: 2, b3Unknown: false),
      DeliveryReportCopy.incompleteEndWarning(2),
    );
    expect(
      WorkdayEndConfirmCopy.body(remainingHint: 2, b3Unknown: false),
      contains('미완료 배송 2건'),
    );
    expect(
      WorkdayEndConfirmCopy.body(remainingHint: null, b3Unknown: true),
      DeliveryReportCopy.incompleteEndWarningGeneric(),
    );
  });

  testWidgets('WORKDAY_END_CONFIRM dialog warns remaining work', (tester) async {
    await _openDialog(tester);
    expect(find.byKey(WorkdayEndKeys.dialog), findsOneWidget);
    expect(find.byKey(WorkdayEndKeys.title), findsOneWidget);
    expect(find.text('오늘 배송 종료'), findsWidgets);
    expect(find.byKey(WorkdayEndKeys.remainingWarning), findsOneWidget);
    expect(find.textContaining('미완료 배송 3건'), findsOneWidget);
    expect(find.text('계속 배송하기'), findsOneWidget);
    expect(find.text('배송 완료'), findsNothing);
  });

  testWidgets('WORKDAY_END_CONTINUE_RETURNS_CANCEL', (tester) async {
    final captured = await _openDialog(tester);
    await tester.tap(find.byKey(WorkdayEndKeys.cancel));
    await tester.pumpAndSettle();
    expect(find.byKey(WorkdayEndKeys.dialog), findsNothing);
    expect(captured.value, WorkdayEndDecision.continueDelivery);
    expect(shouldCallEndTodayDelivery(captured.value), isFalse);
  });

  testWidgets('WORKDAY_END_CONFIRM_RETURNS_END', (tester) async {
    final captured = await _openDialog(tester);
    await tester.tap(find.byKey(WorkdayEndKeys.confirm));
    await tester.pumpAndSettle();
    expect(find.byKey(WorkdayEndKeys.dialog), findsNothing);
    expect(captured.value, WorkdayEndDecision.endWorkday);
    expect(shouldCallEndTodayDelivery(captured.value), isTrue);
  });

  testWidgets('WORKDAY_END_DISMISS_DOES_NOT_CALL_END', (tester) async {
    final captured = await _openDialog(tester);
    await tester.tapAt(const Offset(8, 8));
    await tester.pumpAndSettle();
    expect(find.byKey(WorkdayEndKeys.dialog), findsNothing);
    expect(captured.value, WorkdayEndDecision.continueDelivery);
    expect(shouldCallEndTodayDelivery(captured.value), isFalse);
  });

  testWidgets('WORKDAY_END_BACK_DOES_NOT_CALL_END', (tester) async {
    final captured = await _openDialog(tester);
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();
    expect(find.byKey(WorkdayEndKeys.dialog), findsNothing);
    expect(captured.value, WorkdayEndDecision.continueDelivery);
    expect(shouldCallEndTodayDelivery(captured.value), isFalse);
  });
}
