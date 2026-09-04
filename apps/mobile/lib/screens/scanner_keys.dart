import 'package:flutter/material.dart';

abstract final class ScannerKeys {
  static const screen = Key('scanner_screen');
  static const preview = Key('scanner_preview');
  static const frame = Key('scanner_frame');
  static const instruction = Key('scanner_instruction');
  static const initializing = Key('scanner_initializing');
  static const detected = Key('scanner_detected');
  static const detectedValue = Key('scanner_detected_value');
  static const rescan = Key('scanner_rescan');
  static const permissionDenied = Key('scanner_permission_denied');
  static const permissionRetry = Key('scanner_permission_retry');
  static const cameraUnavailable = Key('scanner_camera_unavailable');
  static const error = Key('scanner_error');
  static const errorRetry = Key('scanner_error_retry');
  static const torch = Key('scanner_torch');
  static const registerByAddress = Key('scanner_register_by_address');
}
