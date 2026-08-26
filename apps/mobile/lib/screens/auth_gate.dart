import 'package:flutter/material.dart';

import '../state/auth_controller.dart';
import 'home_screen.dart';
import 'login_screen.dart';

class AuthGate extends StatelessWidget {
  const AuthGate({super.key, required this.controller});

  final AuthController controller;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        switch (controller.state) {
          case AuthViewState.loading:
            return const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            );
          case AuthViewState.signedIn:
            return HomeScreen(controller: controller);
          case AuthViewState.signedOut:
          case AuthViewState.error:
            return LoginScreen(controller: controller);
        }
      },
    );
  }
}
