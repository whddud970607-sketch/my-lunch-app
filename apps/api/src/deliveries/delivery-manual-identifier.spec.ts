import {
  isManualTrackingCode,
  manualTrackingFromIdempotencyKey,
} from "./delivery-manual-identifier";

describe("delivery-manual-identifier", () => {
  it("derives a stable dsman_ id from the same idempotency key", () => {
    const key = "11111111-2222-4333-8444-555555555555";
    const a = manualTrackingFromIdempotencyKey(key);
    const b = manualTrackingFromIdempotencyKey(` ${key} `);
    expect(a).toBe(b);
    expect(a.startsWith("dsman_")).toBe(true);
    expect(a).not.toMatch(/^\d{10,13}$/);
    expect(isManualTrackingCode(a)).toBe(true);
  });
});
