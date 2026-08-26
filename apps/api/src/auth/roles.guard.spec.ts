import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";
import { ROLES_KEY } from "./roles.decorator";

describe("RolesGuard", () => {
  it("allows matching role", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(["driver"]),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    const ok = guard.canActivate({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ authUser: { role: "driver" } }),
      }),
    } as never);
    expect(ok).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      ROLES_KEY,
      expect.any(Array),
    );
  });

  it("rejects non-matching role", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(["platform_admin"]),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(() =>
      guard.canActivate({
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ authUser: { role: "driver" } }),
        }),
      } as never),
    ).toThrow(ForbiddenException);
  });
});
