import 'package:flutter/material.dart';

import '../debug/startup_timing.dart';
import '../state/auth_controller.dart';
import '../state/delivery_session_controller.dart';
import '../sync/completion_projection_store.dart';
import '../sync/operation_sync_engine.dart';
import 'app_shell.dart';
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

    // Sync bind + session restore ONLY after GET /me confirms driver.
    if (state == AuthViewState.signedIn &&
        widget.controller.isDriverAuthorized &&
        driverId != null &&
        driverId.isNotEmpty) {
      StartupTiming.markSync('AUTHORIZED_CONTENT_VISIBLE', once: true);
      StartupTiming.markSync('APP_SHELL_VISIBLE', once: true);
      StartupTiming.markSync('FIRST_INTERACTIVE_SCREEN', once: true);
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
      await StartupTiming.mark('SESSION_RESTORE_START');
      await widget.sessionController.restoreOnBootstrap(driverId: driverId);
      await StartupTiming.mark('SESSION_RESTORE_END');
      return;
    }

    if (_boundDriverId != null || widget.syncEngine.boundDriverId != null) {
      await widget.syncEngine.unbind();
      _boundDriverId = null;
      // Clear optimistic projections so driver B never sees A's UI state.
      widget.projections.clearAll();
    }
  }

  bool get _showAuthenticatedShell {
    final c = widget.controller;
    switch (c.state) {
      case AuthViewState.awaitingProfile:
        return true;
      case AuthViewState.signedIn:
        return true;
      case AuthViewState.error:
        // Transient /me failure: keep non-sensitive shell while session valid.
        return c.hasLocalSession;
      case AuthViewState.loading:
      case AuthViewState.signedOut:
        return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        if (_showAuthenticatedShell) {
          if (widget.controller.state == AuthViewState.awaitingProfile ||
              (widget.controller.state == AuthViewState.error &&
                  widget.controller.hasLocalSession)) {
            StartupTiming.markSync('SAFE_SHELL_VISIBLE', once: true);
          }
          return AppShell(
            controller: widget.controller,
            sessionController: widget.sessionController,
          );
        }
        switch (widget.controller.state) {
          case AuthViewState.loading:
            return const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            );
          case AuthViewState.signedOut:
          case AuthViewState.error:
            return LoginScreen(controller: widget.controller);
          case AuthViewState.awaitingProfile:
          case AuthViewState.signedIn:
            // Unreachable: handled by _showAuthenticatedShell.
            return AppShell(
              controller: widget.controller,
              sessionController: widget.sessionController,
            );
        }
      },
    );
  }
}
