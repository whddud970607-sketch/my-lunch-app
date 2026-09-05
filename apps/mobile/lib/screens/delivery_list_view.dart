import 'package:flutter/material.dart';

import '../copy/driver_chrome_copy.dart';
import '../map/workset_map_filter.dart';
import '../map/workset_map_filter_chips.dart';
import '../models/today_workset.dart';
import '../theme/app_colors.dart';
import '../theme/app_radius.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import '../widgets/ds_card.dart';
import '../widgets/ds_primary_button.dart';
import '../widgets/ds_status_badge.dart';
import 'delivery_list_data.dart';
import 'delivery_list_keys.dart';
import 'home_dashboard.dart';

/// Presentation-only TodayWorkset list. Loader stays on [DeliveryListScreen].
class DeliveryListView extends StatelessWidget {
  const DeliveryListView({
    super.key,
    required this.loadState,
    required this.statusFilter,
    required this.mapFilter,
    required this.searchQuery,
    required this.onStatusFilterSelected,
    required this.onMapFilterSelected,
    required this.onSearchChanged,
    required this.onRefresh,
    this.searchController,
    this.onSearchSubmitted,
    this.onSearchClear,
    this.addressMatchPointIds = const {},
    this.addressSearchPhase = DeliveryAddressSearchPhase.idle,
    this.workset,
    this.listError,
    this.onRetry,
    this.onPointTap,
    this.onViewOnMap,
    this.onViewPointOnMap,
  });

  final HomeDashboardLoadState loadState;
  final TodayWorkset? workset;
  final String? listError;
  final DeliveryListStatusFilter statusFilter;
  final WorksetMapFilter mapFilter;
  final String searchQuery;
  final TextEditingController? searchController;
  final ValueChanged<DeliveryListStatusFilter> onStatusFilterSelected;
  final ValueChanged<WorksetMapFilter> onMapFilterSelected;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<String>? onSearchSubmitted;
  final VoidCallback? onSearchClear;
  final Set<String> addressMatchPointIds;
  final DeliveryAddressSearchPhase addressSearchPhase;
  final VoidCallback onRefresh;
  final VoidCallback? onRetry;
  final ValueChanged<WorksetPoint>? onPointTap;
  final VoidCallback? onViewOnMap;
  final ValueChanged<WorksetPoint>? onViewPointOnMap;

  bool get _stale =>
      listError != null &&
      workset != null &&
      loadState != HomeDashboardLoadState.error;

  @override
  Widget build(BuildContext context) {
    final summary = workset?.summary;
    final points = workset == null
        ? const <WorksetPoint>[]
        : visibleDeliveryPoints(
            workset: workset!,
            status: statusFilter,
            mapFilter: mapFilter,
            searchQuery: searchQuery,
            addressMatchPointIds: addressMatchPointIds,
          );
    final queryActive = normalizeDeliverySearchQuery(searchQuery).isNotEmpty;
    final showLoading = loadState == HomeDashboardLoadState.loading &&
        workset == null;
    final showError = loadState == HomeDashboardLoadState.error &&
        workset == null;
    final todayEmpty = !showLoading &&
        !showError &&
        (workset == null || workset!.isEmpty);
    final addressSearching = queryActive &&
        addressSearchPhase == DeliveryAddressSearchPhase.loading;
    final addressFailed = queryActive &&
        addressSearchPhase == DeliveryAddressSearchPhase.error;
    // Active search outranks Today-empty copy, including Today = 0.
    final showZeroMatch = !showLoading &&
        !showError &&
        queryActive &&
        !addressSearching &&
        !addressFailed &&
        points.isEmpty;
    final showEmpty = todayEmpty && !queryActive;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.sm,
            AppSpacing.lg,
            0,
          ),
          child: _ListHeader(
            total: summary?.totalPoints ?? 0,
            completed: summary?.completedPoints ?? 0,
            remaining: summary?.remainingPoints ?? 0,
            showSummary: workset != null && !showLoading,
            stale: _stale,
            onViewOnMap: onViewOnMap,
          ),
        ),
        if (!showLoading && !showError) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.md,
              AppSpacing.lg,
              0,
            ),
            child: _StatusFilters(
              selected: statusFilter,
              onSelected: onStatusFilterSelected,
            ),
          ),
          if (workset != null)
            _SecondaryFilters(
              workset: workset!,
              selected: mapFilter,
              onSelected: onMapFilterSelected,
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.sm,
              AppSpacing.lg,
              0,
            ),
            child: _DeliverySearchField(
              controller: searchController,
              searchQuery: searchQuery,
              onChanged: onSearchChanged,
              onSubmitted: onSearchSubmitted ?? onSearchChanged,
              onClear: onSearchClear,
            ),
          ),
          if (addressSearching && points.isNotEmpty)
            const Padding(
              padding: EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.sm,
                AppSpacing.lg,
                0,
              ),
              child: Text(
                DriverChromeCopy.searchInProgress,
                key: DeliveryListKeys.searchLoading,
              ),
            ),
          if (addressFailed && points.isNotEmpty)
            const Padding(
              padding: EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.sm,
                AppSpacing.lg,
                0,
              ),
              child: Text(
                DriverChromeCopy.searchFailed,
                key: DeliveryListKeys.searchFailed,
              ),
            ),
        ],
        const SizedBox(height: AppSpacing.md),
        Expanded(
          child: showLoading
              ? const Center(
                  key: DeliveryListKeys.loadingState,
                  child: CircularProgressIndicator(),
                )
              : showError
                  ? _ErrorBody(
                      message: listError ?? DriverChromeCopy.loadListFailed,
                      onRetry: onRetry ?? onRefresh,
                    )
                  : addressSearching && points.isEmpty
                      ? const _SearchStatusBody(
                          keyName: DeliveryListKeys.searchLoading,
                          message: DriverChromeCopy.searchInProgress,
                        )
                      : addressFailed && points.isEmpty
                          ? const _SearchStatusBody(
                              keyName: DeliveryListKeys.searchFailed,
                              message: DriverChromeCopy.searchFailed,
                            )
                          : showZeroMatch
                              ? const _ZeroMatchBody()
                              : showEmpty
                                  ? _EmptyBody(onRefresh: onRefresh)
                                  : RefreshIndicator(
                                  onRefresh: () async => onRefresh(),
                                  child: ListView.builder(
                                    key: DeliveryListKeys.lazyList,
                                    physics:
                                        const AlwaysScrollableScrollPhysics(),
                                    padding: const EdgeInsets.fromLTRB(
                                      AppSpacing.lg,
                                      0,
                                      AppSpacing.lg,
                                      AppSpacing.xxl,
                                    ),
                                    itemCount: points.length,
                                    itemBuilder: (context, index) {
                                      final point = points[index];
                                      return Padding(
                                        padding: const EdgeInsets.only(
                                          bottom: AppSpacing.sm,
                                        ),
                                        child: DeliveryPointCard(
                                          point: point,
                                          onTap: onPointTap == null
                                              ? null
                                              : () => onPointTap!(point),
                                          onViewOnMap: onViewPointOnMap != null
                                              ? () => onViewPointOnMap!(point)
                                              : onViewOnMap,
                                        ),
                                      );
                                    },
                                  ),
                                ),
        ),
      ],
    );
  }
}

class _ListHeader extends StatelessWidget {
  const _ListHeader({
    required this.total,
    required this.completed,
    required this.remaining,
    required this.showSummary,
    required this.stale,
    this.onViewOnMap,
  });

  final int total;
  final int completed;
  final int remaining;
  final bool showSummary;
  final bool stale;
  final VoidCallback? onViewOnMap;

  @override
  Widget build(BuildContext context) {
    return Column(
      key: DeliveryListKeys.header,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showSummary)
          Row(
            key: DeliveryListKeys.summary,
            children: [
              _stat('전체', total),
              _stat('완료', completed),
              _stat('남음', remaining),
            ],
          ),
        if (stale) ...[
          const SizedBox(height: AppSpacing.sm),
          Material(
            key: DeliveryListKeys.staleBanner,
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
          ),
        ],
        if (onViewOnMap != null) ...[
          const SizedBox(height: AppSpacing.sm),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              key: DeliveryListKeys.mapAction,
              onPressed: onViewOnMap,
              icon: const Icon(Icons.map_outlined),
              label: const Text(DriverChromeCopy.viewOnMap),
            ),
          ),
        ],
      ],
    );
  }

  Widget _stat(String label, int value) {
    return Expanded(
      child: Text(
        '$label $value',
        style: AppTypography.textTheme.titleSmall,
      ),
    );
  }
}

class _StatusFilters extends StatelessWidget {
  const _StatusFilters({
    required this.selected,
    required this.onSelected,
  });

  final DeliveryListStatusFilter selected;
  final ValueChanged<DeliveryListStatusFilter> onSelected;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _chip(
          key: DeliveryListKeys.filterAll,
          label: '전체',
          value: DeliveryListStatusFilter.all,
        ),
        const SizedBox(width: AppSpacing.sm),
        _chip(
          key: DeliveryListKeys.filterOpen,
          label: '미완료',
          value: DeliveryListStatusFilter.open,
        ),
        const SizedBox(width: AppSpacing.sm),
        _chip(
          key: DeliveryListKeys.filterCompleted,
          label: '완료',
          value: DeliveryListStatusFilter.completed,
        ),
      ],
    );
  }

  Widget _chip({
    required Key key,
    required String label,
    required DeliveryListStatusFilter value,
  }) {
    return FilterChip(
      key: key,
      label: Text(label),
      selected: selected == value,
      onSelected: (_) => onSelected(value),
      showCheckmark: false,
    );
  }
}

class _SecondaryFilters extends StatelessWidget {
  const _SecondaryFilters({
    required this.workset,
    required this.selected,
    required this.onSelected,
  });

  final TodayWorkset workset;
  final WorksetMapFilter selected;
  final ValueChanged<WorksetMapFilter> onSelected;

  @override
  Widget build(BuildContext context) {
    final chips = WorksetMapFilterChips.fromWorkset(workset)
        .where((c) => c.kind != MapFilterChipKind.all)
        .toList(growable: false);
    if (chips.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: 48,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          AppSpacing.sm,
          AppSpacing.lg,
          0,
        ),
        scrollDirection: Axis.horizontal,
        itemCount: chips.length,
        separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.sm),
        itemBuilder: (context, index) {
          final spec = chips[index];
          return FilterChip(
            label: Text(spec.label),
            selected: spec.filter == selected,
            showCheckmark: false,
            onSelected: (_) {
              if (spec.filter == selected) {
                onSelected(WorksetMapFilter.all);
              } else {
                onSelected(spec.filter);
              }
            },
          );
        },
      ),
    );
  }
}

class _DeliverySearchField extends StatefulWidget {
  const _DeliverySearchField({
    required this.searchQuery,
    required this.onChanged,
    required this.onSubmitted,
    this.controller,
    this.onClear,
  });

  final String searchQuery;
  final TextEditingController? controller;
  final ValueChanged<String> onChanged;
  final ValueChanged<String> onSubmitted;
  final VoidCallback? onClear;

  @override
  State<_DeliverySearchField> createState() => _DeliverySearchFieldState();
}

class _DeliverySearchFieldState extends State<_DeliverySearchField> {
  TextEditingController? _owned;
  TextEditingController get _controller => widget.controller ?? _owned!;

  @override
  void initState() {
    super.initState();
    if (widget.controller == null) {
      _owned = TextEditingController(text: widget.searchQuery);
    }
  }

  @override
  void didUpdateWidget(covariant _DeliverySearchField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.controller == null &&
        widget.searchQuery.isEmpty &&
        _controller.text.isNotEmpty) {
      _controller.clear();
    }
  }

  @override
  void dispose() {
    _owned?.dispose();
    super.dispose();
  }

  void _applyCurrentText() {
    widget.onSubmitted(_controller.text);
  }

  void _clear() {
    if (widget.onClear != null) {
      widget.onClear!();
      return;
    }
    _controller.clear();
    widget.onChanged('');
  }

  @override
  Widget build(BuildContext context) {
    final showClear = widget.searchQuery.trim().isNotEmpty ||
        _controller.text.trim().isNotEmpty;
    return TextField(
      key: DeliveryListKeys.search,
      controller: _controller,
      onChanged: widget.onChanged,
      onSubmitted: widget.onSubmitted,
      textInputAction: TextInputAction.search,
      decoration: InputDecoration(
        hintText: deliveryListSearchHint,
        isDense: true,
        prefixIcon: IconButton(
          key: DeliveryListKeys.searchAction,
          tooltip: '검색',
          onPressed: _applyCurrentText,
          icon: const Icon(Icons.search),
        ),
        suffixIcon: showClear
            ? IconButton(
                key: DeliveryListKeys.searchClear,
                tooltip: '검색 지우기',
                onPressed: _clear,
                icon: const Icon(Icons.clear),
              )
            : null,
      ),
    );
  }
}

/// Centers status cards when space allows; scrolls when the IME shrinks the
/// viewport. Does not clip overflow.
class _KeyboardSafeCentered extends StatelessWidget {
  const _KeyboardSafeCentered({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return SingleChildScrollView(
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: child,
              ),
            ),
          ),
        );
      },
    );
  }
}

class _EmptyBody extends StatelessWidget {
  const _EmptyBody({required this.onRefresh});

  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    return _KeyboardSafeCentered(
      child: DsCard(
        key: DeliveryListKeys.emptyState,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              DriverChromeCopy.emptyToday,
              style: AppTypography.textTheme.bodyLarge,
            ),
            const SizedBox(height: AppSpacing.md),
            DsPrimaryButton(label: DriverChromeCopy.refresh, onPressed: onRefresh),
          ],
        ),
      ),
    );
  }
}

class _SearchStatusBody extends StatelessWidget {
  const _SearchStatusBody({
    required this.keyName,
    required this.message,
  });

  final Key keyName;
  final String message;

  @override
  Widget build(BuildContext context) {
    return _KeyboardSafeCentered(
      child: DsCard(
        key: keyName,
        child: Text(message, style: AppTypography.textTheme.bodyLarge),
      ),
    );
  }
}

class _ZeroMatchBody extends StatelessWidget {
  const _ZeroMatchBody();

  @override
  Widget build(BuildContext context) {
    return _KeyboardSafeCentered(
      child: DsCard(
        key: DeliveryListKeys.zeroMatchState,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              DriverChromeCopy.searchZeroMatch,
              style: AppTypography.textTheme.bodyLarge,
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              DriverChromeCopy.searchZeroMatchHint,
              style: AppTypography.textTheme.bodyMedium,
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return _KeyboardSafeCentered(
      child: DsCard(
        key: DeliveryListKeys.errorState,
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
    );
  }
}

class DeliveryPointCard extends StatelessWidget {
  const DeliveryPointCard({
    super.key,
    required this.point,
    this.onTap,
    this.onViewOnMap,
  });

  final WorksetPoint point;
  final VoidCallback? onTap;
  final VoidCallback? onViewOnMap;

  @override
  Widget build(BuildContext context) {
    final completed = point.isCompleted;
    return Material(
      key: DeliveryListKeys.pointCard(point.pointId),
      color: completed
          ? AppColors.success.withValues(alpha: 0.08)
          : AppColors.surfaceElevated,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      deliveryPointTitle(point),
                      style: AppTypography.textTheme.titleMedium,
                    ),
                  ),
                  DsStatusBadge(
                    label: deliveryPointStatusLabel(point),
                    tone: completed
                        ? DsStatusTone.success
                        : DsStatusTone.active,
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                deliveryPointMeta(point),
                style: AppTypography.textTheme.bodyMedium,
              ),
              if (onViewOnMap != null) ...[
                const SizedBox(height: AppSpacing.sm),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    key: DeliveryListKeys.pointMapAction(point.pointId),
                    onPressed: onViewOnMap,
                    child: const Text(DriverChromeCopy.viewOnMap),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
