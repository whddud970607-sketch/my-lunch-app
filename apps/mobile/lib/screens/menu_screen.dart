import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import '../widgets/ds_card.dart';
import 'logout_confirm.dart';
import 'menu_account_data.dart';
import 'menu_keys.dart';

/// Production Menu tab. Settings here must already exist elsewhere.
class MenuScreen extends StatelessWidget {
  const MenuScreen({
    super.key,
    required this.account,
    required this.versionLabel,
    required this.onOpenMapSettings,
    required this.onLogout,
    this.debugTools,
  });

  final MenuAccountView account;
  final String versionLabel;
  final VoidCallback onOpenMapSettings;
  final Future<void> Function() onLogout;
  final Widget? debugTools;

  Future<void> _onLogoutPressed(BuildContext context) async {
    final decision = await showLogoutConfirmDialog(context: context);
    if (!shouldSignOut(decision)) return;
    await onLogout();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: MenuKeys.screen,
      appBar: AppBar(title: const Text('메뉴')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.sm,
            AppSpacing.lg,
            AppSpacing.xxl,
          ),
          children: [
            _SectionLabel('계정'),
            DsCard(
              key: MenuKeys.account,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    account.displayName,
                    style: AppTypography.textTheme.titleMedium,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    account.roleLabel,
                    style: AppTypography.textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            _SectionLabel('지도/내비게이션'),
            DsCard(
              padding: EdgeInsets.zero,
              child: ListTile(
                key: MenuKeys.mapSettings,
                leading: const Icon(Icons.map_outlined),
                title: const Text('지도 설정'),
                subtitle: const Text('카카오맵 · 네이버지도 · 티맵 · 운송수단 아이콘'),
                trailing: const Icon(Icons.chevron_right),
                onTap: onOpenMapSettings,
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            _SectionLabel('지원/정보'),
            DsCard(
              key: MenuKeys.appInfo,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('앱 정보', style: AppTypography.textTheme.titleSmall),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    versionLabel,
                    style: AppTypography.textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            FilledButton(
              key: MenuKeys.logout,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.danger,
                minimumSize: const Size.fromHeight(48),
              ),
              onPressed: () => _onLogoutPressed(context),
              child: const Text('로그아웃'),
            ),
            if (debugTools != null) ...[
              const SizedBox(height: AppSpacing.xl),
              debugTools!,
            ],
          ],
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Text(label, style: AppTypography.textTheme.labelMedium),
    );
  }
}
