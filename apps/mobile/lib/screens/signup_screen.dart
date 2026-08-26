import 'package:flutter/material.dart';

import '../state/auth_controller.dart';

class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key, required this.controller});

  final AuthController controller;

  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    await widget.controller.signUp(
      email: _email.text,
      password: _password.text,
      displayName: _name.text,
    );
    if (!mounted) return;
    if (widget.controller.state == AuthViewState.signedIn) {
      Navigator.of(context).pop();
    } else if (widget.controller.errorMessage != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(widget.controller.errorMessage!)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    return Scaffold(
      appBar: AppBar(title: const Text('회원가입')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Form(
                key: _formKey,
                child: ListView(
                  children: [
                    TextFormField(
                      controller: _name,
                      decoration: const InputDecoration(
                        labelText: '표시 이름',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(
                        labelText: '이메일',
                        border: OutlineInputBorder(),
                      ),
                      validator: (v) =>
                          (v == null || v.trim().isEmpty) ? '이메일을 입력하세요' : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _password,
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelText: '비밀번호 (8자 이상)',
                        border: OutlineInputBorder(),
                      ),
                      validator: (v) => (v == null || v.length < 8)
                          ? '비밀번호는 8자 이상이어야 합니다'
                          : null,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      '가입 시 기본 역할은 driver 입니다. platform_admin으로 승격할 수 없습니다.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: c.busy ? null : _submit,
                      child: c.busy
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('계정 만들기'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
