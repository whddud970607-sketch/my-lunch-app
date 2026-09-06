import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('release ProGuard keeps Kakao VectorMap JNI types', () {
    final rules = File('android/app/proguard-rules.pro').readAsStringSync();
    expect(rules.contains('-keep class com.kakao.vectormap.**'), isTrue);
    expect(rules.contains('-keepclassmembers class com.kakao.vectormap.**'), isTrue);
    // Documented failure mode — keep comment + rule together.
    expect(rules.contains('MapViewHolder'), isTrue);
    expect(rules.contains('RenderViewOptions'), isTrue);
  });

  test('release buildType wires app ProGuard rules file', () {
    final gradle = File('android/app/build.gradle.kts').readAsStringSync();
    expect(gradle.contains('proguard-rules.pro'), isTrue);
    expect(gradle.contains('proguardFiles'), isTrue);
  });

  test('A: pin + driver style paths share _runLabelStyleOp', () {
    final kakao = File('lib/map/kakao_delivery_map.dart').readAsStringSync();
    expect(kakao.contains('_runLabelStyleOp'), isTrue);
    // Both registerMarkerStyles call sites must go through the shared gate.
    final registerCalls = RegExp(r'registerMarkerStyles\(').allMatches(kakao);
    expect(registerCalls.length, greaterThanOrEqualTo(2));
    final gateBlocks = RegExp(
      r'_runLabelStyleOp\(\(\) async \{[\s\S]*?registerMarkerStyles',
    ).allMatches(kakao);
    expect(gateBlocks.length, equals(registerCalls.length));
  });

  test('B/D: host generation guard wraps style registration', () {
    final kakao = File('lib/map/kakao_delivery_map.dart').readAsStringSync();
    expect(kakao.contains('KakaoMapHostGuard'), isTrue);
    expect(kakao.contains('_isCurrentController(controller)'), isTrue);
    expect(kakao.contains('_driverStyles.reset()'), isTrue);
  });
}
