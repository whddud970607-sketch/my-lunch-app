import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/screens/manual_address_register_data.dart';
import 'package:delivery_shield_mobile/services/api_exception.dart';

void main() {
  test('composeManualDetailAddress covers dong/ho/detail rules', () {
    expect(
      composeManualDetailAddress(detail: '', dong: '101', unit: '1203'),
      '101동 1203호',
    );
    expect(
      composeManualDetailAddress(detail: '', dong: '101동', unit: '1203호'),
      '101동 1203호',
    );
    expect(
      composeManualDetailAddress(detail: 'A동 출입구 앞', dong: '', unit: ''),
      'A동 출입구 앞',
    );
    expect(
      composeManualDetailAddress(detail: '', dong: '101', unit: ''),
      '101동',
    );
    expect(
      composeManualDetailAddress(detail: '', dong: '', unit: '1203'),
      '1203호',
    );
    expect(
      composeManualDetailAddress(
        detail: '건물 뒤편',
        dong: '101',
        unit: '1203',
      ),
      '101동 1203호 건물 뒤편',
    );
    expect(
      composeManualDetailAddress(
        detail: '   ',
        dong: ' 101 ',
        unit: ' 1203 ',
      ),
      '101동 1203호',
    );
    expect(
      composeManualDetailAddress(detail: '', dong: '', unit: ''),
      '',
    );
  });

  test('manualRegisterErrorMessage does not swallow API failures', () {
    expect(
      manualRegisterErrorMessage(
        ApiException(message: 'source_ensure_unavailable', statusCode: 503),
      ),
      contains('서버 준비 중'),
    );
    expect(
      manualRegisterErrorMessage(Exception('timeout')),
      contains('인터넷'),
    );
  });
}
