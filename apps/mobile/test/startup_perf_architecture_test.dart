import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('runApp path does not await map SDK or profile before first frame', () {
    final main = File('lib/main.dart').readAsStringSync();
    expect(main.contains('MapSdkBootstrap.ensureInitialized()'), isTrue);
    expect(main.contains('await KakaoMapsFlutter.init'), isFalse);
    expect(main.contains('await NaverMapFeature.tryInitialize()'), isFalse);
    expect(
      main.contains('await sessionController.restoreOnBootstrap'),
      isFalse,
    );
    final runAppIdx = main.indexOf("mark('RUN_APP')");
    final bootstrapIdx = main.indexOf('controller.bootstrap()');
    expect(runAppIdx, greaterThan(0));
    expect(bootstrapIdx, greaterThan(runAppIdx));
  });

  test('auth gate still requires signedIn before AppShell', () {
    final gate = File('lib/screens/auth_gate.dart').readAsStringSync();
    expect(gate.contains('AuthViewState.signedIn'), isTrue);
    expect(gate.contains('AppShell('), isTrue);
    expect(gate.contains('LoginScreen('), isTrue);
    expect(gate.contains('AuthViewState.loading'), isTrue);
    // Profile-backed signedIn remains the shell gate (no provisional shell).
    final auth = File('lib/state/auth_controller.dart').readAsStringSync();
    expect(auth.contains('await refreshMe()'), isTrue);
    expect(auth.contains('state = AuthViewState.signedIn'), isTrue);
  });

  test('map tab ensures deferred SDK init before load', () {
    final map = File('lib/screens/map_spike_screen.dart').readAsStringSync();
    expect(map.contains('MapSdkBootstrap.ensureInitialized()'), isTrue);
    expect(File('lib/map/map_sdk_bootstrap.dart').existsSync(), isTrue);
  });

  test('session restore is owned by AuthGate after signedIn', () {
    final gate = File('lib/screens/auth_gate.dart').readAsStringSync();
    expect(gate.contains('restoreOnBootstrap'), isTrue);
    final main = File('lib/main.dart').readAsStringSync();
    expect(main.contains('restoreOnBootstrap'), isFalse);
  });
}
