import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'app_env.dart';

/// App configuration. Publishable/anon + map native keys only — never service_role/REST secret.
class AppConfig {
  AppConfig._({
    required this.dsEnv,
    required this.supabaseUrl,
    required this.supabaseAnonKey,
    required this.apiBaseUrl,
    required this.kakaoNativeAppKey,
    required this.naverMapClientId,
    required this.tmapClientId,
    required this.tmapApiKey,
    required this.tmapUserKey,
    required this.tmapDeviceKey,
    required this.completeViaSyncQueue,
    required this.todayServiceDateOverride,
    required this.workdayExecutionSessionV1,
  });

  final DsAppEnv dsEnv;
  final String supabaseUrl;
  final String supabaseAnonKey;
  final String apiBaseUrl;
  final String kakaoNativeAppKey;

  /// Optional. When null/empty, Naver map stays feature-gated (no init, no crash).
  final String? naverMapClientId;

  /// Optional TMAP Navi PoC auth fields (debug entry only). Empty = PoC gated.
  final String tmapClientId;
  final String tmapApiKey;
  final String tmapUserKey;
  final String tmapDeviceKey;

  /// Feature flag: when true, Complete uses Operation Queue (Phase 2).
  /// Default false — existing map-spike complete path unchanged.
  final bool completeViaSyncQueue;

  /// Debug/test only: pass explicit `?date=` to GET /delivery/today.
  /// Never invent a fixture-date fallback when unset (production uses server Seoul date).
  final String? todayServiceDateOverride;

  /// B3: job-neutral execution Session per Workday (mirrors server
  /// WORKDAY_EXECUTION_SESSION_V1). Default false — B2 picker path unchanged.
  final bool workdayExecutionSessionV1;

  static late AppConfig instance;

  static Future<void> load() async {
    try {
      await dotenv.load(fileName: '.env');
    } catch (_) {
      await dotenv.load(fileName: '.env.example');
    }

    const definedEnv = String.fromEnvironment('DS_ENV');
    const definedApi = String.fromEnvironment('API_BASE_URL');
    final dsEnv = ApiBaseUrlRules.parse(
      definedEnv.isNotEmpty ? definedEnv : (dotenv.env['DS_ENV'] ?? ''),
    );
    final url = (dotenv.env['SUPABASE_URL'] ?? '').trim();
    final anon = (dotenv.env['SUPABASE_ANON_KEY'] ?? '').trim();
    final api = ApiBaseUrlRules.resolve(
      fromDefine: definedApi,
      fromDotenv: dotenv.env['API_BASE_URL'] ?? '',
      env: dsEnv,
      allowLocalFallback: kDebugMode,
    );
    final kakaoNative = (dotenv.env['KAKAO_NATIVE_APP_KEY'] ?? '').trim();
    final naverClient = (dotenv.env['NAVER_MAP_CLIENT_ID'] ?? '').trim();
    final tmapClientId = (dotenv.env['TMAP_CLIENT_ID'] ?? '').trim();
    final tmapApiKey = (dotenv.env['TMAP_API_KEY'] ?? '').trim();
    final tmapUserKey = (dotenv.env['TMAP_USER_KEY'] ?? '').trim();
    final tmapDeviceKey = (dotenv.env['TMAP_DEVICE_KEY'] ?? '').trim();
    final syncCompleteRaw =
        (dotenv.env['COMPLETE_VIA_SYNC_QUEUE'] ?? 'false').trim().toLowerCase();
    final completeViaSyncQueue =
        syncCompleteRaw == '1' || syncCompleteRaw == 'true' || syncCompleteRaw == 'yes';
    final todayOverride =
        (dotenv.env['TODAY_SERVICE_DATE'] ?? '').trim();
    final executionRaw = (dotenv.env['WORKDAY_EXECUTION_SESSION_V1'] ?? 'false')
        .trim()
        .toLowerCase();
    final workdayExecutionSessionV1 = executionRaw == '1' ||
        executionRaw == 'true' ||
        executionRaw == 'yes';

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
      dsEnv: dsEnv,
      supabaseUrl: url.replaceAll(RegExp(r'/$'), ''),
      supabaseAnonKey: anon,
      apiBaseUrl: api.replaceAll(RegExp(r'/$'), ''),
      kakaoNativeAppKey: kakaoNative,
      naverMapClientId: naverClient.isEmpty ? null : naverClient,
      tmapClientId: tmapClientId,
      tmapApiKey: tmapApiKey,
      tmapUserKey: tmapUserKey,
      tmapDeviceKey: tmapDeviceKey,
      completeViaSyncQueue: completeViaSyncQueue,
      todayServiceDateOverride:
          todayOverride.isEmpty ? null : todayOverride,
      workdayExecutionSessionV1: workdayExecutionSessionV1,
    );
  }
}
