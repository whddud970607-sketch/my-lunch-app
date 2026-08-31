import 'dart:convert';

import 'package:crypto/crypto.dart';

/// Payload rules for local operation queue (Phase 0/1).
///
/// Never persist secrets, auth material, raw GPS, or POD binaries.
/// Prefer entity IDs / storage path references only.
///
/// TODO(P1-Snapshot): consider SQLCipher / encrypted-at-rest for the
/// LocalOperationStore backend behind [LocalOperationStore] — not in Phase 0/1.
class OperationPayloadRules {
  OperationPayloadRules._();

  /// Keys that must never appear in an operation payload (case-insensitive).
  static const prohibitedKeys = <String>{
    'password',
    'otp',
    'accesstoken',
    'access_token',
    'refreshtoken',
    'refresh_token',
    'ci',
    'accesssecret',
    'access_secret',
    'accessinfo',
    'access_info',
    'doorcode',
    'door_code',
    'entrancecode',
    'entrance_code',
    '공동현관',
    'latitude',
    'longitude',
    'lat',
    'lng',
    'rawgps',
    'raw_gps',
    'gps',
    'coordinates',
    'phone',
    'phonenumber',
    'phone_number',
    'msisdn',
    'customerphone',
    'customeraddress',
    'raw_address',
    'address',
    'podbytes',
    'pod_bytes',
    'imagebytes',
    'image_bytes',
    'photoBytes',
    'photobytes',
  };

  static void validateOrThrow(Map<String, dynamic> payload) {
    _walk(payload, '');
  }

  static void _walk(Object? node, String path) {
    if (node is Map) {
      for (final entry in node.entries) {
        final key = entry.key.toString();
        final normalized = key.toLowerCase().replaceAll('-', '_');
        final compact = normalized.replaceAll('_', '');
        if (prohibitedKeys.contains(normalized) ||
            prohibitedKeys.contains(compact) ||
            prohibitedKeys.contains(key.toLowerCase())) {
          throw ArgumentError(
            'prohibited payload field blocked (key only; value not logged)',
          );
        }
        _walk(entry.value, '$path.$key');
      }
      return;
    }
    if (node is List) {
      for (var i = 0; i < node.length; i++) {
        _walk(node[i], '$path[$i]');
      }
    }
  }

  /// Stable hash for idempotency payload comparison (no secrets in input).
  static String hashPayload(Map<String, dynamic> payload) {
    final canonical = jsonEncode(_canonicalize(payload));
    return sha256.convert(utf8.encode(canonical)).toString();
  }

  static Object? _canonicalize(Object? value) {
    if (value is Map) {
      final keys = value.keys.map((k) => k.toString()).toList()..sort();
      return {
        for (final k in keys) k: _canonicalize(value[k]),
      };
    }
    if (value is List) {
      return [for (final e in value) _canonicalize(e)];
    }
    return value;
  }
}
