import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('awaitingProfile exists and shell gates protected home before /me', () {
    final auth = File('lib/state/auth_controller.dart').readAsStringSync();
    expect(auth.contains('awaitingProfile'), isTrue);
    expect(auth.contains('isDriverAuthorized'), isTrue);
    expect(auth.contains('LOCAL_SESSION_KNOWN'), isTrue);
    // Session known → awaitingProfile notify before refreshMe.
    final knownIdx = auth.indexOf("markSync('LOCAL_SESSION_KNOWN'");
    final awaitingIdx = auth.indexOf('AuthViewState.awaitingProfile');
    final refreshIdx = auth.indexOf('await refreshMe();');
    final permIdx = auth.indexOf('permissions.prepare');
    expect(knownIdx, greaterThan(0));
    expect(awaitingIdx, greaterThan(knownIdx));
    expect(refreshIdx, greaterThan(awaitingIdx));
    // Permission prep after safe-shell notify (PERF-S4).
    expect(permIdx, greaterThan(awaitingIdx));
  });

  test('AppShell does not mount HomeScreen before driver authorization', () {
    final shell = File('lib/screens/app_shell.dart').readAsStringSync();
    expect(shell.contains('isDriverAuthorized'), isTrue);
    expect(shell.contains('HomePendingSkeleton'), isTrue);
    expect(shell.contains('HomeScreen('), isTrue);
    final gateIdx = shell.indexOf('if (!widget.controller.isDriverAuthorized)');
    final homeIdx = shell.indexOf('return HomeScreen(');
    expect(gateIdx, greaterThan(0));
    expect(homeIdx, greaterThan(gateIdx));
    // Skeleton must not construct HomeScreen / workset repo.
    final skeleton = File('lib/screens/home_pending_skeleton.dart').readAsStringSync();
    expect(skeleton.contains('TodayWorkset'), isFalse);
    expect(skeleton.contains('fetchToday'), isFalse);
  });

  test('AuthGate binds sync/session only after signedIn driver', () {
    final gate = File('lib/screens/auth_gate.dart').readAsStringSync();
    expect(gate.contains('isDriverAuthorized'), isTrue);
    expect(gate.contains('bindDriver'), isTrue);
    expect(gate.contains('restoreOnBootstrap'), isTrue);
    expect(gate.contains('SAFE_SHELL_VISIBLE'), isTrue);
    expect(gate.contains('AUTHORIZED_CONTENT_VISIBLE'), isTrue);
    // awaitingProfile shows shell; bind only in signedIn block.
    final bindBlock = gate.indexOf('await widget.syncEngine.bindDriver');
    final signedInCheck = gate.lastIndexOf('AuthViewState.signedIn', bindBlock);
    expect(signedInCheck, greaterThan(0));
  });

  test('main does not restore session before runApp', () {
    final main = File('lib/main.dart').readAsStringSync();
    expect(
      main.contains('await sessionController.restoreOnBootstrap'),
      isFalse,
    );
    expect(main.contains('MapSdkBootstrap.ensureInitialized()'), isTrue);
  });

  test('StartupTiming markMainStart does not await MethodChannel before emit', () {
    final timing = File('lib/debug/startup_timing.dart').readAsStringSync();
    final startIdx = timing.indexOf('static Future<void> markMainStart()');
    final hydrateIdx = timing.indexOf('_hydrateProcessTiming');
    expect(startIdx, greaterThan(0));
    expect(hydrateIdx, greaterThan(startIdx));
    final body = timing.substring(startIdx, hydrateIdx + 40);
    expect(body.contains("_emit('DART_MAIN_START')"), isTrue);
    expect(body.contains('unawaited(_hydrateProcessTiming())'), isTrue);
  });
}
