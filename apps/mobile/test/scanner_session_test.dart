import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/screens/scanner_session.dart';

void main() {
  test('SCANNER_INITIAL_STATE is initializing', () {
    final session = ScannerSession();
    expect(session.state, ScannerViewState.initializing);
    expect(session.detectedValue, isNull);
    expect(session.shouldRunCamera, isTrue);
  });

  test('SCANNER_PERMISSION_DENIED maps to permissionDenied', () {
    final session = ScannerSession();
    session.markScanning();
    session.markFailure(ScannerCameraFailure.permissionDenied);
    expect(session.state, ScannerViewState.permissionDenied);
    expect(session.permanentlyDenied, isFalse);
    expect(session.shouldRunCamera, isFalse);
  });

  test('second permission denial is treated as permanently denied', () {
    final session = ScannerSession();
    session.markFailure(ScannerCameraFailure.permissionDenied);
    session.retryAfterFailure();
    session.markFailure(ScannerCameraFailure.permissionDenied);
    expect(session.state, ScannerViewState.permissionDenied);
    expect(session.permanentlyDenied, isTrue);
  });

  test('SCANNER_ERROR_STATE maps init failure', () {
    final session = ScannerSession();
    session.markFailure(ScannerCameraFailure.initFailed);
    expect(session.state, ScannerViewState.error);
    expect(session.shouldRunCamera, isFalse);
  });

  test('camera unavailable is not an error state', () {
    final session = ScannerSession();
    session.markFailure(ScannerCameraFailure.unavailable);
    expect(session.state, ScannerViewState.cameraUnavailable);
  });

  test('SCANNER_DETECTED_STATE stores the code once', () {
    final session = ScannerSession();
    session.markScanning();
    final first = session.acceptDetection(
      rawValue: 'SYNTH-CODE-128',
      formatLabel: 'Code 128',
    );
    expect(first, isTrue);
    expect(session.state, ScannerViewState.detected);
    expect(session.detectedValue, 'SYNTH-CODE-128');
    expect(session.detectedFormatLabel, 'Code 128');
  });

  test('SCANNER_DEDUPLICATION ignores the same in-frame value', () {
    final session = ScannerSession();
    session.markScanning();
    expect(
      session.acceptDetection(
        rawValue: 'SYNTH-QR-1',
        formatLabel: 'QR',
      ),
      isTrue,
    );
    expect(
      session.acceptDetection(
        rawValue: 'SYNTH-QR-1',
        formatLabel: 'QR',
      ),
      isFalse,
    );
    expect(session.state, ScannerViewState.detected);
  });

  test('empty values are not detections', () {
    final session = ScannerSession();
    session.markScanning();
    expect(
      session.acceptDetection(rawValue: '   ', formatLabel: 'QR'),
      isFalse,
    );
    expect(session.state, ScannerViewState.scanning);
  });

  test('SCANNER_RESCAN allows the same code again', () {
    final session = ScannerSession();
    session.markScanning();
    session.acceptDetection(rawValue: 'SYNTH-EAN-13', formatLabel: 'EAN-13');
    session.rescan();
    expect(session.state, ScannerViewState.scanning);
    expect(session.detectedValue, isNull);
    expect(
      session.acceptDetection(rawValue: 'SYNTH-EAN-13', formatLabel: 'EAN-13'),
      isTrue,
    );
    expect(session.state, ScannerViewState.detected);
  });

  test('SCANNER_NO_FAKE_DELIVERY_CREATION stays local', () {
    final session = ScannerSession();
    session.markScanning();
    session.acceptDetection(rawValue: 'SYNTH-RAW', formatLabel: 'QR');
    expect(session.state, ScannerViewState.detected);
  });
}
