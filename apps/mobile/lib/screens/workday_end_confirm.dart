import 'package:flutter/material.dart';

import '../copy/delivery_report_copy.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import 'workday_end_keys.dart';

/// Explicit Workday-end decision. Never infer end from null/bool/dismiss.
enum WorkdayEndDecision {
  continueDelivery,
  endWorkday,
}

/// Fail-closed: only [WorkdayEndDecision.endWorkday] may call endTodayDelivery.
bool shouldCallEndTodayDelivery(WorkdayEndDecision? decision) =>
    decision == WorkdayEndDecision.endWorkday;

/// Maps dialog/Navigator results. Unknown values never confirm end.
WorkdayEndDecision coerceWorkdayEndDecision(Object? raw) {
  if (raw == WorkdayEndDecision.endWorkday) {
    return WorkdayEndDecision.endWorkday;
  }
  return WorkdayEndDecision.continueDelivery;
}

/// Presentation-only Workday-end confirmation. Distinct from Point completion.
abstract final class WorkdayEndConfirmCopy {
  static const title = '오늘 배송 종료';
  static const continueLabel = '계속 배송하기';
  static const endLabel = '오늘 배송 종료';

  static bool shouldWarnRemaining(int? remainingHint) =>
      remainingHint != null && remainingHint > 0;

  static bool isUnknownRemaining({
    required bool b3WorkdayPath,
    required int? remainingHint,
  }) =>
      b3WorkdayPath && remainingHint == null;

  static String body({
    required int? remainingHint,
    required bool b3Unknown,
  }) {
    if (shouldWarnRemaining(remainingHint)) {
      return DeliveryReportCopy.incompleteEndWarning(remainingHint!);
    }
    if (b3Unknown) return DeliveryReportCopy.incompleteEndWarningGeneric();
    return '오늘 배송을 종료할까요?\n\n종료 시각은 지금 확인한 시각으로 기록됩니다.';
  }
}

Future<WorkdayEndDecision> showWorkdayEndConfirmDialog({
  required BuildContext context,
  required String message,
  required bool warnRemaining,
}) async {
  final raw = await showDialog<WorkdayEndDecision>(
    context: context,
    barrierDismissible: true,
    builder: (ctx) => WorkdayEndConfirmDialog(
      message: message,
      warnRemaining: warnRemaining,
    ),
  );
  return coerceWorkdayEndDecision(raw);
}

class WorkdayEndConfirmDialog extends StatelessWidget {
  const WorkdayEndConfirmDialog({
    super.key,
    required this.message,
    required this.warnRemaining,
  });

  final String message;
  final bool warnRemaining;

  void _pop(BuildContext context, WorkdayEndDecision decision) {
    Navigator.of(context).pop(decision);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      key: WorkdayEndKeys.dialog,
      backgroundColor: AppColors.surfaceElevated,
      title: Text(
        WorkdayEndConfirmCopy.title,
        key: WorkdayEndKeys.title,
        style: AppTypography.textTheme.titleMedium?.copyWith(
          color: warnRemaining ? AppColors.warning : AppColors.textPrimary,
        ),
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            message,
            key: warnRemaining ? WorkdayEndKeys.remainingWarning : null,
            style: AppTypography.textTheme.bodyMedium,
          ),
          const SizedBox(height: AppSpacing.lg),
          OutlinedButton(
            key: WorkdayEndKeys.cancel,
            onPressed: () =>
                _pop(context, WorkdayEndDecision.continueDelivery),
            child: const Text(WorkdayEndConfirmCopy.continueLabel),
          ),
          const SizedBox(height: AppSpacing.md),
          FilledButton(
            key: WorkdayEndKeys.confirm,
            style: FilledButton.styleFrom(
              backgroundColor:
                  warnRemaining ? AppColors.warning : AppColors.primary,
              minimumSize: const Size(0, 48),
            ),
            onPressed: () => _pop(context, WorkdayEndDecision.endWorkday),
            child: const Text(WorkdayEndConfirmCopy.endLabel),
          ),
        ],
      ),
    );
  }
}
