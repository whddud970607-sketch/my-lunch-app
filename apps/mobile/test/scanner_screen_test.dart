import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/screens/scanner_camera_host.dart';
import 'package:delivery_shield_mobile/screens/scanner_keys.dart';
import 'package:delivery_shield_mobile/screens/scanner_screen.dart';
import 'package:delivery_shield_mobile/screens/scanner_session.dart';
import 'package:delivery_shield_mobile/theme/app_theme.dart';

class FakeScannerCameraHost implements ScannerCameraHost {
  FakeScannerCameraHost({this.startHandler});

  Future<void> Function()? startHandler;
  int startCount = 0;
  int stopCount = 0;
  int pauseCount = 0;
  ValueChanged<ScannerDetectedCode>? onDetect;

  @override
  bool torchAvailable = false;

  @override
  bool torchEnabled = false;

  @override
  Listenable? get listenable => null;

  @override
  Widget buildPreview({
    required ValueChanged<ScannerDetectedCode> onDetect,
  }) {
    this.onDetect = onDetect;
    return const ColoredBox(
      color: Colors.black,
      child: SizedBox.expand(),
    );
  }

  @override
  Future<void> start() async {
    startCount += 1;
    if (startHandler != null) {
      await startHandler!();
      return;
    }
  }

  @override
  Future<void> stop() async {
    stopCount += 1;
  }

  @override
  Future<void> pause() async {
    pauseCount += 1;
  }

  @override
  Future<void> toggleTorch() async {
    torchEnabled = !torchEnabled;
  }

  @override
  Future<void> dispose() async {}

  void emitSynthetic(String value, String format) {
    onDetect?.call(
      ScannerDetectedCode(rawValue: value, formatLabel: format),
    );
  }
}

Future<void> _pumpScanner(
  WidgetTester tester, {
  required FakeScannerCameraHost host,
  ScannerSession? session,
  ValueNotifier<int>? tabIndex,
  int scanTabIndex = 3,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark(),
      home: ScannerScreen(
        tabIndex: tabIndex,
        scanTabIndex: scanTabIndex,
        session: session,
        cameraHost: host,
        onRegisterByAddress: () {},
      ),
    ),
  );
  await tester.pump();
}

void main() {
  testWidgets('SCANNER_INITIAL_STATE shows initializing until camera starts',
      (tester) async {
    final host = FakeScannerCameraHost(
      startHandler: () => Completer<void>().future,
    );
    await _pumpScanner(tester, host: host);
    expect(find.byKey(ScannerKeys.initializing), findsOneWidget);
    expect(find.text('카메라를 준비하는 중'), findsOneWidget);
    expect(find.text('스캔 기능 준비 중'), findsNothing);
  });

  testWidgets('SCANNER_PERMISSION_DENIED shows retry copy', (tester) async {
    final host = FakeScannerCameraHost(
      startHandler: () => throw const ScannerCameraException(
        ScannerCameraFailure.permissionDenied,
      ),
    );
    await _pumpScanner(tester, host: host);
    await tester.pump();
    expect(find.byKey(ScannerKeys.permissionDenied), findsOneWidget);
    expect(find.text('카메라 권한이 필요합니다'), findsOneWidget);
    expect(find.byKey(ScannerKeys.permissionRetry), findsOneWidget);
  });

  testWidgets('SCANNER_ERROR_STATE does not crash the shell chrome',
      (tester) async {
    final host = FakeScannerCameraHost(
      startHandler: () => throw const ScannerCameraException(
        ScannerCameraFailure.initFailed,
      ),
    );
    await _pumpScanner(tester, host: host);
    await tester.pump();
    expect(find.byKey(ScannerKeys.error), findsOneWidget);
    expect(find.text('스캔'), findsWidgets);
    expect(find.text('스캐너를 시작할 수 없습니다'), findsOneWidget);
  });

  testWidgets('SCANNER_DETECTED_STATE pauses and shows the synthetic code',
      (tester) async {
    final host = FakeScannerCameraHost();
    await _pumpScanner(tester, host: host);
    await tester.pump();
    expect(find.byKey(ScannerKeys.instruction), findsOneWidget);

    host.emitSynthetic('SYNTH-CODE-128', 'Code 128');
    await tester.pump();

    expect(find.byKey(ScannerKeys.detected), findsOneWidget);
    expect(find.text('코드가 인식되었습니다'), findsOneWidget);
    expect(find.text('SYNTH-CODE-128'), findsOneWidget);
    expect(find.text('Code 128'), findsOneWidget);
    expect(host.pauseCount, greaterThan(0));
  });

  testWidgets('SCANNER_DEDUPLICATION emits one result interaction',
      (tester) async {
    final host = FakeScannerCameraHost();
    await _pumpScanner(tester, host: host);
    await tester.pump();

    host.emitSynthetic('SYNTH-QR-DUP', 'QR');
    host.emitSynthetic('SYNTH-QR-DUP', 'QR');
    await tester.pump();

    expect(find.byKey(ScannerKeys.detected), findsOneWidget);
    expect(find.text('SYNTH-QR-DUP'), findsOneWidget);
    expect(find.byKey(ScannerKeys.rescan), findsOneWidget);
  });

  testWidgets('SCANNER_RESCAN restarts detection for the same code',
      (tester) async {
    final host = FakeScannerCameraHost();
    await _pumpScanner(tester, host: host);
    await tester.pump();

    host.emitSynthetic('SYNTH-EAN-13', 'EAN-13');
    await tester.pump();
    await tester.tap(find.byKey(ScannerKeys.rescan));
    await tester.pump();

    expect(find.byKey(ScannerKeys.instruction), findsOneWidget);
    host.emitSynthetic('SYNTH-EAN-13', 'EAN-13');
    await tester.pump();
    expect(find.text('SYNTH-EAN-13'), findsOneWidget);
  });

  testWidgets('SCANNER_TAB_LIFECYCLE stops camera when the tab is left',
      (tester) async {
    final host = FakeScannerCameraHost();
    final tabIndex = ValueNotifier(3);
    await _pumpScanner(tester, host: host, tabIndex: tabIndex);
    await tester.pump();
    expect(host.startCount, greaterThan(0));
    final startsAfterOpen = host.startCount;
    final stopsAfterOpen = host.stopCount;

    tabIndex.value = 0;
    await tester.pump();
    expect(host.stopCount, greaterThan(stopsAfterOpen));

    tabIndex.value = 3;
    await tester.pump();
    expect(host.startCount, greaterThan(startsAfterOpen));
  });

  testWidgets('SCANNER_TAB_LIFECYCLE stops camera on app background',
      (tester) async {
    final host = FakeScannerCameraHost();
    await _pumpScanner(tester, host: host);
    await tester.pump();
    final stopsBefore = host.stopCount;

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump();
    expect(host.stopCount, greaterThan(stopsBefore));

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(find.byKey(ScannerKeys.instruction), findsOneWidget);
  });

  testWidgets('SCANNER_MANUAL_CTA is visible while scanning', (tester) async {
    final host = FakeScannerCameraHost();
    await _pumpScanner(tester, host: host);
    await tester.pump();
    expect(find.byKey(ScannerKeys.instruction), findsOneWidget);
    expect(find.byKey(ScannerKeys.registerByAddress), findsOneWidget);
    expect(find.text('주소로 직접 등록'), findsOneWidget);
  });
}
