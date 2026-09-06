import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/config/app_env.dart';

void main() {
  test('parse env profiles', () {
    expect(ApiBaseUrlRules.parse(''), DsAppEnv.local);
    expect(ApiBaseUrlRules.parse('local'), DsAppEnv.local);
    expect(ApiBaseUrlRules.parse('staging'), DsAppEnv.staging);
    expect(ApiBaseUrlRules.parse('production'), DsAppEnv.production);
  });

  test('loopback hosts are detected', () {
    expect(ApiBaseUrlRules.isLoopbackHost('http://127.0.0.1:4000/v1'), isTrue);
    expect(ApiBaseUrlRules.isLoopbackHost('http://localhost:4000/v1'), isTrue);
    expect(ApiBaseUrlRules.isLoopbackHost('http://10.0.2.2:4000/v1'), isTrue);
    expect(
      ApiBaseUrlRules.isLoopbackHost('https://example.invalid/v1'),
      isFalse,
    );
  });

  test('dart-define wins and staging rejects loopback or http overrides', () {
    expect(
      ApiBaseUrlRules.resolve(
        fromDefine: 'https://staging.example/v1/',
        fromDotenv: 'http://127.0.0.1:4000/v1',
        env: DsAppEnv.staging,
        allowLocalFallback: false,
      ),
      'https://staging.example/v1',
    );
    expect(
      () => ApiBaseUrlRules.resolve(
        fromDefine: 'http://127.0.0.1:4000/v1',
        fromDotenv: '',
        env: DsAppEnv.staging,
        allowLocalFallback: false,
      ),
      throwsStateError,
    );
    expect(
      () => ApiBaseUrlRules.resolve(
        fromDefine: 'http://example.invalid/v1',
        fromDotenv: '',
        env: DsAppEnv.staging,
        allowLocalFallback: false,
      ),
      throwsStateError,
    );
  });

  test('staging uses official Render URL when dart-define is empty', () {
    expect(
      ApiBaseUrlRules.resolve(
        fromDefine: '',
        fromDotenv: 'http://127.0.0.1:4000/v1',
        env: DsAppEnv.staging,
        allowLocalFallback: false,
      ),
      ApiBaseUrlRules.stagingApiBaseUrl,
    );
    expect(
      ApiBaseUrlRules.stagingApiBaseUrl,
      'https://delivery-shield-api-staging.onrender.com/v1',
    );
    expect(
      ApiBaseUrlRules.isLoopbackHost(ApiBaseUrlRules.stagingApiBaseUrl),
      isFalse,
    );
    expect(
      Uri.parse(ApiBaseUrlRules.stagingApiBaseUrl).scheme,
      'https',
    );
  });

  test('local debug may fall back to emulator host', () {
    expect(
      ApiBaseUrlRules.resolve(
        fromDefine: '',
        fromDotenv: '',
        env: DsAppEnv.local,
        allowLocalFallback: true,
      ),
      'http://10.0.2.2:4000/v1',
    );
  });
}
