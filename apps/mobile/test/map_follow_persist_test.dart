import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:delivery_shield_mobile/location/driver_location_marker_state.dart';
import 'package:delivery_shield_mobile/location/driver_location_service.dart';
import 'package:delivery_shield_mobile/map/delivery_location_pin.dart';
import 'package:delivery_shield_mobile/map/delivery_map_controller.dart';
import 'package:delivery_shield_mobile/map/map_follow_settings.dart';
import 'package:delivery_shield_mobile/map/map_location_coordinator.dart';

class _FakeMap implements DeliveryMapController {
  @override
  Future<DeliveryLatLng?> getCenter() async => null;

  @override
  Future<void> syncPins(List<DeliveryLocationPin> pins) async {}

  @override
  Future<void> removePin(String markerId) async {}

  @override
  Future<void> upsertPin(DeliveryLocationPin pin) async {}

  @override
  Future<void> moveCamera(
    DeliveryLatLng target, {
    double? zoom,
    bool programmatic = false,
    bool followUpdate = false,
  }) async {}

  @override
  Future<void> upsertDriverMarker(DriverLocationMarkerState state) async {}

  @override
  Future<void> removeDriverMarker() async {}

  @override
  Future<void> setRoutePolyline(List<DeliveryLatLng> points) async {}

  @override
  Future<void> clearRoutePolyline() async {}

  @override
  Future<void> requestCarRoutePreview({
    required DeliveryLatLng start,
    required DeliveryLatLng destination,
  }) async {}

  @override
  Future<void> setSessionEndpoints({
    DeliveryLatLng? start,
    DeliveryLatLng? end,
  }) async {}

  @override
  void setUserGestureListener(void Function()? onUserGesture) {}

  @override
  Future<void> setShieldHudPresentation({
    required String title,
    required bool showSummary,
    required int totalPoints,
    required int completedPoints,
    required int remainingPoints,
    required bool followActive,
    required bool myLocationEnabled,
    bool refreshing = false,
  }) async {}

  @override
  void setMyLocationButtonListener(void Function()? onPressed) {}

  @override
  void setHudActionListener({
    void Function()? onRefresh,
    void Function()? onProviderMenu,
  }) {}

  @override
  Future<Map<String, dynamic>?> setHudPopupsVisible(bool visible) async => null;

  @override
  Future<Map<String, dynamic>?> getProviderButtonScreenCoords() async => null;
}

DriverLocationService _okGps() {
  final controller = StreamController<Position>.broadcast();
  return DriverLocationService(
    isLocationServiceEnabled: () async => true,
    checkPermission: () async => LocationPermission.always,
    requestPermission: () async => LocationPermission.always,
    getCurrentPosition: (_) async => Position(
      longitude: 126.9780,
      latitude: 37.5665,
      timestamp: DateTime.utc(2026, 9, 10, 8),
      accuracy: 5,
      altitude: 0,
      altitudeAccuracy: 0,
      heading: 0,
      headingAccuracy: 0,
      speed: 0,
      speedAccuracy: 0,
    ),
    getPositionStream: (_) => controller.stream,
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test(
    'Follow ON persists across coordinator dispose/remount hydrate',
    () async {
      final first = MapLocationCoordinator(locationService: _okGps());
      first.bindPositionStream();
      first.attachMap(_FakeMap());

      await first.onMyLocationPressed();
      expect(first.followEnabled, isTrue);
      expect(await MapFollowSettings.load(), isTrue);

      first.dispose();

      final second = MapLocationCoordinator(locationService: _okGps());
      second.bindPositionStream();
      expect(second.followEnabled, isFalse);
      await second.hydrateFollowFromPersistence();
      expect(second.followEnabled, isTrue);

      second.attachMap(_FakeMap());
      await Future<void>.delayed(const Duration(milliseconds: 800));
      expect(second.followEnabled, isTrue);
      second.dispose();
    },
  );

  test('disableFollow clears persistence', () async {
    await MapFollowSettings.save(true);
    final c = MapLocationCoordinator(locationService: _okGps());
    await c.hydrateFollowFromPersistence();
    expect(c.followEnabled, isTrue);
    c.disableFollow();
    expect(c.followEnabled, isFalse);
    expect(await MapFollowSettings.load(), isFalse);
    c.dispose();
  });
}
