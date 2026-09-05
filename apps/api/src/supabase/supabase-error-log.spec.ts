import {
  normalizeConfigSecret,
  summarizeSupabaseError,
} from "./supabase-error-log";

describe("supabase-error-log", () => {
  it("treats missing/empty code as none", () => {
    expect(summarizeSupabaseError({ message: "Invalid API key" })).toContain(
      "code=none",
    );
    expect(summarizeSupabaseError({ code: "", message: "Invalid API key" })).toContain(
      "message=Invalid API key",
    );
  });

  it("keeps postgres codes and redacts tokens", () => {
    const summary = summarizeSupabaseError({
      code: "42501",
      message: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb denied",
      details: "",
      hint: "check grants",
      status: 401,
    });
    expect(summary).toContain("code=42501");
    expect(summary).toContain("status=401");
    expect(summary).toContain("hint=check grants");
    expect(summary).not.toContain("eyJ");
    expect(summary).not.toContain("Bearer eyJ");
  });

  it("trims quoted env secrets without exposing them", () => {
    expect(normalizeConfigSecret('  "abc"  ')).toBe("abc");
    expect(normalizeConfigSecret("")).toBe("");
  });
});
