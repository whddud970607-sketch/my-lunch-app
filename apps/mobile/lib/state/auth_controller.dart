import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../debug/startup_timing.dart';
import '../models/me_response.dart';
import '../services/api_client.dart';
import '../services/api_exception.dart';
import '../services/auth_service.dart';
import '../services/me_service.dart';
import '../services/permissions_stub.dart';

/// Auth UI state.
///
/// [awaitingProfile]: local Supabase session exists; GET /me not yet authorized.
/// Safe chrome may render; protected data must not.
enum AuthViewState { loading, awaitingProfile, signedIn, signedOut, error }

class AuthController extends ChangeNotifier {
  AuthController({
    required AuthService authService,
    required ApiClient apiClient,
    required MeService meService,
    PermissionsStub? permissions,
  }) : _auth = authService,
       _api = apiClient,
       _me = meService,
       permissions = permissions ?? PermissionsStub();

  final AuthService _auth;
  final ApiClient _api;
  final MeService _me;
  final PermissionsStub permissions;

  ApiClient get apiClient => _api;

  AuthViewState state = AuthViewState.loading;
  MeResponse? me;
  String? errorMessage;
  bool busy = false;

  /// True when Supabase still holds a session (not an authorization grant).
  bool get hasLocalSession => _auth.currentSession != null;

  /// Driver role + driver id confirmed via GET /me.
  bool get isDriverAuthorized =>
      state == AuthViewState.signedIn &&
      me != null &&
      me!.isDriver &&
      me!.driver != null &&
      me!.driver!.id.isNotEmpty;

  Future<void> bootstrap() async {
    state = AuthViewState.loading;
    notifyListeners();

    _auth.authStateChanges.listen((data) {
      final event = data.event;
      if (event == AuthChangeEvent.signedOut) {
        me = null;
        state = AuthViewState.signedOut;
        notifyListeners();
      }
    });

    if (_auth.currentSession == null) {
      state = AuthViewState.signedOut;
      notifyListeners();
      return;
    }

    // PERF-S4: sync marks — MethodChannel await must not delay safe shell.
    StartupTiming.markSync('LOCAL_SESSION_KNOWN', once: true);
    state = AuthViewState.awaitingProfile;
    errorMessage = null;
    StartupTiming.markSync('SAFE_SHELL_VISIBLE', once: true);
    notifyListeners();

    // Permission module prep is not required for shell chrome (no OS prompts).
    await permissions.prepare(AppPermission.camera);
    await permissions.prepare(AppPermission.location);

    await refreshMe();
  }

  Future<void> refreshMe() async {
    await StartupTiming.mark('PROFILE_REQUEST_START');
    try {
      final profile = await _me.fetchMe();
      if (!profile.isDriver) {
        await _auth.signOut();
        me = null;
        state = AuthViewState.signedOut;
        errorMessage = 'Driver role required';
        await StartupTiming.mark('PROFILE_READY');
        notifyListeners();
        return;
      }
      if (profile.driver == null || profile.driver!.id.isEmpty) {
        await _auth.signOut();
        me = null;
        state = AuthViewState.signedOut;
        errorMessage = 'Driver profile required';
        await StartupTiming.mark('PROFILE_READY');
        notifyListeners();
        return;
      }
      me = profile;
      state = AuthViewState.signedIn;
      errorMessage = null;
    } on ApiException catch (e) {
      if (e.unauthorized) {
        await StartupTiming.mark('ME_CONTROLLER_READY');
        await StartupTiming.mark('PROFILE_READY');
        await handleUnauthorized();
        return;
      }
      me = null;
      state = AuthViewState.error;
      errorMessage = e.message;
    } catch (_) {
      me = null;
      state = AuthViewState.error;
      errorMessage = 'Failed to load profile';
    }
    await StartupTiming.mark('ME_CONTROLLER_READY');
    await StartupTiming.mark('PROFILE_READY');
    notifyListeners();
  }

  Future<void> signIn(String email, String password) async {
    busy = true;
    errorMessage = null;
    notifyListeners();
    try {
      final res = await _auth.signIn(email: email, password: password);
      if (res.session == null) {
        errorMessage = 'Sign-in did not return a session';
        state = AuthViewState.signedOut;
      } else {
        state = AuthViewState.awaitingProfile;
        me = null;
        notifyListeners();
        await refreshMe();
      }
    } on AuthException catch (e) {
      errorMessage = e.message;
      state = AuthViewState.signedOut;
    } catch (_) {
      errorMessage = 'Sign-in failed';
      state = AuthViewState.signedOut;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> signUp({
    required String email,
    required String password,
    String? displayName,
  }) async {
    busy = true;
    errorMessage = null;
    notifyListeners();
    try {
      final res = await _auth.signUp(
        email: email,
        password: password,
        displayName: displayName,
      );
      if (res.session == null) {
        // Email confirmation may be required depending on project settings.
        errorMessage =
            'Account created. Confirm email if required, then sign in.';
        state = AuthViewState.signedOut;
      } else {
        state = AuthViewState.awaitingProfile;
        me = null;
        notifyListeners();
        await refreshMe();
      }
    } on AuthException catch (e) {
      errorMessage = e.message;
      state = AuthViewState.signedOut;
    } catch (_) {
      errorMessage = 'Sign-up failed';
      state = AuthViewState.signedOut;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> signOut() async {
    await _auth.signOut();
    me = null;
    state = AuthViewState.signedOut;
    notifyListeners();
  }

  Future<void> handleUnauthorized() async {
    await _auth.signOut();
    me = null;
    state = AuthViewState.signedOut;
    errorMessage = 'Session expired. Please sign in again.';
    notifyListeners();
  }

  @override
  void dispose() {
    _api.close();
    super.dispose();
  }
}
