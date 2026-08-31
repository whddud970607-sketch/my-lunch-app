/// Entity kinds referenced by sync operations (IDs only in payload).
enum OperationEntityType {
  deliveryPoint,
  deliveryShipment,
  deliveryJob,
  deliverySession,
  unknown;

  String get wireName {
    switch (this) {
      case OperationEntityType.deliveryPoint:
        return 'delivery_point';
      case OperationEntityType.deliveryShipment:
        return 'delivery_shipment';
      case OperationEntityType.deliveryJob:
        return 'delivery_job';
      case OperationEntityType.deliverySession:
        return 'delivery_session';
      case OperationEntityType.unknown:
        return 'unknown';
    }
  }

  static OperationEntityType parse(String raw) {
    for (final v in OperationEntityType.values) {
      if (v.name == raw || v.wireName == raw) return v;
    }
    return OperationEntityType.unknown;
  }
}
