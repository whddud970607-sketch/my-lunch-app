import 'package:flutter/material.dart';

import '../utils/identity_input_util.dart';
import '../utils/recovery_flow_lifecycle.dart';
import '../utils/recovery_input_decorations.dart';
import '../widgets/verification_code_input.dart';
import '../services/account_recovery_service.dart';
import '../services/api_exception.dart';
import '../state/auth_controller.dart';

enum _RecoveryStep { identify, verify, newPassword, done }

class PasswordRecoveryScreen extends StatefulWidget {
  const PasswordRecoveryScreen({super.key, required this.controller});

  final AuthController controller;

  @override
  State<PasswordRecoveryScreen> createState() => _PasswordRecoveryScreenState();
}

class _PasswordRecoveryScreenState extends State<PasswordRecoveryScreen> {
  final _recovery = AccountRecoveryService();
  final _name = TextEditingController();
  final _birthDate = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _passwordConfirm = TextEditingController();
  final _otpInputKey = GlobalKey<VerificationCodeInputState>();

  _RecoveryStep _step = _RecoveryStep.identify;
  bool _busy = false;
  String? _errorMessage;
  String? _verificationSessionId;
  String? _recoveryToken;
  String? _maskedEmail;
  String? _recoveredEmail;
  String _otpCode = '';
  String _phoneForDisplay = '';

  @override
  void initState() {
    super.initState();
    _resetForNewRecoveryFlow();
  }

  @override
  void dispose() {
    _clearAllSensitiveData();
    _recovery.close();
    _name.dispose();
    _birthDate.dispose();
    _phone.dispose();
    _password.dispose();
    _passwordConfirm.dispose();
    super.dispose();
  }

  void _clearOtpOnly() {
    _otpCode = '';
    _otpInputKey.currentState?.clear();
  }

  void _clearPasswordOnly() {
    RecoveryFlowLifecycle.clearPasswordFields(
      password: _password,
      passwordConfirm: _passwordConfirm,
    );
  }

  void _clearRecoveryInputs() {
    RecoveryFlowLifecycle.clearAllInputFields(
      name: _name,
      birthDate: _birthDate,
      phone: _phone,
      password: _password,
      passwordConfirm: _passwordConfirm,
    );
    _verificationSessionId = null;
    _recoveryToken = null;
    _maskedEmail = null;
    _phoneForDisplay = '';
    _otpCode = '';
    _otpInputKey.currentState?.clear();
  }

  void _clearAllSensitiveData() {
    _clearRecoveryInputs();
    _recoveredEmail = null;
    _errorMessage = null;
    _busy = false;
    _step = _RecoveryStep.identify;
  }

  void _resetForNewRecoveryFlow() {
    _clearAllSensitiveData();
  }

  void _restartRecoveryFlow() {
    if (!mounted) return;
    setState(_resetForNewRecoveryFlow);
  }

  void _leaveRecoveryScreen() {
    _clearAllSensitiveData();
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _start() async {
    final birthResult = IdentityInputUtil.validateBirthDate(_birthDate.text);
    if (!birthResult.isValid) {
      setState(
        () => _errorMessage = IdentityInputUtil.birthDateErrorMessage(birthResult),
      );
      return;
    }
    final normalizedBirth = birthResult.canonical!;
    final phoneResult = IdentityInputUtil.validatePhoneLocal(_phone.text);
    if (!phoneResult.isValid) {
      setState(() => _errorMessage = IdentityInputUtil.phoneInvalidMessage);
      return;
    }
    final normalizedPhone = phoneResult.canonical!;

    setState(() {
      _busy = true;
      _errorMessage = null;
    });
    try {
      final result = await _recovery.startResetPassword(
        legalName: _name.text,
        birthDate: normalizedBirth,
        phone: normalizedPhone,
      );
      setState(() {
        _verificationSessionId = result.verificationSessionId;
        _phoneForDisplay = _phone.text;
        _clearOtpOnly();
        _step = _RecoveryStep.verify;
      });
    } on ApiException catch (e) {
      setState(() => _errorMessage = e.message);
    } catch (_) {
      setState(() => _errorMessage = '본인인증을 시작하지 못했습니다.');
    } finally {
      setState(() => _busy = false);
    }
  }

  Future<void> _confirm() async {
    final sessionId = _verificationSessionId;
    if (sessionId == null) return;
    if (_otpCode.length != 6) {
      setState(() => _errorMessage = '인증번호 6자리를 입력해 주세요.');
      return;
    }
    setState(() {
      _busy = true;
      _errorMessage = null;
    });
    try {
      final result = await _recovery.confirmResetPassword(
        verificationSessionId: sessionId,
        otp: _otpCode,
      );
      setState(() {
        _recoveryToken = result.recoveryToken;
        _maskedEmail = result.maskedEmail;
        _clearPasswordOnly();
        _step = _RecoveryStep.newPassword;
      });
    } on ApiException catch (e) {
      setState(() => _errorMessage = e.message);
    } catch (_) {
      setState(() => _errorMessage = '본인인증에 실패했습니다.');
    } finally {
      setState(() => _busy = false);
    }
  }

  Future<void> _complete({required bool autoSignIn}) async {
    final token = _recoveryToken;
    if (token == null) return;
    if (_password.text != _passwordConfirm.text) {
      setState(() => _errorMessage = '비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    if (_password.text.length < 8) {
      setState(() => _errorMessage = '비밀번호는 8자 이상이어야 합니다.');
      return;
    }

    setState(() {
      _busy = true;
      _errorMessage = null;
    });
    try {
      final result = await _recovery.completeResetPassword(
        recoveryToken: token,
        newPassword: _password.text,
      );
      final email = result.email;
      if (autoSignIn && email != null && email.isNotEmpty) {
        await widget.controller.signIn(email, _password.text);
        if (!mounted) return;
        if (widget.controller.state == AuthViewState.signedIn) {
          _clearAllSensitiveData();
          Navigator.of(context).popUntil((route) => route.isFirst);
          return;
        }
      }
      _clearRecoveryInputs();
      setState(() {
        _recoveredEmail = email;
        _step = _RecoveryStep.done;
      });
    } on ApiException catch (e) {
      setState(() => _errorMessage = e.message);
    } catch (_) {
      setState(() => _errorMessage = '비밀번호 변경에 실패했습니다.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_busy,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) {
          _clearAllSensitiveData();
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('비밀번호 찾기'),
          leading: _busy
              ? null
              : BackButton(
                  onPressed: _leaveRecoveryScreen,
                ),
        ),
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: SingleChildScrollView(
                  child: AutofillGroup(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _StepIndicator(step: _step),
                        const SizedBox(height: 24),
                        AnimatedSwitcher(
                          duration: const Duration(milliseconds: 200),
                          child: _buildStep(context),
                        ),
                        if (_errorMessage != null) ...[
                          const SizedBox(height: 16),
                          Text(
                            _errorMessage!,
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.error,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStep(BuildContext context) {
    switch (_step) {
      case _RecoveryStep.identify:
        return _IdentifyStep(
          key: const ValueKey('identify'),
          name: _name,
          birthDate: _birthDate,
          phone: _phone,
          busy: _busy,
          onSubmit: _start,
        );
      case _RecoveryStep.verify:
        return _VerifyStep(
          key: const ValueKey('verify'),
          maskedPhone: maskPhoneForDisplay(_phoneForDisplay),
          otpInputKey: _otpInputKey,
          otpCode: _otpCode,
          onOtpChanged: (v) => setState(() {
            _otpCode = v;
            _errorMessage = null;
          }),
          busy: _busy,
          onSubmit: _confirm,
          onResend: _busy ? null : _start,
          onBack: () => setState(() {
            _step = _RecoveryStep.identify;
            _errorMessage = null;
            _clearOtpOnly();
          }),
          onRestart: _busy ? null : _restartRecoveryFlow,
        );
      case _RecoveryStep.newPassword:
        return _NewPasswordStep(
          key: const ValueKey('newPassword'),
          maskedEmail: _maskedEmail,
          password: _password,
          passwordConfirm: _passwordConfirm,
          busy: _busy,
          onSubmit: () => _complete(autoSignIn: true),
          onBack: () => setState(() {
            _step = _RecoveryStep.verify;
            _errorMessage = null;
            _clearPasswordOnly();
            _clearOtpOnly();
          }),
          onRestart: _busy ? null : _restartRecoveryFlow,
        );
      case _RecoveryStep.done:
        return _DoneStep(
          key: const ValueKey('done'),
          email: _recoveredEmail,
          onLogin: _leaveRecoveryScreen,
        );
    }
  }
}

class _StepIndicator extends StatelessWidget {
  const _StepIndicator({required this.step});

  final _RecoveryStep step;

  @override
  Widget build(BuildContext context) {
    final labels = ['계정 확인', '본인인증', '새 비밀번호', '완료'];
    final index = step.index;
    return Row(
      children: List.generate(labels.length, (i) {
        final active = i <= index;
        return Expanded(
          child: Column(
            children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: active
                      ? Theme.of(context).colorScheme.primary
                      : Theme.of(context).colorScheme.surfaceContainerHighest,
                ),
                child: Text(
                  '${i + 1}',
                  style: TextStyle(
                    color: active
                        ? Theme.of(context).colorScheme.onPrimary
                        : Theme.of(context).colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                labels[i],
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.labelSmall,
              ),
            ],
          ),
        );
      }),
    );
  }
}

class _IdentifyStep extends StatelessWidget {
  const _IdentifyStep({
    super.key,
    required this.name,
    required this.birthDate,
    required this.phone,
    required this.busy,
    required this.onSubmit,
  });

  final TextEditingController name;
  final TextEditingController birthDate;
  final TextEditingController phone;
  final bool busy;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          '가입 시 등록한 정보를 입력해 주세요.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 16),
        TextField(
          controller: name,
          textInputAction: TextInputAction.next,
          autofillHints: RecoveryInputDecorations.identifyAutofillHints,
          enableSuggestions: false,
          autocorrect: false,
          smartDashesType: SmartDashesType.disabled,
          smartQuotesType: SmartQuotesType.disabled,
          decoration: RecoveryInputDecorations.field(labelText: '이름'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: birthDate,
          keyboardType: TextInputType.number,
          autofillHints: RecoveryInputDecorations.identifyAutofillHints,
          enableSuggestions: false,
          autocorrect: false,
          smartDashesType: SmartDashesType.disabled,
          smartQuotesType: SmartQuotesType.disabled,
          inputFormatters: const [DigitsOnlyInputFormatter(maxLength: 8)],
          decoration: RecoveryInputDecorations.field(
            labelText: '생년월일',
            hintText: RecoveryFlowLifecycle.birthDateHint,
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: phone,
          keyboardType: TextInputType.phone,
          autofillHints: RecoveryInputDecorations.identifyAutofillHints,
          enableSuggestions: false,
          autocorrect: false,
          smartDashesType: SmartDashesType.disabled,
          smartQuotesType: SmartQuotesType.disabled,
          inputFormatters: const [DigitsOnlyInputFormatter(maxLength: 11)],
          decoration: RecoveryInputDecorations.field(
            labelText: '휴대폰번호',
            hintText: RecoveryFlowLifecycle.phoneHint,
          ),
        ),
        const SizedBox(height: 20),
        FilledButton(
          onPressed: busy ? null : onSubmit,
          child: busy
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('인증번호 받기'),
        ),
      ],
    );
  }
}

class _VerifyStep extends StatelessWidget {
  const _VerifyStep({
    super.key,
    required this.maskedPhone,
    required this.otpInputKey,
    required this.otpCode,
    required this.onOtpChanged,
    required this.busy,
    required this.onSubmit,
    required this.onResend,
    required this.onBack,
    required this.onRestart,
  });

  final String maskedPhone;
  final GlobalKey<VerificationCodeInputState> otpInputKey;
  final String otpCode;
  final ValueChanged<String> onOtpChanged;
  final bool busy;
  final VoidCallback onSubmit;
  final VoidCallback? onResend;
  final VoidCallback onBack;
  final VoidCallback? onRestart;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Icon(
          Icons.sms_outlined,
          size: 40,
          color: theme.colorScheme.primary,
        ),
        const SizedBox(height: 12),
        Text(
          '인증번호 입력',
          style: theme.textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        Text(
          '$maskedPhone 번호로 발송된\n6자리 인증번호를 입력해 주세요.',
          style: theme.textTheme.bodyMedium,
        ),
        const SizedBox(height: 24),
        VerificationCodeInput(
          key: otpInputKey,
          enabled: !busy,
          onChanged: onOtpChanged,
        ),
        const SizedBox(height: 12),
        Text(
          '인증번호가 오지 않나요?',
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            onPressed: busy ? null : onResend,
            child: const Text('인증번호 다시 받기'),
          ),
        ),
        const SizedBox(height: 8),
        FilledButton(
          onPressed: busy || otpCode.length != 6 ? null : onSubmit,
          child: busy
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('확인'),
        ),
        TextButton(onPressed: busy ? null : onBack, child: const Text('이전')),
        TextButton(
          onPressed: onRestart,
          child: const Text('처음부터 다시하기'),
        ),
      ],
    );
  }
}

class _NewPasswordStep extends StatelessWidget {
  const _NewPasswordStep({
    super.key,
    required this.maskedEmail,
    required this.password,
    required this.passwordConfirm,
    required this.busy,
    required this.onSubmit,
    required this.onBack,
    required this.onRestart,
  });

  final String? maskedEmail;
  final TextEditingController password;
  final TextEditingController passwordConfirm;
  final bool busy;
  final VoidCallback onSubmit;
  final VoidCallback onBack;
  final VoidCallback? onRestart;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (maskedEmail != null) ...[
          Text('계정: $maskedEmail'),
          const SizedBox(height: 8),
        ],
        Text(
          '새 비밀번호를 입력해 주세요.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 16),
        TextField(
          controller: password,
          obscureText: true,
          autofillHints: RecoveryInputDecorations.newPasswordAutofillHints,
          enableSuggestions: false,
          autocorrect: false,
          decoration: RecoveryInputDecorations.field(labelText: '새 비밀번호'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: passwordConfirm,
          obscureText: true,
          autofillHints: RecoveryInputDecorations.newPasswordAutofillHints,
          enableSuggestions: false,
          autocorrect: false,
          decoration: RecoveryInputDecorations.field(labelText: '새 비밀번호 확인'),
        ),
        const SizedBox(height: 20),
        FilledButton(
          onPressed: busy ? null : onSubmit,
          child: busy
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('비밀번호 변경'),
        ),
        TextButton(onPressed: busy ? null : onBack, child: const Text('이전')),
        TextButton(
          onPressed: onRestart,
          child: const Text('처음부터 다시하기'),
        ),
      ],
    );
  }
}

class _DoneStep extends StatelessWidget {
  const _DoneStep({
    super.key,
    required this.email,
    required this.onLogin,
  });

  final String? email;
  final VoidCallback onLogin;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Icon(
          Icons.check_circle_outline,
          size: 48,
          color: Theme.of(context).colorScheme.primary,
        ),
        const SizedBox(height: 12),
        Text(
          '비밀번호가 변경되었습니다.',
          style: Theme.of(context).textTheme.titleMedium,
          textAlign: TextAlign.center,
        ),
        if (email != null) ...[
          const SizedBox(height: 8),
          Text(email!, textAlign: TextAlign.center),
        ],
        const SizedBox(height: 20),
        FilledButton(onPressed: onLogin, child: const Text('로그인 화면으로')),
      ],
    );
  }
}
