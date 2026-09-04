import '../models/delivery_address_search_hit.dart';
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

  /// Authorized address/display search. Caller must not log [query].
  Future<List<DeliveryAddressSearchHit>> searchToday({
    required String query,
    String? serviceDate,
  }) async {
    final q = Uri.encodeQueryComponent(query);
    final datePart = (serviceDate == null || serviceDate.isEmpty)
        ? ''
        : '&date=${Uri.encodeQueryComponent(serviceDate)}';
    final json = await _api.getJson('/delivery/today/search?q=$q$datePart');
    final raw = json['results'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map(
          (e) => DeliveryAddressSearchHit.fromJson(
            Map<String, dynamic>.from(e),
          ),
        )
        .where((h) => h.pointId.isNotEmpty)
        .toList(growable: false);
  }
}
