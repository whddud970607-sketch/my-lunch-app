import '../copy/delivery_report_copy.dart';
import '../models/delivery_session.dart';
import 'home_dashboard_data.dart';

/// Metrics that actually exist on Workday/session report payloads.
class WorkdayReportMetrics {
  const WorkdayReportMetrics({
    required this.totalPoints,
    required this.completedPoints,
    required this.remainingPoints,
    required this.progressPercent,
    required this.durationLabel,
    required this.hasRoute,
    this.failedPoints = 0,
    this.totalQuantity = 0,
  });

  final int totalPoints;
  final int completedPoints;
  final int remainingPoints;
  final int progressPercent;
  final String durationLabel;
  final bool hasRoute;
  final int failedPoints;
  final int totalQuantity;
}

WorkdayReportMetrics workdayReportMetrics({
  required DeliveryProgressCounts progress,
  required int? durationSeconds,
  required bool hasRoute,
}) {
  return WorkdayReportMetrics(
    totalPoints: progress.totalPoints,
    completedPoints: progress.completedPoints,
    remainingPoints: progress.incompletePoints,
    progressPercent: workdayProgressPercent(
      total: progress.totalPoints,
      completed: progress.completedPoints,
    ),
    durationLabel: DeliveryReportCopy.formatDuration(durationSeconds),
    hasRoute: hasRoute,
    failedPoints: progress.failedPoints,
    totalQuantity: progress.totalQuantity,
  );
}
