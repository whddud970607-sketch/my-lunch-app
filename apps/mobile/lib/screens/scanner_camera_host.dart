import 'package:flutter/widgets.dart';

import 'scanner_session.dart';

class ScannerCameraException implements Exception {
  const ScannerCameraException(this.failure);

  final ScannerCameraFailure failure;
}

/// Camera/barcode hardware boundary. Widget tests inject a fake host.
abstract class ScannerCameraHost {
  Widget buildPreview({
    required ValueChanged<ScannerDetectedCode> onDetect,
  });

  Future<void> start();

  Future<void> stop();

  Future<void> pause();

  Future<void> toggleTorch();

  bool get torchAvailable;

  bool get torchEnabled;

  Listenable? get listenable;

  Future<void> dispose();
}

class ScannerDetectedCode {
  const ScannerDetectedCode({
    required this.rawValue,
    required this.formatLabel,
  });

  final String rawValue;
  final String formatLabel;
}
