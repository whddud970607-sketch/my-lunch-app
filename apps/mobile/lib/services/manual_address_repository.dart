import '../models/manual_address_candidate.dart';
import '../screens/manual_address_register_data.dart';
import 'api_client.dart';


/// Nest manual-address APIs. Does not call Phase B assigned-point search.
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
    final normalizedDetail = composeManualDetailAddress(
      detail: detailAddress,
      dong: dong,
      unit: unit,
    );
    return _api
        .postJson('/delivery/manual/register', {
          'commitIdempotencyKey': commitIdempotencyKey,
          if (serviceDate != null && serviceDate.isNotEmpty)
            'serviceDate': serviceDate,
          'roadAddress': candidate.roadAddress,
          'jibunAddress': candidate.jibunAddress,
          'buildingName': candidate.buildingName,
          'detailAddress': normalizedDetail.isEmpty ? null : normalizedDetail,
          'dong': (dong ?? '').trim(),
          'unit': (unit ?? '').trim(),
          'quantity': quantity,
          ...manualRegisterCoordinateFields(candidate),
        })
        .then(ManualRegisterResult.fromJson);
  }
}
