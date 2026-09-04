import 'package:uuid/uuid.dart';

import '../models/manual_address_candidate.dart';

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

String composeManualDetailPreview({
  required String? detail,
  required String? dong,
  required String? unit,
}) {
  final parts = <String>[];
  final d = dong?.trim() ?? '';
  if (d.isNotEmpty) {
    parts.add(d.endsWith('동') ? d : '$d동');
  }
  final u = unit?.trim() ?? '';
  if (u.isNotEmpty) {
    parts.add(u.endsWith('호') ? u : '$u호');
  }
  final extra = detail?.trim() ?? '';
  if (extra.isNotEmpty) parts.add(extra);
  return parts.join(' ');
}

bool isOfflineManualFailure(Object error) {
  final text = error.toString().toLowerCase();
  return text.contains('socket') ||
      text.contains('failed host lookup') ||
      text.contains('network') ||
      text.contains('connection');
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
