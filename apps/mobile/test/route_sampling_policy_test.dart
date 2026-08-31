import 'package:delivery_shield_mobile/copy/delivery_report_copy.dart';
import 'package:delivery_shield_mobile/location/driver_location_snapshot.dart';
import 'package:delivery_shield_mobile/location/route_noise_filter.dart';
import 'package:delivery_shield_mobile/location/route_sampling_policy.dart';
import 'package:delivery_shield_mobile/models/delivery_session.dart';
import 'package:flutter_test/flutter_test.dart';

DriverLocationSnapshot snap({
  required double lat,
  required double lng,
  required DateTime t,
  double accuracy = 10,
  double speed = 5,
}) {
  return DriverLocationSnapshot(
    latitude: lat,
    longitude: lng,
    headingDegrees: 90,
    speedMetersPerSecond: speed,
    accuracyMeters: accuracy,
    timestamp: t,
  );
}

void main() {
  group('RouteSamplingPolicy', () {
    test('keeps first fix', () {
      final policy = RouteSamplingPolicy();
      final t0 = DateTime.utc(2026, 8, 29, 3, 0, 0);
      expect(
        policy.evaluate(snap(lat: 37.5, lng: 127.0, t: t0), force: true),
        RouteSampleDecision.keep,
      );
    });

    test('OR distance or time creates candidate', () {
      final policy = RouteSamplingPolicy();
      final t0 = DateTime.utc(2026, 8, 29, 3, 0, 0);
      policy.evaluate(snap(lat: 37.5, lng: 127.0, t: t0), force: true);

      // ~30m north roughly 0.00027 deg
      final near = policy.evaluate(
        snap(lat: 37.50005, lng: 127.0, t: t0.add(const Duration(seconds: 5))),
      );
      expect(near, RouteSampleDecision.skip);

      final far = policy.evaluate(
        snap(lat: 37.5003, lng: 127.0, t: t0.add(const Duration(seconds: 5))),
      );
      expect(far, RouteSampleDecision.keep);

      policy.reset();
      policy.evaluate(snap(lat: 37.5, lng: 127.0, t: t0), force: true);
      final timed = policy.evaluate(
        snap(
          lat: 37.50005,
          lng: 127.0,
          t: t0.add(const Duration(seconds: 16)),
        ),
      );
      expect(timed, RouteSampleDecision.keep);
    });
  });

  group('RouteNoiseFilter', () {
    test('rejects bad accuracy and jumps', () {
      final filter = RouteNoiseFilter();
      final t0 = DateTime.utc(2026, 8, 29, 3, 0, 0);
      final a = snap(lat: 37.5, lng: 127.0, t: t0);
      expect(filter.shouldAccept(sample: a), isTrue);

      final badAcc = snap(
        lat: 37.5002,
        lng: 127.0,
        t: t0.add(const Duration(seconds: 10)),
        accuracy: 80,
      );
      expect(filter.shouldAccept(sample: badAcc, previousKept: a), isFalse);

      final jump = snap(
        lat: 38.0,
        lng: 127.0,
        t: t0.add(const Duration(seconds: 2)),
      );
      expect(filter.shouldAccept(sample: jump, previousKept: a), isFalse);
    });
  });

  group('DeliveryReportCopy', () {
    test('complete vs incomplete messaging', () {
      const done = DeliveryProgressCounts(
        totalPoints: 10,
        completedPoints: 10,
        incompletePoints: 0,
      );
      const partial = DeliveryProgressCounts(
        totalPoints: 10,
        completedPoints: 8,
        incompletePoints: 2,
      );
      expect(DeliveryReportCopy.headline(done), contains('완료'));
      expect(DeliveryReportCopy.headline(partial), isNot(contains('모두 완료')));
      expect(
        DeliveryReportCopy.body(progress: partial, durationSeconds: 3600),
        contains('8건'),
      );
    });
  });
}
