import 'package:flutter/material.dart';

import '../state/auth_controller.dart';
import '../state/delivery_session_controller.dart';
import '../sync/completion_projection_store.dart';
import '../sync/operation_sync_engine.dart';
import 'home_screen.dart';
import 'login_screen.dart';

/// Binds [OperationSyncEngine] to the signed-in driver (app-scope).
/// Restores Workday/Session on login / account switch.
class AuthGate extends StatefulWidget {
  const AuthGate({
    super.key,
    required this.controller,
    required this.sessionController,
    required this.syncEngine,
    required this.projections,
  });

  final AuthController controller;
  final DeliverySessionController sessionController;
  final OperationSyncEngine syncEngine;
  final CompletionProjectionStore projections;

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  String? _boundDriverId;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onAuthChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncBinding());
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onAuthChanged);
    super.dispose();
  }

  void _onAuthChanged() {
    _syncBinding();
  }

  Future<void> _syncBinding() async {
    final state = widget.controller.state;
    final driverId = widget.controller.me?.driver?.id;

    if (state == AuthViewState.signedIn &&
        driverId != null &&
        driverId.isNotEmpty) {
      if (_boundDriverId == driverId &&
          widget.syncEngine.boundDriverId == driverId) {
        return;
      }
      // Account switch: clear previous driver's local delivery state first.
      if (_boundDriverId != null && _boundDriverId != driverId) {
        await widget.sessionController.onSignOut();
      }
      await widget.syncEngine.bindDriver(driverId);
      _boundDriverId = driverId;
      await widget.sessionController.restoreOnBootstrap(driverId: driverId);
      return;
    }

    if (_boundDriverId != null || widget.syncEngine.boundDriverId != null) {
      await widget.syncEngine.unbind();
      _boundDriverId = null;
      // Clear optimistic projections so driver B never sees A's UI state.
      widget.projections.clearAll();
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        switch (widget.controller.state) {
          case AuthViewState.loading:
            return const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            );
          case AuthViewState.signedIn:
            return HomeScreen(
              controller: widget.controller,
              sessionController: widget.sessionController,
            );
          case AuthViewState.signedOut:
          case AuthViewState.error:
            return LoginScreen(controller: widget.controller);
        }
      },
    );
  }
}
