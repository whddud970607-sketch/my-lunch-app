import {
  assertNoSensitiveLeak,
  redactCredentials,
  redactCustomerPii,
  sanitizeOperationalError,
} from "./diagnostic-redaction";

describe("diagnostic-redaction", () => {
  describe("redactCredentials", () => {
    it("redacts KakaoAK tokens", () => {
      const out = redactCredentials("Authorization: KakaoAK abc123secret-key");
      expect(out).not.toMatch(/abc123secret-key/);
      expect(out).toContain("[REDACTED_CREDENTIAL]");
      expect(assertNoSensitiveLeak(out)).toBe(true);
    });

    it("redacts serviceKey query params", () => {
      const out = redactCredentials(
        "https://apis.data.go.kr/foo?serviceKey=SUPER_SECRET_KEY&sigunguCd=28200",
      );
      expect(out).not.toMatch(/SUPER_SECRET_KEY/);
      expect(out).toContain("[REDACTED_CREDENTIAL]");
    });

    it("redacts apiKey params", () => {
      const out = redactCredentials("fetch failed apiKey=live-vworld-key-12345");
      expect(out).not.toMatch(/live-vworld-key-12345/);
      expect(out).toContain("[REDACTED_CREDENTIAL]");
    });
  });

  describe("redactCustomerPii", () => {
    it("redacts phone numbers", () => {
      const out = redactCustomerPii("고객 연락처 010-1234-5678 문의");
      expect(out).not.toMatch(/010-1234-5678/);
      expect(out).toContain("[REDACTED_PII]");
    });

    it("redacts ho numbers and access phrases", () => {
      const out = redactCustomerPii("503호 비밀번호 1234 출입코드");
      expect(out).not.toMatch(/503호/);
      expect(out).not.toMatch(/비밀번호/);
      expect(out).not.toMatch(/출입/);
      expect(out).toContain("[REDACTED_PII]");
    });
  });

  describe("sanitizeOperationalError", () => {
    it("strips credentials from message and url", () => {
      const safe = sanitizeOperationalError({
        provider: "building_hub",
        httpStatus: 401,
        code: "AUTH_ERROR",
        message: "KakaoAK leaked-key in body",
        url: "https://apis.data.go.kr/x?serviceKey=secret&sigunguCd=28200",
      });
      expect(JSON.stringify(safe)).not.toMatch(/leaked-key/);
      expect(JSON.stringify(safe)).not.toMatch(/secret/);
      expect(safe.urlPath).not.toMatch(/serviceKey=/);
      expect(assertNoSensitiveLeak(JSON.stringify(safe))).toBe(true);
    });
  });

  describe("assertNoSensitiveLeak", () => {
    it("passes on clean diagnostic text", () => {
      expect(assertNoSensitiveLeak("BUILDING_HUB_FETCH_FAILED sigunguCd=28200")).toBe(true);
    });

    it("fails when credentials remain", () => {
      expect(assertNoSensitiveLeak("KakaoAK still-here")).toBe(false);
    });

    it("fails when PII remains", () => {
      expect(assertNoSensitiveLeak("배달 01099998888")).toBe(false);
    });
  });
});
