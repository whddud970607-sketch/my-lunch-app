import 'package:flutter/material.dart';

abstract final class ManualAddressKeys {
  static const screen = Key('manual_address_screen');
  static const searchField = Key('manual_address_search_field');
  static const searchLoading = Key('manual_address_search_loading');
  static const searchZero = Key('manual_address_search_zero');
  static const searchError = Key('manual_address_search_error');
  static const candidateList = Key('manual_address_candidate_list');
  static const selectedAddress = Key('manual_address_selected');
  static const detailField = Key('manual_address_detail');
  static const dongField = Key('manual_address_dong');
  static const unitField = Key('manual_address_unit');
  static const quantityField = Key('manual_address_quantity');
  static const confirmButton = Key('manual_address_confirm');
  static const registerBusy = Key('manual_address_register_busy');
  static const success = Key('manual_address_success');
  static const failure = Key('manual_address_failure');
  static const offline = Key('manual_address_offline');
}
