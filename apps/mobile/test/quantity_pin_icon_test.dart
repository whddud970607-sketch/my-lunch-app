import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:delivery_shield_mobile/map/quantity_pin_icon.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('renders quantity 1 into pin bitmap for visual check', () async {
    QuantityPinIconFactory.clearCache();
    final bytes = await QuantityPinIconFactory.bytesForQuantity(1);
    expect(bytes.length, greaterThan(1000));
    final out = File('build/quantity_pin_1.png');
    await out.parent.create(recursive: true);
    await out.writeAsBytes(bytes);
    expect(out.existsSync(), isTrue);
  });
}
