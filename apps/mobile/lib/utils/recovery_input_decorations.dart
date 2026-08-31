import 'package:flutter/material.dart';

/// Recovery-only input settings: no PII autofill/suggestion on identify fields.
class RecoveryInputDecorations {
  RecoveryInputDecorations._();

  static const identifyAutofillHints = <String>[];
  static const newPasswordAutofillHints = [AutofillHints.newPassword];

  static InputDecoration field({
    required String labelText,
    String? hintText,
  }) {
    return InputDecoration(
      labelText: labelText,
      hintText: hintText,
      border: const OutlineInputBorder(),
    );
  }
}
