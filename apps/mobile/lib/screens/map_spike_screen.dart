import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kakao_maps_flutter/kakao_maps_flutter.dart';

import '../config/device_abi.dart';
import '../models/map_spike_point.dart';
import '../services/api_client.dart';
import '../services/api_exception.dart';
import '../services/map_spike_service.dart';
import 'complete_delivery_screen.dart';

/// Kakao map spike: map + delivery pins; details only when a pin is selected.
///
/// State is shaped for many points later:
/// - [_pointsById] holds all DeliveryPoint payloads
/// - [_selectedPointId] selects which point's panel is open (null = closed)
/// Selection updates via [ValueNotifier] so the KakaoMap Platform View is not rebuilt.
class MapSpikeScreen extends StatefulWidget {
  const MapSpikeScreen({super.key, required this.apiClient});

  final ApiClient apiClient;

  @override
  State<MapSpikeScreen> createState() => _MapSpikeScreenState();
}

class _MapSpikeScreenState extends State<MapSpikeScreen> {
  late final MapSpikeService _service = MapSpikeService(widget.apiClient);

  /// All loaded points keyed by delivery_points.id (marker id).
  final Map<String, MapSpikePoint> _pointsById = {};

  /// Currently selected pin; null means panel closed (map-only).
  final ValueNotifier<String?> _selectedPointId = ValueNotifier<String?>(null);
  final ValueNotifier<bool> _pinAdjustMode = ValueNotifier<bool>(false);

  String? _error;
  bool _loading = true;
  bool _markersPlaced = false;
  KakaoMapController? _controller;
  StreamSubscription<LabelClickEvent>? _labelSub;

  /// Stable map widget — do not recreate when selection changes.
  static const _mapKey = ValueKey('delivery-spike-kakao-map');
  static const _markerStyleId = 'delivery_spike_pin_v1';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _labelSub?.cancel();
    _selectedPointId.dispose();
    _pinAdjustMode.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _markersPlaced = false;
    });
    _selectedPointId.value = null;
    _pointsById.clear();

    try {
      final kakaoOk = await DeviceAbi.isKakaoMapNativeSupported();
      if (!kakaoOk) {
        final abi = await DeviceAbi.primaryAbi();
        throw ApiException(
          message:
              '카카오맵 네이티브 SDK는 arm64/armeabi만 지원합니다. '
              '현재 ABI=$abi (x86_64 에뮬레이터에서는 지도 불가).',
        );
      }

      final point = await _service.fetchSpikePoint();
      final ok = point.provider.isNotEmpty &&
          point.pinAccuracy.isNotEmpty &&
          point.latitude != 0 &&
          point.longitude != 0 &&
          point.pointId.isNotEmpty;
      if (!ok) {
        throw ApiException(message: 'map-spike 응답 필드 검증 실패');
      }

      if (!mounted) return;
      _pointsById[point.pointId] = point;
      setState(() => _loading = false);

      // Map may already be created (retry); place markers if so.
      final c = _controller;
      if (c != null) {
        await _placeMarkers(c);
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = '지도 데이터를 불러오지 못했습니다';
        _loading = false;
      });
    }
  }

  Future<void> _onMapCreated(KakaoMapController controller) async {
    _controller = controller;

    await _labelSub?.cancel();
    _labelSub = controller.onLabelClickedStream.listen(_onLabelClicked);

    if (_pointsById.isEmpty) return;
    await _placeMarkers(controller);
  }

  void _onLabelClicked(LabelClickEvent event) {
    final id = event.labelId;
    if (!_pointsById.containsKey(id)) return;
    // Instant panel open — no KakaoMap rebuild.
    _selectedPointId.value = id;
  }

  Future<void> _placeMarkers(KakaoMapController controller) async {
    if (_markersPlaced || _pointsById.isEmpty) return;

    // Let native map finish first layout (plugin example pattern).
    await Future<void>.delayed(const Duration(milliseconds: 600));
    if (!mounted || _controller != controller) return;

    final focus = _pointsById.values.first;
    // Safe coord diagnostics only (no tokens/keys).
    final latOk = focus.latitude > 33 && focus.latitude < 39;
    final lngOk = focus.longitude > 124 && focus.longitude < 132;
    final swappedSuspect =
        focus.latitude > 100 || focus.longitude < 40; // Korea WGS84 sanity
    debugPrint(
      'map-spike coords lat=${focus.latitude} lng=${focus.longitude} '
      'latOk=$latOk lngOk=$lngOk swappedSuspect=$swappedSuspect '
      'pointIdLen=${focus.pointId.length} count=${_pointsById.length}',
    );

    try {
      // Required on Android: LabelLayer must exist before addMarker.
      await controller.addMarkerLayer(
        layerId: KakaoMapController.defaultLabelLayerId,
        zOrder: 1000,
        clickable: true,
      );
      debugPrint('map-spike addMarkerLayer=ok');
    } catch (e) {
      debugPrint('map-spike addMarkerLayer FAIL: ${e.runtimeType}');
      rethrow;
    }

    // Root cause fix: DefaultLabelStyle is TEXT-ONLY (no icon). Without
    // registerMarkerStyles + styleId (and with empty text), labels are invisible.
    try {
      final pinBytes =
          (await rootBundle.load('assets/markers/delivery_pin.png'))
              .buffer
              .asUint8List();
      await controller.registerMarkerStyles(
        styles: [
          MarkerStyle(
            styleId: _markerStyleId,
            perLevels: [
              MarkerPerLevelStyle.fromBytes(
                bytes: pinBytes,
                level: 0,
              ),
            ],
          ),
        ],
      );
      debugPrint('map-spike registerMarkerStyles=ok bytes=${pinBytes.length}');
    } catch (e) {
      debugPrint('map-spike registerMarkerStyles FAIL: ${e.runtimeType}');
      rethrow;
    }

    final options = _pointsById.values
        .map(
          (p) => MarkerOption(
            id: p.pointId,
            latLng: LatLng(
              latitude: p.latitude,
              longitude: p.longitude,
            ),
            styleId: _markerStyleId,
            rank: 1000,
          ),
        )
        .toList(growable: false);

    try {
      if (options.length == 1) {
        await controller.addMarker(markerOption: options.first);
      } else {
        await controller.addMarkers(markerOptions: options);
      }
      final o = options.first;
      debugPrint(
        'map-spike addMarker=ok idLen=${o.id.length} '
        'pos=(${o.latLng.latitude},${o.latLng.longitude}) '
        'styleId=${o.styleId} markerCount=${options.length}',
      );
    } catch (e) {
      debugPrint('map-spike addMarker FAIL: ${e.runtimeType}');
      rethrow;
    }

    final target = LatLng(
      latitude: focus.latitude,
      longitude: focus.longitude,
    );
    await controller.moveCamera(
      cameraUpdate: CameraUpdate(
        position: target,
        zoomLevel: 17,
        type: 0,
      ),
      animation: const CameraAnimation(
        duration: 800,
        autoElevation: true,
        isConsecutive: false,
      ),
    );

    final center = await controller.getCenter();
    debugPrint(
      'map-spike cameraCenter=(${center?.latitude},${center?.longitude}) '
      'sameAsMarker=${center != null && (center.latitude - target.latitude).abs() < 1e-5 && (center.longitude - target.longitude).abs() < 1e-5}',
    );

    if (mounted) {
      setState(() => _markersPlaced = true);
    }
  }

  void _closePanel() {
    _selectedPointId.value = null;
  }

  Future<void> _startPinAdjust(MapSpikePoint point) async {
    _closePanel();
    _pinAdjustMode.value = true;
  }

  Future<void> _savePinAdjust() async {
    final controller = _controller;
    if (controller == null || _pointsById.isEmpty) return;
    final point = _pointsById.values.first;
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
      await controller.removeMarker(id: point.pointId);
      await controller.addMarker(
        markerOption: MarkerOption(
          id: updated.pointId,
          latLng: LatLng(
            latitude: updated.latitude,
            longitude: updated.longitude,
          ),
          styleId: _markerStyleId,
          rank: 1000,
        ),
      );
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

  Future<void> _openComplete(MapSpikePoint point) async {
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => CompleteDeliveryScreen(
          point: point,
          driverId: point.driverId,
          mapSpikeService: _service,
        ),
      ),
    );
    if (ok == true) {
      await _load();
      _markersPlaced = false;
      final c = _controller;
      if (c != null && _pointsById.isNotEmpty) {
        await _placeMarkers(c);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('배송 지도 (Spike)')),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton(onPressed: _load, child: const Text('다시 시도')),
            ],
          ),
        ),
      );
    }

    final first = _pointsById.values.first;
    return Stack(
      fit: StackFit.expand,
      children: [
        KakaoMap(
          key: _mapKey,
          onMapCreated: _onMapCreated,
          initialPosition: LatLng(
            latitude: first.latitude,
            longitude: first.longitude,
          ),
          initialLevel: 17,
        ),
        ValueListenableBuilder<bool>(
          valueListenable: _pinAdjustMode,
          builder: (context, adjusting, _) {
            if (!adjusting) {
              return ValueListenableBuilder<String?>(
                valueListenable: _selectedPointId,
                builder: (context, selectedId, _) {
                  if (selectedId != null) return const SizedBox.shrink();
                  return const Align(
                    alignment: Alignment.topCenter,
                    child: SafeArea(
                      child: Padding(
                        padding: EdgeInsets.all(12),
                        child: _HintChip(
                          text: '배송지 핀을 탭하면 상세 정보가 표시됩니다',
                        ),
                      ),
                    ),
                  );
                },
              );
            }
            return Align(
              alignment: Alignment.bottomCenter,
              child: Material(
                elevation: 8,
                child: SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text('지도를 이동해 실제 배송 위치를 맞춘 뒤 저장하세요.'),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                onPressed: () => _pinAdjustMode.value = false,
                                child: const Text('취소'),
                              ),
                            ),
                            const SizedBox(width: 8),
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
              valueListenable: _selectedPointId,
              builder: (context, selectedId, _) {
                if (selectedId == null) return const SizedBox.shrink();
                final point = _pointsById[selectedId];
                if (point == null) return const SizedBox.shrink();
                return Align(
                  alignment: Alignment.bottomCenter,
                  child: _DeliveryDetailPanel(
                    point: point,
                    onClose: _closePanel,
                    onAdjustPin: point.isCompleted
                        ? null
                        : () => _startPinAdjust(point),
                    onComplete: point.isCompleted
                        ? null
                        : () => _openComplete(point),
                  ),
                );
              },
            );
          },
        ),
      ],
    );
  }
}

class _HintChip extends StatelessWidget {
  const _HintChip({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 2,
      borderRadius: BorderRadius.circular(20),
      color: Theme.of(context).colorScheme.surface.withValues(alpha: 0.95),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        child: Text(text, style: Theme.of(context).textTheme.bodySmall),
      ),
    );
  }
}

/// Bottom overlay for one selected DeliveryPoint. Closable via X or drag down.
class _DeliveryDetailPanel extends StatelessWidget {
  const _DeliveryDetailPanel({
    required this.point,
    required this.onClose,
    this.onAdjustPin,
    this.onComplete,
  });

  final MapSpikePoint point;
  final VoidCallback onClose;
  final VoidCallback? onAdjustPin;
  final VoidCallback? onComplete;

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Material(
      elevation: 12,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
      clipBehavior: Clip.antiAlias,
      child: SafeArea(
        top: false,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onVerticalDragEnd: (details) {
            if ((details.primaryVelocity ?? 0) > 200) {
              onClose();
            }
          },
          child: Padding(
            padding: EdgeInsets.fromLTRB(16, 8, 8, 16 + bottom),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 8),
                    decoration: BoxDecoration(
                      color: Theme.of(context).dividerColor,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '배송지 상세',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                    IconButton(
                      tooltip: '닫기',
                      onPressed: onClose,
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                _row(context, '배송사', point.carrier),
                _row(context, '상품', point.product),
                _row(context, '수량', '${point.quantity}개'),
                _row(context, '고객', point.customerName),
                _row(context, '주소', point.address),
                _row(context, '상세주소', point.detailAddress),
                _row(context, '상태', point.status),
                const SizedBox(height: 8),
                Text(
                  'provider: ${point.provider}\n'
                  'pinAccuracy: ${point.pinAccuracy}\n'
                  'lat: ${point.latitude}\n'
                  'lng: ${point.longitude}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                if (onAdjustPin != null || onComplete != null) ...[
                  const SizedBox(height: 12),
                  if (onAdjustPin != null)
                    OutlinedButton(
                      onPressed: onAdjustPin,
                      child: const Text('핀 위치 수정'),
                    ),
                  if (onComplete != null) ...[
                    const SizedBox(height: 8),
                    FilledButton.icon(
                      onPressed: onComplete,
                      icon: const Icon(Icons.check_circle_outline),
                      label: const Text('배송완료'),
                    ),
                  ],
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _row(BuildContext context, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 72,
            child: Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}
