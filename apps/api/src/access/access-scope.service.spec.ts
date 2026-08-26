import { ForbiddenException } from "@nestjs/common";
import { AccessScopeService } from "./access-scope.service";
import type { AuthUser } from "../auth/auth.types";

function user(partial: Partial<AuthUser> & Pick<AuthUser, "userId" | "role">): AuthUser {
  return {
    companyId: null,
    driverId: null,
    accessToken: "test-token",
    ...partial,
  };
}

describe("AccessScopeService", () => {
  const scope = new AccessScopeService();

  it("blocks driver A from driver B resources", () => {
    const a = user({
      userId: "u-a",
      role: "driver",
      driverId: "d-a",
    });
    expect(() =>
      scope.forUser(a).assertCanAccessDriverResource({
        driverId: "d-b",
        companyId: null,
      }),
    ).toThrow(ForbiddenException);
  });

  it("blocks company_admin from another company", () => {
    const admin = user({
      userId: "u-c",
      role: "company_admin",
      companyId: "co-1",
    });
    expect(() =>
      scope.forUser(admin).assertCanAccessDriverResource({
        driverId: "d-x",
        companyId: "co-2",
      }),
    ).toThrow(ForbiddenException);
  });

  it("allows company_admin for same company", () => {
    const admin = user({
      userId: "u-c",
      role: "company_admin",
      companyId: "co-1",
    });
    expect(() =>
      scope.forUser(admin).assertCanAccessDriverResource({
        driverId: "d-x",
        companyId: "co-1",
      }),
    ).not.toThrow();
  });

  it("denies client platform_admin elevation API", () => {
    expect(() => scope.denyClientRoleElevation()).toThrow(ForbiddenException);
  });
});
