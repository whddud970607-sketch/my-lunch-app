import 'public_api_client.dart';

class AccountRecoveryService {
  AccountRecoveryService({PublicApiClient? client})
      : _client = client ?? PublicApiClient();

  final PublicApiClient _client;

  Future<RecoveryStartResult> startResetPassword({
    required String legalName,
    required String birthDate,
    required String phone,
  }) async {
    final body = await _client.postJson('/auth/recovery/reset-password/start', {
      'legalName': legalName.trim(),
      'birthDate': birthDate.trim(),
      'phone': phone.trim(),
    });
    return RecoveryStartResult(
      verificationSessionId: body['verificationSessionId'] as String,
      expiresAt: body['expiresAt'] as String,
    );
  }

  Future<RecoveryConfirmResult> confirmResetPassword({
    required String verificationSessionId,
    required String otp,
  }) async {
    final body = await _client.postJson('/auth/recovery/reset-password/confirm', {
      'verificationSessionId': verificationSessionId,
      'otp': otp.trim(),
    });
    return RecoveryConfirmResult(
      recoveryToken: body['recoveryToken'] as String,
      expiresAt: body['expiresAt'] as String,
      maskedEmail: body['maskedEmail'] as String?,
    );
  }

  Future<RecoveryCompleteResult> completeResetPassword({
    required String recoveryToken,
    required String newPassword,
  }) async {
    final body = await _client.postJson('/auth/recovery/reset-password/complete', {
      'recoveryToken': recoveryToken,
      'newPassword': newPassword,
    });
    return RecoveryCompleteResult(
      email: body['email'] as String?,
    );
  }

  void close() => _client.close();
}

class RecoveryStartResult {
  RecoveryStartResult({
    required this.verificationSessionId,
    required this.expiresAt,
  });

  final String verificationSessionId;
  final String expiresAt;
}

class RecoveryConfirmResult {
  RecoveryConfirmResult({
    required this.recoveryToken,
    required this.expiresAt,
    this.maskedEmail,
  });

  final String recoveryToken;
  final String expiresAt;
  final String? maskedEmail;
}

class RecoveryCompleteResult {
  RecoveryCompleteResult({this.email});

  final String? email;
}
