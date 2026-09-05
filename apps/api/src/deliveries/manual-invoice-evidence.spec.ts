import {
  MAX_INVOICE_EVIDENCE_BYTES,
  buildManualInvoiceStoragePath,
  decodeEvidenceBase64,
  detectImageMime,
  evidenceTypeForReason,
  isManualInvoiceStoragePath,
  parseManualReason,
  parseRegistrationMethod,
  prepareInvoiceEvidenceBytes,
  stripJpegExif,
} from "./manual-invoice-evidence";

function jpegWithExif(): Buffer {
  // APP1 length 0x0010 = 16 (2 length bytes + 14 payload starting with Exif)
  const app1 = Buffer.from([
    0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  const rest = Buffer.from([
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xff, 0xd9,
  ]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, rest]);
}

describe("manual invoice evidence helpers", () => {
  it("maps reasons and evidence types", () => {
    expect(parseManualReason("barcode_scan_failed")).toBe("barcode_scan_failed");
    expect(parseManualReason("manual_entry")).toBe("manual_entry");
    expect(parseManualReason(undefined)).toBe("manual_entry");
    expect(parseManualReason("unspecified")).toBe("manual_entry");
    expect(parseRegistrationMethod(undefined)).toBe("manual");
    expect(evidenceTypeForReason("barcode_scan_failed")).toBe(
      "manual_invoice_scan_failure",
    );
    expect(evidenceTypeForReason("manual_entry")).toBe("manual_invoice");
  });

  it("rejects invalid reason", () => {
    expect(() => parseManualReason("other")).toThrow("invalid_manual_reason");
  });

  it("validates jpeg magic and strips EXIF GPS marker", () => {
    const raw = jpegWithExif();
    expect(detectImageMime(raw)).toBe("image/jpeg");
    const stripped = stripJpegExif(raw);
    expect(stripped.includes(Buffer.from("Exif"))).toBe(false);
    const prepared = prepareInvoiceEvidenceBytes(raw, "image/jpeg");
    expect(prepared.contentType).toBe("image/jpeg");
    expect(prepared.bytes.includes(Buffer.from("Exif"))).toBe(false);
  });

  it("rejects invalid MIME and oversized files", () => {
    try {
      prepareInvoiceEvidenceBytes(Buffer.from("not-an-image"));
      throw new Error("expected invalid_mime");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("invalid_mime");
    }
    const huge = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xda]),
      Buffer.alloc(MAX_INVOICE_EVIDENCE_BYTES),
    ]);
    try {
      prepareInvoiceEvidenceBytes(huge);
      throw new Error("expected file_too_large");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("file_too_large");
    }
    try {
      prepareInvoiceEvidenceBytes(jpegWithExif(), "application/pdf");
      throw new Error("expected invalid_mime");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("invalid_mime");
    }
  });

  it("keeps evidence path off the completion object name", () => {
    const driverId = "22222222-2222-4222-8222-222222222222";
    const pointId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const path = buildManualInvoiceStoragePath({
      driverId,
      pointId,
      objectName: "a.jpg",
    });
    expect(path).toBe(`${driverId}/${pointId}/manual-invoice/a.jpg`);
    expect(path).not.toMatch(/\/\d+\.jpg$/);
    expect(isManualInvoiceStoragePath({ driverId, pointId, storagePath: path })).toBe(
      true,
    );
    expect(
      isManualInvoiceStoragePath({
        driverId,
        pointId,
        storagePath: `${driverId}/${pointId}/123.jpg`,
      }),
    ).toBe(false);
  });

  it("decodes base64 without logging", () => {
    const raw = jpegWithExif();
    const encoded = raw.toString("base64");
    expect(decodeEvidenceBase64(encoded).equals(raw)).toBe(true);
  });
});
