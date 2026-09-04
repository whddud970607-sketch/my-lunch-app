import '../models/manual_address_candidate.dart';
import 'api_client.dart';

/// Nest manual-address APIs. Does not call GET /delivery/today/search.
class ManualAddressRepository {
  ManualAddressRepository(this._api);

  final ApiClient _api;

  Future<List<ManualAddressCandidate>> suggest(String query) async {
    final encoded = Uri.encodeQueryComponent(query);
    final json = await _api.getJson(
      '/delivery/manual/address/suggest?q=$encoded',
    );
    final raw = json['results'];
    if (raw is! List) return const [];
    return [
      for (final row in raw)
        if (row is Map<String, dynamic>) ManualAddressCandidate.fromJson(row),
    ];
  }

  Future<ManualRegisterResult> register({
    required String commitIdempotencyKey,
    required ManualAddressCandidate candidate,
    String? detailAddress,
    String? dong,
    String? unit,
    required int quantity,
    String? serviceDate,
  }) {
    return _api
        .postJson('/delivery/manual/register', {
          'commitIdempotencyKey': commitIdempotencyKey,
          if (serviceDate != null && serviceDate.isNotEmpty)
            'serviceDate': serviceDate,
          'roadAddress': candidate.roadAddress,
          'jibunAddress': candidate.jibunAddress,
          'buildingName': candidate.buildingName,
          'detailAddress': detailAddress,
          'dong': dong,
          'unit': unit,
          'quantity': quantity,
        })
        .then(ManualRegisterResult.fromJson);
  }
}
