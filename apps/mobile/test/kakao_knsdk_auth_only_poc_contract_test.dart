import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Contract: auth-only KNSDK PoC stays isolated from product 길찾기 Activity.
void main() {
  test('manifest registers KakaoKnsdkAuthOnlyPocActivity (diagnostic, not launcher)', () {
    final manifest = File('android/app/src/main/AndroidManifest.xml');
    expect(manifest.existsSync(), isTrue);
    final text = manifest.readAsStringSync();
    expect(text.contains('.KakaoKnsdkAuthOnlyPocActivity'), isTrue);
    expect(text.contains('KakaoNaviPocActivity'), isTrue);
    expect(text.contains('KNSDK_AUTH_ONLY_POC'), isTrue);
    final pocBlock = RegExp(
      r'android:name="\.KakaoKnsdkAuthOnlyPocActivity"[\s\S]*?(?=<activity|</application>)',
    ).firstMatch(text)?.group(0);
    expect(pocBlock, isNotNull);
    expect(pocBlock!.contains('LAUNCHER'), isFalse);
    expect(pocBlock.contains('MAIN'), isFalse);
  });
}
