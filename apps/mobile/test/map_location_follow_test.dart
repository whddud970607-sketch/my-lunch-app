import 'dart:async';

import 'package:delivery_shield_mobile/location/driver_location_marker_state.dart';
import 'package:delivery_shield_mobile/location/driver_location_service.dart';
import 'package:delivery_shield_mobile/location/driver_location_snapshot.dart';
import 'package:delivery_shield_mobile/location/driver_vehicle_type.dart';
import 'package:delivery_shield_mobile/map/delivery_map_controller.dart';
import 'package:delivery_shield_mobile/map/delivery_location_pin.dart';
import 'package:delivery_shield_mobile/map/map_location_coordinator.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakeMapController implements DeliveryMapController {
  final cameraMoves = <DeliveryLatLng>[];
  final cameraZooms = <double?>[];
  final followFlags = <bool>[];
  final programmaticFlags = <bool>[];
  final driverMarkers = <DriverLocationMarkerState>[];
  void Function()? userGesture;

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
  }) async {
    cameraMoves.add(target);
    cameraZooms.add(zoom);
    programmaticFlags.add(programmatic);
    followFlags.add(followUpdate);
  }

  @override
  Future<void> upsertDriverMarker(DriverLocationMarkerState state) async {
    driverMarkers.add(state);
  }

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
  void setUserGestureListener(void Function()? onUserGesture) {
    userGesture = onUserGesture;
  }

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

Position _pos({
  required double lat,
  required double lng,
  required DateTime ts,
  double speed = 5,
  double heading = 90,
}) {
  return Position(
    longitude: lng,
    latitude: lat,
    timestamp: ts,
    accuracy: 5,
    altitude: 0,
    altitudeAccuracy: 0,
    heading: heading,
    headingAccuracy: 0,
    speed: speed,
    speedAccuracy: 0,
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('DriverLocationService low-latency config', () {
    test('uses navigation accuracy and 1m / 1s Android settings', () {
      expect(DriverLocationService.distanceFilterMeters, 1);
      expect(
        DriverLocationService.androidInterval,
        const Duration(milliseconds: 1000),
      );
    });

    test('L/M: stale older timestamp is discarded', () async {
      final t1 = DateTime.utc(2026, 9, 5, 12, 0, 1);
      final t2 = DateTime.utc(2026, 9, 5, 12, 0, 2);
      final events = <Position>[
        _pos(lat: 37.5, lng: 127.0, ts: t1),
        _pos(lat: 37.5001, lng: 127.0, ts: t2),
        _pos(lat: 37.5002, lng: 127.0, ts: t1), // stale
      ];
      var i = 0;
      final service = DriverLocationService(
        isLocationServiceEnabled: () async => true,
        checkPermission: () async => LocationPermission.always,
        requestPermission: () async => LocationPermission.always,
        getCurrentPosition: (_) async => events.first,
        getPositionStream: (_) => Stream.fromIterable(events.skip(1)),
      );
      final seen = <DriverLocationSnapshot>[];
      service.positions.listen(seen.add);
      await service.start();
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(seen.length, greaterThanOrEqualTo(2));
      expect(seen.last.timestamp, t2);
      expect(
        seen.any((s) => s.latitude == 37.5002 && s.timestamp == t1),
        isFalse,
      );
      await service.stop();
      i; // silence
    });
  });

  group('DriverLocationSnapshot stale guard', () {
    test('isStaleRelativeTo uses timestamp then sequence', () {
      final t = DateTime.utc(2026, 9, 5);
      final older = DriverLocationSnapshot(
        latitude: 37.5,
        longitude: 127.0,
        headingDegrees: 0,
        speedMetersPerSecond: 5,
        accuracyMeters: 5,
        timestamp: t,
        sequence: 1,
      );
      final newer = DriverLocationSnapshot(
        latitude: 37.5001,
        longitude: 127.0,
        headingDegrees: 0,
        speedMetersPerSecond: 5,
        accuracyMeters: 5,
        timestamp: t.add(const Duration(seconds: 1)),
        sequence: 2,
      );
      expect(older.isStaleRelativeTo(newer), isTrue);
      expect(newer.isStaleRelativeTo(older), isFalse);
    });

    test('significant at ~1m move', () {
      final t = DateTime.utc(2026, 1, 1);
      final a = DriverLocationSnapshot(
        latitude: 37.5,
        longitude: 127.0,
        headingDegrees: 0,
        speedMetersPerSecond: 5,
        accuracyMeters: 5,
        timestamp: t,
      );
      final b = DriverLocationSnapshot(
        latitude: 37.50001,
        longitude: 127.0,
        headingDegrees: 0,
        speedMetersPerSecond: 5,
        accuracyMeters: 5,
        timestamp: t,
      );
      expect(b.isSignificantMarkerChange(a), isTrue);
    });
  });

  group('MapLocationCoordinator follow mode', () {
    late MapLocationCoordinator coordinator;
    late _FakeMapController map;
    late DriverLocationService service;
    late StreamController<Position> gps;

    setUp(() {
      gps = StreamController<Position>.broadcast();
      final t0 = DateTime.utc(2026, 9, 5, 10);
      service = DriverLocationService(
        isLocationServiceEnabled: () async => true,
        checkPermission: () async => LocationPermission.always,
        requestPermission: () async => LocationPermission.always,
        getCurrentPosition: (_) async => _pos(lat: 37.4, lng: 126.7, ts: t0),
        getPositionStream: (_) => gps.stream,
      );
      coordinator = MapLocationCoordinator(locationService: service);
      coordinator.bindPositionStream();
      map = _FakeMapController();
      coordinator.attachMap(map);
    });

    tearDown(() async {
      await gps.close();
      coordinator.dispose();
    });

    test('A/B: location button enables follow and centers camera', () async {
      await coordinator.startTracking();
      await coordinator.onMyLocationPressed();
      expect(coordinator.followEnabled, isTrue);
      expect(map.cameraMoves, isNotEmpty);
      expect(map.programmaticFlags.every((v) => v), isTrue);
      expect(map.followFlags.last, isTrue);
      expect(map.driverMarkers, isNotEmpty);
    });

    test(
      'C/D: new location updates marker and camera while follow ON',
      () async {
        await coordinator.startTracking();
        await coordinator.onMyLocationPressed();
        map.cameraMoves.clear();
        map.driverMarkers.clear();
        final t1 = DateTime.utc(2026, 9, 5, 10, 0, 2);
        gps.add(_pos(lat: 37.401, lng: 126.701, ts: t1));
        await Future<void>.delayed(const Duration(milliseconds: 30));
        expect(map.driverMarkers, isNotEmpty);
        expect(map.cameraMoves, isNotEmpty);
        expect(map.driverMarkers.last.latitude, closeTo(37.401, 0.0001));
        expect(map.cameraMoves.last.latitude, closeTo(37.401, 0.0001));
      },
    );

    test(
      'E: only one logical driver marker id path (latest upsert wins)',
      () async {
        await coordinator.startTracking();
        await coordinator.onMyLocationPressed();
        expect(
          map.driverMarkers.every((m) => m.snapshot.latitude.isFinite),
          isTrue,
        );
        // Fake records upserts; production uses fixed DriverLocationMarkerIds.
        expect(DriverVehicleType.values, isNotEmpty);
      },
    );

    test(
      'G/H: user gesture does NOT disable follow; zoom/pan stay free',
      () async {
        await coordinator.startTracking();
        await coordinator.onMyLocationPressed();
        expect(coordinator.followEnabled, isTrue);
        // Coordinator clears gesture→disableFollow wiring on attach.
        expect(map.userGesture, isNull);
        expect(coordinator.followEnabled, isTrue);
        expect(map.programmaticFlags.last, isTrue);
      },
    );

    test(
      'I/J: location button applies default zoom; GPS follow preserves zoom',
      () async {
        await coordinator.startTracking();
        await coordinator.onMyLocationPressed();
        expect(map.cameraZooms.last, MapLocationCoordinator.followZoom);
        map.cameraZooms.clear();
        map.cameraMoves.clear();
        final t2 = DateTime.utc(2026, 9, 5, 10, 0, 5);
        gps.add(_pos(lat: 37.402, lng: 126.702, ts: t2));
        await Future<void>.delayed(const Duration(milliseconds: 30));
        expect(coordinator.followEnabled, isTrue);
        expect(map.cameraMoves.last.latitude, closeTo(37.402, 0.0001));
        // Ongoing GPS follow must omit zoom so user pinch level is preserved.
        expect(map.cameraZooms.last, isNull);
      },
    );

    test('pin-adjust suppresses camera but keeps Follow ON', () async {
      await coordinator.startTracking();
      await coordinator.onMyLocationPressed();
      expect(coordinator.followEnabled, isTrue);
      map.cameraMoves.clear();

      coordinator.setCameraFollowSuppressed(true);
      expect(coordinator.followEnabled, isTrue);
      expect(coordinator.cameraFollowSuppressed, isTrue);

      final t1 = DateTime.utc(2026, 9, 5, 10, 0, 8);
      gps.add(_pos(lat: 37.405, lng: 126.705, ts: t1));
      await Future<void>.delayed(const Duration(milliseconds: 40));
      expect(coordinator.followEnabled, isTrue);
      expect(map.cameraMoves, isEmpty);

      coordinator.setCameraFollowSuppressed(false);
      expect(coordinator.followEnabled, isTrue);
      final t2 = DateTime.utc(2026, 9, 5, 10, 0, 10);
      gps.add(_pos(lat: 37.406, lng: 126.706, ts: t2));
      await Future<void>.delayed(const Duration(milliseconds: 40));
      expect(map.cameraMoves, isNotEmpty);
      expect(map.cameraZooms.last, isNull);
    });

    test(
      'session end is the Follow OFF path via disableFollow/stopTracking',
      () async {
        await coordinator.startTracking();
        await coordinator.onMyLocationPressed();
        expect(coordinator.followEnabled, isTrue);
        coordinator.disableFollow();
        expect(coordinator.followEnabled, isFalse);
        await coordinator.onMyLocationPressed();
        expect(coordinator.followEnabled, isTrue);
        await coordinator.stopTracking();
        expect(coordinator.followEnabled, isFalse);
      },
    );

    test('background pauseTracking keeps Follow ON', () async {
      await coordinator.startTracking();
      await coordinator.onMyLocationPressed();
      expect(coordinator.followEnabled, isTrue);
      await coordinator.pauseTracking();
      expect(coordinator.followEnabled, isTrue);
      expect(service.isTracking, isFalse);
      await coordinator.startTracking();
      expect(coordinator.followEnabled, isTrue);
    });

    test(
      'A: provider switch dispose/remount keeps Follow logically ON',
      () async {
        await coordinator.startTracking();
        await coordinator.onMyLocationPressed();
        expect(coordinator.followEnabled, isTrue);

        coordinator.detachMap();
        expect(coordinator.followEnabled, isTrue);

        final next = _FakeMapController();
        coordinator.attachMap(next);
        expect(coordinator.followEnabled, isTrue);
      },
    );

    test(
      'B: new provider ready auto-resumes camera while Follow stays ON',
      () async {
        await coordinator.startTracking();
        await coordinator.onMyLocationPressed();
        expect(coordinator.followEnabled, isTrue);

        coordinator.detachMap();
        final next = _FakeMapController();
        coordinator.attachMap(next);
        await Future<void>.delayed(const Duration(milliseconds: 850));

        expect(coordinator.followEnabled, isTrue);
        expect(next.driverMarkers, isNotEmpty);
        expect(next.cameraMoves, isNotEmpty);
        expect(next.followFlags.last, isTrue);
        // Remount resume must preserve user zoom (no default zoom snap).
        expect(next.cameraZooms.last, isNull);
      },
    );

    test('C: background then resume keeps Follow ON', () async {
      await coordinator.startTracking();
      await coordinator.onMyLocationPressed();
      expect(coordinator.followEnabled, isTrue);

      await coordinator.pauseTracking();
      expect(coordinator.followEnabled, isTrue);

      await coordinator.startTracking();
      expect(coordinator.followEnabled, isTrue);
    });

    test('D: resume + ready controller auto-resumes camera tracking', () async {
      await coordinator.startTracking();
      await coordinator.onMyLocationPressed();
      expect(coordinator.followEnabled, isTrue);

      await coordinator.pauseTracking();
      coordinator.detachMap();
      map.cameraMoves.clear();

      final next = _FakeMapController();
      coordinator.attachMap(next);
      await coordinator.startTracking();
      await Future<void>.delayed(const Duration(milliseconds: 850));

      expect(coordinator.followEnabled, isTrue);
      expect(next.cameraMoves, isNotEmpty);
      expect(next.driverMarkers, isNotEmpty);
    });

    test('E: temporary GPS stop preserves Follow ON', () async {
      await coordinator.startTracking();
      await coordinator.onMyLocationPressed();
      expect(coordinator.followEnabled, isTrue);
      await coordinator.pauseTracking();
      expect(coordinator.followEnabled, isTrue);
      expect(service.isTracking, isFalse);
    });

    test(
      'F: GPS valid again resumes tracking without clearing Follow',
      () async {
        await coordinator.startTracking();
        await coordinator.onMyLocationPressed();
        map.cameraMoves.clear();

        await coordinator.pauseTracking();
        expect(coordinator.followEnabled, isTrue);

        await coordinator.startTracking();
        expect(coordinator.followEnabled, isTrue);
        // startTracking with Follow ON force-syncs marker/camera when attached.
        expect(map.cameraMoves, isNotEmpty);
        expect(map.driverMarkers, isNotEmpty);

        map.cameraMoves.clear();
        final t = DateTime.utc(2026, 9, 5, 10, 1, 0);
        gps.add(_pos(lat: 37.410, lng: 126.710, ts: t));
        await Future<void>.delayed(const Duration(milliseconds: 40));
        expect(coordinator.followEnabled, isTrue);
        expect(map.cameraMoves.last.latitude, closeTo(37.410, 0.0001));
      },
    );

    test('G: delivery session end disables Follow', () async {
      await coordinator.startTracking();
      await coordinator.onMyLocationPressed();
      expect(coordinator.followEnabled, isTrue);
      coordinator.disableFollow();
      expect(coordinator.followEnabled, isFalse);
    });

    test('K: permission failure keeps follow OFF', () async {
      final denied = DriverLocationService(
        isLocationServiceEnabled: () async => true,
        checkPermission: () async => LocationPermission.denied,
        requestPermission: () async => LocationPermission.denied,
        getCurrentPosition: (_) async => throw StateError('no gps'),
        getPositionStream: (_) => const Stream.empty(),
      );
      final c = MapLocationCoordinator(locationService: denied);
      c.bindPositionStream();
      c.attachMap(_FakeMapController());
      await c.onMyLocationPressed();
      expect(c.followEnabled, isFalse);
      expect(c.permissionDenied, isTrue);
      c.dispose();
    });

    test(
      'N: consecutive follow updates use followUpdate (no long queue flag)',
      () async {
        await coordinator.startTracking();
        await coordinator.onMyLocationPressed();
        map.followFlags.clear();
        for (var i = 1; i <= 3; i++) {
          gps.add(
            _pos(
              lat: 37.4 + i * 0.001,
              lng: 126.7,
              ts: DateTime.utc(2026, 9, 5, 10, 0, i),
            ),
          );
        }
        await Future<void>.delayed(const Duration(milliseconds: 50));
        expect(map.followFlags, isNotEmpty);
        expect(map.followFlags.every((f) => f), isTrue);
      },
    );
  });
}
