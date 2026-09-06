/// Explicit runtime profile. Local may use a PC API; staging/production must not.
enum DsAppEnv {
  local,
  staging,
  production,
}

abstract final class ApiBaseUrlRules {
  static const stagingApiBaseUrl =
      'https://delivery-shield-api-staging.onrender.com/v1';

  static DsAppEnv parse(String raw) {
    switch (raw.trim().toLowerCase()) {
      case 'staging':
        return DsAppEnv.staging;
      case 'production':
        return DsAppEnv.production;
      default:
        return DsAppEnv.local;
    }
  }

  static bool isLoopbackHost(String url) {
    final parsed = Uri.tryParse(url.trim());
    if (parsed == null || parsed.host.isEmpty) return false;
    final host = parsed.host.toLowerCase();
    return host == 'localhost' ||
        host == '127.0.0.1' ||
        host == '10.0.2.2' ||
        host == '::1';
  }

  /// Compile-time `--dart-define=API_BASE_URL=` wins over dotenv.
  /// Staging/production reject loopback (adb reverse / 127.0.0.1 / emulator).
  static String resolve({
    required String fromDefine,
    required String fromDotenv,
    required DsAppEnv env,
    required bool allowLocalFallback,
  }) {
    // Staging ignores local dotenv so USB/loopback .env cannot leak into testers.
    final chosen = fromDefine.trim().isNotEmpty
        ? fromDefine.trim()
        : (env == DsAppEnv.staging ? stagingApiBaseUrl : fromDotenv.trim());
    if (chosen.isEmpty) {
      if (env == DsAppEnv.local && allowLocalFallback) {
        return 'http://10.0.2.2:4000/v1';
      }
      throw StateError('API_BASE_URL is required for ${env.name}');
    }
    if (env != DsAppEnv.local) {
      if (isLoopbackHost(chosen)) {
        throw StateError(
          'API_BASE_URL for ${env.name} cannot be localhost / 127.0.0.1 / 10.0.2.2',
        );
      }
      final parsed = Uri.tryParse(chosen);
      if (parsed == null || parsed.scheme.toLowerCase() != 'https') {
        throw StateError(
          'API_BASE_URL for ${env.name} must be HTTPS',
        );
      }
    }
    return chosen.replaceAll(RegExp(r'/$'), '');
  }
}
