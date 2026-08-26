class ApiException implements Exception {
  ApiException({
    required this.message,
    this.statusCode,
    this.unauthorized = false,
  });

  final String message;
  final int? statusCode;
  final bool unauthorized;

  @override
  String toString() => 'ApiException($statusCode): $message';
}
