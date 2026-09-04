import '../models/map_spike_point.dart';
import '../models/today_workset.dart';
import 'delivery_detail_data.dart';

enum CompleteUiPhase { idle, submitting, success, offlineQueued, error }

enum CompleteNavAction { close, next, map, list }

enum CompleteSubmitKind { confirmed, queued }

class CompleteFlowResult {
  const CompleteFlowResult({
    required this.queued,
    required this.confirmed,
    this.action = CompleteNavAction.close,
    this.nextPointId,
  });

  final bool queued;
  final bool confirmed;
  final CompleteNavAction action;
  final String? nextPointId;

  bool get applied => queued || confirmed;
}

/// Actual POD capabilities of CompleteDeliveryScreen. Do not invent extras.
abstract final class PodFieldInventory {
  static const capabilities = ['photo'];
  static const requiredFields = ['photo'];
  static const optionalFields = <String>[];
  static const unsupportedFakeFields = [
    'signature',
    'recipientType',
    'placementType',
    'note',
    'gpsProof',
  ];
}

String completePointHeader(MapSpikePoint point) => detailPointHeader(point);

int completeDeliveryCount({
  required MapSpikePoint point,
  int? shipmentCount,
}) =>
    detailDeliveryCount(point: point, shipmentCount: shipmentCount);

String completeCountsLine({
  required MapSpikePoint point,
  int? shipmentCount,
}) {
  final count = completeDeliveryCount(
    point: point,
    shipmentCount: shipmentCount,
  );
  return '배송 $count건 · 물량 ${point.quantity}';
}

/// First subsequent open Point in existing order. Does not wrap or reorder.
MapSpikePoint? nextOpenPointAfter({
  required List<MapSpikePoint> ordered,
  required String currentPointId,
}) {
  final idx = ordered.indexWhere((p) => p.pointId == currentPointId);
  if (idx < 0) return null;
  for (var i = idx + 1; i < ordered.length; i++) {
    if (!ordered[i].isCompleted) return ordered[i];
  }
  return null;
}

WorksetPoint? nextOpenWorksetPointAfter({
  required List<WorksetPoint> ordered,
  required String currentPointId,
}) {
  final idx = ordered.indexWhere((p) => p.pointId == currentPointId);
  if (idx < 0) return null;
  for (var i = idx + 1; i < ordered.length; i++) {
    if (!ordered[i].isCompleted) return ordered[i];
  }
  return null;
}

CompleteFlowResult? parseCompleteFlowResult(Object? raw) {
  if (raw is CompleteFlowResult) return raw;
  if (raw == true) {
    return const CompleteFlowResult(queued: false, confirmed: true);
  }
  if (raw is Map && raw['optimistic'] == true) {
    return CompleteFlowResult(
      queued: true,
      confirmed: false,
      nextPointId: raw['pointId'] as String?,
    );
  }
  return null;
}

bool completeSubmitBlocked(CompleteUiPhase phase) =>
    phase == CompleteUiPhase.submitting ||
    phase == CompleteUiPhase.success ||
    phase == CompleteUiPhase.offlineQueued;
