import 'package:flutter/material.dart';

import '../models/map_spike_point.dart';
import '../screens/unified_map_keys.dart';
import '../theme/app_colors.dart';
import '../theme/app_radius.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import 'ds_primary_button.dart';
import 'ds_status_badge.dart';

/// Compact selected-point card. No phone / access secret / UUID.
class MapSelectedPointCard extends StatelessWidget {
  const MapSelectedPointCard({
    super.key,
    required this.point,
    required this.onClose,
    this.onNavigate,
    this.onOpenDetail,
    this.clusteredJobCount = 1,
  });

  final MapSpikePoint point;
  final VoidCallback onClose;
  final VoidCallback? onNavigate;
  final VoidCallback? onOpenDetail;
  final int clusteredJobCount;

  static String buildingDisplay(MapSpikePoint point) {
    if (!point.piiMasked && !point.isCompleted) {
      final address = point.address.trim();
      if (address.isNotEmpty && address != '****') return address;
    }
    final product = point.product.trim();
    if (product.isNotEmpty && product != '****') return product;
    return '배송지';
  }

  @override
  Widget build(BuildContext context) {
    final completed = point.isCompleted;
    final shipmentCount = point.shipments.length;
    return Material(
      key: UnifiedMapKeys.selectedPointCard,
      color: AppColors.surfaceElevated,
      elevation: 8,
      borderRadius: const BorderRadius.vertical(
        top: Radius.circular(AppRadius.lg),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.md,
            AppSpacing.sm,
            AppSpacing.sm,
            AppSpacing.md,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: AppSpacing.sm),
                  decoration: BoxDecoration(
                    color: AppColors.outline,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      buildingDisplay(point),
                      style: AppTypography.textTheme.titleSmall,
                    ),
                  ),
                  DsStatusBadge(
                    label: completed ? '완료' : '미완료',
                    tone: completed ? DsStatusTone.success : DsStatusTone.active,
                  ),
                  IconButton(
                    tooltip: '닫기',
                    onPressed: onClose,
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                shipmentCount > 0
                    ? '물량 ${point.quantity} · 송장 $shipmentCount건'
                    : '물량 ${point.quantity}',
                style: AppTypography.textTheme.bodySmall,
              ),
              if (clusteredJobCount > 1) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  '같은 위치 $clusteredJobCount건',
                  style: AppTypography.textTheme.bodySmall,
                ),
              ],
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  if (onNavigate != null) ...[
                    Expanded(
                      child: DsPrimaryButton(
                        key: UnifiedMapKeys.navigateCta,
                        label: '길찾기',
                        onPressed: onNavigate,
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                  ],
                  if (onOpenDetail != null)
                    Expanded(
                      child: OutlinedButton(
                        key: UnifiedMapKeys.detailAction,
                        onPressed: onOpenDetail,
                        child: const Text('상세'),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
