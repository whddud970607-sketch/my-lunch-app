import '../models/map_spike_point.dart';
import 'pin_visual_status.dart';

/// One map pin for a delivery location (may aggregate several points).
///
/// Quantity on the pin is always the **sum of delivery quantities**,
/// never the count of jobs/points.
///
/// [routeOrder] is reserved for future AI route recommendation (null = off /
/// original order). Pin UI can later show order + quantity together.
class DeliveryLocationPin {
  const DeliveryLocationPin({
    required this.markerId,
    required this.latitude,
    required this.longitude,
    required this.totalQuantity,
    required this.points,
    required this.visualStatus,
    this.routeOrder,
  });

  /// Kakao marker id (single pointId, or stable cluster key).
  final String markerId;
  final double latitude;
  final double longitude;

  /// Sum of [MapSpikePoint.quantity] at this location.
  final int totalQuantity;

  /// All delivery points at this location (same coords / location key).
  final List<MapSpikePoint> points;

  /// Red vs gray (and future failed/retry) pin chrome.
  final PinVisualStatus visualStatus;

  /// 1-based recommended stop order when AI routing is ON; null when OFF.
  final int? routeOrder;

  /// Primary point for detail panel (prefer incomplete, else first).
  MapSpikePoint get primaryPoint {
    for (final p in points) {
      if (!p.isCompleted) return p;
    }
    return points.first;
  }

  bool get isCluster => points.length > 1;
}

/// Groups points that share the same delivery location and sums quantities.
List<DeliveryLocationPin> groupPointsByLocation(
  Iterable<MapSpikePoint> points, {
  Map<String, int>? routeOrderByPointId,
}) {
  final buckets = <String, List<MapSpikePoint>>{};
  for (final p in points) {
    final key = locationKeyFor(p.latitude, p.longitude);
    (buckets[key] ??= <MapSpikePoint>[]).add(p);
  }

  final pins = <DeliveryLocationPin>[];
  for (final entry in buckets.entries) {
    final group = entry.value;
    final first = group.first;
    final totalQty = group.fold<int>(0, (sum, p) => sum + p.quantity);
    final markerId = group.length == 1
        ? first.pointId
        : 'loc:${entry.key}';

    int? routeOrder;
    if (routeOrderByPointId != null) {
      for (final p in group) {
        final o = routeOrderByPointId[p.pointId];
        if (o == null) continue;
        if (routeOrder == null || o < routeOrder) routeOrder = o;
      }
    }

    pins.add(
      DeliveryLocationPin(
        markerId: markerId,
        latitude: first.latitude,
        longitude: first.longitude,
        totalQuantity: totalQty,
        points: List<MapSpikePoint>.unmodifiable(group),
        visualStatus: pinVisualStatusForStatusCodes(
          group.map((p) => p.statusCode),
        ),
        routeOrder: routeOrder,
      ),
    );
  }
  return pins;
}

/// Stable location key for same-building / same-pin aggregation.
String locationKeyFor(double latitude, double longitude) {
  return '${latitude.toStringAsFixed(6)},${longitude.toStringAsFixed(6)}';
}
