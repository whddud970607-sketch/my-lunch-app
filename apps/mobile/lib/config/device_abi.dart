import 'dart:io';

import 'package:flutter/services.dart';

/// Kakao Map Android SDK ships only armeabi-v7a / arm64-v8a (no x86_64).
class DeviceAbi {
  DeviceAbi._();

  static const _channel = MethodChannel('delivery_shield/device');

  /// Primary ABI, e.g. `x86_64` or `arm64-v8a`. Empty on failure / non-Android.
  static Future<String> primaryAbi() async {
    if (!Platform.isAndroid) return '';
    try {
      final abi = await _channel.invokeMethod<String>('primaryAbi');
      return (abi ?? '').trim();
    } catch (_) {
      return '';
    }
  }

  static Future<bool> isKakaoMapNativeSupported() async {
    if (!Platform.isAndroid) return true;
    final abi = await primaryAbi();
    return abi == 'arm64-v8a' || abi == 'armeabi-v7a';
  }
}
