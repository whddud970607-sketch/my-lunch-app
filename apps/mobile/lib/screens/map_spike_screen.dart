import 'dart:async';

import 'package:flutter/material.dart';

import '../config/app_config.dart';
import '../copy/driver_chrome_copy.dart';
import '../config/device_abi.dart';
import '../map/delivery_location_pin.dart';
import '../map/delivery_map_controller.dart';
import '../map/delivery_map_surface.dart';
import '../map/map_location_coordinator.dart';
import '../map/map_provider_id.dart';
import '../map/map_provider_settings.dart';
import '../map/today_workset_map_adapter.dart';
import '../map/workset_completion_reconciler.dart';
import '../map/workset_map_filter.dart';
import '../map/workset_map_filter_chips.dart';
import '../models/map_spike_point.dart';
import '../models/today_workset.dart';
import '../navigation/point_external_navi.dart';
import '../services/api_client.dart';
import '../services/api_exception.dart';
import '../services/map_spike_service.dart';
import '../services/today_workset_repository.dart';
import '../sync/completion_projection_store.dart';
import '../sync/sync_scope.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../widgets/delivery_detail_panel.dart';
import '../widgets/map_selected_point_card.dart';
import '../widgets/my_location_button.dart';
import 'app_shell_tabs.dart';
import 'complete_delivery_data.dart';
import 'complete_delivery_flow.dart';
import 'unified_map_keys.dart';
import 'unified_map_overlay.dart';

enum DeliveryMapDataSource {
  /// Primary: GET /delivery/today
  today,

  /// Dev/fixture entry (namdong10 + seoul)
  namdong10,

  /// Legacy single spike
  singleSpike,
}

/// Delivery map screen: domain state is map-SDK agnostic.
class MapSpikeScreen extends StatefulWidget {
  const MapSpikeScreen({
    super.key,
    required this.apiClient,
    this.dataSource = DeliveryMapDataSource.today,
    this.useNamdong10Fixture = false,
    this.focusPointId,
    this.driverId,
    this.serviceDate,
    this.initialWorkset,
    this.onSelectTab,
  });

  final ApiClient apiClient;

  /// Preferred data source. When [useNamdong10Fixture] is true (legacy),
  /// namdong10 wins for backward-compatible call sites.
  final DeliveryMapDataSource dataSource;

  /// Legacy flag — prefer [dataSource].
  final bool useNamdong10Fixture;

  final String? focusPointId;
  final String? driverId;

  /// Explicit service date for Today (tests/dev). Null → AppConfig override or server default.
  final String? serviceDate;

  /// Optional preloaded workset to avoid an extra fetch on first paint.
  final TodayWorkset? initialWorkset;

  /// Optional AppShell tab switch (complete success → 배송 목록).
  final ValueChanged<int>? onSelectTab;

  @override
  State<MapSpikeScreen> createState() => _MapSpikeScreenState();
}

class _MapSpikeScreenState extends State<MapSpikeScreen>
    with WidgetsBindingObserver {
  late final MapSpikeService _service = MapSpikeService(widget.apiClient);
  late final TodayWorksetRepository _todayRepo =
      TodayWorksetRepository(widget.apiClient);
  late final MapLocationCoordinator _locationCoordinator =
      MapLocationCoordinator()..bindPositionStream();

  final Map<String, MapSpikePoint> _pointsById = {};
  final Map<String, DeliveryLocationPin> _pinsByMarkerId = {};

  final ValueNotifier<String?> _selectedMarkerId = ValueNotifier<String?>(null);
  final ValueNotifier<String?> _selectedPointId = ValueNotifier<String?>(null);
  final ValueNotifier<bool> _pinAdjustMode = ValueNotifier<bool>(false);

  MapProviderId _mapProviderId = MapProviderSettings.defaultProvider;
  DeliveryMapController? _mapController;
  String? _error;
  bool _loading = true;
  bool _refreshing = false;
  String? _adjustingPointId;
  int _mapHostGeneration = 0;

  TodayWorkset? _workset;
  WorksetMapFilter _filter = WorksetMapFilter.all;
  bool _detailOpen = false;
  final Set<String> _detailHydratedPointIds = {};

  final Map<String, MapSpikePoint> _preOptimisticByPointId = {};
  CompletionProjectionStore? _projections;
  bool _projectionListenerAttached = false;

  DeliveryMapDataSource get _effectiveSource {
    if (widget.useNamdong10Fixture) return DeliveryMapDataSource.namdong10;
    return widget.dataSource;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _locationCoordinator.addListener(_onLocationCoordinatorChanged);
    _bootstrap();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final projections = SyncScope.maybeOf(context)?.projections;
    if (identical(projections, _projections)) return;
    if (_projections != null && _projectionListenerAttached) {
      _projections!.removeListener(_onProjectionsChanged);
      _projectionListenerAttached = false;
    }
    _projections = projections;
    if (_projections != null) {
      _projections!.addListener(_onProjectionsChanged);
      _projectionListenerAttached = true;
    }
  }

  void _onProjectionsChanged() {
    final store = _projections;
    if (store == null || !mounted) return;
    var changed = false;
    for (final entry in _preOptimisticByPointId.entries.toList()) {
      final proj = store.forPoint(entry.key);
      if (proj == null) continue;
      if (proj.phase == LocalCompletionSyncPhase.failed ||
          proj.phase == LocalCompletionSyncPhase.conflict) {
        _pointsById[entry.key] = entry.value;
        _preOptimisticByPointId.remove(entry.key);
        changed = true;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              proj.phase == LocalCompletionSyncPhase.conflict
                  ? '동기화 충돌 — 서버 상태로 되돌렸습니다'
                  : '동기화 실패 — 서버 상태로 되돌렸습니다',
            ),
          ),
        );
      } else if (proj.phase == LocalCompletionSyncPhase.synced) {
        _preOptimisticByPointId.remove(entry.key);
      }
    }
    if (changed) {
      _rebuildPins();
      setState(() {});
      _syncPinsToMap();
    }
  }

  void _onLocationCoordinatorChanged() {
    if (mounted) setState(() {});
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        if (!_loading && _error == null) {
          _locationCoordinator.loadVehicleType().then((_) {
            _locationCoordinator.startTracking();
          });
        }
      case AppLifecycleState.paused:
      case AppLifecycleState.inactive:
      case AppLifecycleState.detached:
      case AppLifecycleState.hidden:
        _locationCoordinator.stopTracking();
    }
  }

  Future<void> _bootstrap() async {
    final saved = await MapProviderSettings.load();
    if (!mounted) return;
    setState(() => _mapProviderId = saved);
    await _load(isRefresh: false);
  }

  @override
  void dispose() {
    if (_projections != null && _projectionListenerAttached) {
      _projections!.removeListener(_onProjectionsChanged);
    }
    WidgetsBinding.instance.removeObserver(this);
    _locationCoordinator.removeListener(_onLocationCoordinatorChanged);
    _locationCoordinator.dispose();
    _selectedMarkerId.dispose();
    _selectedPointId.dispose();
    _pinAdjustMode.dispose();
    super.dispose();
  }

  void _rebuildPins() {
    final filtered = TodayWorksetMapAdapter.applyFilter(
      _pointsById.values,
      _filter,
      workset: _workset,
    );
    _pinsByMarkerId
      ..clear()
      ..addEntries(
        groupPointsByLocation(filtered).map(
          (pin) => MapEntry(pin.markerId, pin),
        ),
      );
  }

  Future<void> _syncPinsToMap() async {
    final controller = _mapController;
    if (controller == null) return;
    await controller.syncPins(_pinsByMarkerId.values.toList(growable: false));
  }

  Future<void> _load({required bool isRefresh}) async {
    final hadData = _pointsById.isNotEmpty;
    if (isRefresh) {
      setState(() {
        _refreshing = true;
        _error = null;
      });
    } else {
      setState(() {
        _loading = true;
        _error = null;
      });
      _selectedMarkerId.value = null;
      _selectedPointId.value = null;
      _pointsById.clear();
      _pinsByMarkerId.clear();
      _mapController = null;
    }

    try {
      if (_mapProviderId == MapProviderId.kakao) {
        final kakaoOk = await DeviceAbi.isKakaoMapNativeSupported();
        if (!kakaoOk) {
          final abi = await DeviceAbi.primaryAbi();
          throw ApiException(
            message:
                '카카오맵 네이티브 SDK는 arm64/armeabi만 지원합니다. '
                '현재 ABI=$abi (x86_64 에뮬레이터에서는 지도 불가). '
                '설정에서 네이버지도를 선택하거나 실기기를 사용해 주세요.',
          );
        }
      }

      final List<MapSpikePoint> loaded;
      final int apiMs;
      TodayWorkset? workset;

      switch (_effectiveSource) {
        case DeliveryMapDataSource.today:
          final result = await _loadToday();
          loaded = result.points;
          apiMs = result.apiMs;
          workset = result.workset;
        case DeliveryMapDataSource.namdong10:
          final result = await _service.fetchNamdong10Points();
          loaded = result.points;
          apiMs = result.apiMs;
        case DeliveryMapDataSource.singleSpike:
          final sw = Stopwatch()..start();
          final one = await _service.fetchSpikePoint();
          apiMs = sw.elapsedMilliseconds;
          loaded = [one];
      }

      final markerSw = Stopwatch()..start();
      final previous = Map<String, MapSpikePoint>.from(_pointsById);
      final reconciled = WorksetCompletionReconciler.mergeAll(
        serverPoints: loaded,
        previousById: previous,
        projections: _projections,
      );
      _pointsById
        ..clear()
        ..addAll(reconciled);
      _workset = workset;
      _rebuildPins();
      final markerMs = markerSw.elapsedMilliseconds;
      debugPrint(
        '[timing] api_ms=$apiMs data_to_markers_ms=$markerMs '
        'points=${_pointsById.length} pins=${_pinsByMarkerId.length} '
        'source=${_effectiveSource.name}',
      );

      if (!mounted) return;
      setState(() {
        _loading = false;
        _refreshing = false;
        _error = null;
        if (!isRefresh) _mapHostGeneration++;
      });
      if (isRefresh) {
        await _syncPinsToMap();
      }
      await _locationCoordinator.loadVehicleType();
      final trackingOk = await _locationCoordinator.startTracking();
      if (!trackingOk && mounted && _locationCoordinator.permissionDenied) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('위치 권한이 없어 내 위치 기능을 사용할 수 없습니다'),
          ),
        );
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
        _refreshing = false;
        // Stale-but-visible: keep last successful points on refresh failure.
        if (!hadData && !isRefresh) {
          _pointsById.clear();
          _pinsByMarkerId.clear();
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = DriverChromeCopy.loadMapFailed;
        _loading = false;
        _refreshing = false;
        if (!hadData && !isRefresh) {
          _pointsById.clear();
          _pinsByMarkerId.clear();
        }
      });
    }
  }

  Future<({List<MapSpikePoint> points, int apiMs, TodayWorkset workset})>
      _loadToday() async {
    final driverId = widget.driverId?.trim() ?? '';
    TodayWorkset workset;
    int apiMs;
    if (widget.initialWorkset != null && !_refreshing && _pointsById.isEmpty) {
      workset = widget.initialWorkset!;
      apiMs = 0;
    } else {
      final date = widget.serviceDate?.trim().isNotEmpty == true
          ? widget.serviceDate!.trim()
          : AppConfig.instance.todayServiceDateOverride;
      final result = await _todayRepo.fetchToday(serviceDate: date);
      workset = result.workset;
      apiMs = result.apiMs;
    }

    // Production Today path: no namdong10 soft-enrich dependency.
    final points = TodayWorksetMapAdapter.toMapPoints(
      workset,
      driverId: driverId,
    );
    for (final point in points) {
      final ok = point.pinAccuracy.isNotEmpty &&
          point.latitude != 0 &&
          point.longitude != 0 &&
          point.pointId.isNotEmpty;
      if (!ok) {
        throw ApiException(message: 'today workset 핀 필드 검증 실패');
      }
    }
    _detailHydratedPointIds.clear();
    return (points: points, apiMs: apiMs, workset: workset);
  }

  void _onMapReady(DeliveryMapController controller) {
    _mapController = controller;
    _locationCoordinator.attachMap(controller);
    final focusId = widget.focusPointId;
    if (focusId == null || focusId.isEmpty) return;
    final point = _pointsById[focusId];
    if (point == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await controller.moveCamera(
        DeliveryLatLng(
          latitude: point.latitude,
          longitude: point.longitude,
        ),
        zoom: 15,
        programmatic: true,
      );
      if (!mounted) return;
      DeliveryLocationPin? pin;
      for (final p in _pinsByMarkerId.values) {
        if (p.points.any((x) => x.pointId == focusId)) {
          pin = p;
          break;
        }
      }
      if (pin != null) {
        _onPinTap(pin.markerId, preferredPointId: focusId);
      }
    });
  }

  void _onPinTap(String markerId, {String? preferredPointId}) {
    if (!_pinsByMarkerId.containsKey(markerId)) return;
    final pin = _pinsByMarkerId[markerId]!;
    MapSpikePoint? preferred;
    if (preferredPointId != null) {
      for (final p in pin.points) {
        if (p.pointId == preferredPointId) {
          preferred = p;
          break;
        }
      }
    }
    final point = preferred ?? pin.primaryPoint;
    _selectedMarkerId.value = markerId;
    _selectedPointId.value = point.pointId;
    if (_detailOpen) {
      setState(() => _detailOpen = false);
    }
    if (_effectiveSource == DeliveryMapDataSource.today) {
      unawaited(_hydratePointDetail(point.pointId));
    }
  }

  /// Lazy PII load for the tapped point only (no bulk N+1 on map open).
  Future<void> _hydratePointDetail(String pointId) async {
    if (_detailHydratedPointIds.contains(pointId)) return;
    final existing = _pointsById[pointId];
    if (existing == null) return;
    try {
      final rich = await _service.fetchPointDetail(pointId);
      if (!mounted) return;
      final merged = existing.copyWith(
        customerName: rich.customerName,
        address: rich.address,
        detailAddress: rich.detailAddress,
        deliveryMemo: rich.deliveryMemo,
        contactType: rich.contactType,
        contactValue: rich.contactValue,
        hasAccessInfo: rich.hasAccessInfo,
        piiMasked: rich.piiMasked,
        status: rich.status.isNotEmpty ? rich.status : existing.status,
        statusCode: rich.statusCode,
        shipments:
            rich.shipments.isNotEmpty ? rich.shipments : existing.shipments,
        companyId: rich.companyId ?? existing.companyId,
        companyLabel: existing.companyLabel,
        sourceLabel: existing.sourceLabel,
        sourceId: rich.sourceId ?? existing.sourceId,
      );
      _pointsById[pointId] = merged;
      _detailHydratedPointIds.add(pointId);
      _rebuildPins();
      if (_selectedPointId.value == pointId) {
        setState(() {});
      }
    } catch (_) {
      // Keep operational Today row; detail panel shows empty PII until retry.
    }
  }

  void _closePanel() {
    _selectedMarkerId.value = null;
    _selectedPointId.value = null;
    if (_detailOpen) {
      setState(() => _detailOpen = false);
    }
  }

  Future<void> _navigateToPoint(MapSpikePoint point) async {
    if (!PointExternalNavi.hasValidDestination(point)) return;
    final ok = await PointExternalNavi.open(
      latitude: point.latitude,
      longitude: point.longitude,
      name: PointExternalNavi.labelFor(point),
      preferredProvider: _mapProviderId,
    );
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('길찾기를 열 수 없습니다')),
      );
    }
  }

  DeliveryLatLng? _cameraTarget() {
    final cameraSource = _pointsById.values.toList(growable: false);
    if (cameraSource.isNotEmpty) {
      final first = cameraSource.first;
      if (cameraSource.length == 1) {
        return DeliveryLatLng(
          latitude: first.latitude,
          longitude: first.longitude,
        );
      }
      final midLat =
          cameraSource.map((p) => p.latitude).reduce((a, b) => a + b) /
              cameraSource.length;
      final midLng =
          cameraSource.map((p) => p.longitude).reduce((a, b) => a + b) /
              cameraSource.length;
      return DeliveryLatLng(latitude: midLat, longitude: midLng);
    }
    final snap = _locationCoordinator.locationService.lastSnapshot;
    if (snap == null) return null;
    if (!PointExternalNavi.isValidCoordinate(snap.latitude, snap.longitude)) {
      return null;
    }
    return DeliveryLatLng(
      latitude: snap.latitude,
      longitude: snap.longitude,
    );
  }

  void _setFilter(WorksetMapFilter filter) {
    if (filter == _filter) return;
    setState(() {
      _filter = filter;
      _rebuildPins();
    });
    _closePanel();
    unawaited(_syncPinsToMap());
  }

  Future<void> _startPinAdjust(MapSpikePoint point) async {
    _adjustingPointId = point.pointId;
    _closePanel();
    _locationCoordinator.disableFollow();
    _pinAdjustMode.value = true;
  }

  Future<void> _savePinAdjust() async {
    final controller = _mapController;
    if (controller == null || _pointsById.isEmpty) return;
    final pointId = _adjustingPointId ?? _pointsById.keys.first;
    final point = _pointsById[pointId];
    if (point == null) return;
    DeliveryLocationPin? oldPin;
    for (final p in _pinsByMarkerId.values) {
      if (p.points.any((x) => x.pointId == pointId)) {
        oldPin = p;
        break;
      }
    }
    final center = await controller.getCenter();
    if (center == null) return;
    try {
      await _service.saveDriverVerifiedPin(
        pointId: point.pointId,
        latitude: center.latitude,
        longitude: center.longitude,
      );
      final updated = point.copyWith(
        latitude: center.latitude,
        longitude: center.longitude,
        pinAccuracy: 'driver_verified',
      );
      _pointsById[point.pointId] = updated;
      if (oldPin != null) {
        await controller.removePin(oldPin.markerId);
      }
      _rebuildPins();
      final newPin = _pinsByMarkerId.values.firstWhere(
        (p) => p.points.any((x) => x.pointId == point.pointId),
      );
      await controller.upsertPin(newPin);
      _adjustingPointId = null;
      _pinAdjustMode.value = false;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('배송 위치로 저장됨 (driver_verified)')),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message)),
        );
      }
    }
  }

  List<MapSpikePoint> _orderedTodayPoints() {
    final workset = _workset;
    if (workset == null) return const [];
    final out = <MapSpikePoint>[];
    for (final p in workset.points) {
      final mapped = _pointsById[p.pointId];
      if (mapped != null) out.add(mapped);
    }
    return out;
  }

  void _revealPoint(String pointId) {
    DeliveryLocationPin? pin;
    for (final p in _pinsByMarkerId.values) {
      if (p.points.any((x) => x.pointId == pointId)) {
        pin = p;
        break;
      }
    }
    if (pin == null) return;
    _onPinTap(pin.markerId, preferredPointId: pointId);
    setState(() => _detailOpen = true);
  }

  Future<void> _openComplete(MapSpikePoint point) async {
    final driverId = point.driverId.isNotEmpty
        ? point.driverId
        : (widget.driverId ?? '');
    final next = nextOpenPointAfter(
      ordered: _orderedTodayPoints(),
      currentPointId: point.pointId,
    );
    final result = await openCompleteDeliveryScreen(
      context: context,
      point: point,
      mapSpikeService: _service,
      driverId: driverId,
      nextPoint: next,
      onOpenMap: () {},
      onOpenList: widget.onSelectTab == null ? null : () {},
    );
    if (!mounted) return;
    final parsed = parseCompleteFlowResult(result);
    final optimistic = parsed?.queued == true;
    if (parsed == null || !parsed.applied) return;

    if (optimistic) {
      _preOptimisticByPointId[point.pointId] = point;
    }
    final updated = point.copyWith(
      status: '배송 완료',
      statusCode: 'completed',
      product: '배송 완료',
      customerName: '****',
      address: '****',
      detailAddress: '****',
      piiMasked: true,
      hasAccessInfo: false,
    );
    _pointsById[point.pointId] = updated;
    _rebuildPins();
    setState(() {});
    final controller = _mapController;
    DeliveryLocationPin? newPin;
    for (final p in _pinsByMarkerId.values) {
      if (p.points.any((x) => x.pointId == point.pointId)) {
        newPin = p;
        break;
      }
    }
    if (controller != null && newPin != null) {
      await controller.upsertPin(newPin);
    }
    _closePanel();
    if (!mounted) return;
    if (parsed.action == CompleteNavAction.list) {
      widget.onSelectTab?.call(AppShellTabs.delivery);
      return;
    }
    if (parsed.action == CompleteNavAction.next &&
        parsed.nextPointId != null) {
      _revealPoint(parsed.nextPointId!);
    }
  }

  Future<void> _changeMapProvider(MapProviderId id) async {
    if (id == _mapProviderId) return;
    await MapProviderSettings.save(id);
    if (!mounted) return;
    _locationCoordinator.detachMap();
    final selected = _selectedMarkerId.value;
    final selectedPoint = _selectedPointId.value;
    setState(() {
      _mapProviderId = id;
      _mapController = null;
      _mapHostGeneration++;
    });
    _selectedMarkerId.value = selected;
    _selectedPointId.value = selectedPoint;
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${id.displayLabel}으로 전환했습니다')),
      );
    }
  }

  String get _mapTitle => switch (_effectiveSource) {
        DeliveryMapDataSource.today => '통합 지도',
        DeliveryMapDataSource.namdong10 => '배송 지도 (남동구 fixture)',
        DeliveryMapDataSource.singleSpike => '배송 지도 (Spike)',
      };

  UnifiedMapOverlay _overlay({required bool stale}) {
    final today = _effectiveSource == DeliveryMapDataSource.today;
    final summary = _workset?.summary;
    return UnifiedMapOverlay(
      title: _mapTitle,
      showSummary: today && _workset != null,
      totalPoints: summary?.totalPoints ?? 0,
      completedPoints: summary?.completedPoints ?? 0,
      remainingPoints: summary?.remainingPoints ?? 0,
      filters: today
          ? WorksetMapFilterChips.fromWorkset(_workset)
          : const [],
      selectedFilter: _filter,
      onFilterSelected: today ? _setFilter : null,
      onRefresh: () => _load(isRefresh: true),
      refreshing: _refreshing,
      mapProviderId: _mapProviderId,
      onProviderSelected: _changeMapProvider,
      showBack: ModalRoute.of(context)?.canPop ?? false,
      onBack: () => Navigator.of(context).maybePop(),
      stale: stale,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    final stale = _error != null && _pointsById.isNotEmpty;
    final overlay = _overlay(stale: stale);

    if (_loading && _pointsById.isEmpty) {
      return Stack(
        fit: StackFit.expand,
        children: [
          overlay,
          const MapLoadingPanel(),
        ],
      );
    }
    if (_error != null && _pointsById.isEmpty) {
      return Stack(
        fit: StackFit.expand,
        children: [
          overlay,
          MapErrorPanel(
            message: _error!,
            onRetry: () => _load(isRefresh: false),
          ),
        ],
      );
    }

    final pins = _pinsByMarkerId.values.toList(growable: false);
    final initial = _cameraTarget() ??
        const DeliveryLatLng(
          latitude: 37.5665,
          longitude: 126.9780,
        );

    return Stack(
      fit: StackFit.expand,
      children: [
        DeliveryMapSurface(
          key: ValueKey('map-surface-$_mapProviderId-$_mapHostGeneration'),
          providerId: _mapProviderId,
          initialTarget: initial,
          pins: pins,
          onPinTap: _onPinTap,
          onReady: _onMapReady,
        ),
        overlay,
        ValueListenableBuilder<bool>(
          valueListenable: _pinAdjustMode,
          builder: (context, adjusting, _) {
            if (adjusting || _detailOpen) return const SizedBox.shrink();
            return ValueListenableBuilder<String?>(
              valueListenable: _selectedMarkerId,
              builder: (context, selectedId, _) {
                return Align(
                  alignment: Alignment.bottomRight,
                  child: SafeArea(
                    child: Padding(
                      padding: EdgeInsets.only(
                        right: AppSpacing.md,
                        bottom: selectedId != null
                            ? 176
                            : AppSpacing.lg,
                      ),
                      child: MyLocationButton(
                        key: UnifiedMapKeys.currentLocation,
                        followActive: _locationCoordinator.followEnabled,
                        enabled: !_locationCoordinator.permissionDenied,
                        onPressed: () =>
                            _locationCoordinator.onMyLocationPressed(),
                      ),
                    ),
                  ),
                );
              },
            );
          },
        ),
        ValueListenableBuilder<bool>(
          valueListenable: _pinAdjustMode,
          builder: (context, adjusting, _) {
            if (!adjusting) return const SizedBox.shrink();
            return Align(
              alignment: Alignment.bottomCenter,
              child: Material(
                color: AppColors.surfaceElevated,
                elevation: 8,
                child: SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.md),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text('지도를 이동해 실제 배송 위치를 맞춘 뒤 저장하세요.'),
                        const SizedBox(height: AppSpacing.sm),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                onPressed: () {
                                  _adjustingPointId = null;
                                  _pinAdjustMode.value = false;
                                },
                                child: const Text('취소'),
                              ),
                            ),
                            const SizedBox(width: AppSpacing.sm),
                            Expanded(
                              child: FilledButton(
                                onPressed: _savePinAdjust,
                                child: const Text('배송 위치로 저장'),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        ),
        ValueListenableBuilder<bool>(
          valueListenable: _pinAdjustMode,
          builder: (context, adjusting, _) {
            if (adjusting) return const SizedBox.shrink();
            return ValueListenableBuilder<String?>(
              valueListenable: _selectedMarkerId,
              builder: (context, selectedId, _) {
                if (selectedId == null) return const SizedBox.shrink();
                final pin = _pinsByMarkerId[selectedId];
                if (pin == null) return const SizedBox.shrink();
                return ValueListenableBuilder<String?>(
                  valueListenable: _selectedPointId,
                  builder: (context, selectedPointId, _) {
                    final point = pin.points.firstWhere(
                      (p) => p.pointId == selectedPointId,
                      orElse: () => pin.primaryPoint,
                    );
                    final canNavigate =
                        PointExternalNavi.hasValidDestination(point);
                    return Align(
                      alignment: Alignment.bottomCenter,
                      child: _detailOpen
                          ? DeliveryDetailPanel(
                              point: point,
                              totalQuantity: point.quantity,
                              clusteredJobCount: pin.points.length,
                              clusterPoints:
                                  pin.isCluster ? pin.points : null,
                              onSelectClusterPoint: pin.isCluster
                                  ? (p) {
                                      _selectedPointId.value = p.pointId;
                                      if (_effectiveSource ==
                                          DeliveryMapDataSource.today) {
                                        unawaited(
                                          _hydratePointDetail(p.pointId),
                                        );
                                      }
                                    }
                                  : null,
                              onClose: _closePanel,
                              onNavigate: canNavigate
                                  ? () => _navigateToPoint(point)
                                  : null,
                              onAdjustPin: point.isCompleted
                                  ? null
                                  : () => _startPinAdjust(point),
                              onComplete: point.isCompleted
                                  ? null
                                  : () => _openComplete(point),
                              onRevealAccessInfo: (id) =>
                                  _service.fetchAccessInfo(id),
                            )
                          : MapSelectedPointCard(
                              point: point,
                              clusteredJobCount: pin.points.length,
                              onClose: _closePanel,
                              onNavigate: canNavigate
                                  ? () => _navigateToPoint(point)
                                  : null,
                              onOpenDetail: () {
                                setState(() => _detailOpen = true);
                              },
                            ),
                    );
                  },
                );
              },
            );
          },
        ),
      ],
    );
  }
}
