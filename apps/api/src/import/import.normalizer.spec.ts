import {
  buildHeaderLookup,
  mapHeaders,
  REQUIRED_CANONICAL_FIELDS,
} from "./import.header-mapping";
import {
  emptyToNull,
  normalizeQuantity,
  normalizeTrackingIdentifier,
} from "./import.normalizer";

describe("import.header-mapping", () => {
  it("maps Korean and English aliases to the same canonical field", () => {
    const lookup = buildHeaderLookup();
    expect(lookup.get("송장번호")).toBe("trackingCode");
    expect(lookup.get("tracking_code")).toBe("trackingCode");
    expect(lookup.get("배송주소")).toBe("address");
  });

  it("lists missing required fields without throwing", () => {
    const result = mapHeaders({ 수량: "1" });
    expect(result.missingRequired).toEqual(
      expect.arrayContaining(REQUIRED_CANONICAL_FIELDS),
    );
  });
});

describe("import.normalizer helpers", () => {
  it("emptyToNull trims", () => {
    expect(emptyToNull("  ")).toBeNull();
    expect(emptyToNull(" a ")).toBe("a");
  });

  it("normalizeTrackingIdentifier collapses spaces", () => {
    expect(normalizeTrackingIdentifier(" AB 12 ")).toBe("AB12");
  });

  it("normalizeQuantity distinguishes explicit 1 vs defaulted missing", () => {
    const missing = normalizeQuantity(null);
    expect(missing.quantity).toBe(1);
    expect(missing.origin).toBe("defaulted");
    expect(missing.issue?.code).toBe("default_quantity_applied");

    const explicit = normalizeQuantity("1");
    expect(explicit.quantity).toBe(1);
    expect(explicit.origin).toBe("explicit");
    expect(explicit.issue).toBeUndefined();

    expect(normalizeQuantity("3").origin).toBe("explicit");
    expect(normalizeQuantity("x").origin).toBe("invalid");
    expect(normalizeQuantity("x").issue?.code).toBe("invalid_quantity");
  });
});
