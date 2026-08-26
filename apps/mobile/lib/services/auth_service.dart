import 'package:supabase_flutter/supabase_flutter.dart';

import '../config/app_config.dart';

/// Supabase Auth only (publishable key). No delivery_* PostgREST usage.
class AuthService {
  SupabaseClient get _client => Supabase.instance.client;

  Session? get currentSession => _client.auth.currentSession;
  User? get currentUser => _client.auth.currentUser;

  Stream<AuthState> get authStateChanges => _client.auth.onAuthStateChange;

  Future<void> initialize() async {
    await Supabase.initialize(
      url: AppConfig.instance.supabaseUrl,
      publishableKey: AppConfig.instance.supabaseAnonKey,
      authOptions: const FlutterAuthClientOptions(
        authFlowType: AuthFlowType.pkce,
      ),
    );
  }

  Future<AuthResponse> signUp({
    required String email,
    required String password,
    String? displayName,
  }) {
    return _client.auth.signUp(
      email: email.trim(),
      password: password,
      data: {
        if (displayName != null && displayName.trim().isNotEmpty)
          'display_name': displayName.trim(),
      },
    );
  }

  Future<AuthResponse> signIn({
    required String email,
    required String password,
  }) {
    return _client.auth.signInWithPassword(
      email: email.trim(),
      password: password,
    );
  }

  Future<void> signOut() => _client.auth.signOut();

  Future<String?> accessToken() async {
    final session = _client.auth.currentSession;
    if (session == null) return null;
    // Refresh if close to expiry without logging token.
    final expiresAt = session.expiresAt;
    if (expiresAt != null) {
      final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
      if (expiresAt - now < 60) {
        final refreshed = await _client.auth.refreshSession();
        return refreshed.session?.accessToken;
      }
    }
    return session.accessToken;
  }
}
