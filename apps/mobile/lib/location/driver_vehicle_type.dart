/// Driver vehicle icon shown on the map for current GPS position.
enum DriverVehicleType {
  truck,
  motorcycle;

  String get displayLabel {
    switch (this) {
      case DriverVehicleType.truck:
        return '화물차';
      case DriverVehicleType.motorcycle:
        return '오토바이';
    }
  }

  /// North-facing navigation marker export (v2). Legacy v1 PNGs retained.
  String get markerAssetPath {
    switch (this) {
      case DriverVehicleType.truck:
        return 'assets/markers/driver_truck_v2.png';
      case DriverVehicleType.motorcycle:
        return 'assets/markers/driver_motorcycle_v2.png';
    }
  }

  static DriverVehicleType? tryParse(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    for (final v in DriverVehicleType.values) {
      if (v.name == raw) return v;
    }
    return null;
  }
}
