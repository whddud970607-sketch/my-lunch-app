class ApiException implements Exception {
  ApiException({
    required this.message,
    this.statusCode,
    this.unauthorized = false,
    this.body,
  });

  final String message;
  final int? statusCode;
  final bool unauthorized;
  final Map<String, dynamic>? body;

  int? get incompletePoints {
    final n = body?['incompletePoints'];
    if (n is num) return n.toInt();
    return null;
  }

  /// Nest conflict/error `code` when present (e.g. no_eligible_jobs).
  String? get code {
    final c = body?['code'];
    if (c is String && c.isNotEmpty) return c;
    return null;
  }

  @override
  String toString() => 'ApiException($statusCode): $message';
}
