/// Discrete field operation types for the Reliability & Sync Engine.
///
/// Phase 0/1 registers types for future dispatch; no Nest wiring yet.
enum OperationType {
  podUpload,
  deliveryComplete,
  deliveryException,
  pointPinUpdate,
  scanRecorded,
  manualPointCreate,
  pointUpdate,
  shipmentStatusUpdate,
  loadingPositionUpdate;

  String get wireName {
    switch (this) {
      case OperationType.podUpload:
        return 'POD_UPLOAD';
      case OperationType.deliveryComplete:
        return 'DELIVERY_COMPLETE';
      case OperationType.deliveryException:
        return 'DELIVERY_EXCEPTION';
      case OperationType.pointPinUpdate:
        return 'POINT_PIN_UPDATE';
      case OperationType.scanRecorded:
        return 'SCAN_RECORDED';
      case OperationType.manualPointCreate:
        return 'MANUAL_POINT_CREATE';
      case OperationType.pointUpdate:
        return 'POINT_UPDATE';
      case OperationType.shipmentStatusUpdate:
        return 'SHIPMENT_STATUS_UPDATE';
      case OperationType.loadingPositionUpdate:
        return 'LOADING_POSITION_UPDATE';
    }
  }

  static OperationType parse(String raw) {
    for (final v in OperationType.values) {
      if (v.name == raw || v.wireName == raw) return v;
    }
    throw FormatException('unknown OperationType: $raw');
  }
}
