import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import 'api_exception.dart';

typedef AccessTokenProvider = Future<String?> Function();
typedef UnauthorizedHandler = Future<void> Function();

/// NestJS HTTP client. Always uses Bearer access_token.
/// Does not talk to Supabase PostgREST for delivery_* tables.
class ApiClient {
  ApiClient({
    required this.tokenProvider,
    this.onUnauthorized,
    http.Client? httpClient,
  }) : _http = httpClient ?? http.Client();

  final AccessTokenProvider tokenProvider;
  final UnauthorizedHandler? onUnauthorized;
  final http.Client _http;

  Uri _uri(String path) {
    final base = AppConfig.instance.apiBaseUrl;
    final normalized = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$base$normalized');
  }

  Future<Map<String, dynamic>> getJson(String path) async {
    final token = await tokenProvider();
    if (token == null || token.isEmpty) {
      throw ApiException(message: 'Not signed in', unauthorized: true);
    }

    final response = await _http.get(
      _uri(path),
      headers: {
        'Authorization': 'Bearer $token',
        'Accept': 'application/json',
      },
    );

    return _decode(response);
  }

  Future<Map<String, dynamic>> patchJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    final token = await tokenProvider();
    if (token == null || token.isEmpty) {
      throw ApiException(message: 'Not signed in', unauthorized: true);
    }

    final response = await _http.patch(
      _uri(path),
      headers: {
        'Authorization': 'Bearer $token',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: jsonEncode(body),
    );

    return _decode(response);
  }

  Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    final token = await tokenProvider();
    if (token == null || token.isEmpty) {
      throw ApiException(message: 'Not signed in', unauthorized: true);
    }

    final response = await _http.post(
      _uri(path),
      headers: {
        'Authorization': 'Bearer $token',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: jsonEncode(body),
    );

    return _decode(response);
  }

  Map<String, dynamic> _decode(http.Response response) {
    Map<String, dynamic> body = {};
    if (response.body.isNotEmpty) {
      final decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic>) {
        body = decoded;
      }
    }

    if (response.statusCode == 401) {
      // Do not log token or body contents that may include PII.
      onUnauthorized?.call();
      throw ApiException(
        message: 'Session expired. Please sign in again.',
        statusCode: 401,
        unauthorized: true,
      );
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final msg = (body['message'] as String?) ?? 'Request failed';
      throw ApiException(message: msg, statusCode: response.statusCode);
    }

    return body;
  }

  void close() => _http.close();
}
