import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import 'api_exception.dart';

/// Unauthenticated Nest API client for account recovery flows.
class PublicApiClient {
  PublicApiClient({http.Client? httpClient}) : _http = httpClient ?? http.Client();

  final http.Client _http;

  Uri _uri(String path) {
    final base = AppConfig.instance.apiBaseUrl;
    final normalized = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$base$normalized');
  }

  Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    final response = await _http.post(
      _uri(path),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: jsonEncode(body),
    );

    Map<String, dynamic> decoded = {};
    if (response.body.isNotEmpty) {
      final raw = jsonDecode(response.body);
      if (raw is Map<String, dynamic>) decoded = raw;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message = (decoded['message'] as String?) ??
          _statusMessage(response.statusCode);
      throw ApiException(message: message, statusCode: response.statusCode);
    }

    return decoded;
  }

  String _statusMessage(int code) {
    if (code == 401) return '인증에 실패했습니다.';
    if (code == 429) return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
    return '요청에 실패했습니다.';
  }

  void close() => _http.close();
}
