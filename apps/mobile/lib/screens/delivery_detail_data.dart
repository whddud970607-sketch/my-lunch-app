import '../models/delivery_shipment.dart';
import '../models/map_spike_point.dart';
import '../navigation/point_external_navi.dart';

const detailRevealTtl = Duration(seconds: 30);

bool isMaskedOrEmpty(String value) {
  final trimmed = value.trim();
  return trimmed.isEmpty || trimmed == '****';
}

String detailPointHeader(MapSpikePoint point) {
  final product = point.product.trim();
  if (!isMaskedOrEmpty(product)) return product;
  return '배송지';
}

String detailStatusLabel(MapSpikePoint point) =>
    point.isCompleted ? '완료' : '미완료';

int detailDeliveryCount({
  required MapSpikePoint point,
  int? shipmentCount,
  int clusteredJobCount = 1,
}) {
  if (point.shipments.isNotEmpty) return point.shipments.length;
  if (shipmentCount != null) return shipmentCount;
  return clusteredJobCount;
}

String? detailCompanyLabel(MapSpikePoint point) {
  final value = (point.companyLabel ?? '').trim();
  return value.isEmpty ? null : value;
}

String? detailSourceLabel(MapSpikePoint point) {
  final value = (point.sourceLabel ?? '').trim();
  return value.isEmpty ? null : value;
}

/// Real address field only. Never derived from [MapSpikePoint.product].
String? detailAddressLine(MapSpikePoint point) {
  if (point.piiMasked) return null;
  final value = point.address.trim();
  if (isMaskedOrEmpty(value)) return null;
  return value;
}

String? detailAddressDetailLine(MapSpikePoint point) {
  if (point.piiMasked) return null;
  final value = point.detailAddress.trim();
  if (isMaskedOrEmpty(value)) return null;
  return value;
}

String? detailMemoLine(MapSpikePoint point) {
  final value = (point.deliveryMemo ?? '').trim();
  if (isMaskedOrEmpty(value)) return null;
  return value;
}

List<DeliveryShipment> detailShipments(MapSpikePoint point) {
  return point.shipments
      .where((s) => s.trackingCode.trim().isNotEmpty)
      .toList(growable: false);
}

bool detailHasShipmentRows(MapSpikePoint point) =>
    detailShipments(point).isNotEmpty;

bool detailCanNavigate(MapSpikePoint point) =>
    PointExternalNavi.hasValidDestination(point);

bool detailShowComplete(MapSpikePoint point) => !point.isCompleted;

bool detailShowPhoneActions(MapSpikePoint point) => point.canContact;

bool detailShowAccessReveal(MapSpikePoint point) =>
    !point.isCompleted && !point.piiMasked && point.hasAccessInfo;

bool detailShowCompletedAccessPolicy(MapSpikePoint point) =>
    point.isCompleted || point.piiMasked;

MapSpikePoint mergeHydratedDetail(
  MapSpikePoint operational,
  MapSpikePoint rich,
) {
  return operational.copyWith(
    customerName: rich.customerName,
    address: rich.address,
    detailAddress: rich.detailAddress,
    deliveryMemo: rich.deliveryMemo,
    contactType: rich.contactType,
    contactValue: rich.contactValue,
    hasAccessInfo: rich.hasAccessInfo,
    piiMasked: rich.piiMasked,
    status: rich.status.isNotEmpty ? rich.status : operational.status,
    statusCode: rich.statusCode,
    shipments:
        rich.shipments.isNotEmpty ? rich.shipments : operational.shipments,
    companyId: rich.companyId ?? operational.companyId,
    sourceId: rich.sourceId ?? operational.sourceId,
    companyLabel: operational.companyLabel ?? rich.companyLabel,
    sourceLabel: operational.sourceLabel ?? rich.sourceLabel,
  );
}
