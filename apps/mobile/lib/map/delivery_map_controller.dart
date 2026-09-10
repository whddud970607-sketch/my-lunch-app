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
  /// [followUpdate] uses a short/no animation so GPS updates are not queued behind
  /// long camera animations (latest position wins).
  /// When [zoom] is null and [followUpdate] is true, preserve the current map zoom
  /// (user pinch/zoom must not be reset by GPS follow).
  Future<void> moveCamera(
    DeliveryLatLng target, {
    double? zoom,
    bool programmatic = false,
    bool followUpdate = false,
  });

  /// Driver GPS marker — separate layer/id from delivery pins.
  Future<void> upsertDriverMarker(DriverLocationMarkerState state);

  Future<void> removeDriverMarker();

  /// Recorded delivery route polyline (provider-independent geometry).
  Future<void> setRoutePolyline(List<DeliveryLatLng> points);

  Future<void> clearRoutePolyline();

  /// Provider-native car route preview when supported.
  ///
  /// TMAP Vector uses [TMapData.findPathDataWithType] + [TMapPolyLine].
  /// Kakao / NAVER remain no-ops. Must not disable Follow or recreate the map.
  Future<void> requestCarRoutePreview({
    required DeliveryLatLng start,
    required DeliveryLatLng destination,
  });

  /// Session start/end markers (distinct from delivery pins / driver marker).
  Future<void> setSessionEndpoints({
    DeliveryLatLng? start,
    DeliveryLatLng? end,
  });

  /// Optional user-gesture hook. Follow Mode must NOT disable on pan/zoom;
  /// only delivery-session end turns Follow OFF.
  void setUserGestureListener(void Function()? onUserGesture);
}

typedef DeliveryPinTapCallback = void Function(String markerId);
typedef DeliveryMapReadyCallback = void Function(DeliveryMapController controller);
