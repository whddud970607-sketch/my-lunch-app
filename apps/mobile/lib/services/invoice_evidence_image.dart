import 'dart:convert';
import 'dart:typed_data';

const maxInvoiceEvidenceBytes = 5 * 1024 * 1024;
const invoiceEvidenceJpegQuality = 85;
const invoiceEvidenceMaxWidth = 1600;

enum InvoiceEvidenceImageError { invalidMime, fileTooLarge }

class InvoiceEvidenceImageException implements Exception {
  InvoiceEvidenceImageException(this.code);
  final InvoiceEvidenceImageError code;

  @override
  String toString() => 'InvoiceEvidenceImageException(${code.name})';
}

class PreparedInvoiceEvidence {
  const PreparedInvoiceEvidence({
    required this.bytes,
    required this.contentType,
  });

  final Uint8List bytes;
  final String contentType;
}

String? detectInvoiceImageMime(List<int> bytes) {
  if (bytes.length >= 3 &&
      bytes[0] == 0xff &&
      bytes[1] == 0xd8 &&
      bytes[2] == 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 8 &&
      bytes[0] == 0x89 &&
      bytes[1] == 0x50 &&
      bytes[2] == 0x4e &&
      bytes[3] == 0x47 &&
      bytes[4] == 0x0d &&
      bytes[5] == 0x0a &&
      bytes[6] == 0x1a &&
      bytes[7] == 0x0a) {
    return 'image/png';
  }
  if (bytes.length >= 12 &&
      bytes[0] == 0x52 &&
      bytes[1] == 0x49 &&
      bytes[2] == 0x46 &&
      bytes[3] == 0x46 &&
      bytes[8] == 0x57 &&
      bytes[9] == 0x45 &&
      bytes[10] == 0x42 &&
      bytes[11] == 0x50) {
    return 'image/webp';
  }
  return null;
}

Uint8List stripJpegExif(Uint8List input) {
  if (input.length < 4 || input[0] != 0xff || input[1] != 0xd8) {
    return input;
  }
  final out = <int>[0xff, 0xd8];
  var i = 2;
  while (i + 3 < input.length) {
    if (input[i] != 0xff) {
      out.addAll(input.sublist(i));
      break;
    }
    final marker = input[i + 1];
    if (marker == 0xda) {
      out.addAll(input.sublist(i));
      break;
    }
    if (marker == 0xd9) {
      out.addAll([0xff, 0xd9]);
      break;
    }
    if (marker == 0xd8 ||
        marker == 0x01 ||
        (marker >= 0xd0 && marker <= 0xd7)) {
      out.addAll([0xff, marker]);
      i += 2;
      continue;
    }
    final length = (input[i + 2] << 8) | input[i + 3];
    if (length < 2 || i + 2 + length > input.length) {
      out.addAll(input.sublist(i));
      break;
    }
    final drop = marker == 0xe1 || marker == 0xe3;
    if (!drop) {
      out.addAll(input.sublist(i, i + 2 + length));
    }
    i += 2 + length;
  }
  return Uint8List.fromList(out);
}

PreparedInvoiceEvidence prepareInvoiceEvidenceBytes(List<int> raw) {
  if (raw.isEmpty || raw.length > maxInvoiceEvidenceBytes) {
    throw InvoiceEvidenceImageException(InvoiceEvidenceImageError.fileTooLarge);
  }
  final mime = detectInvoiceImageMime(raw);
  if (mime == null) {
    throw InvoiceEvidenceImageException(InvoiceEvidenceImageError.invalidMime);
  }
  final bytes = Uint8List.fromList(raw);
  final stripped = mime == 'image/jpeg' ? stripJpegExif(bytes) : bytes;
  if (stripped.isEmpty || stripped.length > maxInvoiceEvidenceBytes) {
    throw InvoiceEvidenceImageException(InvoiceEvidenceImageError.fileTooLarge);
  }
  return PreparedInvoiceEvidence(bytes: stripped, contentType: mime);
}

String invoiceEvidenceBytesBase64(Uint8List bytes) => base64Encode(bytes);
