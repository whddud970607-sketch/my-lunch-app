import 'package:uuid/uuid.dart';

import '../copy/driver_chrome_copy.dart';
import '../models/manual_address_candidate.dart';
import '../services/api_exception.dart';

/// Client idempotency: one UUID per 등록 intent, reused on retry/double-tap.
class ManualRegisterIdempotency {
  ManualRegisterIdempotency({String Function()? createKey})
      : _createKey = createKey ?? const Uuid().v4;

  final String Function() _createKey;
  String? _key;

  String get key => _key ??= _createKey();

  void reset() {
    _key = null;
  }

  bool get hasKey => _key != null;
}

int normalizeManualQuantity(String raw) {
  final t = raw.trim();
  if (t.isEmpty) return 1;
  return int.tryParse(t) ?? -1;
}

int defaultManualQuantity() => 1;

String _blankToEmpty(String? raw) => (raw ?? '').trim();

String _withKoreanSuffix(String raw, String suffix) {
  if (raw.isEmpty) return '';
  return raw.endsWith(suffix) ? raw : '$raw$suffix';
}

/// Normalizes optional detail + 동/호 for payload and stored address.
/// Empty/whitespace fields are ignored. Does not invent a detail from quantity.
String composeManualDetailAddress({
  required String? detail,
  required String? dong,
  required String? unit,
}) {
  final extra = _blankToEmpty(detail);
  final dongPart = _withKoreanSuffix(_blankToEmpty(dong), '동');
  final hoPart = _withKoreanSuffix(_blankToEmpty(unit), '호');
  final generated = [dongPart, hoPart].where((p) => p.isNotEmpty).join(' ');
  if (extra.isEmpty) return generated;
  if (generated.isEmpty) return extra;
  if (extra.contains(generated)) return extra;
  return '$generated $extra';
}

String composeManualDetailPreview({
  required String? detail,
  required String? dong,
  required String? unit,
}) {
  return composeManualDetailAddress(detail: detail, dong: dong, unit: unit);
}

String manualRegisterErrorMessage(Object error) {
  if (isOfflineManualFailure(error)) {
    return DriverChromeCopy.manualOffline;
  }
  if (error is ApiException) {
    if (error.unauthorized) {
      return DriverChromeCopy.manualRegisterNeedLogin;
    }
    final code = (error.code ?? error.message).trim();
    switch (code) {
      case 'source_ensure_unavailable':
      case 'source_ensure_failed':
        return DriverChromeCopy.manualRegisterServerBusy;
      case 'validation_not_committable':
        return DriverChromeCopy.manualRegisterInvalidAddress;
      case 'address is required':
        return DriverChromeCopy.manualRegisterMissingAddress;
      case 'quantity must be a non-negative integer':
        return DriverChromeCopy.manualRegisterBadQuantity;
      default:
        if (code.startsWith('import_context_')) {
          return DriverChromeCopy.manualRegisterServerBusy;
        }
        if (error.message.isNotEmpty &&
            error.message != 'Request failed' &&
            !error.message.contains('Exception')) {
          return '${DriverChromeCopy.manualRegisterFailed} · ${error.message}';
        }
    }
  }
  return DriverChromeCopy.manualRegisterFailed;
}

bool isOfflineManualFailure(Object error) {
  final text = error.toString().toLowerCase();
  return text.contains('socket') ||
      text.contains('failed host lookup') ||
      text.contains('network') ||
      text.contains('connection') ||
      text.contains('timeout');
}

/// Search-result coords for register payload. Invalid/missing → omitted.
Map<String, double> manualRegisterCoordinateFields(
  ManualAddressCandidate candidate,
) {
  final lat = candidate.latitude;
  final lng = candidate.longitude;
  if (lat == null || lng == null) return const {};
  if (!lat.isFinite || !lng.isFinite) return const {};
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return const {};
  if (lat == 0 && lng == 0) return const {};
  return {'latitude': lat, 'longitude': lng};
}

List<ManualAddressCandidate> parseManualSuggestResults(
  Map<String, dynamic> json,
) {
  final raw = json['results'];
  if (raw is! List) return const [];
  return [
    for (final row in raw)
      if (row is Map<String, dynamic>) ManualAddressCandidate.fromJson(row),
  ];
}
