import 'package:delivery_shield_mobile/location/driver_location_snapshot.dart';
import 'package:delivery_shield_mobile/map/driver_marker_interpolator.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('latest-wins retargets from current visual without backlog', () async {
    final ticks = <(double, double)>[];
    final interp = DriverMarkerInterpolator(
      duration: const Duration(milliseconds: 200),
      onTick: (lat, lng, _) => ticks.add((lat, lng)),
    );

    interp.snapTo(latitude: 37.0, longitude: 127.0);
    expect(interp.visualLatitude, 37.0);

    interp.animateTo(latitude: 37.01, longitude: 127.0);
    await Future<void>.delayed(const Duration(milliseconds: 60));
    final midLat = interp.visualLatitude!;
    expect(midLat, greaterThan(37.0));
    expect(midLat, lessThan(37.01));

    // Newer target arrives mid-flight — must retarget from current visual.
    interp.animateTo(latitude: 37.02, longitude: 127.0);
    await Future<void>.delayed(const Duration(milliseconds: 250));
    expect(interp.visualLatitude, closeTo(37.02, 0.0001));
    expect(ticks, isNotEmpty);

    interp.dispose();
  });

  test('coalesces sub-threshold moves using shared min distance', () {
    final ticks = <(double, double)>[];
    final interp = DriverMarkerInterpolator(
      onTick: (lat, lng, _) => ticks.add((lat, lng)),
    );
    interp.snapTo(latitude: 37.5, longitude: 127.0);
    ticks.clear();
    // ~0.1m move — below markerMinDistanceMeters (1.0).
    interp.animateTo(latitude: 37.5 + 0.0000005, longitude: 127.0);
    expect(ticks, isEmpty);
    expect(DriverLocationSnapshot.markerMinDistanceMeters, 1.0);
    interp.dispose();
  });
}
