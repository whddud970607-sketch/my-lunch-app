import 'package:flutter/material.dart';

import '../copy/delivery_report_copy.dart';
import '../map/delivery_map_controller.dart';
import '../map/delivery_map_surface.dart';
import '../map/map_provider_id.dart';
import '../map/map_provider_settings.dart';
import '../models/delivery_session.dart';
import '../services/api_client.dart';
import '../state/delivery_session_controller.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import '../widgets/ds_card.dart';
import '../widgets/ds_primary_button.dart';
import 'workday_report_data.dart';
import 'workday_report_keys.dart';

class DeliveryReportScreen extends StatefulWidget {
  const DeliveryReportScreen({
    super.key,
    required this.apiClient,
    required this.sessionController,
    this.sessionId,
    this.workdayId,
  }) : assert(
          sessionId != null || workdayId != null,
          'sessionId or workdayId required',
        );

  final ApiClient apiClient;
  final DeliverySessionController sessionController;
  final String? sessionId;
  final String? workdayId;

  @override
  State<DeliveryReportScreen> createState() => _DeliveryReportScreenState();
}

class _DeliveryReportScreenState extends State<DeliveryReportScreen> {
  bool _loading = true;
  String? _error;
  DeliveryProgressCounts _progress = const DeliveryProgressCounts(
    totalPoints: 0,
    completedPoints: 0,
    incompletePoints: 0,
  );
  int? _durationSeconds;
  List<DeliveryLatLng> _route = const [];
  DeliveryLatLng? _start;
  DeliveryLatLng? _end;
  MapProviderId _provider = MapProviderId.kakao;
  DeliveryMapController? _map;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      _provider = await MapProviderSettings.load();
      final report = widget.workdayId != null
          ? await widget.sessionController.loadReport(
              workdayId: widget.workdayId,
            )
          : await widget.sessionController.loadReport(
              sessionId: widget.sessionId,
            );
      if (report == null) {
        setState(() {
          _error = '리포트를 불러오지 못했습니다.';
          _loading = false;
        });
        return;
      }

      if (widget.workdayId != null) {
        await _applyWorkdayReport(report);
      } else {
        await _applySessionReport(report);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = '리포트를 불러오지 못했습니다.';
        _loading = false;
      });
    }
  }

  Future<void> _applySessionReport(Map<String, dynamic> report) async {
    final sessionJson = report['session'] as Map<String, dynamic>?;
    final session =
        sessionJson != null ? DeliverySession.fromJson(sessionJson) : null;
    final progress = DeliveryProgressCounts.fromJson(
      report['progress'] as Map<String, dynamic>?,
    );
    final routeJson = report['route'] as Map<String, dynamic>?;
    final pointsJson = routeJson?['points'] as List<dynamic>? ?? const [];
    final route = pointsJson
        .whereType<Map<String, dynamic>>()
        .map(
          (p) => DeliveryLatLng(
            latitude: (p['latitude'] as num).toDouble(),
            longitude: (p['longitude'] as num).toDouble(),
          ),
        )
        .toList();

    DeliveryLatLng? start;
    DeliveryLatLng? end;
    final startJson = routeJson?['start'] as Map<String, dynamic>?;
    final endJson = routeJson?['end'] as Map<String, dynamic>?;
    if (startJson != null) {
      start = DeliveryLatLng(
        latitude: (startJson['latitude'] as num).toDouble(),
        longitude: (startJson['longitude'] as num).toDouble(),
      );
    }
    if (endJson != null) {
      end = DeliveryLatLng(
        latitude: (endJson['latitude'] as num).toDouble(),
        longitude: (endJson['longitude'] as num).toDouble(),
      );
    }

    int? duration = session?.durationSeconds;
    if (duration == null &&
        session?.endedAt != null &&
        session?.startedAt != null) {
      duration = session!.endedAt!.difference(session.startedAt).inSeconds;
    }

    await _finalizeLoaded(
      progress: progress,
      durationSeconds: duration,
      route: route,
      start: start,
      end: end,
    );
  }

  Future<void> _applyWorkdayReport(Map<String, dynamic> report) async {
    final progress = DeliveryProgressCounts.fromJson(
      report['progress'] as Map<String, dynamic>?,
    );
    final duration = (report['durationSeconds'] as num?)?.toInt();

    var route = <DeliveryLatLng>[];
    DeliveryLatLng? start;
    DeliveryLatLng? end;

    final routeSummary = report['route'] as Map<String, dynamic>?;
    final startJson = routeSummary?['start'] as Map<String, dynamic>?;
    final endJson = routeSummary?['end'] as Map<String, dynamic>?;
    if (startJson != null) {
      start = DeliveryLatLng(
        latitude: (startJson['latitude'] as num).toDouble(),
        longitude: (startJson['longitude'] as num).toDouble(),
      );
    }
    if (endJson != null) {
      end = DeliveryLatLng(
        latitude: (endJson['latitude'] as num).toDouble(),
        longitude: (endJson['longitude'] as num).toDouble(),
      );
    }

    final workdayId = widget.workdayId;
    if (workdayId != null) {
      try {
        final routeBody =
            await widget.sessionController.loadWorkdayRoute(workdayId);
        final segments = routeBody?['segments'] as List<dynamic>? ?? const [];
        for (final seg in segments) {
          if (seg is! Map<String, dynamic>) continue;
          final points = seg['points'] as List<dynamic>? ?? const [];
          for (final p in points) {
            if (p is! Map<String, dynamic>) continue;
            route.add(
              DeliveryLatLng(
                latitude: (p['latitude'] as num).toDouble(),
                longitude: (p['longitude'] as num).toDouble(),
              ),
            );
          }
        }
      } catch (_) {}
    }

    if (route.isEmpty && start != null && end != null) {
      route = [start, end];
    }

    await _finalizeLoaded(
      progress: progress,
      durationSeconds: duration,
      route: route,
      start: start ?? (route.isNotEmpty ? route.first : null),
      end: end ?? (route.isNotEmpty ? route.last : null),
    );
  }

  Future<void> _finalizeLoaded({
    required DeliveryProgressCounts progress,
    required int? durationSeconds,
    required List<DeliveryLatLng> route,
    required DeliveryLatLng? start,
    required DeliveryLatLng? end,
  }) async {
    if (!mounted) return;
    setState(() {
      _progress = progress;
      _durationSeconds = durationSeconds;
      _route = route;
      _start = start;
      _end = end;
      _loading = false;
    });
    await _paintRoute();
  }

  Future<void> _paintRoute() async {
    final map = _map;
    if (map == null) return;
    await map.syncPins(const []);
    await map.setRoutePolyline(_route);
    await map.setSessionEndpoints(start: _start, end: _end);
    final focus = _start ?? (_route.isNotEmpty ? _route.first : null);
    if (focus != null) {
      await map.moveCamera(focus, zoom: 13, programmatic: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final headline = DeliveryReportCopy.headline(_progress);
    final body = DeliveryReportCopy.body(
      progress: _progress,
      durationSeconds: _durationSeconds,
    );
    final metrics = workdayReportMetrics(
      progress: _progress,
      durationSeconds: _durationSeconds,
      hasRoute: _route.isNotEmpty || _start != null || _end != null,
    );

    return Scaffold(
      key: WorkdayReportKeys.screen,
      appBar: AppBar(title: const Text('오늘의 배송')),
      body: _loading
          ? const Center(
              key: WorkdayReportKeys.loading,
              child: CircularProgressIndicator(),
            )
          : _error != null
              ? _ReportError(
                  message: _error!,
                  onRetry: _load,
                )
              : ListView(
                  children: [
                    SizedBox(
                      key: WorkdayReportKeys.route,
                      height: 280,
                      child: DeliveryMapSurface(
                        providerId: _provider,
                        initialTarget: _start ??
                            const DeliveryLatLng(
                              latitude: 37.5665,
                              longitude: 126.9780,
                            ),
                        pins: const [],
                        onPinTap: (_) {},
                        onReady: (c) async {
                          _map = c;
                          await _paintRoute();
                        },
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(AppSpacing.lg),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          DsCard(
                            child: Column(
                              key: WorkdayReportKeys.metrics,
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Text(
                                  '총 배송시간',
                                  style: AppTypography.textTheme.titleMedium,
                                ),
                                Text(
                                  metrics.durationLabel,
                                  key: WorkdayReportKeys.duration,
                                  style: AppTypography.textTheme.headlineSmall,
                                ),
                                const SizedBox(height: AppSpacing.md),
                                Text(
                                  '전체 배송 ${metrics.totalPoints}건',
                                  key: WorkdayReportKeys.total,
                                ),
                                Text(
                                  '완료 ${metrics.completedPoints}건',
                                  key: WorkdayReportKeys.completed,
                                ),
                                Text(
                                  '미완료 ${metrics.remainingPoints}건',
                                  key: WorkdayReportKeys.remaining,
                                ),
                                Text(
                                  '진행 ${metrics.progressPercent}%',
                                  key: WorkdayReportKeys.progress,
                                ),
                                if (metrics.hasRoute) ...[
                                  const SizedBox(height: AppSpacing.sm),
                                  Text(
                                    '오늘 기록된 경로',
                                    style: AppTypography.textTheme.bodySmall,
                                  ),
                                ],
                                if (metrics.failedPoints > 0)
                                  Text('실패 ${metrics.failedPoints}건'),
                                if (metrics.totalQuantity > 0)
                                  Text('물량 ${metrics.totalQuantity}'),
                              ],
                            ),
                          ),
                          const SizedBox(height: AppSpacing.lg),
                          Text(
                            headline,
                            style: AppTypography.textTheme.titleMedium,
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          Text(body, style: AppTypography.textTheme.bodyMedium),
                          const SizedBox(height: AppSpacing.xl),
                          DsPrimaryButton(
                            key: WorkdayReportKeys.home,
                            label: '홈으로',
                            onPressed: () => Navigator.of(context)
                                .popUntil((r) => r.isFirst),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
    );
  }
}

class _ReportError extends StatelessWidget {
  const _ReportError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            message,
            key: WorkdayReportKeys.error,
            style: AppTypography.textTheme.bodyLarge,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: AppSpacing.md),
          DsPrimaryButton(
            key: WorkdayReportKeys.retry,
            label: '다시 시도',
            onPressed: onRetry,
          ),
        ],
      ),
    );
  }
}
