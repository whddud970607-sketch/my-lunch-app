import '../config/app_config.dart';

/// Feature guard for existing TMAP Navi UI SDK (not Vector Map / TMapView).
class TmapMapFeature {
  TmapMapFeature._();

  static bool get isConfigured {
    try {
      return AppConfig.instance.tmapApiKey.trim().isNotEmpty;
    } catch (_) {
      return false;
    }
  }
}
