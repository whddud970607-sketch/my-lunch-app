import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('awaitingProfile exists and shell gates protected home before /me', () {
    final auth = File('lib/state/auth_controller.dart').readAsStringSync();
    expect(auth.contains('awaitingProfile'), isTrue);
    expect(auth.contains('isDriverAuthorized'), isTrue);
    expect(auth.contains('LOCAL_SESSION_KNOWN'), isTrue);
    // Session known → awaitingProfile notify before refreshMe.
    final knownIdx = auth.indexOf("mark('LOCAL_SESSION_KNOWN')");
    final awaitingIdx = auth.indexOf('AuthViewState.awaitingProfile');
    final refreshIdx = auth.indexOf('await refreshMe();');
    expect(knownIdx, greaterThan(0));
    expect(awaitingIdx, greaterThan(knownIdx));
    expect(refreshIdx, greaterThan(awaitingIdx));
  });

  test('AppShell does not mount HomeScreen before driver authorization', () {
    final shell = File('lib/screens/app_shell.dart').readAsStringSync();
    expect(shell.contains('isDriverAuthorized'), isTrue);
    expect(shell.contains('ProfilePendingBody'), isTrue);
    final gateIdx = shell.indexOf('if (!widget.controller.isDriverAuthorized)');
    final homeIdx = shell.indexOf('return HomeScreen(');
    expect(gateIdx, greaterThan(0));
    expect(homeIdx, greaterThan(gateIdx));
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
}
