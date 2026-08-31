import 'package:delivery_shield_mobile/utils/recovery_flow_lifecycle.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('RecoveryFlowLifecycle', () {
    late TextEditingController name;
    late TextEditingController birthDate;
    late TextEditingController phone;
    late TextEditingController password;
    late TextEditingController passwordConfirm;

    setUp(() {
      name = TextEditingController(text: '테스트');
      birthDate = TextEditingController(text: '19900101');
      phone = TextEditingController(text: '00000000001');
      password = TextEditingController(text: 'secret123');
      passwordConfirm = TextEditingController(text: 'secret123');
    });

    tearDown(() {
      name.dispose();
      birthDate.dispose();
      phone.dispose();
      password.dispose();
      passwordConfirm.dispose();
    });

    test('clearIdentifyFields removes name birthdate phone only', () {
      RecoveryFlowLifecycle.clearIdentifyFields(
        name: name,
        birthDate: birthDate,
        phone: phone,
      );

      expect(name.text, isEmpty);
      expect(birthDate.text, isEmpty);
      expect(phone.text, isEmpty);
      expect(password.text, isNotEmpty);
    });

    test('clearPasswordFields removes password fields only', () {
      RecoveryFlowLifecycle.clearPasswordFields(
        password: password,
        passwordConfirm: passwordConfirm,
      );

      expect(password.text, isEmpty);
      expect(passwordConfirm.text, isEmpty);
      expect(name.text, isNotEmpty);
    });

    test('clearAllInputFields removes every recovery input', () {
      RecoveryFlowLifecycle.clearAllInputFields(
        name: name,
        birthDate: birthDate,
        phone: phone,
        password: password,
        passwordConfirm: passwordConfirm,
      );

      expect(name.text, isEmpty);
      expect(birthDate.text, isEmpty);
      expect(phone.text, isEmpty);
      expect(password.text, isEmpty);
      expect(passwordConfirm.text, isEmpty);
    });

    test('cleared session snapshot has no active session', () {
      const active = RecoverySessionSnapshot(
        verificationSessionId: 'session-1',
        recoveryToken: 'token-1',
        phoneForDisplay: '00000000001',
        otpCode: '123456',
        stepIndex: 2,
      );

      final cleared = active.clearedForRestart();
      expect(cleared.hasActiveSession, isFalse);
      expect(cleared.verificationSessionId, isNull);
      expect(cleared.recoveryToken, isNull);
      expect(cleared.phoneForDisplay, isEmpty);
      expect(cleared.otpCode, isEmpty);
    });

    test('uses neutral hint copy without numeric examples', () {
      expect(RecoveryFlowLifecycle.birthDateHint, '8자리 숫자');
      expect(RecoveryFlowLifecycle.phoneHint, '숫자만 입력');
      expect(RecoveryFlowLifecycle.birthDateHint.contains('1997'), isFalse);
      expect(RecoveryFlowLifecycle.phoneHint.contains('010'), isFalse);
    });
  });
}
