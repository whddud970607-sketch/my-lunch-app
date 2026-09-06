import 'dart:io';

import 'package:delivery_shield_mobile/location/driver_location_filter.dart';
import 'package:delivery_shield_mobile/location/driver_location_icon_factory.dart';
import 'package:delivery_shield_mobile/location/driver_location_snapshot.dart';
import 'package:delivery_shield_mobile/location/driver_vehicle_type.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('DriverLocationFilter', () {
    test('holds last heading when speed is low', () {
      final filter = DriverLocationFilter();
      final first = filter.resolveHeading(
        rawHeading: 90,
        speedMetersPerSecond: 5,
      );
      expect(first, 90);

      final second = filter.resolveHeading(
        rawHeading: 120,
        speedMetersPerSecond: 0.5,
      );
      expect(second, 90);
    });

    test('updates heading when moving', () {
      final filter = DriverLocationFilter();
      filter.resolveHeading(rawHeading: 45, speedMetersPerSecond: 3);
      final next = filter.resolveHeading(
        rawHeading: 60,
        speedMetersPerSecond: 4,
      );
      expect(next, 60);
    });
  });

  group('DriverLocationSnapshot', () {
    test('significant when moved >= 1m', () {
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

    test('not significant for tiny move and small heading delta', () {
      final t = DateTime.utc(2026, 1, 1);
      final a = DriverLocationSnapshot(
        latitude: 37.5,
        longitude: 127.0,
        headingDegrees: 10,
        speedMetersPerSecond: 5,
        accuracyMeters: 5,
        timestamp: t,
      );
      final b = DriverLocationSnapshot(
        latitude: 37.500001,
        longitude: 127.000001,
        headingDegrees: 12,
        speedMetersPerSecond: 5,
        accuracyMeters: 5,
        timestamp: t,
      );
      expect(b.isSignificantMarkerChange(a), isFalse);
    });
  });

  group('DriverGpsAccuracyVisual', () {
    test('tiers from meters', () {
      expect(
        DriverGpsAccuracyVisual.fromMeters(10),
        DriverGpsAccuracyVisual.good,
      );
      expect(
        DriverGpsAccuracyVisual.fromMeters(30),
        DriverGpsAccuracyVisual.fair,
      );
      expect(
        DriverGpsAccuracyVisual.fromMeters(50),
        DriverGpsAccuracyVisual.poor,
      );
    });
  });

  group('DriverLocationIconFactory', () {
    setUp(DriverLocationIconFactory.clearCache);

    test('renders truck and motorcycle north-facing markers', () async {
      for (final vehicle in DriverVehicleType.values) {
        final bytes = await DriverLocationIconFactory.baseBytesFor(vehicle);
        expect(bytes.length, greaterThan(800), reason: vehicle.name);
        final out = File('build/driver_marker_${vehicle.name}_north.png');
        await out.parent.create(recursive: true);
        await out.writeAsBytes(bytes);
        expect(out.existsSync(), isTrue);
      }
    });

    test('heading buckets rotate 0/90/180/270 distinctly', () async {
      final keys = <String>{};
      for (final heading in [0.0, 90.0, 180.0, 270.0]) {
        final bucket = DriverLocationIconFactory.bucketHeading(heading);
        expect(bucket, heading.round());
        final bytes = await DriverLocationIconFactory.rotatedBytesFor(
          vehicle: DriverVehicleType.truck,
          headingDegrees: heading,
        );
        expect(bytes.length, greaterThan(800));
        keys.add(
          DriverLocationIconFactory.cacheKey(
            vehicle: DriverVehicleType.truck,
            headingBucket: bucket,
            accuracy: DriverGpsAccuracyVisual.good,
            sessionActive: false,
          ),
        );
        final out = File('build/driver_marker_truck_h$bucket.png');
        await out.writeAsBytes(bytes);
      }
      expect(keys.length, 4);
    });

    test('poor accuracy still renders a marker', () async {
      final good = await DriverLocationIconFactory.baseBytesFor(
        DriverVehicleType.truck,
        accuracyMeters: 8,
      );
      final poor = await DriverLocationIconFactory.baseBytesFor(
        DriverVehicleType.truck,
        accuracyMeters: 55,
      );
      expect(good.length, greaterThan(800));
      expect(poor.length, greaterThan(800));
      expect(
        DriverLocationIconFactory.cacheKey(
          vehicle: DriverVehicleType.truck,
          headingBucket: -1,
          accuracy: DriverGpsAccuracyVisual.good,
          sessionActive: false,
        ),
        isNot(
          DriverLocationIconFactory.cacheKey(
            vehicle: DriverVehicleType.truck,
            headingBucket: -1,
            accuracy: DriverGpsAccuracyVisual.poor,
            sessionActive: false,
          ),
        ),
      );
    });

    test('exports v2 reference assets for truck and motorcycle', () async {
      DriverLocationIconFactory.clearCache();
      final assetsDir = Directory('assets/markers');
      expect(assetsDir.existsSync(), isTrue);

      for (final vehicle in DriverVehicleType.values) {
        final bytes = await DriverLocationIconFactory.baseBytesFor(vehicle);
        final file = File(vehicle.markerAssetPath);
        await file.writeAsBytes(bytes);
        expect(file.existsSync(), isTrue);
        expect(file.lengthSync(), greaterThan(800));
      }
    });
  });
}
