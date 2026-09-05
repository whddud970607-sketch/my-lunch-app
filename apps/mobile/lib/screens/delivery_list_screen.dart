import 'dart:async';

import 'package:flutter/material.dart';

import '../config/app_config.dart';
import '../copy/driver_chrome_copy.dart';
import '../map/workset_map_filter.dart';
import '../models/map_spike_point.dart';
import '../models/today_workset.dart';
import '../navigation/point_external_navi.dart';
import '../services/api_exception.dart';
import '../services/map_spike_service.dart';
import '../services/today_workset_repository.dart';
import '../state/auth_controller.dart';
import '../widgets/delivery_detail_panel.dart';
import 'app_shell_tabs.dart';
import 'complete_delivery_data.dart';
import 'complete_delivery_flow.dart';
import 'delivery_list_data.dart';
import 'delivery_list_view.dart';
import 'home_dashboard.dart';

/// AppShell 배송 탭: TodayWorkset Point list. No new delivery domain.
class DeliveryListScreen extends StatefulWidget {
  const DeliveryListScreen({
    super.key,
    required this.controller,
    this.onSelectTab,
    this.onViewPointOnMap,
    this.refreshTick,
  });

  final AuthController controller;
  final ValueChanged<int>? onSelectTab;
  final ValueChanged<WorksetPoint>? onViewPointOnMap;
  final ValueNotifier<int>? refreshTick;

  @override
  State<DeliveryListScreen> createState() => _DeliveryListScreenState();
}

class _DeliveryListScreenState extends State<DeliveryListScreen> {
  TodayWorkset? _workset;
  String? _listError;
  HomeDashboardLoadState _loadState = HomeDashboardLoadState.loading;
  DeliveryListStatusFilter _statusFilter = DeliveryListStatusFilter.all;
  WorksetMapFilter _mapFilter = WorksetMapFilter.all;
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();
  Set<String> _addressMatchIds = {};
  DeliveryAddressSearchPhase _addressSearchPhase =
      DeliveryAddressSearchPhase.idle;
  Timer? _addressDebounce;
  int _addressSearchSeq = 0;

  late final TodayWorksetRepository _todayRepo =
      TodayWorksetRepository(widget.controller.apiClient);
  late final MapSpikeService _detailService =
      MapSpikeService(widget.controller.apiClient);

  @override
  void initState() {
    super.initState();
    widget.refreshTick?.addListener(_onExternalRefresh);
    _loadToday(isRefresh: false);
  }

  void _onExternalRefresh() {
    _loadToday(isRefresh: true);
  }

  @override
  void dispose() {
    widget.refreshTick?.removeListener(_onExternalRefresh);
    _addressDebounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  void _setSearchQuery(String value) {
    if (_searchQuery != value) {
      setState(() => _searchQuery = value);
    }
    _scheduleAddressSearch(value, immediate: false);
  }

  void _submitSearch(String value) {
    if (_searchQuery != value) {
      setState(() => _searchQuery = value);
    }
    _scheduleAddressSearch(value, immediate: true);
  }

  void _clearSearch() {
    _addressDebounce?.cancel();
    _addressSearchSeq++;
    if (_searchController.text.isNotEmpty) {
      _searchController.clear();
    }
    setState(() {
      _searchQuery = '';
      _addressMatchIds = {};
      _addressSearchPhase = DeliveryAddressSearchPhase.idle;
    });
  }

  void _scheduleAddressSearch(String value, {required bool immediate}) {
    _addressDebounce?.cancel();
    final q = normalizeDeliverySearchQuery(value);
    if (q.isEmpty) {
      setState(() {
        _addressMatchIds = {};
        _addressSearchPhase = DeliveryAddressSearchPhase.idle;
      });
      return;
    }
    if (immediate) {
      unawaited(_runAddressSearch(value));
      return;
    }
    _addressDebounce = Timer(const Duration(milliseconds: 450), () {
      unawaited(_runAddressSearch(value));
    });
  }

  Future<void> _runAddressSearch(String value) async {
    final q = normalizeDeliverySearchQuery(value);
    if (q.isEmpty) return;
    final seq = ++_addressSearchSeq;
    setState(() => _addressSearchPhase = DeliveryAddressSearchPhase.loading);
    try {
      final hits = await _todayRepo.searchToday(
        query: value,
        serviceDate: _serviceDateOverride,
      );
      if (!mounted || seq != _addressSearchSeq) return;
      setState(() {
        _addressMatchIds = {
          for (final hit in hits) hit.pointId,
        };
        _addressSearchPhase = DeliveryAddressSearchPhase.idle;
      });
    } catch (_) {
      if (!mounted || seq != _addressSearchSeq) return;
      setState(() => _addressSearchPhase = DeliveryAddressSearchPhase.error);
    }
  }

  String? get _serviceDateOverride {
    final fromConfig = AppConfig.instance.todayServiceDateOverride;
    if (fromConfig != null && fromConfig.isNotEmpty) return fromConfig;
    return null;
  }

  Future<void> _loadToday({required bool isRefresh}) async {
    final hadData = _workset != null;
    setState(() {
      _loadState = isRefresh
          ? HomeDashboardLoadState.refreshing
          : HomeDashboardLoadState.loading;
      if (!isRefresh) _listError = null;
    });
    try {
      final result = await _todayRepo.fetchToday(
        serviceDate: _serviceDateOverride,
      );
      if (!mounted) return;
      setState(() {
        _workset = result.workset;
        _listError = null;
        _loadState = result.workset.isEmpty
            ? HomeDashboardLoadState.empty
            : HomeDashboardLoadState.loaded;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _listError = e.message;
        if (hadData) {
          _loadState = HomeDashboardLoadState.loaded;
        } else {
          _workset = null;
          _loadState = HomeDashboardLoadState.error;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _listError = DriverChromeCopy.loadListFailed;
        if (hadData) {
          _loadState = HomeDashboardLoadState.loaded;
        } else {
          _workset = null;
          _loadState = HomeDashboardLoadState.error;
        }
      });
    }
  }

  void _openMapTab() => widget.onSelectTab?.call(AppShellTabs.map);

  void _openPointOnMap(WorksetPoint point) {
    if (widget.onViewPointOnMap != null) {
      widget.onViewPointOnMap!(point);
      return;
    }
    _openMapTab();
  }

  Future<void> _navigateToPoint(MapSpikePoint point) async {
    if (!PointExternalNavi.hasValidDestination(point)) return;
    final ok = await PointExternalNavi.open(
      latitude: point.latitude,
      longitude: point.longitude,
      name: PointExternalNavi.labelFor(point),
    );
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('길찾기를 열 수 없습니다')),
      );
    }
  }

  Future<void> _completePoint(MapSpikePoint point) async {
    final driverId = widget.controller.me?.driver?.id ?? '';
    final workset = _workset;
    MapSpikePoint? next;
    if (workset != null) {
      final nextWp = nextOpenWorksetPointAfter(
        ordered: workset.points,
        currentPointId: point.pointId,
      );
      if (nextWp != null) {
        next = worksetPointToDetailPoint(
          workset: workset,
          point: nextWp,
          driverId: driverId,
        );
      }
    }
    final result = await openCompleteDeliveryScreen(
      context: context,
      point: point,
      mapSpikeService: _detailService,
      driverId: driverId,
      nextPoint: next,
      onOpenMap: widget.onSelectTab == null ? null : _openMapTab,
      onOpenList: () {},
      shipmentCount: point.shipments.isEmpty ? null : point.shipments.length,
    );
    if (!mounted) return;
    await _loadToday(isRefresh: true);
    if (!mounted) return;
    final parsed = parseCompleteFlowResult(result);
    if (parsed == null || !parsed.applied) return;
    if (parsed.action == CompleteNavAction.map) {
      _openMapTab();
      return;
    }
    if (parsed.action == CompleteNavAction.next &&
        parsed.nextPointId != null) {
      final refreshed = _workset;
      if (refreshed == null) return;
      for (final p in refreshed.points) {
        if (p.pointId == parsed.nextPointId) {
          await _openDetail(p);
          return;
        }
      }
    }
  }

  Future<void> _openDetail(WorksetPoint point) async {
    final workset = _workset;
    if (workset == null) return;
    final driverId = widget.controller.me?.driver?.id ?? '';
    final mapped = worksetPointToDetailPoint(
      workset: workset,
      point: point,
      driverId: driverId,
    );
    if (!mounted) return;
    final canNavigate = PointExternalNavi.hasValidDestination(mapped);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return DeliveryDetailPanel(
          point: mapped,
          totalQuantity: mapped.quantity,
          clusteredJobCount: 1,
          shipmentCount: point.shipmentCount,
          onClose: () => Navigator.of(ctx).pop(),
          onNavigate: canNavigate ? () => _navigateToPoint(mapped) : null,
          onComplete: mapped.isCompleted
              ? null
              : () async {
                  Navigator.of(ctx).pop();
                  await _completePoint(mapped);
                },
          onRevealAccessInfo: (id) => _detailService.fetchAccessInfo(id),
          onHydratePoint: _detailService.fetchPointDetail,
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('배송 목록'),
        actions: [
          IconButton(
            tooltip: '새로고침',
            onPressed: () => _loadToday(isRefresh: true),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: DeliveryListView(
          loadState: _loadState == HomeDashboardLoadState.refreshing
              ? HomeDashboardLoadState.loaded
              : _loadState,
          workset: _workset,
          listError: _listError,
          statusFilter: _statusFilter,
          mapFilter: _mapFilter,
          searchQuery: _searchQuery,
          searchController: _searchController,
          addressMatchPointIds: _addressMatchIds,
          addressSearchPhase: _addressSearchPhase,
          onStatusFilterSelected: (value) {
            setState(() => _statusFilter = value);
          },
          onMapFilterSelected: (value) {
            setState(() => _mapFilter = value);
          },
          onSearchChanged: _setSearchQuery,
          onSearchSubmitted: _submitSearch,
          onSearchClear: _clearSearch,
          onRefresh: () => _loadToday(isRefresh: true),
          onRetry: () => _loadToday(isRefresh: false),
          onPointTap: _openDetail,
          onViewOnMap: _openMapTab,
          onViewPointOnMap: _openPointOnMap,
        ),
      ),
    );
  }
}
