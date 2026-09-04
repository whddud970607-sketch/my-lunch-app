import 'package:flutter/material.dart';

import '../config/app_config.dart';
import '../navigation/kakao_navi_poc_bridge.dart';
import '../navigation/tmap_navi_poc_bridge.dart';
import '../services/api_client.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import '../widgets/ds_card.dart';
import 'map_spike_screen.dart';
import 'menu_keys.dart';

/// Debug-build-only tools. Never present as a production Menu setting.
class MenuDebugTools extends StatelessWidget {
  const MenuDebugTools({
    super.key,
    required this.apiClient,
    this.driverId,
    this.serviceDateOverride,
  });

  final ApiClient apiClient;
  final String? driverId;
  final String? serviceDateOverride;

  Future<void> _openFixture(
    BuildContext context, {
    required DeliveryMapDataSource source,
  }) {
    return Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => MapSpikeScreen(
          apiClient: apiClient,
          dataSource: source,
          driverId: driverId,
          serviceDate: serviceDateOverride,
        ),
      ),
    );
  }

  Future<void> _launchKakaoNavi(BuildContext context) async {
    try {
      await KakaoNaviPocBridge.launch(
        appKey: AppConfig.instance.kakaoNativeAppKey,
      );
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Kakao Navigation POC unavailable ($e)')),
      );
    }
  }

  Future<void> _launchTmapNavi(BuildContext context) async {
    final apiKey = AppConfig.instance.tmapApiKey;
    if (apiKey.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'TMAP Navigation POC gated: set TMAP_API_KEY in apps/mobile/.env',
          ),
        ),
      );
      return;
    }
    try {
      await TmapNaviPocBridge.launch(
        apiKey: apiKey,
        clientId: AppConfig.instance.tmapClientId,
        userKey: AppConfig.instance.tmapUserKey,
        deviceKey: AppConfig.instance.tmapDeviceKey,
      );
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('TMAP Navigation POC unavailable ($e)')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return DsCard(
      key: MenuKeys.debugSection,
      padding: const EdgeInsets.all(0),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          title: Text(
            '개발자 도구',
            style: AppTypography.textTheme.titleSmall,
          ),
          subtitle: Text(
            '디버그 전용 · 실기기 PoC',
            style: AppTypography.textTheme.bodySmall,
          ),
          childrenPadding: const EdgeInsets.fromLTRB(
            AppSpacing.md,
            0,
            AppSpacing.md,
            AppSpacing.md,
          ),
          children: [
            if (serviceDateOverride != null) ...[
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'dev serviceDate=$serviceDateOverride',
                  style: AppTypography.textTheme.bodySmall,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
            OutlinedButton(
              onPressed: () => _openFixture(
                context,
                source: DeliveryMapDataSource.namdong10,
              ),
              child: const Text('남동구 fixture 지도 (dev)'),
            ),
            const SizedBox(height: AppSpacing.sm),
            OutlinedButton(
              onPressed: () => _openFixture(
                context,
                source: DeliveryMapDataSource.singleSpike,
              ),
              child: const Text('단일 Spike 지도 (dev)'),
            ),
            const SizedBox(height: AppSpacing.sm),
            OutlinedButton(
              onPressed: () => _launchKakaoNavi(context),
              child: const Text('Kakao Navigation POC'),
            ),
            const SizedBox(height: AppSpacing.sm),
            OutlinedButton(
              onPressed: () => _launchTmapNavi(context),
              child: const Text('TMAP Navigation POC'),
            ),
          ],
        ),
      ),
    );
  }
}
