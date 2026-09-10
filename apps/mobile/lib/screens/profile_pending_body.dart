import 'package:flutter/material.dart';

/// Non-sensitive body while local auth session exists but GET /me is pending
/// or temporarily failed. Never shows profile/workset/delivery data.
class ProfilePendingBody extends StatelessWidget {
  const ProfilePendingBody({
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
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (!isError) ...[
                const CircularProgressIndicator(),
                const SizedBox(height: 20),
                Text(
                  '계정 확인 중…',
                  style: theme.textTheme.titleMedium,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  '잠시만 기다려 주세요.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  textAlign: TextAlign.center,
                ),
              ] else ...[
                Icon(
                  Icons.cloud_off_outlined,
                  size: 40,
                  color: theme.colorScheme.error,
                ),
                const SizedBox(height: 16),
                Text(
                  '프로필을 불러오지 못했습니다',
                  style: theme.textTheme.titleMedium,
                  textAlign: TextAlign.center,
                ),
                if (message != null && message!.trim().isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    message!,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
                const SizedBox(height: 20),
                FilledButton(onPressed: onRetry, child: const Text('다시 시도')),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
