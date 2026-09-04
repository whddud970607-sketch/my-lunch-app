import '../map/workset_map_filter.dart';
import '../models/map_spike_point.dart';
import '../models/today_workset.dart';
import 'home_dashboard_data.dart';

enum DeliveryListStatusFilter { all, open, completed }

enum DeliveryAddressSearchPhase { idle, loading, error }

/// Hint: local displayLabel + authorized server address search.
const String deliveryListSearchHint = '주소·표시명 검색';

final _whitespace = RegExp(r'\s+');
final _dongOrHoGap = RegExp(r'([0-9a-z]+)\s+(동|호)');

/// Trim, collapse internal whitespace, Latin case-fold. Empty/whitespace → ''.
String normalizeDeliverySearchQuery(String raw) {
  return raw.trim().replaceAll(_whitespace, ' ').toLowerCase();
}

/// Deterministic "504 동" / "2003 호" compacting. Does not rewrite addresses.
String compactDeliverySearchHaystack(String normalized) {
  return normalized.replaceAllMapped(
    _dongOrHoGap,
    (match) => '${match[1]}${match[2]}',
  );
}

/// Local [displayLabel] match. Does not search ids, company, or network fields.
bool deliveryPointMatchesSearch(WorksetPoint point, String searchQuery) {
  final query = normalizeDeliverySearchQuery(searchQuery);
  if (query.isEmpty) return true;
  final haystack = normalizeDeliverySearchQuery(pointCardTitle(point));
  if (haystack.contains(query)) return true;
  return compactDeliverySearchHaystack(haystack)
      .contains(compactDeliverySearchHaystack(query));
}

/// Presentation-only list projection. Does not reorder [TodayWorkset.points].
List<WorksetPoint> visibleDeliveryPoints({
  required TodayWorkset workset,
  DeliveryListStatusFilter status = DeliveryListStatusFilter.all,
  WorksetMapFilter mapFilter = WorksetMapFilter.all,
  String searchQuery = '',
  Set<String> addressMatchPointIds = const {},
}) {
  final out = <WorksetPoint>[];
  final query = normalizeDeliverySearchQuery(searchQuery);
  for (final point in workset.points) {
    if (status == DeliveryListStatusFilter.open && point.isCompleted) {
      continue;
    }
    if (status == DeliveryListStatusFilter.completed && !point.isCompleted) {
      continue;
    }
    if (!_matchesMapFilter(point, mapFilter, workset)) continue;
    if (query.isNotEmpty) {
      final local = deliveryPointMatchesSearch(point, searchQuery);
      final addressHit = addressMatchPointIds.contains(point.pointId);
      if (!local && !addressHit) continue;
    }
    out.add(point);
  }
  return List<WorksetPoint>.unmodifiable(out);
}

bool _matchesMapFilter(
  WorksetPoint point,
  WorksetMapFilter filter,
  TodayWorkset workset,
) {
  if (filter is WorksetMapFilterAll) return true;
  if (filter is WorksetMapFilterCompany) {
    return point.companyId == filter.companyId;
  }
  if (filter is WorksetMapFilterSource) {
    return point.sourceId == filter.sourceId;
  }
  if (filter is WorksetMapFilterManual) {
    return workset.sourceById(point.sourceId)?.isManual == true;
  }
  return true;
}

String deliveryPointStatusLabel(WorksetPoint point) =>
    point.isCompleted ? '완료' : '미완료';

String deliveryPointMeta(WorksetPoint point) {
  return '배송 ${point.shipmentCount}건 · 물량 ${point.quantity}';
}

String deliveryPointTitle(WorksetPoint point) => pointCardTitle(point);

/// Existing detail panel domain. Lat/lng are constructor-only; list never
/// invents a focus coordinate for the map tab.
MapSpikePoint worksetPointToDetailPoint({
  required TodayWorkset workset,
  required WorksetPoint point,
  required String driverId,
}) {
  final source = workset.sourceById(point.sourceId);
  final company = workset.companyById(point.companyId);
  final shipments = workset.shipments
      .where((s) => s.pointId == point.pointId)
      .map((s) => s.toDeliveryShipment())
      .toList(growable: false);
  return MapSpikePoint(
    geocodeProvider: 'kakao',
    pinAccuracy: point.pinAccuracy,
    latitude: point.latitude ?? 0,
    longitude: point.longitude ?? 0,
    carrier: '',
    customerName: '',
    address: '',
    detailAddress: '',
    product: point.displayLabel,
    quantity: point.quantity,
    status: point.isCompleted ? '완료' : '미완료',
    statusCode: point.status,
    pointId: point.pointId,
    jobId: point.jobId,
    driverId: driverId,
    piiMasked: point.piiMasked,
    contactType: 'none',
    contactValue: null,
    hasAccessInfo: point.hasAccessInfo,
    fixtureGroup: 'other',
    shipments: shipments,
    companyId: point.companyId,
    sourceId: point.sourceId,
    companyLabel: company?.displayName,
    sourceLabel: source?.displayName,
  );
}
