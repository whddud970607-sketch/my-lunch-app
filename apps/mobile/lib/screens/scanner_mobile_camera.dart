import 'package:flutter/widgets.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import 'scanner_camera_host.dart';
import 'scanner_session.dart';

/// On-device CameraX / ML Kit host. Does not log or persist scan payloads.
class MobileScannerCameraHost implements ScannerCameraHost {
  MobileScannerCameraHost()
      : _controller = MobileScannerController(
          autoStart: false,
          returnImage: false,
          detectionSpeed: DetectionSpeed.normal,
          detectionTimeoutMs: 800,
          formats: const [
            BarcodeFormat.code128,
            BarcodeFormat.code39,
            BarcodeFormat.ean13,
            BarcodeFormat.ean8,
            BarcodeFormat.qrCode,
          ],
        );

  MobileScannerController? _controller;

  MobileScannerController get _requireController {
    final controller = _controller;
    if (controller == null) {
      throw ScannerCameraException(ScannerCameraFailure.initFailed);
    }
    return controller;
  }

  @override
  Listenable? get listenable => _controller;

  @override
  bool get torchAvailable {
    final torch = _controller?.value.torchState;
    return torch == TorchState.on || torch == TorchState.off;
  }

  @override
  bool get torchEnabled => _controller?.value.torchState == TorchState.on;

  @override
  Widget buildPreview({
    required ValueChanged<ScannerDetectedCode> onDetect,
  }) {
    final controller = _requireController;
    return MobileScanner(
      controller: controller,
      useAppLifecycleState: false,
      onDetect: (capture) {
        for (final barcode in capture.barcodes) {
          final raw = barcode.rawValue;
          if (raw == null || raw.isEmpty) continue;
          onDetect(
            ScannerDetectedCode(
              rawValue: raw,
              formatLabel: _formatLabel(barcode.format),
            ),
          );
          return;
        }
      },
    );
  }

  @override
  Future<void> start() async {
    final controller = _requireController;
    try {
      await controller.start();
    } on MobileScannerException catch (e) {
      throw ScannerCameraException(_mapError(e.errorCode));
    }
  }

  @override
  Future<void> stop() async {
    final controller = _controller;
    if (controller == null) return;
    try {
      await controller.stop();
    } on MobileScannerException {
      // Already stopped or not attached — safe to ignore.
    }
  }

  @override
  Future<void> pause() async {
    final controller = _controller;
    if (controller == null) return;
    try {
      await controller.pause();
    } on MobileScannerException {
      await stop();
    }
  }

  @override
  Future<void> toggleTorch() async {
    final controller = _controller;
    if (controller == null || !torchAvailable) return;
    try {
      await controller.toggleTorch();
    } on MobileScannerException {
      // Device/package may not support torch.
    }
  }

  @override
  Future<void> dispose() async {
    final controller = _controller;
    _controller = null;
    if (controller == null) return;
    await controller.dispose();
  }

  ScannerCameraFailure _mapError(MobileScannerErrorCode code) {
    switch (code) {
      case MobileScannerErrorCode.permissionDenied:
        return ScannerCameraFailure.permissionDenied;
      case MobileScannerErrorCode.unsupported:
        return ScannerCameraFailure.unavailable;
      default:
        return ScannerCameraFailure.initFailed;
    }
  }

  String _formatLabel(BarcodeFormat format) {
    switch (format) {
      case BarcodeFormat.code128:
        return 'Code 128';
      case BarcodeFormat.code39:
        return 'Code 39';
      case BarcodeFormat.ean13:
        return 'EAN-13';
      case BarcodeFormat.ean8:
        return 'EAN-8';
      case BarcodeFormat.qrCode:
        return 'QR';
      default:
        return 'Barcode';
    }
  }
}
