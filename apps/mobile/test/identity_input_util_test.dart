import 'package:delivery_shield_mobile/utils/identity_input_util.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final ref = DateTime.utc(2026, 8, 29);
  const canonical = '1997-06-07';

  group('IdentityInputUtil.normalizeBirthDate', () {
    for (final input in [
      '19970607',
      '1997-06-07',
      '1997/06/07',
      '1997.06.07',
      ' 19970607 ',
    ]) {
      test('accepts "$input"', () {
        expect(
          IdentityInputUtil.normalizeBirthDate(input, referenceDate: ref),
          canonical,
        );
      });
    }

    test('rejects non-existent calendar date', () {
      expect(
        IdentityInputUtil.normalizeBirthDate('19971340', referenceDate: ref),
        isNull,
      );
    });

    test('rejects partial input', () {
      expect(
        IdentityInputUtil.normalizeBirthDate('199706', referenceDate: ref),
        isNull,
      );
    });

    test('rejects future date', () {
      expect(
        IdentityInputUtil.normalizeBirthDate('20300101', referenceDate: ref),
        isNull,
      );
    });

    test('rejects under minimum age', () {
      expect(
        IdentityInputUtil.normalizeBirthDate('20150101', referenceDate: ref),
        isNull,
      );
    });
  });

  group('IdentityInputUtil.validateBirthDate messages', () {
    test('length error message', () {
      final result = IdentityInputUtil.validateBirthDate('199706', referenceDate: ref);
      expect(result.lengthError, isTrue);
      expect(
        IdentityInputUtil.birthDateErrorMessage(result),
        IdentityInputUtil.birthDateLengthMessage,
      );
    });

    test('invalid date message', () {
      final result = IdentityInputUtil.validateBirthDate('19971340', referenceDate: ref);
      expect(result.invalidDate, isTrue);
      expect(
        IdentityInputUtil.birthDateErrorMessage(result),
        IdentityInputUtil.birthDateInvalidMessage,
      );
    });
  });

  group('IdentityInputUtil.sanitizeDigits', () {
    test('strips separators from pasted birth date', () {
      expect(
        IdentityInputUtil.sanitizeDigits('1997-06-07', maxLength: 8),
        '19970607',
      );
    });

    test('caps phone digits at 11', () {
      expect(
        IdentityInputUtil.sanitizeDigits('01012345678999', maxLength: 11),
        '01012345678',
      );
    });
  });

  group('IdentityInputUtil.normalizePhoneLocal', () {
    const canonicalPhone = '01012345678';

    for (final input in [
      '01012345678',
      '010-1234-5678',
      ' 010 1234 5678 ',
    ]) {
      test('accepts "$input"', () {
        expect(IdentityInputUtil.normalizePhoneLocal(input), canonicalPhone);
      });
    }
  });

  group('DigitsOnlyInputFormatter', () {
    test('shows digits only for pasted hyphenated birth date', () {
      const formatter = DigitsOnlyInputFormatter(maxLength: 8);
      final result = formatter.formatEditUpdate(
        const TextEditingValue(text: ''),
        const TextEditingValue(text: '1997-06-07'),
      );
      expect(result.text, '19970607');
    });

    test('shows digits only for pasted hyphenated phone', () {
      const formatter = DigitsOnlyInputFormatter(maxLength: 11);
      final result = formatter.formatEditUpdate(
        const TextEditingValue(text: ''),
        const TextEditingValue(text: '010-1234-5678'),
      );
      expect(result.text, '01012345678');
    });
  });
}
