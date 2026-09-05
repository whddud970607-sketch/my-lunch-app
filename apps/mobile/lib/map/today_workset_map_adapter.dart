import '../models/map_spike_point.dart';
import '../models/today_workset.dart';
import 'workset_map_filter.dart';

/// Maps Today Workset projection → map pin domain ([MapSpikePoint]).
///
/// No fixture soft-enrich. PII comes from lazy GET /delivery/points/:id.
class TodayWorksetMapAdapter {
  const TodayWorksetMapAdapter._();

  static List<MapSpikePoint> toMapPoints(
    TodayWorkset workset, {
    required String driverId,
  }) {
    final shipmentsByPoint = <String, List<WorksetShipment>>{};
    for (final s in workset.shipments) {
      (shipmentsByPoint[s.pointId] ??= <WorksetShipment>[]).add(s);
    }

    final out = <MapSpikePoint>[];
    for (final p in workset.points) {
      if (!isRenderableWorksetPoint(p)) continue;
      final source = workset.sourceById(p.sourceId);
      final company = workset.companyById(p.companyId);
      final shipments = (shipmentsByPoint[p.pointId] ?? const <WorksetShipment>[])
          .map((s) => s.toDeliveryShipment())
          .toList(growable: false);
      final statusCode = p.status;
      out.add(
        MapSpikePoint(
          geocodeProvider: 'kakao',
          pinAccuracy: p.pinAccuracy,
          latitude: p.latitude!,
          longitude: p.longitude!,
          carrier: '',
          customerName: p.piiMasked ? '****' : '',
          address: p.piiMasked ? '****' : '',
          detailAddress: p.piiMasked ? '****' : '',
          product: p.displayLabel,
          quantity: p.quantity,
          status: _statusLabel(statusCode),
          statusCode: statusCode,
          pointId: p.pointId,
          jobId: p.jobId,
          driverId: driverId,
          piiMasked: p.piiMasked,
          contactType: 'none',
          contactValue: null,
          hasAccessInfo: p.hasAccessInfo,
          fixtureGroup: 'other',
          shipments: shipments,
          companyId: p.companyId,
          sourceId: p.sourceId,
          companyLabel: company?.displayName,
          sourceLabel: source?.displayName,
        ),
      );
    }
    return out;
  }

  /// One bad/missing coordinate must not block the map host.
  static bool isRenderableWorksetPoint(WorksetPoint p) {
    return p.pointId.isNotEmpty && p.hasCoordinates && isFiniteLatLng(p.latitude, p.longitude);
  }

  static bool isRenderableMapPoint(MapSpikePoint point) {
    return point.pointId.isNotEmpty &&
        isFiniteLatLng(point.latitude, point.longitude);
  }

  static List<MapSpikePoint> retainRenderableMapPoints(
    Iterable<MapSpikePoint> points,
  ) {
    return points.where(isRenderableMapPoint).toList(growable: false);
  }

  static bool isFiniteLatLng(double? latitude, double? longitude) {
    if (latitude == null || longitude == null) return false;
    if (!latitude.isFinite || !longitude.isFinite) return false;
    if (latitude == 0 && longitude == 0) return false;
    if (latitude < -90 || latitude > 90) return false;
    if (longitude < -180 || longitude > 180) return false;
    return true;
  }

  static List<MapSpikePoint> applyFilter(
    Iterable<MapSpikePoint> points,
    WorksetMapFilter filter, {
    required TodayWorkset? workset,
  }) {
    if (filter is WorksetMapFilterAll) {
      return List<MapSpikePoint>.unmodifiable(points);
    }
    if (filter is WorksetMapFilterCompany) {
      return points
          .where((p) => p.companyId == filter.companyId)
          .toList(growable: false);
    }
    if (filter is WorksetMapFilterSource) {
      return points
          .where((p) => p.sourceId == filter.sourceId)
          .toList(growable: false);
    }
    if (filter is WorksetMapFilterManual) {
      final manualIds = <String>{};
      if (workset != null) {
        for (final s in workset.sources) {
          if (s.isManual) manualIds.add(s.id);
        }
      }
      return points
          .where(
            (p) =>
                (p.sourceId != null && manualIds.contains(p.sourceId)) ||
                (p.companyId == null &&
                    workset?.sourceById(p.sourceId)?.isManual == true),
          )
          .toList(growable: false);
    }
    return List<MapSpikePoint>.unmodifiable(points);
  }

  static String _statusLabel(String code) {
    switch (code) {
      case 'completed':
        return '배송 완료';
      case 'out_for_delivery':
      case 'in_progress':
        return '배송중';
      case 'failed':
        return '실패';
      default:
        return '대기';
    }
  }
}
