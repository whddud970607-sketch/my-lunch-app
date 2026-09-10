import { UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "./auth.guard";

describe("AuthGuard", () => {
  const jwt = { verifyAccessToken: jest.fn() };
  const userClients = { createForAccessToken: jest.fn() };
  const profiles = { resolveAuthUser: jest.fn() };

  const guard = new AuthGuard(
    jwt as never,
    userClients as never,
    profiles as never,
  );

  beforeEach(() => {
    jwt.verifyAccessToken.mockReset();
    userClients.createForAccessToken.mockReset();
    profiles.resolveAuthUser.mockReset();
  });

  const ctx = (authorization?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization },
        }),
      }),
      getClass: () => ({ name: "OtherController" }),
    }) as never;

  it("rejects missing bearer token", async () => {
    await expect(guard.canActivate(ctx())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects invalid token", async () => {
    jwt.verifyAccessToken.mockRejectedValueOnce(new Error("bad"));
    await expect(
      guard.canActivate(ctx("Bearer not-a-jwt")),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("accepts valid token and attaches auth user + profile/driver rows", async () => {
    jwt.verifyAccessToken.mockResolvedValueOnce({
      userId: "u1",
      email: "d@example.com",
    });
    const fakeClient = { from: jest.fn() };
    userClients.createForAccessToken.mockReturnValueOnce(fakeClient);
    const profile = {
      id: "u1",
      role: "driver",
      company_id: null,
      display_name: "Driver",
    };
    const driver = {
      id: "d1",
      user_id: "u1",
      company_id: null,
      work_status: "available",
    };
    profiles.resolveAuthUser.mockResolvedValueOnce({
      user: {
        userId: "u1",
        role: "driver",
        companyId: null,
        driverId: "d1",
        accessToken: "tok",
      },
      profile,
      driver,
    });

    const request: {
      headers: { authorization: string };
      authUser?: unknown;
      authProfile?: unknown;
      authDriver?: unknown;
      supabaseUser?: unknown;
    } = {
      headers: { authorization: "Bearer tok" },
    };

    const ok = await guard.canActivate({
      switchToHttp: () => ({ getRequest: () => request }),
      getClass: () => ({ name: "MeController" }),
    } as never);

    expect(ok).toBe(true);
    expect(request.authUser).toMatchObject({ userId: "u1", role: "driver" });
    expect(request.authProfile).toEqual(profile);
    expect(request.authDriver).toEqual(driver);
    expect(request.supabaseUser).toBe(fakeClient);
    expect(userClients.createForAccessToken).toHaveBeenCalledWith("tok");
  });
});
