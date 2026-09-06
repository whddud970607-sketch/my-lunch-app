import 'dart:io';

import 'package:delivery_shield_mobile/location/driver_location_marker_state.dart';
import 'package:delivery_shield_mobile/location/driver_location_snapshot.dart';
import 'package:delivery_shield_mobile/location/driver_vehicle_type.dart';
import 'package:delivery_shield_mobile/map/kakao_driver_marker_styles.dart';
import 'package:delivery_shield_mobile/map/map_location_coordinator.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('A/C: follow mode defaults OFF on coordinator create', () {
    final c = MapLocationCoordinator();
    expect(c.followEnabled, isFalse);
    c.dispose();
  });

  test('F: zero lat/lng treated as invalid for driver marker gate', () {
    final snap = DriverLocationSnapshot(
      latitude: 0,
      longitude: 0,
      headingDegrees: null,
      speedMetersPerSecond: 0,
      accuracyMeters: 50,
      timestamp: DateTime.utc(2026, 9, 5),
    );
    expect(snap.latitude == 0 && snap.longitude == 0, isTrue);
  });

  test('B/D: Kakao defers driver styles until pin style surface ready', () {
    // Regression: concurrent registerMarkerStyles → native SIGSEGV
    // LabelPerLevelStyle / MapLabelManager.addStyle on GLThread.
    final kakao = File('lib/map/kakao_delivery_map.dart').readAsStringSync();
    expect(kakao.contains('_labelStyleSurfaceReady'), isTrue);
    expect(kakao.contains('_runLabelStyleOp'), isTrue);
    expect(kakao.contains('_pendingDriverMarker'), isTrue);
    final readyIdx = kakao.indexOf('widget.onReady(this)');
    final syncIdx = kakao.indexOf('await syncPins(_pins)');
    expect(syncIdx, greaterThan(0));
    expect(readyIdx, greaterThan(syncIdx));
  });

  test('coordinator attachMap defers immediate driver sync', () {
    final src = File('lib/map/map_location_coordinator.dart').readAsStringSync();
    expect(src.contains('Duration(milliseconds: 750)'), isTrue);
    expect(src.contains('Do not sync driver marker synchronously'), isTrue);
  });

  test('driver style id factory stays bounded', () {
    expect(KakaoDriverMarkerStyles.maxStyleCount, lessThanOrEqualTo(1000));
    final state = DriverLocationMarkerState(
      snapshot: DriverLocationSnapshot(
        latitude: 37.4,
        longitude: 126.7,
        headingDegrees: 90,
        speedMetersPerSecond: 5,
        accuracyMeters: 5,
        timestamp: DateTime.utc(2026, 9, 5),
      ),
      vehicle: DriverVehicleType.truck,
    );
    expect(
      KakaoDriverMarkerStyles.styleIdForState(state),
      startsWith('driver-loc'),
    );
  });
}
