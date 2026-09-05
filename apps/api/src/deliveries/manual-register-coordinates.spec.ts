import {
  assertManualDongRegisterAllowed,
  isUserPinConfirmedFlag,
  manualSourceFromDongSourceType,
  pickManualCoordinatePriority,
  sanitizeManualCoordinates,
  shouldOverwriteExistingManualLocation,
  toCoordinateSource,
  toLocationEwkt,
} from "./manual-register-coordinates";

describe("sanitizeManualCoordinates", () => {
  it("keeps valid search coordinates", () => {
    expect(sanitizeManualCoordinates(37.42, 126.74)).toEqual({
      latitude: 37.42,
      longitude: 126.74,
    });
    expect(sanitizeManualCoordinates("37.5", "127.0")).toEqual({
      latitude: 37.5,
      longitude: 127.0,
    });
  });

  it("rejects missing, NaN, range, and 0,0", () => {
    expect(sanitizeManualCoordinates(null, 126.74)).toBeNull();
    expect(sanitizeManualCoordinates(37.42, undefined)).toBeNull();
    expect(sanitizeManualCoordinates(Number.NaN, 126.74)).toBeNull();
    expect(sanitizeManualCoordinates(91, 126.74)).toBeNull();
    expect(sanitizeManualCoordinates(37.42, 181)).toBeNull();
    expect(sanitizeManualCoordinates(0, 0)).toBeNull();
  });

  it("prefers manual adjust over dong and base", () => {
    const picked = pickManualCoordinatePriority({
      adjusted: { latitude: 37.1, longitude: 126.1 },
      apartmentDong: { latitude: 37.2, longitude: 126.2 },
      baseAddress: { latitude: 37.3, longitude: 126.3 },
    });
    expect(picked?.source).toBe("manual_adjust");
    expect(picked?.coords).toEqual({ latitude: 37.1, longitude: 126.1 });
  });

  it("uses apartment dong before base address", () => {
    const picked = pickManualCoordinatePriority({
      adjusted: null,
      apartmentDong: { latitude: 37.2, longitude: 126.2 },
      baseAddress: { latitude: 37.3, longitude: 126.3 },
    });
    expect(picked?.source).toBe("apartment_dong");
  });

  it("maps coord sources to persisted metadata names", () => {
    expect(toCoordinateSource("manual_adjust")).toBe("user_adjusted");
    expect(toCoordinateSource("apartment_dong")).toBe("provider_dong_exact");
    expect(toCoordinateSource("base_address")).toBe("provider_base_address");
  });

  it("F: tmap_exact_dong is not mapped to persistable apartment_dong", () => {
    expect(manualSourceFromDongSourceType("tmap_exact_dong")).toBeNull();
    expect(manualSourceFromDongSourceType("kakao_exact_dong")).toBe(
      "apartment_dong",
    );
  });

  it("overwrites stored location only for a driver-adjusted pin", () => {
    expect(shouldOverwriteExistingManualLocation(true)).toBe(true);
    expect(shouldOverwriteExistingManualLocation(false)).toBe(false);
    expect(shouldOverwriteExistingManualLocation(undefined)).toBe(false);
  });

  it("fail-closed gate: dong requires exact OR user confirm", () => {
    expect(
      assertManualDongRegisterAllowed({
        requestedDong: "503동",
        exactDongVerified: true,
        userPinConfirmed: false,
      }),
    ).toEqual({ allowed: true });
    expect(
      assertManualDongRegisterAllowed({
        requestedDong: "503",
        exactDongVerified: false,
        userPinConfirmed: true,
      }),
    ).toEqual({ allowed: true });
    expect(
      assertManualDongRegisterAllowed({
        requestedDong: "503동",
        exactDongVerified: false,
        userPinConfirmed: false,
      }),
    ).toEqual({
      allowed: false,
      code: "manual_pin_confirmation_required",
    });
    expect(
      assertManualDongRegisterAllowed({
        requestedDong: null,
        exactDongVerified: false,
        userPinConfirmed: false,
      }),
    ).toEqual({ allowed: true });
  });

  it("map open alone is not user confirmation", () => {
    expect(isUserPinConfirmedFlag({})).toBe(false);
    expect(isUserPinConfirmedFlag({ pinAdjusted: false })).toBe(false);
    expect(isUserPinConfirmedFlag({ pinConfirmed: true })).toBe(true);
    expect(isUserPinConfirmedFlag({ pinAdjusted: true })).toBe(true);
  });

  it("ignores ho: dong wins over base and adjust still wins", () => {
    const picked = pickManualCoordinatePriority({
      adjusted: null,
      apartmentDong: { latitude: 37.201, longitude: 126.201 },
      baseAddress: { latitude: 37.3, longitude: 126.3 },
    });
    expect(picked?.source).toBe("apartment_dong");
  });

  it("builds EWKT without swapping lat/lng", () => {
    expect(toLocationEwkt({ latitude: 37.42, longitude: 126.74 })).toBe(
      "SRID=4326;POINT(126.74 37.42)",
    );
  });
});
