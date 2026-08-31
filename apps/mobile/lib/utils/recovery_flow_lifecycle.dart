import 'package:flutter/material.dart';

/// Clears in-memory account recovery PII. Never persists to local storage.
class RecoveryFlowLifecycle {
  RecoveryFlowLifecycle._();

  static const birthDateHint = '8자리 숫자';
  static const phoneHint = '숫자만 입력';

  static void clearIdentifyFields({
    required TextEditingController name,
    required TextEditingController birthDate,
    required TextEditingController phone,
  }) {
    name.clear();
    birthDate.clear();
    phone.clear();
  }

  static void clearPasswordFields({
    required TextEditingController password,
    required TextEditingController passwordConfirm,
  }) {
    password.clear();
    passwordConfirm.clear();
  }

  static void clearAllInputFields({
    required TextEditingController name,
    required TextEditingController birthDate,
    required TextEditingController phone,
    required TextEditingController password,
    required TextEditingController passwordConfirm,
  }) {
    clearIdentifyFields(name: name, birthDate: birthDate, phone: phone);
    clearPasswordFields(password: password, passwordConfirm: passwordConfirm);
  }
}

/// Session tokens for an in-progress recovery. Cleared when flow ends or restarts.
class RecoverySessionSnapshot {
  const RecoverySessionSnapshot({
    this.verificationSessionId,
    this.recoveryToken,
    this.maskedEmail,
    this.recoveredEmail,
    this.phoneForDisplay = '',
    this.otpCode = '',
    this.stepIndex = 0,
  });

  final String? verificationSessionId;
  final String? recoveryToken;
  final String? maskedEmail;
  final String? recoveredEmail;
  final String phoneForDisplay;
  final String otpCode;
  final int stepIndex;

  RecoverySessionSnapshot clearedForRestart() {
    return const RecoverySessionSnapshot();
  }

  bool get hasActiveSession =>
      verificationSessionId != null || recoveryToken != null;
}
