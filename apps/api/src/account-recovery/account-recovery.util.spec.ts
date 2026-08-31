import {
  birthDateErrorMessage,
  isValidBirthDate,
  isValidPassword,
  maskEmail,
  normalizeBirthDate,
  normalizeKrPhoneToE164,
  validateBirthDate,
} from "./account-recovery.util";

describe("account-recovery.util", () => {
  const ref = new Date(Date.UTC(2026, 7, 29));

  it("normalizes Korean mobile numbers", () => {
    expect(normalizeKrPhoneToE164("010-1234-5678")).toBe("+821012345678");
    expect(normalizeKrPhoneToE164("01012345678")).toBe("+821012345678");
    expect(normalizeKrPhoneToE164(" 010 1234 5678 ")).toBe("+821012345678");
  });

  it.each([
    "19970607",
    "1997-06-07",
    "1997/06/07",
    "1997.06.07",
    " 19970607 ",
  ])("normalizes birth date from %s", (input) => {
    expect(normalizeBirthDate(input)).toBe("1997-06-07");
    expect(validateBirthDate(input, ref)).toEqual({ ok: true, value: "1997-06-07" });
  });

  it("rejects invalid birth dates", () => {
    expect(normalizeBirthDate("19971340")).toBeNull();
    expect(normalizeBirthDate("199706")).toBeNull();
    expect(validateBirthDate("19971340", ref)).toEqual({ ok: false, reason: "invalid" });
    expect(validateBirthDate("199706", ref)).toEqual({ ok: false, reason: "length" });
  });

  it("rejects future birth dates", () => {
    expect(normalizeBirthDate("20300101")).toBeNull();
    expect(validateBirthDate("20300101", ref)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects under minimum age", () => {
    expect(normalizeBirthDate("20150101")).toBeNull();
    expect(validateBirthDate("20150101", ref)).toEqual({ ok: false, reason: "invalid" });
  });

  it("returns user-facing birth date error messages", () => {
    expect(birthDateErrorMessage({ ok: false, reason: "length" })).toBe(
      "생년월일 8자리를 입력해주세요.",
    );
    expect(birthDateErrorMessage({ ok: false, reason: "invalid" })).toBe(
      "생년월일을 다시 확인해주세요.",
    );
  });

  it("validates birth date format via normalize", () => {
    expect(isValidBirthDate("1990-01-15")).toBe(true);
    expect(isValidBirthDate("19900115")).toBe(true);
    expect(isValidBirthDate("1990/01/15")).toBe(true);
    expect(normalizeBirthDate("1990/01/15")).toBe("1990-01-15");
  });

  it("validates password length", () => {
    expect(isValidPassword("12345678")).toBe(true);
    expect(isValidPassword("short")).toBe(false);
  });

  it("masks email", () => {
    expect(maskEmail("whddud97@naver.com")).toBe("wh***@naver.com");
  });
});
