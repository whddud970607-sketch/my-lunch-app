import 'package:flutter/material.dart';

abstract final class WorkdayReportKeys {
  static const screen = Key('workday_report_screen');
  static const loading = Key('workday_report_loading');
  static const error = Key('workday_report_error');
  static const retry = Key('workday_report_retry');
  static const metrics = Key('workday_report_metrics');
  static const duration = Key('workday_report_duration');
  static const total = Key('workday_report_total');
  static const completed = Key('workday_report_completed');
  static const remaining = Key('workday_report_remaining');
  static const progress = Key('workday_report_progress');
  static const route = Key('workday_report_route');
  static const home = Key('workday_report_home');
}
