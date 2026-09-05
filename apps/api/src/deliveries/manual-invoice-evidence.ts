export const MANUAL_INVOICE_EVIDENCE_BUCKET = "delivery-proofs";
export const MANUAL_INVOICE_OBJECT_PREFIX = "manual-invoice";
export const MAX_INVOICE_EVIDENCE_BYTES = 5 * 1024 * 1024;
export const INVOICE_EVIDENCE_SIGNED_TTL_SEC = 120;

export const MANUAL_REASONS = ["barcode_scan_failed", "manual_entry"] as const;
export type ManualReason = (typeof MANUAL_REASONS)[number];

export const REGISTRATION_METHODS = ["manual"] as const;
export type RegistrationMethod = (typeof REGISTRATION_METHODS)[number];

export type InvoiceEvidenceType =
  | "manual_invoice"
  | "manual_invoice_scan_failure";

export type PreparedInvoiceEvidence = {
  bytes: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
};

export class InvoiceEvidenceValidationError extends Error {
  constructor(readonly code: "invalid_mime" | "file_too_large") {
    super(code);
    this.name = "InvoiceEvidenceValidationError";
  }
}

export function parseRegistrationMethod(raw: unknown): RegistrationMethod {
  if (raw == null || raw === "" || raw === "manual") return "manual";
  throw new Error("invalid_registration_method");
}

export function parseManualReason(raw: unknown): ManualReason {
  if (raw === "barcode_scan_failed" || raw === "manual_entry") return raw;
  if (raw == null || raw === "" || raw === "unspecified") return "manual_entry";
  throw new Error("invalid_manual_reason");
}

export function evidenceTypeForReason(reason: ManualReason): InvoiceEvidenceType {
  return reason === "barcode_scan_failed"
    ? "manual_invoice_scan_failure"
    : "manual_invoice";
}

export function detectImageMime(
  bytes: Buffer,
): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** Drop JPEG APP1 (EXIF, including GPS) and APP3. Keeps SOI and remaining markers. */
export function stripJpegExif(input: Buffer): Buffer {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return input;
  const out: number[] = [0xff, 0xd8];
  let i = 2;
  while (i + 3 < input.length) {
    if (input[i] !== 0xff) {
      out.push(...input.subarray(i));
      break;
    }
    const marker = input[i + 1];
    if (marker === 0xda) {
      out.push(...input.subarray(i));
      break;
    }
    if (marker === 0xd9) {
      out.push(0xff, 0xd9);
      break;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(0xff, marker);
      i += 2;
      continue;
    }
    const length = (input[i + 2] << 8) | input[i + 3];
    if (length < 2 || i + 2 + length > input.length) {
      out.push(...input.subarray(i));
      break;
    }
    const drop = marker === 0xe1 || marker === 0xe3;
    if (!drop) {
      out.push(...input.subarray(i, i + 2 + length));
    }
    i += 2 + length;
  }
  return Buffer.from(out);
}

/** Remove PNG eXIf / iTXt GPS-ish ancillary chunks. */
export function stripPngExif(input: Buffer): Buffer {
  if (detectImageMime(input) !== "image/png") return input;
  const sig = input.subarray(0, 8);
  const chunks: Buffer[] = [sig];
  let i = 8;
  while (i + 12 <= input.length) {
    const length = input.readUInt32BE(i);
    const type = input.toString("ascii", i + 4, i + 8);
    const end = i + 12 + length;
    if (end > input.length) break;
    if (type !== "eXIf" && type !== "zTXt") {
      chunks.push(input.subarray(i, end));
    }
    i = end;
    if (type === "IEND") break;
  }
  return Buffer.concat(chunks);
}

export function prepareInvoiceEvidenceBytes(
  bytes: Buffer,
  declaredContentType?: string | null,
): PreparedInvoiceEvidence {
  if (bytes.length === 0 || bytes.length > MAX_INVOICE_EVIDENCE_BYTES) {
    throw new InvoiceEvidenceValidationError("file_too_large");
  }
  const mime = detectImageMime(bytes);
  if (!mime) {
    throw new InvoiceEvidenceValidationError("invalid_mime");
  }
  if (
    declaredContentType &&
    declaredContentType !== mime &&
    !(declaredContentType === "image/jpg" && mime === "image/jpeg")
  ) {
    throw new InvoiceEvidenceValidationError("invalid_mime");
  }
  const stripped =
    mime === "image/jpeg"
      ? stripJpegExif(bytes)
      : mime === "image/png"
        ? stripPngExif(bytes)
        : bytes;
  if (stripped.length === 0 || stripped.length > MAX_INVOICE_EVIDENCE_BYTES) {
    throw new InvoiceEvidenceValidationError("file_too_large");
  }
  return { bytes: stripped, contentType: mime };
}

export function buildManualInvoiceStoragePath(args: {
  driverId: string;
  pointId: string;
  objectName: string;
}): string {
  return `${args.driverId}/${args.pointId}/${MANUAL_INVOICE_OBJECT_PREFIX}/${args.objectName}`;
}

export function isManualInvoiceStoragePath(args: {
  driverId: string;
  pointId: string;
  storagePath: string;
}): boolean {
  const expectedPrefix = `${args.driverId}/${args.pointId}/${MANUAL_INVOICE_OBJECT_PREFIX}/`;
  return (
    args.storagePath.startsWith(expectedPrefix) &&
    args.storagePath.length > expectedPrefix.length &&
    !args.storagePath.includes("..")
  );
}

export function decodeEvidenceBase64(raw: unknown): Buffer {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new InvoiceEvidenceValidationError("invalid_mime");
  }
  const compact = raw.replace(/\s+/g, "");
  const padded =
    compact.length % 4 === 0 ? compact : compact + "=".repeat(4 - (compact.length % 4));
  const buf = Buffer.from(padded, "base64");
  if (buf.length === 0) {
    throw new InvoiceEvidenceValidationError("invalid_mime");
  }
  return buf;
}
