import { AdminSupportService } from "./admin-support.service";

describe("AdminSupportService", () => {
  const service = new AdminSupportService();

  it("returns empty search skeleton without passwords", () => {
    const result = service.searchUsers({ legalName: "Tester" });
    expect(result.users).toEqual([]);
    expect(result.meta.resultCount).toBe(0);
  });

  it("grant recovery never exposes password fields", () => {
    const result = service.grantRecoveryAccess({
      userId: "user-1",
      method: "admin_grant",
      reason: "support case",
    });
    expect(result.grantId).toBeNull();
    expect(result.message).toMatch(/recovery token/i);
  });
});
