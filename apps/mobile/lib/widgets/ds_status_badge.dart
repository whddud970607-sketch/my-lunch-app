import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_radius.dart';
import '../theme/app_spacing.dart';

enum DsStatusTone { idle, active, success, warning }

/// Compact status pill for Workday / delivery state.
class DsStatusBadge extends StatelessWidget {
  const DsStatusBadge({
    super.key,
    required this.label,
    this.tone = DsStatusTone.idle,
  });

  final String label;
  final DsStatusTone tone;

  @override
  Widget build(BuildContext context) {
    final Color bg;
    final Color fg;
    switch (tone) {
      case DsStatusTone.active:
        bg = AppColors.warning.withValues(alpha: 0.18);
        fg = AppColors.warning;
      case DsStatusTone.success:
        bg = AppColors.success.withValues(alpha: 0.18);
        fg = AppColors.success;
      case DsStatusTone.warning:
        bg = AppColors.danger.withValues(alpha: 0.16);
        fg = AppColors.danger;
      case DsStatusTone.idle:
        bg = AppColors.outline;
        fg = AppColors.textSecondary;
    }
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppRadius.sm),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: fg,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
