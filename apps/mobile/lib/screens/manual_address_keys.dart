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
  static const recipientNameField = Key('manual_address_recipient_name');
  static const recipientPhoneField = Key('manual_address_recipient_phone');
  static const pinAdjustButton = Key('manual_address_pin_adjust');
  static const invoiceEvidence = Key('manual_address_invoice_evidence');
  static const invoicePreview = Key('manual_address_invoice_preview');
  static const invoiceRetake = Key('manual_address_invoice_retake');
  static const invoiceRemove = Key('manual_address_invoice_remove');
  static const invoiceStatus = Key('manual_address_invoice_status');
  static const invoiceRetry = Key('manual_address_invoice_retry');
  static const confirmButton = Key('manual_address_confirm');
  static const registerBusy = Key('manual_address_register_busy');
  static const success = Key('manual_address_success');
  static const failure = Key('manual_address_failure');
  static const offline = Key('manual_address_offline');
}
