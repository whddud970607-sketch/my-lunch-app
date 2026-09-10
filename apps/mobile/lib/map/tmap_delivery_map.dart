import 'dart:async';
import 'dart:io' show Platform;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../config/app_config.dart';
import '../location/driver_location_icon_factory.dart';
import '../location/driver_location_marker_state.dart';
import '../navigation/point_external_navi.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import 'delivery_location_pin.dart';
import 'delivery_map_controller.dart';
import 'driver_marker_interpolator.dart';
import 'pin_visual_status.dart';
import 'quantity_pin_icon.dart';
import 'tmap_map_feature.dart';

/// TMAP Vector Map host — renderer adapter for Delivery Shield state (MP-C3).
///
/// Flutter owns pins / selection / driver GPS. Native [TMapView] only renders.
class TmapDeliveryMap extends StatefulWidget {
  const TmapDeliveryMap({
    super.key,
    required this.initialTarget,
    required this.pins,
    required this.onPinTap,
    required this.onReady,
    this.selectedMarkerId,
  });

  final DeliveryLatLng initialTarget;
  final List<DeliveryLocationPin> pins;
  final DeliveryPinTapCallback onPinTap;
  final DeliveryMapReadyCallback onReady;

  /// Flutter-owned selection (restored after provider remount).
  final String? selectedMarkerId;

  @override
  State<TmapDeliveryMap> createState() => _TmapDeliveryMapState();
}

enum _TmapMapUiState {
  creating,
  authPending,
  authFailed,
  mapReady,
  mapFailed,
  unsupported,
}

class _TmapDeliveryMapState extends State<TmapDeliveryMap>
    implements DeliveryMapController {
  static const _viewType = 'delivery_shield/tmap_vector_map';

  MethodChannel? _channel;
  _TmapMapUiState _uiState = _TmapMapUiState.creating;
  String? _errorMessage;
  bool _readyNotified = false;
  bool _mapReady = false;
  List<DeliveryLocationPin> _pins = const [];
  DriverLocationMarkerState? _pendingDriver;
  void Function()? _onUserGesture;
  bool _programmaticCameraMove = false;
  late DriverMarkerInterpolator _driverInterp;
  DriverLocationMarkerState? _driverTruth;
  int _driverIconGen = 0;
  Uint8List? _lastDriverIconBytes;
  String? _lastDriverIconKey;
  DateTime? _lastDriverPushAt;

  final Map<String, Uint8List> _pinIconCache = {};

  @override
  void initState() {
    super.initState();
    _driverInterp = DriverMarkerInterpolator(onTick: _onDriverVisualTick);
    _pins = List<DeliveryLocationPin>.unmodifiable(widget.pins);
    if (!TmapMapFeature.isConfigured) {
      _uiState = _TmapMapUiState.authFailed;
      _errorMessage = 'missing_api_key';
    } else if (kIsWeb || !Platform.isAndroid) {
      _uiState = _TmapMapUiState.unsupported;
      _errorMessage = 'android_only';
    }
  }

  @override
  void didUpdateWidget(TmapDeliveryMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    _pins = List<DeliveryLocationPin>.unmodifiable(widget.pins);
    if (_mapReady && oldWidget.selectedMarkerId != widget.selectedMarkerId) {
      unawaited(
        _applySelectionChange(
          oldWidget.selectedMarkerId,
          widget.selectedMarkerId,
        ),
      );
    }
  }

  Future<void> _applySelectionChange(String? previous, String? next) async {
    await _setSelectedMarkerId(next);
    for (final id in <String?>{previous, next}) {
      if (id == null) continue;
      DeliveryLocationPin? pin;
      for (final p in _pins) {
        if (p.markerId == id) {
          pin = p;
          break;
        }
      }
      if (pin != null) {
        await upsertPin(pin);
      }
    }
  }

  @override
  void dispose() {
    _driverInterp.dispose();
    _channel?.setMethodCallHandler(null);
    _channel = null;
    _mapReady = false;
    super.dispose();
  }

  void _onPlatformViewCreated(int id) {
    final channel = MethodChannel('delivery_shield/tmap_vector_map_$id');
    _channel?.setMethodCallHandler(null);
    _channel = channel;
    channel.setMethodCallHandler(_onNativeCall);
    if (!mounted) return;
    setState(() {
      _uiState = _TmapMapUiState.authPending;
      _errorMessage = null;
    });
  }

  Future<void> _onNativeCall(MethodCall call) async {
    if (!mounted) return;
    switch (call.method) {
      case 'onState':
        final state = _stringArg(call.arguments, 'state');
        if (state == 'AUTH_PENDING') {
          setState(() {
            _uiState = _TmapMapUiState.authPending;
            _errorMessage = null;
          });
        }
        break;
      case 'onAuthSuccess':
        setState(() {
          _uiState = _TmapMapUiState.authPending;
          _errorMessage = null;
        });
        break;
      case 'onAuthFailed':
        setState(() {
          _uiState = _TmapMapUiState.authFailed;
          _errorMessage =
              _stringArg(call.arguments, 'message') ?? 'auth_failed';
        });
        break;
      case 'onMapReady':
        setState(() {
          _uiState = _TmapMapUiState.mapReady;
          _errorMessage = null;
        });
        _mapReady = true;
        await syncPins(_pins);
        await _setSelectedMarkerId(widget.selectedMarkerId);
        final pending = _pendingDriver;
        if (pending != null) {
          // Remount / MAP_READY: snap to last truth (no backlog animation).
          _driverTruth = pending;
          _lastDriverPushAt = null;
          _driverInterp.snapTo(
            latitude: pending.latitude,
            longitude: pending.longitude,
            headingDegrees: pending.headingDegrees,
          );
        }
        if (!_readyNotified) {
          _readyNotified = true;
          widget.onReady(this);
        }
        break;
      case 'onMapFailed':
        setState(() {
          _uiState = _TmapMapUiState.mapFailed;
          _errorMessage = _stringArg(call.arguments, 'message') ?? 'map_failed';
        });
        break;
      case 'onPinTap':
        final id = _stringArg(call.arguments, 'markerId');
        if (id != null) {
          widget.onPinTap(id);
          await _setSelectedMarkerId(id);
        }
        break;
      case 'onUserGesture':
        if (_programmaticCameraMove) {
          _programmaticCameraMove = false;
          return;
        }
        // Follow must NOT turn OFF on gesture (locked product policy).
        _onUserGesture?.call();
        break;
    }
  }

  String? _stringArg(dynamic args, String key) {
    if (args is Map) {
      final value = args[key];
      if (value is String && value.trim().isNotEmpty) {
        return value.trim();
      }
    }
    return null;
  }

  Future<void> _invoke(String method, [dynamic args]) async {
    final channel = _channel;
    if (channel == null) return;
    try {
      await channel.invokeMethod<void>(method, args);
    } catch (e) {
      debugPrint('tmap-map invoke $method failed: $e');
    }
  }

  Future<Uint8List> _pinIconBytes(
    DeliveryLocationPin pin, {
    required bool selected,
  }) async {
    final cacheKey =
        '${pin.totalQuantity}:${pin.visualStatus.styleKey}:sel=$selected';
    final cached = _pinIconCache[cacheKey];
    if (cached != null) return cached;
    final base = await QuantityPinIconFactory.bytesForQuantity(
      pin.totalQuantity,
      status: pin.visualStatus,
    );
    final bytes = selected ? await _withSelectionRing(base) : base;
    _pinIconCache[cacheKey] = bytes;
    return bytes;
  }

  Future<Uint8List> _withSelectionRing(Uint8List png) async {
    final codec = await ui.instantiateImageCodec(png);
    final frame = await codec.getNextFrame();
    final src = frame.image;
    final size = src.width.toDouble();
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    final paint = Paint()..isAntiAlias = true;
    canvas.drawImage(src, Offset.zero, paint);
    final ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = size * 0.07
      ..color = const Color(0xFFFFC107);
    canvas.drawCircle(Offset(size / 2, size / 2), size * 0.42, ring);
    final picture = recorder.endRecording();
    final out = await picture.toImage(src.width, src.height);
    final bd = await out.toByteData(format: ui.ImageByteFormat.png);
    src.dispose();
    out.dispose();
    return bd!.buffer.asUint8List();
  }

  Future<Map<String, dynamic>?> _pinPayload(DeliveryLocationPin pin) async {
    if (!PointExternalNavi.isValidCoordinate(pin.latitude, pin.longitude)) {
      return null;
    }
    final selected = pin.markerId == widget.selectedMarkerId;
    final icon = await _pinIconBytes(pin, selected: selected);
    return <String, dynamic>{
      'markerId': pin.markerId,
      'latitude': pin.latitude,
      'longitude': pin.longitude,
      'quantity': pin.totalQuantity,
      'visualStatus': pin.visualStatus.styleKey,
      'selected': selected,
      'iconBytes': icon,
    };
  }

  Future<void> _setSelectedMarkerId(String? markerId) async {
    await _invoke('setSelectedMarkerId', <String, dynamic>{
      'markerId': markerId,
    });
  }

  Map<String, dynamic> get _creationParams {
    final cfg = AppConfig.instance;
    return <String, dynamic>{
      'apiKey': cfg.tmapApiKey.trim(),
      'latitude': widget.initialTarget.latitude,
      'longitude': widget.initialTarget.longitude,
    };
  }

  @override
  void setUserGestureListener(void Function()? onUserGesture) {
    _onUserGesture = onUserGesture;
  }

  @override
  Future<DeliveryLatLng?> getCenter() async {
    final channel = _channel;
    if (channel == null || !_mapReady) return null;
    try {
      final raw = await channel.invokeMethod<dynamic>('getCenter');
      if (raw is Map) {
        final lat = (raw['latitude'] as num?)?.toDouble();
        final lng = (raw['longitude'] as num?)?.toDouble();
        if (lat != null && lng != null) {
          return DeliveryLatLng(latitude: lat, longitude: lng);
        }
      }
    } catch (e) {
      debugPrint('tmap-map getCenter failed: $e');
    }
    return null;
  }

  @override
  Future<void> syncPins(List<DeliveryLocationPin> pins) async {
    _pins = List<DeliveryLocationPin>.unmodifiable(pins);
    final payloads = <Map<String, dynamic>>[];
    for (final pin in pins) {
      try {
        final p = await _pinPayload(pin);
        if (p != null) payloads.add(p);
      } catch (e) {
        debugPrint('tmap-map pin payload failed id=${pin.markerId}: $e');
      }
    }
    await _invoke('syncPins', payloads);
  }

  @override
  Future<void> removePin(String markerId) async {
    _pins = _pins.where((p) => p.markerId != markerId).toList(growable: false);
    await _invoke('removePin', <String, dynamic>{'markerId': markerId});
  }

  @override
  Future<void> upsertPin(DeliveryLocationPin pin) async {
    _pins = [..._pins.where((p) => p.markerId != pin.markerId), pin];
    final payload = await _pinPayload(pin);
    if (payload == null) return;
    await _invoke('upsertPin', payload);
  }

  @override
  Future<void> moveCamera(
    DeliveryLatLng target, {
    double? zoom,
    bool programmatic = false,
    bool followUpdate = false,
  }) async {
    if (programmatic) _programmaticCameraMove = true;
    final double? resolvedZoom;
    if (zoom != null) {
      resolvedZoom = zoom;
    } else if (followUpdate) {
      // Preserve user pinch zoom (shared Follow contract).
      resolvedZoom = null;
    } else {
      resolvedZoom = _pins.length > 1 ? 14.0 : 17.0;
    }
    await _invoke('moveCamera', <String, dynamic>{
      'latitude': target.latitude,
      'longitude': target.longitude,
      if (resolvedZoom != null) 'zoom': resolvedZoom.round(),
      // Follow: short animated recenter without zoom. Initial: animated center.
      'animated': true,
      'followUpdate': followUpdate,
    });
  }

  void _onDriverVisualTick(double lat, double lng, double? heading) {
    if (!_mapReady || !mounted) return;
    final now = DateTime.now();
    final last = _lastDriverPushAt;
    // Throttle channel spam; always allow final settle via snap path.
    if (last != null &&
        now.difference(last) < const Duration(milliseconds: 48)) {
      return;
    }
    _lastDriverPushAt = now;
    unawaited(_pushDriverVisual(lat, lng, heading));
  }

  Future<void> _pushDriverVisual(
    double lat,
    double lng,
    double? heading,
  ) async {
    final truth = _driverTruth;
    if (truth == null) return;
    final gen = ++_driverIconGen;
    final iconKey =
        '${truth.vehicle.name}:${heading?.round() ?? truth.headingDegrees?.round()}:'
        '${truth.accuracyMeters.round()}:${truth.sessionActive}';
    Uint8List icon;
    if (_lastDriverIconKey == iconKey && _lastDriverIconBytes != null) {
      icon = _lastDriverIconBytes!;
    } else {
      icon = await DriverLocationIconFactory.rotatedBytesFor(
        vehicle: truth.vehicle,
        headingDegrees: heading ?? truth.headingDegrees,
        accuracyMeters: truth.accuracyMeters,
        sessionActive: truth.sessionActive,
      );
      if (!mounted || gen != _driverIconGen) return;
      _lastDriverIconKey = iconKey;
      _lastDriverIconBytes = icon;
    }
    if (!mounted || gen != _driverIconGen || !_mapReady) return;
    await _invoke('upsertDriverMarker', <String, dynamic>{
      'latitude': lat,
      'longitude': lng,
      'headingDegrees': ?heading,
      'iconBytes': icon,
    });
  }

  @override
  Future<void> upsertDriverMarker(DriverLocationMarkerState state) async {
    if (!PointExternalNavi.isValidCoordinate(state.latitude, state.longitude)) {
      return;
    }
    _pendingDriver = state;
    _driverTruth = state;
    if (!_mapReady) {
      return;
    }
    if (!_driverInterp.hasVisual) {
      _lastDriverPushAt = null;
      _driverInterp.snapTo(
        latitude: state.latitude,
        longitude: state.longitude,
        headingDegrees: state.headingDegrees,
      );
      return;
    }
    _driverInterp.animateTo(
      latitude: state.latitude,
      longitude: state.longitude,
      headingDegrees: state.headingDegrees,
    );
  }

  @override
  Future<void> removeDriverMarker() async {
    _pendingDriver = null;
    _driverTruth = null;
    _lastDriverIconBytes = null;
    _lastDriverIconKey = null;
    _driverInterp.dispose();
    _driverInterp = DriverMarkerInterpolator(onTick: _onDriverVisualTick);
    await _invoke('removeDriverMarker');
  }

  @override
  Future<void> setRoutePolyline(List<DeliveryLatLng> points) async {
    // MP-C3: not implemented (deferred).
  }

  @override
  Future<void> clearRoutePolyline() async {}

  @override
  Future<void> setSessionEndpoints({
    DeliveryLatLng? start,
    DeliveryLatLng? end,
  }) async {
    // MP-C3: not required.
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    if (_uiState == _TmapMapUiState.unsupported) {
      return _StatusPanel(
        title: '티맵 지도',
        message: '티맵 벡터 지도는 Android에서만 지원됩니다.',
        color: scheme.errorContainer,
        foreground: scheme.onErrorContainer,
      );
    }

    if (_uiState == _TmapMapUiState.authFailed &&
        !TmapMapFeature.isConfigured) {
      return _StatusPanel(
        title: '티맵 지도',
        message:
            '티맵 API 키가 설정되지 않았습니다. Settings에서 티맵을 '
            '선택해도 지도를 표시할 수 없습니다.',
        color: scheme.errorContainer,
        foreground: scheme.onErrorContainer,
      );
    }

    return Stack(
      fit: StackFit.expand,
      children: [
        if (TmapMapFeature.isConfigured && Platform.isAndroid)
          AndroidView(
            viewType: _viewType,
            layoutDirection: TextDirection.ltr,
            creationParams: _creationParams,
            creationParamsCodec: const StandardMessageCodec(),
            onPlatformViewCreated: _onPlatformViewCreated,
          ),
        if (_uiState == _TmapMapUiState.creating ||
            _uiState == _TmapMapUiState.authPending)
          const ColoredBox(
            color: Color(0x66FFFFFF),
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: AppSpacing.md),
                  Text('티맵 지도 준비 중…'),
                ],
              ),
            ),
          ),
        if (_uiState == _TmapMapUiState.authFailed ||
            _uiState == _TmapMapUiState.mapFailed)
          _StatusPanel(
            title: '티맵 지도를 열 수 없습니다',
            message: _friendlyError(_errorMessage),
            color: scheme.errorContainer,
            foreground: scheme.onErrorContainer,
          ),
      ],
    );
  }

  String _friendlyError(String? code) {
    switch (code) {
      case 'missing_api_key':
        return '티맵 API 키가 없습니다.';
      case 'auth_failed':
        return '티맵 지도 인증에 실패했습니다. 키/상품 권한을 확인하세요.';
      case 'map_failed':
        return '티맵 지도 초기화에 실패했습니다.';
      default:
        if (code == null || code.isEmpty) {
          return '티맵 지도 초기화에 실패했습니다.';
        }
        return '티맵 지도 오류 ($code)';
    }
  }
}

class _StatusPanel extends StatelessWidget {
  const _StatusPanel({
    required this.title,
    required this.message,
    required this.color,
    required this.foreground,
  });

  final String title;
  final String message;
  final Color color;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: color,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                title,
                style: AppTypography.textTheme.titleMedium?.copyWith(
                  color: foreground,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                message,
                style: AppTypography.textTheme.bodyMedium?.copyWith(
                  color: foreground,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
