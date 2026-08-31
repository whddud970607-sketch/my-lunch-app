import '../location/driver_location_marker_state.dart';
import 'delivery_location_pin.dart';

/// WGS84 coordinate shared across map SDKs.
class DeliveryLatLng {
  const DeliveryLatLng({required this.latitude, required this.longitude});

  final double latitude;
  final double longitude;
}

/// Map-SDK-agnostic controller used by pin-adjust, marker sync, and driver GPS.
abstract class DeliveryMapController {
  Future<DeliveryLatLng?> getCenter();

  /// Replace or add markers. Pin icons must show [DeliveryLocationPin.totalQuantity] only.
  Future<void> syncPins(List<DeliveryLocationPin> pins);

  Future<void> removePin(String markerId);

  Future<void> upsertPin(DeliveryLocationPin pin);

  /// Move camera without fitting all pins (e.g. focus Seoul stop from list).
  /// [programmatic] true for follow-mode moves (ignored for user-gesture detection).
  Future<void> moveCamera(
    DeliveryLatLng target, {
    double? zoom,
    bool programmatic = false,
  });

  /// Driver GPS marker — separate layer/id from delivery pins.
  Future<void> upsertDriverMarker(DriverLocationMarkerState state);

  Future<void> removeDriverMarker();

  /// Recorded delivery route polyline (provider-independent geometry).
  Future<void> setRoutePolyline(List<DeliveryLatLng> points);

  Future<void> clearRoutePolyline();

  /// Session start/end markers (distinct from delivery pins / driver marker).
  Future<void> setSessionEndpoints({
    DeliveryLatLng? start,
    DeliveryLatLng? end,
  });

  /// Called when the user drags/pans the map (not programmatic camera moves).
  void setUserGestureListener(void Function()? onUserGesture);
}

typedef DeliveryPinTapCallback = void Function(String markerId);
typedef DeliveryMapReadyCallback = void Function(DeliveryMapController controller);
