import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/services/invoice_evidence_image.dart';

Uint8List jpegWithExif() {
  return Uint8List.fromList([
    0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xda, 0x00, 0x08,
    0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xff, 0xd9,
  ]);
}

void main() {
  test('compress path strips JPEG EXIF and keeps jpeg mime', () {
    final prepared = prepareInvoiceEvidenceBytes(jpegWithExif());
    expect(prepared.contentType, 'image/jpeg');
    expect(String.fromCharCodes(prepared.bytes).contains('Exif'), isFalse);
    expect(prepared.bytes.length, lessThanOrEqualTo(maxInvoiceEvidenceBytes));
  });

  test('rejects invalid MIME and oversized files', () {
    expect(
      () => prepareInvoiceEvidenceBytes([1, 2, 3, 4]),
      throwsA(
        isA<InvoiceEvidenceImageException>().having(
          (e) => e.code,
          'code',
          InvoiceEvidenceImageError.invalidMime,
        ),
      ),
    );
    expect(
      () => prepareInvoiceEvidenceBytes(
        List<int>.filled(maxInvoiceEvidenceBytes + 1, 0xff),
      ),
      throwsA(
        isA<InvoiceEvidenceImageException>().having(
          (e) => e.code,
          'code',
          InvoiceEvidenceImageError.fileTooLarge,
        ),
      ),
    );
  });
}
