import '../location/driver_location_icon_factory.dart';
import '../location/driver_location_marker_state.dart';
import '../location/driver_vehicle_type.dart';

/// Bounded Kakao driver-marker style IDs.
///
/// Heading is quantized to [DriverLocationIconFactory.headingBucketDegrees].
/// Accuracy is one of three visual tiers. Vehicle and session flags are enums.
/// No raw GPS heading/accuracy value can mint an unbounded style id.
abstract final class KakaoDriverMarkerStyles {
  static const styleIdPrefix = 'driver-loc';

  static const headingBucketCount = 73; // 0..355 step 5, plus unknown (-1)

  /// 2 vehicles × 73 headings × 3 accuracy tiers × 2 session flags.
  static const maxStyleCount = 876;

  static int headingBucket(double? headingDegrees) =>
      DriverLocationIconFactory.bucketHeading(headingDegrees);

  static DriverGpsAccuracyVisual accuracyTier(double? accuracyMeters) =>
      DriverGpsAccuracyVisual.fromMeters(accuracyMeters);

  static String styleIdFor({
    required DriverVehicleType vehicle,
    required int headingBucket,
    required DriverGpsAccuracyVisual accuracy,
    required bool sessionActive,
  }) {
    final session = sessionActive ? '1' : '0';
    return '$styleIdPrefix-${vehicle.name}-h$headingBucket-a${accuracy.name}-s$session';
  }

  static String styleIdForState(DriverLocationMarkerState state) => styleIdFor(
        vehicle: state.vehicle,
        headingBucket: headingBucket(state.headingDegrees),
        accuracy: accuracyTier(state.accuracyMeters),
        sessionActive: state.sessionActive,
      );

  static bool sameBucketAndPosition({
    required String? lastStyleId,
    required String styleId,
    required double? lastLatitude,
    required double? lastLongitude,
    required double latitude,
    required double longitude,
  }) =>
      lastStyleId == styleId &&
      lastLatitude == latitude &&
      lastLongitude == longitude;
}

/// Prevents late async driver/style work from touching a detached Kakao host.
class KakaoMapHostGuard<T extends Object> {
  T? _attached;
  bool _disposed = false;

  bool get disposed => _disposed;

  T? get attached => _attached;

  void attach(T controller) {
    if (_disposed) return;
    _attached = controller;
  }

  bool isCurrent(T? candidate) =>
      !_disposed && candidate != null && identical(_attached, candidate);

  void dispose() {
    _disposed = true;
    _attached = null;
  }
}

/// Per Kakao map/controller generation: styles registered on this host only.
class KakaoDriverMarkerStyleCache {
  final Set<String> _registered = {};

  int get registeredCount => _registered.length;

  bool isRegistered(String styleId) => _registered.contains(styleId);

  void markRegistered(String styleId) => _registered.add(styleId);

  void reset() => _registered.clear();
}
