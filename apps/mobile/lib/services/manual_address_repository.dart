import '../models/manual_address_candidate.dart';
import '../screens/manual_address_register_data.dart';
import 'api_client.dart';
import 'invoice_evidence_image.dart';


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
    String? recipientName,
    String? recipientPhone,
    ManualPinSelection? pin,
    required int quantity,
    String? serviceDate,
    ManualRegisterReason reason = ManualRegisterReason.manualEntry,
  }) {
    final normalizedDetail = composeManualDetailAddress(
      detail: detailAddress,
      dong: dong,
      unit: unit,
    );
    final name = sanitizeManualRecipientName(recipientName);
    final phone = sanitizeManualRecipientPhone(recipientPhone);
    final coords = pin == null
        ? manualRegisterCoordinateFields(candidate)
        : {
            'latitude': pin.latitude,
            'longitude': pin.longitude,
          };
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
          'recipientName': ?name,
          'recipientPhone': ?phone,
          'quantity': quantity,
          ...coords,
          if (pin?.source == ManualPinSource.manualAdjust) 'pinAdjusted': true,
          'registrationMethod': 'manual',
          'manualReason': manualReasonApiValue(reason),
        })
        .then(ManualRegisterResult.fromJson);
  }

  Future<InvoiceEvidenceUploadResult> uploadInvoiceEvidence({
    required String pointId,
    required List<int> bytes,
    DateTime? capturedAt,
    ManualRegisterReason? reason,
  }) {
    final prepared = prepareInvoiceEvidenceBytes(bytes);
    return _api
        .postJson('/delivery/manual/points/$pointId/invoice-evidence', {
          'contentType': prepared.contentType,
          'bytesBase64': invoiceEvidenceBytesBase64(prepared.bytes),
          if (capturedAt != null) 'capturedAt': capturedAt.toUtc().toIso8601String(),
          if (reason != null) 'manualReason': manualReasonApiValue(reason),
        })
        .then(InvoiceEvidenceUploadResult.fromJson);
  }
}
