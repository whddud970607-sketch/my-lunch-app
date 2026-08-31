import '../location/driver_location_snapshot.dart';
import 'route_sampling_config.dart';

/// Route-only noise filter (separate from DriverLocationFilter heading logic).
class RouteNoiseFilter {
  RouteNoiseFilter({RouteSamplingConfig? config})
      : config = config ?? RouteSamplingConfig.defaults;

  final RouteSamplingConfig config;

  bool shouldAccept({
    required DriverLocationSnapshot sample,
    DriverLocationSnapshot? previousKept,
  }) {
    if (sample.accuracyMeters > config.maxAccuracyMeters) {
      return false;
    }

    if (previousKept == null) return true;

    final moved = sample.distanceMetersTo(previousKept);
    if (moved < config.duplicateDistanceMeters) {
      return false;
    }

    final elapsedSec =
        sample.timestamp.difference(previousKept.timestamp).inMilliseconds /
            1000.0;
    if (elapsedSec > 0.5) {
      final implied = moved / elapsedSec;
      if (implied > config.maxImpliedSpeedMps) {
        return false;
      }
    }

    return true;
  }
}
