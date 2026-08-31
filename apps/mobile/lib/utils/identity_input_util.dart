import 'package:flutter/services.dart';

/// Shared identity field normalization for signup, recovery, and find-id flows.
class IdentityInputUtil {
  IdentityInputUtil._();

  static const minIdentityAge = 18;
  static const birthDateLengthMessage = '생년월일 8자리를 입력해주세요.';
  static const birthDateInvalidMessage = '생년월일을 다시 확인해주세요.';
  static const phoneInvalidMessage = '휴대폰번호를 정확히 입력해주세요.';

  /// Strips non-digits and caps length for on-screen display.
  static String sanitizeDigits(String input, {required int maxLength}) {
    final digits = input.replaceAll(RegExp(r'\D'), '');
    if (digits.length <= maxLength) return digits;
    return digits.substring(0, maxLength);
  }

  /// Accepts common pasted formats; returns canonical `YYYY-MM-DD` or null.
  static String? normalizeBirthDate(
    String input, {
    DateTime? referenceDate,
  }) {
    return validateBirthDate(input, referenceDate: referenceDate).canonical;
  }

  static BirthDateValidationResult validateBirthDate(
    String input, {
    DateTime? referenceDate,
  }) {
    final digits = input.trim().replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) {
      return const BirthDateValidationResult.lengthError();
    }
    if (digits.length != 8) {
      return const BirthDateValidationResult.lengthError();
    }

    final year = int.parse(digits.substring(0, 4));
    final month = int.parse(digits.substring(4, 6));
    final day = int.parse(digits.substring(6, 8));

    if (!_isRealDate(year, month, day)) {
      return const BirthDateValidationResult.invalidDate();
    }

    final ref = _dateOnly(referenceDate ?? DateTime.now());
    final birth = DateTime.utc(year, month, day);

    if (birth.isAfter(ref)) {
      return const BirthDateValidationResult.invalidDate();
    }

    final cutoff = DateTime.utc(
      ref.year - minIdentityAge,
      ref.month,
      ref.day,
    );
    if (birth.isAfter(cutoff)) {
      return const BirthDateValidationResult.invalidDate();
    }

    final mm = month.toString().padLeft(2, '0');
    final dd = day.toString().padLeft(2, '0');
    return BirthDateValidationResult(canonical: '$year-$mm-$dd');
  }

  static String birthDateErrorMessage(BirthDateValidationResult result) {
    if (result.lengthError) return birthDateLengthMessage;
    return birthDateInvalidMessage;
  }

  /// Keeps local mobile digits (e.g. 01012345678). API normalizes to E.164.
  static String? normalizePhoneLocal(String input) {
    return validatePhoneLocal(input).canonical;
  }

  static PhoneValidationResult validatePhoneLocal(String input) {
    final digits = input.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) {
      return const PhoneValidationResult.invalid();
    }

    if (digits.startsWith('82') && digits.length >= 11) {
      return PhoneValidationResult(canonical: '0${digits.substring(2)}');
    }
    if (digits.startsWith('0') && digits.length >= 10 && digits.length <= 11) {
      return PhoneValidationResult(canonical: digits);
    }
    if (digits.length >= 10 && digits.length <= 11) {
      return PhoneValidationResult(canonical: '0$digits');
    }
    return const PhoneValidationResult.invalid();
  }

  static DateTime _dateOnly(DateTime value) {
    return DateTime.utc(value.year, value.month, value.day);
  }

  static bool _isRealDate(int year, int month, int day) {
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    final dt = DateTime.utc(year, month, day);
    return dt.year == year && dt.month == month && dt.day == day;
  }
}

class BirthDateValidationResult {
  const BirthDateValidationResult({this.canonical})
      : lengthError = false,
        invalidDate = false;

  const BirthDateValidationResult.lengthError()
      : canonical = null,
        lengthError = true,
        invalidDate = false;

  const BirthDateValidationResult.invalidDate()
      : canonical = null,
        lengthError = false,
        invalidDate = true;

  final String? canonical;
  final bool lengthError;
  final bool invalidDate;

  bool get isValid => canonical != null;
}

class PhoneValidationResult {
  const PhoneValidationResult({this.canonical}) : invalid = false;

  const PhoneValidationResult.invalid()
      : canonical = null,
        invalid = true;

  final String? canonical;
  final bool invalid;

  bool get isValid => canonical != null;
}

/// Keeps digits only while typing or pasting (no hyphens on screen).
class DigitsOnlyInputFormatter extends TextInputFormatter {
  const DigitsOnlyInputFormatter({required this.maxLength});

  final int maxLength;

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final digits = IdentityInputUtil.sanitizeDigits(
      newValue.text,
      maxLength: maxLength,
    );

    if (digits == newValue.text) return newValue;

    return TextEditingValue(
      text: digits,
      selection: TextSelection.collapsed(offset: digits.length),
    );
  }
}
