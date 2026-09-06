import 'package:flutter/material.dart';

import '../copy/driver_chrome_copy.dart';
import '../map/map_provider_id.dart';
import '../map/workset_map_filter.dart';
import '../map/workset_map_filter_chips.dart';
import '../theme/app_colors.dart';
import '../theme/app_radius.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import '../widgets/ds_card.dart';
import '../widgets/ds_primary_button.dart';
import 'unified_map_keys.dart';

/// Compact map chrome: title, TodayWorkset summary, filters, provider, refresh.
class UnifiedMapOverlay extends StatelessWidget {
  const UnifiedMapOverlay({
    super.key,
    required this.title,
    required this.onRefresh,
    required this.refreshing,
    required this.mapProviderId,
    required this.onProviderSelected,
    this.showSummary = false,
    this.totalPoints = 0,
    this.completedPoints = 0,
    this.remainingPoints = 0,
    this.filters = const [],
    this.selectedFilter = WorksetMapFilter.all,
    this.onFilterSelected,
    this.showBack = false,
    this.onBack,
    this.stale = false,
  });

  final String title;
  final bool showSummary;
  final int totalPoints;
  final int completedPoints;
  final int remainingPoints;
  final List<MapFilterChipSpec> filters;
  final WorksetMapFilter selectedFilter;
  final ValueChanged<WorksetMapFilter>? onFilterSelected;
  final VoidCallback onRefresh;
  final bool refreshing;
  final MapProviderId mapProviderId;
  final ValueChanged<MapProviderId> onProviderSelected;
  final bool showBack;
  final VoidCallback? onBack;
  final bool stale;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.sm,
            AppSpacing.sm,
            AppSpacing.sm,
            0,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              DsCard(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.sm,
                  AppSpacing.sm,
                  AppSpacing.xs,
                  AppSpacing.sm,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        if (showBack)
                          IconButton(
                            tooltip: '뒤로',
                            onPressed: onBack,
                            icon: const Icon(Icons.arrow_back),
                          ),
                        Expanded(
                          child: Text(
                            title,
                            key: UnifiedMapKeys.header,
                            style: AppTypography.textTheme.titleSmall,
                          ),
                        ),
                        if (refreshing)
                          const Padding(
                            padding: EdgeInsets.symmetric(
                              horizontal: AppSpacing.sm,
                            ),
                            child: SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          )
                        else
                          IconButton(
                            key: UnifiedMapKeys.refresh,
                            tooltip: '새로고침',
                            onPressed: onRefresh,
                            icon: const Icon(Icons.refresh),
                          ),
                        PopupMenuButton<MapProviderId>(
                          key: UnifiedMapKeys.providerMenu,
                          tooltip: '지도 제공자',
                          initialValue: mapProviderId,
                          onSelected: onProviderSelected,
                          itemBuilder: (context) => [
                            for (final id in MapProviderId.values)
                              CheckedPopupMenuItem(
                                value: id,
                                checked: id == mapProviderId,
                                child: Text(id.displayLabel),
                              ),
                          ],
                          icon: const Icon(Icons.layers_outlined),
                        ),
                      ],
                    ),
                    if (showSummary) ...[
                      const SizedBox(height: AppSpacing.xs),
                      _MapSummaryRow(
                        totalPoints: totalPoints,
                        completedPoints: completedPoints,
                        remainingPoints: remainingPoints,
                      ),
                    ],
                    if (filters.isNotEmpty && onFilterSelected != null) ...[
                      const SizedBox(height: AppSpacing.sm),
                      _MapFilterRow(
                        filters: filters,
                        selectedFilter: selectedFilter,
                        onSelected: onFilterSelected!,
                      ),
                    ],
                  ],
                ),
              ),
              if (stale) ...[
                const SizedBox(height: AppSpacing.sm),
                const _MapStaleBanner(),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _MapSummaryRow extends StatelessWidget {
  const _MapSummaryRow({
    required this.totalPoints,
    required this.completedPoints,
    required this.remainingPoints,
  });

  final int totalPoints;
  final int completedPoints;
  final int remainingPoints;

  @override
  Widget build(BuildContext context) {
    return Row(
      key: UnifiedMapKeys.summary,
      children: [
        _stat('전체', totalPoints),
        _stat('완료', completedPoints),
        _stat('남음', remainingPoints),
      ],
    );
  }

  Widget _stat(String label, int value) {
    return Expanded(
      child: Text(
        '$label $value',
        style: AppTypography.textTheme.labelMedium,
      ),
    );
  }
}

class _MapFilterRow extends StatelessWidget {
  const _MapFilterRow({
    required this.filters,
    required this.selectedFilter,
    required this.onSelected,
  });

  final List<MapFilterChipSpec> filters;
  final WorksetMapFilter selectedFilter;
  final ValueChanged<WorksetMapFilter> onSelected;

  @override
  Widget build(BuildContext context) {
    final all = filters.where((c) => c.kind == MapFilterChipKind.all);
    final companies =
        filters.where((c) => c.kind == MapFilterChipKind.company);
    final sources = filters.where(
      (c) =>
          c.kind == MapFilterChipKind.source ||
          c.kind == MapFilterChipKind.manual,
    );

    return SingleChildScrollView(
      key: UnifiedMapKeys.filters,
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final chip in all) _chip(chip),
          if (companies.isNotEmpty) ...[
            _caption('회사'),
            for (final chip in companies) _chip(chip),
          ],
          if (sources.isNotEmpty) ...[
            _caption(DriverChromeCopy.sourceGroup),
            for (final chip in sources) _chip(chip),
          ],
        ],
      ),
    );
  }

  Widget _caption(String text) {
    return Padding(
      padding: const EdgeInsets.only(left: AppSpacing.sm, right: AppSpacing.xs),
      child: Text(text, style: AppTypography.textTheme.labelMedium),
    );
  }

  Widget _chip(MapFilterChipSpec spec) {
    return Padding(
      padding: const EdgeInsets.only(right: AppSpacing.xs),
      child: FilterChip(
        label: Text(spec.label),
        selected: selectedFilter == spec.filter,
        onSelected: (_) => onSelected(spec.filter),
        visualDensity: VisualDensity.compact,
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
      ),
    );
  }
}

class _MapStaleBanner extends StatelessWidget {
  const _MapStaleBanner();

  @override
  Widget build(BuildContext context) {
    return Material(
      key: UnifiedMapKeys.staleBanner,
      color: AppColors.warning.withValues(alpha: 0.16),
      borderRadius: BorderRadius.circular(AppRadius.sm),
      child: const Padding(
        padding: EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.sm,
        ),
        child: Text(
          DriverChromeCopy.stale,
          style: TextStyle(
            color: AppColors.warning,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

class MapErrorPanel extends StatelessWidget {
  const MapErrorPanel({
    super.key,
    required this.message,
    required this.onRetry,
  });

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: DsCard(
          key: UnifiedMapKeys.errorState,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(message, style: AppTypography.textTheme.bodyLarge),
              const SizedBox(height: AppSpacing.md),
              DsPrimaryButton(label: DriverChromeCopy.retry, onPressed: onRetry),
            ],
          ),
        ),
      ),
    );
  }
}

class MapLoadingPanel extends StatelessWidget {
  const MapLoadingPanel({super.key});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.bottomCenter,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.lg),
          child: DsCard(
            key: UnifiedMapKeys.loadingState,
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.sm,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                const SizedBox(width: AppSpacing.sm),
                Text(
                  DriverChromeCopy.mapPointsLoading,
                  style: AppTypography.textTheme.bodyMedium,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
