import 'package:flutter_dotenv/flutter_dotenv.dart';

/// App configuration. Publishable/anon + Kakao native only — never service_role/REST secret.
class AppConfig {
  AppConfig._({
    required this.supabaseUrl,
    required this.supabaseAnonKey,
    required this.apiBaseUrl,
    required this.kakaoNativeAppKey,
  });

  final String supabaseUrl;
  final String supabaseAnonKey;
  final String apiBaseUrl;
  final String kakaoNativeAppKey;

  static late AppConfig instance;

  static Future<void> load() async {
    try {
      await dotenv.load(fileName: '.env');
    } catch (_) {
      await dotenv.load(fileName: '.env.example');
    }

    final url = (dotenv.env['SUPABASE_URL'] ?? '').trim();
    final anon = (dotenv.env['SUPABASE_ANON_KEY'] ?? '').trim();
    final api = (dotenv.env['API_BASE_URL'] ?? 'http://10.0.2.2:4000/v1').trim();
    final kakaoNative = (dotenv.env['KAKAO_NATIVE_APP_KEY'] ?? '').trim();

    if (url.isEmpty) {
      throw StateError('SUPABASE_URL is missing in .env');
    }
    if (anon.isEmpty) {
      throw StateError(
        'SUPABASE_ANON_KEY is missing. Put the publishable/anon key in apps/mobile/.env',
      );
    }
    if (anon.contains('service_role') || anon.startsWith('sb_secret_')) {
      throw StateError(
        'Refusing to start: service/secret key must not be used in Flutter',
      );
    }
    if (kakaoNative.isEmpty) {
      throw StateError(
        'KAKAO_NATIVE_APP_KEY is missing in apps/mobile/.env',
      );
    }
    // Never accept Kakao REST/Admin style keys in the mobile app.
    if (dotenv.env.containsKey('KAKAO_REST_API_KEY') &&
        (dotenv.env['KAKAO_REST_API_KEY'] ?? '').trim().isNotEmpty) {
      throw StateError(
        'Refusing to start: KAKAO_REST_API_KEY must not be present in mobile .env',
      );
    }

    instance = AppConfig._(
      supabaseUrl: url.replaceAll(RegExp(r'/$'), ''),
      supabaseAnonKey: anon,
      apiBaseUrl: api.replaceAll(RegExp(r'/$'), ''),
      kakaoNativeAppKey: kakaoNative,
    );
  }
}
