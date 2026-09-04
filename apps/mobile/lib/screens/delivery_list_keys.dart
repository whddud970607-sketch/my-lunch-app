import 'package:flutter/material.dart';

abstract final class DeliveryListKeys {
  static const header = Key('delivery_list_header');
  static const summary = Key('delivery_list_summary');
  static const emptyState = Key('delivery_list_empty');
  static const errorState = Key('delivery_list_error');
  static const staleBanner = Key('delivery_list_stale');
  static const loadingState = Key('delivery_list_loading');
  static const lazyList = Key('delivery_list_lazy');
  static const filterAll = Key('delivery_filter_all');
  static const filterOpen = Key('delivery_filter_open');
  static const filterCompleted = Key('delivery_filter_completed');
  static const mapAction = Key('delivery_list_map_action');
  static const search = Key('delivery_list_search');
  static const searchClear = Key('delivery_list_search_clear');
  static const searchAction = Key('delivery_list_search_action');
  static const zeroMatchState = Key('delivery_list_zero_match');
  static const searchLoading = Key('delivery_list_search_loading');
  static const searchFailed = Key('delivery_list_search_failed');

  static Key pointCard(String pointId) => Key('delivery_point_card_$pointId');
  static Key pointMapAction(String pointId) =>
      Key('delivery_point_map_$pointId');
}
