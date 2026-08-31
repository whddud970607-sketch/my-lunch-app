import '../models/today_workset.dart';
import 'api_client.dart';

/// Loads GET /v1/delivery/today. No fixture-date fallback in production.
class TodayWorksetRepository {
  TodayWorksetRepository(this._api);

  final ApiClient _api;

  /// [serviceDate] null → server Seoul service-date.
  /// Explicit date is for tests / debug only — never invent a fixture fallback.
  Future<({TodayWorkset workset, int apiMs})> fetchToday({
    String? serviceDate,
  }) async {
    final sw = Stopwatch()..start();
    final path = (serviceDate == null || serviceDate.isEmpty)
        ? '/delivery/today'
        : '/delivery/today?date=${Uri.encodeQueryComponent(serviceDate)}';
    final json = await _api.getJson(path);
    final apiMs = sw.elapsedMilliseconds;
    final workset = TodayWorkset.fromJson(json);
    return (workset: workset, apiMs: apiMs);
  }
}
