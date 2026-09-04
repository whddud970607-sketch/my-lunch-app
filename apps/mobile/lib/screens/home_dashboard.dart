import 'package:flutter/material.dart';

import '../copy/driver_chrome_copy.dart';
import '../models/today_workset.dart';
import '../state/delivery_session_controller.dart';
import '../theme/app_colors.dart';
import '../theme/app_radius.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import '../widgets/ds_card.dart';
import '../widgets/ds_primary_button.dart';
import '../widgets/ds_status_badge.dart';
import 'home_dashboard_data.dart';

enum HomeDashboardLoadState { loading, loaded, empty, error, refreshing }

abstract final class HomeDashboardKeys {
  static const header = Key('home_header');
  static const workdayStatus = Key('home_workday_status');
  static const metrics = Key('home_metrics');
  static const zeroState = Key('home_zero_state');
  static const errorState = Key('home_error');
  static const loadingState = Key('home_loading');
  static const quickActionMap = Key('quick_action_map');
  static const quickActionScan = Key('quick_action_scan');
  static const workdayActionStart = Key('workday_action_start');
  static const workdayActionEnd = Key('workday_action_end');
  static const workdayActionRetry = Key('workday_action_retry');
  static const workdayActionContinue = Key('workday_action_continue');
}

/// Presentation-only Home dashboard. Lifecycle stays on [HomeScreen].
class HomeDashboard extends StatelessWidget {
  const HomeDashboard({
    super.key,
    required this.driverDisplayName,
    required this.dateLabel,
    required this.phase,
    required this.needsRecovery,
    required this.inProgress,
    required this.canStartDelivery,
    required this.canEndDelivery,
    required this.needsB2JobPicker,
    required this.sessionBusy,
    required this.loadState,
    required this.elapsedLabel,
    this.workset,
    this.listError,
    this.developerTools,
    this.onStartDelivery,
    this.onEndDelivery,
    this.onContinueDelivery,
    this.onRetryToday,
    this.onOpenMapTab,
    this.onOpenScanTab,
    this.onViewTodayWork,
  });

  final String driverDisplayName;
  final String dateLabel;
  final DeliveryLifecyclePhase phase;
  final bool needsRecovery;
  final bool inProgress;
  final bool canStartDelivery;
  final bool canEndDelivery;
  final bool needsB2JobPicker;
  final bool sessionBusy;
  final HomeDashboardLoadState loadState;
  final String elapsedLabel;
  final TodayWorkset? workset;
  final String? listError;
  final Widget? developerTools;
  final VoidCallback? onStartDelivery;
  final VoidCallback? onEndDelivery;
  final VoidCallback? onContinueDelivery;
  final VoidCallback? onRetryToday;
  final VoidCallback? onOpenMapTab;
  final VoidCallback? onOpenScanTab;
  final VoidCallback? onViewTodayWork;

  @override
  Widget build(BuildContext context) {
    final badge = workdayBadgeView(phase: phase, needsRecovery: needsRecovery);
    final summary = workset?.summary;
    final total = summary?.totalPoints ?? 0;
    final completed = summary?.completedPoints ?? 0;
    final remaining = summary?.remainingPoints ?? 0;
    final percent = workdayProgressPercent(total: total, completed: completed);
    final showMetrics = workset != null &&
        loadState != HomeDashboardLoadState.loading;
    final showZero = loadState == HomeDashboardLoadState.empty ||
        (workset != null && workset!.isEmpty);
    final companyRows =
        workset == null ? const <NamedVolumeRow>[] : namedCompanyVolumes(workset!);
    final sourceRows = workset == null
        ? const <NamedVolumeRow>[]
        : namedSourceVolumes(workset!);
    final nextPoint = firstIncompletePoint(workset);
    final recent = completedPointsLimited(workset);

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.sm,
        AppSpacing.lg,
        AppSpacing.xxl,
      ),
      children: [
        _HomeHeader(
          driverDisplayName: driverDisplayName,
          dateLabel: dateLabel,
          badge: badge,
        ),
        const SizedBox(height: AppSpacing.lg),
        if (loadState == HomeDashboardLoadState.loading && workset == null)
          const _DashboardSkeleton()
        else if (loadState == HomeDashboardLoadState.error && workset == null)
          _ErrorCard(
            message: listError ?? DriverChromeCopy.loadListFailed,
            onRetry: onRetryToday,
          )
        else ...[
          if (listError != null)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: Text(
                DriverChromeCopy.stale,
                style: AppTypography.textTheme.bodySmall,
              ),
            ),
          if (showMetrics)
            _WorkdayMetricsCard(
              total: total,
              completed: completed,
              remaining: remaining,
              percent: percent,
            ),
          if (showZero) ...[
            const SizedBox(height: AppSpacing.md),
            const _ZeroStateCard(),
          ],
        ],
        const SizedBox(height: AppSpacing.md),
        _WorkdayActionCard(
          phase: phase,
          needsRecovery: needsRecovery,
          inProgress: inProgress,
          canStartDelivery: canStartDelivery,
          canEndDelivery: canEndDelivery,
          needsB2JobPicker: needsB2JobPicker,
          sessionBusy: sessionBusy,
          elapsedLabel: elapsedLabel,
          loadBusy: loadState == HomeDashboardLoadState.loading,
          onStartDelivery: onStartDelivery,
          onEndDelivery: onEndDelivery,
          onContinueDelivery: onContinueDelivery,
          onViewTodayWork: onViewTodayWork,
        ),
        if (companyRows.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.lg),
          _NamedVolumeCard(title: DriverChromeCopy.companyVolumes, rows: companyRows),
        ] else if (sourceRows.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.lg),
          _NamedVolumeCard(title: DriverChromeCopy.sourceVolumes, rows: sourceRows),
        ],
        const SizedBox(height: AppSpacing.lg),
        _QuickActionsRow(
          onOpenMapTab: onOpenMapTab,
          onOpenScanTab: onOpenScanTab,
        ),
        if (nextPoint != null) ...[
          const SizedBox(height: AppSpacing.lg),
          _NextDeliveryCard(
            point: nextPoint,
            onOpenMap: onOpenMapTab,
          ),
        ],
        if (recent.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.lg),
          _RecentCompletionCard(points: recent),
        ],
        if (developerTools != null) ...[
          const SizedBox(height: AppSpacing.xl),
          developerTools!,
        ],
      ],
    );
  }
}

class _HomeHeader extends StatelessWidget {
  const _HomeHeader({
    required this.driverDisplayName,
    required this.dateLabel,
    required this.badge,
  });

  final String driverDisplayName;
  final String dateLabel;
  final WorkdayBadgeView badge;

  @override
  Widget build(BuildContext context) {
    return Column(
      key: HomeDashboardKeys.header,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Delivery Shield',
          style: AppTypography.textTheme.labelMedium,
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          '오늘의 배송',
          style: AppTypography.textTheme.headlineSmall,
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          dateLabel,
          style: AppTypography.textTheme.bodyMedium,
        ),
        const SizedBox(height: AppSpacing.sm),
        Row(
          children: [
            Expanded(
              child: Text(
                driverDisplayName,
                style: AppTypography.textTheme.titleMedium,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            DsStatusBadge(
              key: HomeDashboardKeys.workdayStatus,
              label: badge.label,
              tone: _tone(badge.tone),
            ),
          ],
        ),
      ],
    );
  }

  DsStatusTone _tone(WorkdayBadgeTone tone) {
    switch (tone) {
      case WorkdayBadgeTone.active:
        return DsStatusTone.active;
      case WorkdayBadgeTone.success:
        return DsStatusTone.success;
      case WorkdayBadgeTone.warning:
        return DsStatusTone.warning;
      case WorkdayBadgeTone.idle:
        return DsStatusTone.idle;
    }
  }
}

class _DashboardSkeleton extends StatelessWidget {
  const _DashboardSkeleton();

  @override
  Widget build(BuildContext context) {
    Widget bar({required double height, required double widthFactor}) {
      return FractionallySizedBox(
        widthFactor: widthFactor,
        alignment: Alignment.centerLeft,
        child: Container(
          height: height,
          decoration: BoxDecoration(
            color: AppColors.outline,
            borderRadius: BorderRadius.circular(AppRadius.sm),
          ),
        ),
      );
    }

    return Column(
      key: HomeDashboardKeys.loadingState,
      children: [
        DsCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              bar(height: 14, widthFactor: 0.4),
              const SizedBox(height: AppSpacing.md),
              bar(height: 36, widthFactor: 0.55),
              const SizedBox(height: AppSpacing.md),
              bar(height: 8, widthFactor: 1),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        const Center(
          child: Padding(
            padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
            child: CircularProgressIndicator(),
          ),
        ),
      ],
    );
  }
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return DsCard(
      key: HomeDashboardKeys.errorState,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(message, style: AppTypography.textTheme.bodyLarge),
          const SizedBox(height: AppSpacing.md),
          DsPrimaryButton(label: DriverChromeCopy.retry, onPressed: onRetry),
        ],
      ),
    );
  }
}

class _ZeroStateCard extends StatelessWidget {
  const _ZeroStateCard();

  @override
  Widget build(BuildContext context) {
    return DsCard(
      key: HomeDashboardKeys.zeroState,
      child: Text(
        DriverChromeCopy.emptyToday,
        style: AppTypography.textTheme.bodyLarge,
      ),
    );
  }
}

class _WorkdayMetricsCard extends StatelessWidget {
  const _WorkdayMetricsCard({
    required this.total,
    required this.completed,
    required this.remaining,
    required this.percent,
  });

  final int total;
  final int completed;
  final int remaining;
  final int percent;

  @override
  Widget build(BuildContext context) {
    final progress = total <= 0 ? 0.0 : (completed / total).clamp(0.0, 1.0);
    return DsCard(
      key: HomeDashboardKeys.metrics,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('오늘의 배송', style: AppTypography.textTheme.titleMedium),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              _MetricCell(label: '전체', value: '$total'),
              _MetricCell(label: '완료', value: '$completed', emphasize: true),
              _MetricCell(label: '남음', value: '$remaining'),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            '$percent%',
            style: const TextStyle(
              color: AppColors.textPrimary,
              fontSize: 32,
              fontWeight: FontWeight.w700,
              height: 1.1,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.sm),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 8,
              color: AppColors.primary,
              backgroundColor: AppColors.outline,
            ),
          ),
        ],
      ),
    );
  }
}

class _MetricCell extends StatelessWidget {
  const _MetricCell({
    required this.label,
    required this.value,
    this.emphasize = false,
  });

  final String label;
  final String value;
  final bool emphasize;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: AppTypography.textTheme.bodySmall),
          const SizedBox(height: AppSpacing.xs),
          Text(
            value,
            style: TextStyle(
              color: emphasize ? AppColors.success : AppColors.textPrimary,
              fontSize: 28,
              fontWeight: FontWeight.w700,
              height: 1.1,
            ),
          ),
        ],
      ),
    );
  }
}

class _WorkdayActionCard extends StatelessWidget {
  const _WorkdayActionCard({
    required this.phase,
    required this.needsRecovery,
    required this.inProgress,
    required this.canStartDelivery,
    required this.canEndDelivery,
    required this.needsB2JobPicker,
    required this.sessionBusy,
    required this.elapsedLabel,
    required this.loadBusy,
    this.onStartDelivery,
    this.onEndDelivery,
    this.onContinueDelivery,
    this.onViewTodayWork,
  });

  final DeliveryLifecyclePhase phase;
  final bool needsRecovery;
  final bool inProgress;
  final bool canStartDelivery;
  final bool canEndDelivery;
  final bool needsB2JobPicker;
  final bool sessionBusy;
  final String elapsedLabel;
  final bool loadBusy;
  final VoidCallback? onStartDelivery;
  final VoidCallback? onEndDelivery;
  final VoidCallback? onContinueDelivery;
  final VoidCallback? onViewTodayWork;

  @override
  Widget build(BuildContext context) {
    return DsCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (needsRecovery) ...[
            Text('배송 종료 처리 중', style: AppTypography.textTheme.titleMedium),
            const SizedBox(height: AppSpacing.sm),
            Text(
              '종료가 끝나지 않았습니다. 다시 시도해 주세요.',
              style: AppTypography.textTheme.bodyMedium,
            ),
            const SizedBox(height: AppSpacing.md),
            DsPrimaryButton(
              key: HomeDashboardKeys.workdayActionRetry,
              label: '다시 시도',
              busy: sessionBusy,
              onPressed: sessionBusy ? null : onEndDelivery,
            ),
          ] else if (inProgress) ...[
            Text('현재 배송 진행 중', style: AppTypography.textTheme.titleMedium),
            if (elapsedLabel.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(
                '경과 $elapsedLabel',
                style: AppTypography.textTheme.titleLarge,
              ),
            ],
            const SizedBox(height: AppSpacing.md),
            if (canEndDelivery ||
                phase == DeliveryLifecyclePhase.active ||
                phase == DeliveryLifecyclePhase.activeNoSession)
              DsPrimaryButton(
                key: HomeDashboardKeys.workdayActionEnd,
                label: '배송 종료',
                busy: sessionBusy,
                onPressed: sessionBusy ? null : onEndDelivery,
              ),
            if (phase == DeliveryLifecyclePhase.activeNoSession &&
                needsB2JobPicker) ...[
              const SizedBox(height: AppSpacing.sm),
              OutlinedButton(
                key: HomeDashboardKeys.workdayActionContinue,
                onPressed: sessionBusy || loadBusy ? null : onContinueDelivery,
                child: const Text('배송 계속하기'),
              ),
            ],
          ] else if (phase == DeliveryLifecyclePhase.completed &&
              onViewTodayWork != null) ...[
            Text('오늘 배송이 종료되었습니다', style: AppTypography.textTheme.titleMedium),
            const SizedBox(height: AppSpacing.md),
            DsPrimaryButton(
              label: '오늘 업무 보기',
              onPressed: onViewTodayWork,
            ),
          ] else ...[
            Text('오늘 배송을 시작합니다', style: AppTypography.textTheme.titleMedium),
            const SizedBox(height: AppSpacing.md),
            DsPrimaryButton(
              key: HomeDashboardKeys.workdayActionStart,
              label: '오늘 배송 시작',
              busy: sessionBusy,
              onPressed: !canStartDelivery || loadBusy ? null : onStartDelivery,
            ),
          ],
        ],
      ),
    );
  }
}

class _NamedVolumeCard extends StatelessWidget {
  const _NamedVolumeCard({required this.title, required this.rows});

  final String title;
  final List<NamedVolumeRow> rows;

  @override
  Widget build(BuildContext context) {
    return DsCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: AppTypography.textTheme.titleMedium),
          const SizedBox(height: AppSpacing.md),
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                Expanded(
                  child: Text(
                    rows[i].label,
                    style: AppTypography.textTheme.bodyLarge,
                  ),
                ),
                Text(
                  '${rows[i].totalPoints}',
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _QuickActionsRow extends StatelessWidget {
  const _QuickActionsRow({
    this.onOpenMapTab,
    this.onOpenScanTab,
  });

  final VoidCallback? onOpenMapTab;
  final VoidCallback? onOpenScanTab;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _QuickActionCard(
            key: HomeDashboardKeys.quickActionMap,
            icon: Icons.map_outlined,
            label: '통합 지도',
            onTap: onOpenMapTab,
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: _QuickActionCard(
            key: HomeDashboardKeys.quickActionScan,
            icon: Icons.qr_code_scanner,
            label: '물량 스캔',
            onTap: onOpenScanTab,
          ),
        ),
      ],
    );
  }
}

class _QuickActionCard extends StatelessWidget {
  const _QuickActionCard({
    super.key,
    required this.icon,
    required this.label,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surfaceElevated,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.xl,
          ),
          child: Column(
            children: [
              Icon(icon, color: AppColors.primary, size: 28),
              const SizedBox(height: AppSpacing.sm),
              Text(label, style: AppTypography.textTheme.titleSmall),
            ],
          ),
        ),
      ),
    );
  }
}

class _NextDeliveryCard extends StatelessWidget {
  const _NextDeliveryCard({required this.point, this.onOpenMap});

  final WorksetPoint point;
  final VoidCallback? onOpenMap;

  @override
  Widget build(BuildContext context) {
    final meta = <String>[];
    if (point.shipmentCount > 0) {
      meta.add('배송 ${point.shipmentCount}건');
    }
    if (point.quantity > 0) {
      meta.add('상품 ${point.quantity}개');
    }
    return DsCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('다음 배송', style: AppTypography.textTheme.titleMedium),
          const SizedBox(height: AppSpacing.sm),
          Text(
            pointCardTitle(point),
            style: AppTypography.textTheme.titleLarge,
          ),
          if (meta.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              meta.join(' · '),
              style: AppTypography.textTheme.bodyMedium,
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          OutlinedButton(
            onPressed: onOpenMap,
            child: const Text(DriverChromeCopy.viewOnMap),
          ),
        ],
      ),
    );
  }
}

class _RecentCompletionCard extends StatelessWidget {
  const _RecentCompletionCard({required this.points});

  final List<WorksetPoint> points;

  @override
  Widget build(BuildContext context) {
    return DsCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('최근 완료', style: AppTypography.textTheme.titleMedium),
          const SizedBox(height: AppSpacing.sm),
          for (var i = 0; i < points.length; i++) ...[
            if (i > 0) const SizedBox(height: AppSpacing.sm),
            Text(
              pointCardTitle(points[i]),
              style: AppTypography.textTheme.bodyLarge,
            ),
          ],
        ],
      ),
    );
  }
}
