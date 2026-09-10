import '../config/app_config.dart';

/// Feature guard for TMAP AppKey ([TMAP_API_KEY]).
///
/// Used by Vector Map (`TMapView.setSKTMapApiKey`) and the existing Navi PoC.
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
