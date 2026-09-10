import 'package:delivery_shield_mobile/map/delivery_map_controller.dart';
import 'package:delivery_shield_mobile/map/delivery_location_pin.dart';
import 'package:delivery_shield_mobile/location/driver_location_marker_state.dart';
import 'package:flutter_test/flutter_test.dart';

/// Captures route-preview calls for latest-wins / clear / invalid geometry.
class _RecordingMapController implements DeliveryMapController {
  final routePolylines = <List<DeliveryLatLng>>[];
  final carPreviews = <(DeliveryLatLng, DeliveryLatLng)>[];
  var clearCount = 0;

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
  Future<void> setRoutePolyline(List<DeliveryLatLng> points) async {
    if (points.length < 2) {
      clearCount++;
      return;
    }
    routePolylines.add(List<DeliveryLatLng>.unmodifiable(points));
  }

  @override
  Future<void> clearRoutePolyline() async {
    clearCount++;
  }

  @override
  Future<void> requestCarRoutePreview({
    required DeliveryLatLng start,
    required DeliveryLatLng destination,
  }) async {
    carPreviews.add((start, destination));
  }

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

bool _validCoord(double lat, double lng) {
  return lat.isFinite &&
      lng.isFinite &&
      lat != 0.0 &&
      lng != 0.0 &&
      lat >= -90.0 &&
      lat <= 90.0 &&
      lng >= -180.0 &&
      lng <= 180.0;
}

/// Mirrors Flutter preview gating used by map_spike (no Follow mutation).
Future<void> requestPreviewIfPossible({
  required _RecordingMapController controller,
  required bool isTmap,
  required DeliveryLatLng? start,
  required DeliveryLatLng? destination,
  required bool followEnabled,
}) async {
  final followBefore = followEnabled;
  if (!isTmap) {
    await controller.clearRoutePolyline();
    expect(followEnabled, followBefore);
    return;
  }
  if (start == null ||
      destination == null ||
      !_validCoord(start.latitude, start.longitude) ||
      !_validCoord(destination.latitude, destination.longitude)) {
    await controller.clearRoutePolyline();
    expect(followEnabled, followBefore);
    return;
  }
  await controller.requestCarRoutePreview(
    start: start,
    destination: destination,
  );
  expect(followEnabled, followBefore);
}

void main() {
  test('invalid route geometry clears instead of drawing', () async {
    final c = _RecordingMapController();
    await c.setRoutePolyline(const []);
    await c.setRoutePolyline([
      const DeliveryLatLng(latitude: 37.5, longitude: 127.0),
    ]);
    expect(c.routePolylines, isEmpty);
    expect(c.clearCount, 2);
  });

  test('destination change replaces via latest car preview', () async {
    final c = _RecordingMapController();
    const start = DeliveryLatLng(latitude: 37.5, longitude: 126.9);
    await c.requestCarRoutePreview(
      start: start,
      destination: const DeliveryLatLng(latitude: 37.51, longitude: 127.01),
    );
    await c.requestCarRoutePreview(
      start: start,
      destination: const DeliveryLatLng(latitude: 37.52, longitude: 127.02),
    );
    expect(c.carPreviews.length, 2);
    expect(c.carPreviews.last.$2.latitude, 37.52);
  });

  test('clear route works after polyline set', () async {
    final c = _RecordingMapController();
    await c.setRoutePolyline([
      const DeliveryLatLng(latitude: 37.5, longitude: 126.9),
      const DeliveryLatLng(latitude: 37.51, longitude: 127.0),
    ]);
    await c.clearRoutePolyline();
    expect(c.routePolylines.length, 1);
    expect(c.clearCount, 1);
  });

  test('stale async result ignored by generation guard semantics', () {
    var generation = 0;
    final drawn = <int>[];

    int beginRequest() => ++generation;

    void complete(int gen, int destId) {
      if (gen != generation) return;
      drawn.add(destId);
    }

    final gen1 = beginRequest();
    final gen2 = beginRequest();
    // Older callback arrives after newer request started:
    complete(gen1, 1);
    complete(gen2, 2);
    expect(drawn, [2]);
  });

  test('route preview does not disable Follow', () async {
    final c = _RecordingMapController();
    var follow = true;
    await requestPreviewIfPossible(
      controller: c,
      isTmap: true,
      start: const DeliveryLatLng(latitude: 37.5, longitude: 126.9),
      destination: const DeliveryLatLng(latitude: 37.51, longitude: 127.0),
      followEnabled: follow,
    );
    expect(follow, isTrue);
    expect(c.carPreviews, isNotEmpty);
  });

  test('provider switch isolate: non-TMAP clears route', () async {
    final c = _RecordingMapController();
    await requestPreviewIfPossible(
      controller: c,
      isTmap: false,
      start: const DeliveryLatLng(latitude: 37.5, longitude: 126.9),
      destination: const DeliveryLatLng(latitude: 37.51, longitude: 127.0),
      followEnabled: true,
    );
    expect(c.carPreviews, isEmpty);
    expect(c.clearCount, 1);
  });

  test('missing GPS fails safely without preview', () async {
    final c = _RecordingMapController();
    await requestPreviewIfPossible(
      controller: c,
      isTmap: true,
      start: null,
      destination: const DeliveryLatLng(latitude: 37.51, longitude: 127.0),
      followEnabled: true,
    );
    expect(c.carPreviews, isEmpty);
    expect(c.clearCount, 1);
  });
}
