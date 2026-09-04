import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/copy/delivery_report_copy.dart';
import 'package:delivery_shield_mobile/models/delivery_session.dart';
import 'package:delivery_shield_mobile/screens/workday_report_data.dart';

void main() {
  test('WORKDAY_REPORT_ACTUAL_METRICS_ONLY from progress + duration + route', () {
    const progress = DeliveryProgressCounts(
      totalPoints: 10,
      completedPoints: 8,
      incompletePoints: 2,
    );
    final metrics = workdayReportMetrics(
      progress: progress,
      durationSeconds: 3660,
      hasRoute: true,
    );
    expect(metrics.totalPoints, 10);
    expect(metrics.completedPoints, 8);
    expect(metrics.remainingPoints, 2);
    expect(metrics.progressPercent, 80);
    expect(metrics.durationLabel, DeliveryReportCopy.formatDuration(3660));
    expect(metrics.hasRoute, isTrue);
  });

  test('WORKDAY_REPORT_NO_FAKE_METRICS labels stay unused', () {
    const forbidden = [
      'SLA',
      '효율 점수',
      '절감',
      'ETA 정확도',
      '효율',
    ];
    final report =
        File('lib/screens/delivery_report_screen.dart').readAsStringSync();
    final data =
        File('lib/screens/workday_report_data.dart').readAsStringSync();
    final copy =
        File('lib/copy/delivery_report_copy.dart').readAsStringSync();
    for (final label in forbidden) {
      expect(report.contains(label), isFalse, reason: label);
      expect(data.contains(label), isFalse, reason: label);
      expect(copy.contains(label), isFalse, reason: label);
    }
    expect(report.contains('fetchNamdong10Points'), isFalse);
    expect(report.contains('다시 시도'), isTrue);
    expect(report.contains('전체 배송'), isTrue);
    expect(report.contains('완료'), isTrue);
    expect(report.contains('미완료'), isTrue);
    expect(report.contains('진행'), isTrue);
  });
}
