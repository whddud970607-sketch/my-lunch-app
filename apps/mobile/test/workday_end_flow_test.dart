import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/screens/workday_end_confirm.dart';
import 'package:delivery_shield_mobile/screens/workday_end_keys.dart';
import 'package:delivery_shield_mobile/theme/app_theme.dart';

class _EndHarness extends StatefulWidget {
  const _EndHarness();

  @override
  State<_EndHarness> createState() => _EndHarnessState();
}

class _EndHarnessState extends State<_EndHarness> {
  int endCalls = 0;
  int reportOpens = 0;
  bool endInFlight = false;
  String status = 'idle';

  Future<void> _onEndTapped() async {
    if (endInFlight) return;
    setState(() => endInFlight = true);
    try {
      final decision = await showWorkdayEndConfirmDialog(
        context: context,
        message: WorkdayEndConfirmCopy.body(
          remainingHint: 2,
          b3Unknown: false,
        ),
        warnRemaining: true,
      );
      if (!shouldCallEndTodayDelivery(decision)) {
        setState(() => status = 'cancelled');
        return;
      }
      endCalls += 1;
      setState(() {
        status = 'ended';
        reportOpens += 1;
      });
    } finally {
      if (mounted) setState(() => endInFlight = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Text('status:$status'),
          Text('ends:$endCalls'),
          Text('reports:$reportOpens'),
          FilledButton(
            onPressed: endInFlight ? null : _onEndTapped,
            child: const Text('배송 종료'),
          ),
        ],
      ),
    );
  }
}

Future<_EndHarnessState> _pumpHarness(WidgetTester tester) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark(),
      home: const _EndHarness(),
    ),
  );
  return tester.state<_EndHarnessState>(find.byType(_EndHarness));
}

void main() {
  testWidgets('WORKDAY_END_CONTINUE_DOES_NOT_CALL_END', (tester) async {
    final state = await _pumpHarness(tester);
    await tester.tap(find.text('배송 종료'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(WorkdayEndKeys.cancel));
    await tester.pumpAndSettle();
    expect(state.endCalls, 0);
    expect(state.reportOpens, 0);
    expect(state.status, 'cancelled');
    expect(find.text('status:cancelled'), findsOneWidget);
  });

  testWidgets('WORKDAY_END_CONTINUE_NO_REPORT_NAVIGATION', (tester) async {
    final state = await _pumpHarness(tester);
    await tester.tap(find.text('배송 종료'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('계속 배송하기'));
    await tester.pumpAndSettle();
    expect(state.reportOpens, 0);
    expect(find.byKey(WorkdayEndKeys.dialog), findsNothing);
  });

  testWidgets('WORKDAY_END_CONFIRM_CALLS_END_ONCE', (tester) async {
    final state = await _pumpHarness(tester);
    await tester.tap(find.text('배송 종료'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(WorkdayEndKeys.confirm));
    await tester.tap(find.byKey(WorkdayEndKeys.confirm));
    await tester.pumpAndSettle();
    expect(state.endCalls, 1);
    expect(state.reportOpens, 1);
    expect(state.status, 'ended');
  });

  testWidgets('WORKDAY_END_CONFIRM_REPORT_AFTER_SUCCESS', (tester) async {
    final state = await _pumpHarness(tester);
    await tester.tap(find.text('배송 종료'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(WorkdayEndKeys.confirm));
    await tester.pumpAndSettle();
    expect(state.endCalls, 1);
    expect(state.reportOpens, 1);
  });

  testWidgets('WORKDAY_END_BACK_DOES_NOT_CALL_END from harness', (tester) async {
    final state = await _pumpHarness(tester);
    await tester.tap(find.text('배송 종료'));
    await tester.pumpAndSettle();
    Navigator.of(tester.element(find.byType(WorkdayEndConfirmDialog)))
        .maybePop();
    await tester.pumpAndSettle();
    expect(state.endCalls, 0);
    expect(state.reportOpens, 0);
    expect(shouldCallEndTodayDelivery(WorkdayEndDecision.continueDelivery),
        isFalse);
  });
}
