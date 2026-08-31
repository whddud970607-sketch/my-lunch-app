class DeliveryShipment {
  const DeliveryShipment({
    required this.shipmentId,
    required this.sequenceNo,
    required this.trackingCode,
    required this.status,
    required this.statusCode,
    this.sourceId,
    this.externalId,
  });

  final String shipmentId;
  final int sequenceNo;
  final String trackingCode;
  final String status;
  final String statusCode;

  /// Namespace owner after tracking cutover. Null only for legacy map-spike rows.
  final String? sourceId;
  final String? externalId;

  factory DeliveryShipment.fromJson(Map<String, dynamic> json) {
    return DeliveryShipment(
      shipmentId: (json['shipmentId'] as String?) ??
          (json['id'] as String?) ??
          '',
      sequenceNo: (json['sequenceNo'] as num?)?.toInt() ?? 0,
      trackingCode: json['trackingCode'] as String? ?? '',
      status: json['status'] as String? ?? '',
      statusCode: json['statusCode'] as String? ??
          (json['status'] as String?) ??
          'pending',
      sourceId: json['sourceId'] as String?,
      externalId: json['externalId'] as String?,
    );
  }
}
