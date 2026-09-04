import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import 'logout_keys.dart';

enum LogoutDecision {
  cancel,
  confirm,
}

bool shouldSignOut(LogoutDecision? decision) =>
    decision == LogoutDecision.confirm;

LogoutDecision coerceLogoutDecision(Object? raw) {
  if (raw == LogoutDecision.confirm) return LogoutDecision.confirm;
  return LogoutDecision.cancel;
}

abstract final class LogoutConfirmCopy {
  static const title = '로그아웃';
  static const body = '이 기기에서 로그아웃할까요?\n배송 진행 상태는 서버에 그대로 둡니다.';
  static const cancelLabel = '취소';
  static const confirmLabel = '로그아웃';
}

Future<LogoutDecision> showLogoutConfirmDialog({
  required BuildContext context,
}) async {
  final raw = await showDialog<LogoutDecision>(
    context: context,
    barrierDismissible: true,
    builder: (ctx) => const LogoutConfirmDialog(),
  );
  return coerceLogoutDecision(raw);
}

class LogoutConfirmDialog extends StatelessWidget {
  const LogoutConfirmDialog({super.key});

  void _pop(BuildContext context, LogoutDecision decision) {
    Navigator.of(context).pop(decision);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      key: LogoutKeys.dialog,
      backgroundColor: AppColors.surfaceElevated,
      title: Text(
        LogoutConfirmCopy.title,
        key: LogoutKeys.title,
        style: AppTypography.textTheme.titleMedium,
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            LogoutConfirmCopy.body,
            style: AppTypography.textTheme.bodyMedium,
          ),
          const SizedBox(height: AppSpacing.lg),
          OutlinedButton(
            key: LogoutKeys.cancel,
            onPressed: () => _pop(context, LogoutDecision.cancel),
            child: const Text(LogoutConfirmCopy.cancelLabel),
          ),
          const SizedBox(height: AppSpacing.md),
          FilledButton(
            key: LogoutKeys.confirm,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.danger,
              minimumSize: const Size(0, 48),
            ),
            onPressed: () => _pop(context, LogoutDecision.confirm),
            child: const Text(LogoutConfirmCopy.confirmLabel),
          ),
        ],
      ),
    );
  }
}
