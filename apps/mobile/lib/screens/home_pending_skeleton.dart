import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_radius.dart';
import '../theme/app_spacing.dart';

/// Non-data Home layout skeleton while GET /me is pending or failed.
///
/// Never shows driver name, counts, workset, map, or delivery payloads.
class HomePendingSkeleton extends StatelessWidget {
  const HomePendingSkeleton({
    super.key,
    required this.isError,
    this.message,
    required this.onRetry,
  });

  final bool isError;
  final String? message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          // Generic header chrome (no driver/profile fields).
          Container(
            height: 28,
            width: 140,
            decoration: BoxDecoration(
              color: AppColors.surfaceElevated,
              borderRadius: BorderRadius.circular(AppRadius.sm),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Container(
            height: 16,
            width: 96,
            decoration: BoxDecoration(
              color: AppColors.surfaceElevated,
              borderRadius: BorderRadius.circular(AppRadius.sm),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          // Status / metrics placeholders
          Row(
            children: List.generate(
              3,
              (_) => Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(right: AppSpacing.sm),
                  child: Container(
                    height: 72,
                    decoration: BoxDecoration(
                      color: AppColors.surfaceElevated,
                      borderRadius: BorderRadius.circular(AppRadius.md),
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          Container(
            height: 120,
            decoration: BoxDecoration(
              color: AppColors.surfaceElevated,
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          if (!isError) ...[
            const Center(child: CircularProgressIndicator()),
            const SizedBox(height: AppSpacing.md),
            Text(
              '계정 확인 중…',
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              '잠시만 기다려 주세요.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ] else ...[
            Icon(
              Icons.cloud_off_outlined,
              size: 40,
              color: theme.colorScheme.error,
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              '프로필을 불러오지 못했습니다',
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium,
            ),
            if (message != null && message!.trim().isNotEmpty) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(
                message!,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
            const SizedBox(height: AppSpacing.lg),
            Center(
              child: FilledButton(
                onPressed: onRetry,
                child: const Text('다시 시도'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
