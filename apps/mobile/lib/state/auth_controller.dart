import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/me_response.dart';
import '../services/api_client.dart';
import '../services/api_exception.dart';
import '../services/auth_service.dart';
import '../services/me_service.dart';
import '../services/permissions_stub.dart';

enum AuthViewState { loading, signedOut, signedIn, error }

class AuthController extends ChangeNotifier {
  AuthController({
    required AuthService authService,
    required ApiClient apiClient,
    required MeService meService,
    PermissionsStub? permissions,
  })  : _auth = authService,
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

  Future<void> bootstrap() async {
    state = AuthViewState.loading;
    notifyListeners();

    // Prepare permission modules only — no OS prompts in Phase 1D.
    await permissions.prepare(AppPermission.camera);
    await permissions.prepare(AppPermission.location);

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

    await refreshMe();
  }

  Future<void> refreshMe() async {
    try {
      final profile = await _me.fetchMe();
      if (!profile.isDriver) {
        await _auth.signOut();
        me = null;
        state = AuthViewState.signedOut;
        errorMessage = 'Driver role required';
        notifyListeners();
        return;
      }
      me = profile;
      state = AuthViewState.signedIn;
      errorMessage = null;
    } on ApiException catch (e) {
      if (e.unauthorized) {
        await handleUnauthorized();
        return;
      }
      state = AuthViewState.error;
      errorMessage = e.message;
    } catch (_) {
      state = AuthViewState.error;
      errorMessage = 'Failed to load profile';
    }
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
