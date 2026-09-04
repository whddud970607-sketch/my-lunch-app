import 'package:flutter/foundation.dart';

/// Driver-facing scanner presentation states. Not delivery/domain statuses.
///
/// Next-phase production integration (not UI-8):
/// detected barcode/tracking identifier → Shipment → Point → delivery address.
/// Do not add fake local production mappings or embed Korean addresses in Code128.
enum ScannerViewState {
  initializing,
  scanning,
  detected,
  permissionDenied,
  cameraUnavailable,
  error,
}

enum ScannerCameraFailure {
  permissionDenied,
  permissionPermanentlyDenied,
  unavailable,
  initFailed,
}

/// Hardware-free session: one physical scan → one result until 다시 스캔.
class ScannerSession extends ChangeNotifier {
  ScannerViewState _state = ScannerViewState.initializing;
  String? _detectedValue;
  String? _detectedFormatLabel;
  bool _permanentlyDenied = false;
  String? _lockedValue;
  int _permissionDenyCount = 0;

  ScannerViewState get state => _state;
  String? get detectedValue => _detectedValue;
  String? get detectedFormatLabel => _detectedFormatLabel;
  bool get permanentlyDenied => _permanentlyDenied;

  bool get shouldRunCamera =>
      _state == ScannerViewState.initializing ||
      _state == ScannerViewState.scanning;

  void beginInitializing() {
    _state = ScannerViewState.initializing;
    _detectedValue = null;
    _detectedFormatLabel = null;
    _lockedValue = null;
    notifyListeners();
  }

  void markScanning() {
    if (_state == ScannerViewState.detected) return;
    if (_state == ScannerViewState.permissionDenied) return;
    if (_state == ScannerViewState.cameraUnavailable) return;
    if (_state == ScannerViewState.error) return;
    _state = ScannerViewState.scanning;
    notifyListeners();
  }

  /// Returns true when this is a new accepted scan. Duplicate in-frame values
  /// are ignored until [rescan].
  bool acceptDetection({
    required String rawValue,
    required String formatLabel,
  }) {
    final trimmed = rawValue.trim();
    if (trimmed.isEmpty) return false;
    if (_state != ScannerViewState.scanning) return false;
    if (_lockedValue != null && _lockedValue == trimmed) return false;

    _lockedValue = trimmed;
    _detectedValue = trimmed;
    _detectedFormatLabel = formatLabel;
    _state = ScannerViewState.detected;
    notifyListeners();
    return true;
  }

  void rescan() {
    _lockedValue = null;
    _detectedValue = null;
    _detectedFormatLabel = null;
    _state = ScannerViewState.scanning;
    notifyListeners();
  }

  void markFailure(ScannerCameraFailure failure) {
    switch (failure) {
      case ScannerCameraFailure.permissionDenied:
        _permissionDenyCount += 1;
        _permanentlyDenied = false;
        _state = ScannerViewState.permissionDenied;
      case ScannerCameraFailure.permissionPermanentlyDenied:
        _permissionDenyCount += 1;
        _permanentlyDenied = true;
        _state = ScannerViewState.permissionDenied;
      case ScannerCameraFailure.unavailable:
        _state = ScannerViewState.cameraUnavailable;
      case ScannerCameraFailure.initFailed:
        _state = ScannerViewState.error;
    }
    if (_permissionDenyCount >= 2 &&
        _state == ScannerViewState.permissionDenied) {
      _permanentlyDenied = true;
    }
    notifyListeners();
  }

  void retryAfterFailure() {
    beginInitializing();
  }
}
