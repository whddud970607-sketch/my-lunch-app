import 'package:flutter/material.dart';

abstract final class UnifiedMapKeys {
  static const header = Key('map_header');
  static const summary = Key('map_summary');
  static const filters = Key('map_filters');
  static const selectedPointCard = Key('map_selected_point_card');
  static const currentLocation = Key('map_current_location');
  static const providerMenu = Key('map_provider_menu');
  static const navigateCta = Key('map_navigate_cta');
  static const detailAction = Key('map_detail_action');
  static const loadingState = Key('map_loading');
  static const errorState = Key('map_error');
  static const staleBanner = Key('map_stale_banner');
  static const refresh = Key('map_refresh');
}
