import 'driver_location_snapshot.dart';
import 'driver_vehicle_type.dart';

/// Marker id and display state for the driver GPS overlay (not delivery pins).
class DriverLocationMarkerIds {
  DriverLocationMarkerIds._();

  static const markerId = 'driver-location';
  static const kakaoStyleId = 'driver-location-style';
  static const kakaoLayerId = 'driver-location-layer';
}

class DriverLocationMarkerState {
  const DriverLocationMarkerState({
    required this.snapshot,
    required this.vehicle,
    this.sessionActive = false,
  });

  final DriverLocationSnapshot snapshot;
  final DriverVehicleType vehicle;

  /// Reserved for a subtle "배송 중" outer ring; coordinator may wire later.
  final bool sessionActive;

  double get latitude => snapshot.latitude;
  double get longitude => snapshot.longitude;
  double? get headingDegrees => snapshot.headingDegrees;
  double get accuracyMeters => snapshot.accuracyMeters;
}
