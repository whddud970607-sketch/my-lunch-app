import 'dart:io';

import 'package:delivery_shield_mobile/location/driver_location_icon_factory.dart';
import 'package:delivery_shield_mobile/location/driver_location_marker_state.dart';
import 'package:delivery_shield_mobile/location/driver_location_snapshot.dart';
import 'package:delivery_shield_mobile/location/driver_vehicle_type.dart';
import 'package:delivery_shield_mobile/map/kakao_driver_marker_styles.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  DriverLocationMarkerState marker({
    double heading = 10,
    double accuracy = 5,
    DriverVehicleType vehicle = DriverVehicleType.truck,
    bool sessionActive = false,
    double lat = 37.5,
    double lng = 127.0,
  }) {
    return DriverLocationMarkerState(
      snapshot: DriverLocationSnapshot(
        latitude: lat,
        longitude: lng,
        headingDegrees: heading,
        speedMetersPerSecond: 5,
        accuracyMeters: accuracy,
        timestamp: DateTime.utc(2026, 1, 1),
      ),
      vehicle: vehicle,
      sessionActive: sessionActive,
    );
  }

  test('DRIVER_STYLE_BOUNDED max is finite and matches buckets', () {
    expect(KakaoDriverMarkerStyles.headingBucketCount, 73);
    expect(KakaoDriverMarkerStyles.maxStyleCount, 876);
    expect(KakaoDriverMarkerStyles.maxStyleCount, lessThan(1000));

    final ids = <String>{};
    for (final vehicle in DriverVehicleType.values) {
      for (final heading in [-1, ...List.generate(72, (i) => i * 5)]) {
        for (final accuracy in DriverGpsAccuracyVisual.values) {
          for (final session in [false, true]) {
            ids.add(
              KakaoDriverMarkerStyles.styleIdFor(
                vehicle: vehicle,
                headingBucket: heading,
                accuracy: accuracy,
                sessionActive: session,
              ),
            );
          }
        }
      }
    }
    expect(ids.length, KakaoDriverMarkerStyles.maxStyleCount);
  });

  test('SAME_BUCKET_REUSES_STYLE', () {
    final a = KakaoDriverMarkerStyles.styleIdForState(marker(heading: 11));
    final b = KakaoDriverMarkerStyles.styleIdForState(marker(heading: 13));
    expect(KakaoDriverMarkerStyles.headingBucket(11), 10);
    expect(KakaoDriverMarkerStyles.headingBucket(13), 15);
    expect(a, isNot(b));

    final sameA = KakaoDriverMarkerStyles.styleIdForState(marker(heading: 10));
    final sameB = KakaoDriverMarkerStyles.styleIdForState(marker(heading: 12));
    expect(sameA, sameB);
    expect(sameA, contains('h10'));
  });

  test('BUCKET_CHANGE_REUSES_OR_REGISTERS_ONCE', () {
    final cache = KakaoDriverMarkerStyleCache();
    final first = KakaoDriverMarkerStyles.styleIdForState(marker(heading: 0));
    final second = KakaoDriverMarkerStyles.styleIdForState(marker(heading: 90));
    expect(cache.isRegistered(first), isFalse);
    cache.markRegistered(first);
    expect(cache.isRegistered(first), isTrue);
    expect(cache.registeredCount, 1);

    cache.markRegistered(first);
    expect(cache.registeredCount, 1);

    cache.markRegistered(second);
    expect(cache.registeredCount, 2);
    expect(cache.isRegistered(second), isTrue);
  });

  test('NEW_MAP_GENERATION_RESETS_REGISTRATION_STATE', () {
    final cache = KakaoDriverMarkerStyleCache();
    cache.markRegistered(
      KakaoDriverMarkerStyles.styleIdForState(marker()),
    );
    expect(cache.registeredCount, 1);
    cache.reset();
    expect(cache.registeredCount, 0);
    expect(
      cache.isRegistered(KakaoDriverMarkerStyles.styleIdForState(marker())),
      isFalse,
    );
  });

  test('STALE_CONTROLLER_UPDATE_IGNORED', () {
    final guard = KakaoMapHostGuard<Object>();
    final oldHost = Object();
    final newHost = Object();
    guard.attach(oldHost);
    expect(guard.isCurrent(oldHost), isTrue);
    guard.dispose();
    expect(guard.disposed, isTrue);
    expect(guard.attached, isNull);
    expect(guard.isCurrent(oldHost), isFalse);
    expect(guard.isCurrent(newHost), isFalse);
    guard.attach(newHost);
    expect(guard.isCurrent(newHost), isFalse);
  });

  test('same bucket and position skips marker rewrite', () {
    final id = KakaoDriverMarkerStyles.styleIdForState(marker());
    expect(
      KakaoDriverMarkerStyles.sameBucketAndPosition(
        lastStyleId: id,
        styleId: id,
        lastLatitude: 37.5,
        lastLongitude: 127.0,
        latitude: 37.5,
        longitude: 127.0,
      ),
      isTrue,
    );
    expect(
      KakaoDriverMarkerStyles.sameBucketAndPosition(
        lastStyleId: id,
        styleId: id,
        lastLatitude: 37.5,
        lastLongitude: 127.0,
        latitude: 37.51,
        longitude: 127.0,
      ),
      isFalse,
    );
  });

  test('DRIVER_STYLE_NO_LIVE_REMOVE', () {
    final kakao = File('lib/map/kakao_delivery_map.dart').readAsStringSync();
    expect(kakao.contains('removeMarkerStyles'), isFalse);
    expect(kakao.contains('KakaoDriverMarkerStyleCache'), isTrue);
    expect(kakao.contains('KakaoDriverMarkerStyles.styleIdForState'), isTrue);
    expect(kakao.contains('_host.dispose()'), isTrue);
    expect(kakao.contains('_driverStyles.reset()'), isTrue);
  });

  test('raw heading does not mint unique style ids', () {
    final a = KakaoDriverMarkerStyles.styleIdForState(marker(heading: 44.9));
    final b = KakaoDriverMarkerStyles.styleIdForState(marker(heading: 45.1));
    expect(a, b);
    expect(KakaoDriverMarkerStyles.headingBucket(44.9), 45);
    expect(KakaoDriverMarkerStyles.headingBucket(45.1), 45);
  });
}
