import 'package:shared_preferences/shared_preferences.dart';

/// Persists logical Follow ON/OFF across map tab / PlatformView remounts.
///
/// Native map controllers may be disposed (P0 ephemeral map tab). Follow is
/// application policy state — only delivery-session end should clear it.
class MapFollowSettings {
  MapFollowSettings._();

  static const _prefsKey = 'driver.map_follow_enabled';

  static Future<bool> load() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_prefsKey) ?? false;
  }

  static Future<void> save(bool enabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_prefsKey, enabled);
  }
}
