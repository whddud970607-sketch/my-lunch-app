import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('map_spike pin-adjust does not call disableFollow', () {
    final src = File('lib/screens/map_spike_screen.dart').readAsStringSync();
    expect(src.contains('setCameraFollowSuppressed(true)'), isTrue);
    expect(src.contains('_startPinAdjust'), isTrue);

    // Extract _startPinAdjust body roughly.
    final start = src.indexOf('Future<void> _startPinAdjust');
    expect(start, greaterThanOrEqualTo(0));
    final end = src.indexOf('Future<void> _savePinAdjust', start);
    expect(end, greaterThan(start));
    final body = src.substring(start, end);
    expect(body.contains('disableFollow'), isFalse);
    expect(body.contains('setCameraFollowSuppressed(true)'), isTrue);
  });

  test('only session-end path in map_spike calls disableFollow', () {
    final src = File('lib/screens/map_spike_screen.dart').readAsStringSync();
    final matches = RegExp(r'disableFollow\(\)').allMatches(src).length;
    expect(matches, 1);
    expect(src.contains('_onDeliverySessionChanged'), isTrue);
  });
}
