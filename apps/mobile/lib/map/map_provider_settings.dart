import 'package:shared_preferences/shared_preferences.dart';

import 'map_provider_id.dart';

/// Persists the driver's chosen map SDK (not geocode provider).
class MapProviderSettings {
  MapProviderSettings._();

  static const _prefsKey = 'driver.map_provider';
  static const MapProviderId defaultProvider = MapProviderId.kakao;

  static Future<MapProviderId> load() async {
    final prefs = await SharedPreferences.getInstance();
    return MapProviderIdX.tryParse(prefs.getString(_prefsKey)) ??
        defaultProvider;
  }

  static Future<void> save(MapProviderId id) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefsKey, id.storageValue);
  }
}
