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

  const ctx = (authorization?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization },
        }),
      }),
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

  it("accepts valid token and attaches auth user", async () => {
    jwt.verifyAccessToken.mockResolvedValueOnce({
      userId: "u1",
      email: "d@example.com",
    });
    const fakeClient = { from: jest.fn() };
    userClients.createForAccessToken.mockReturnValueOnce(fakeClient);
    profiles.resolveAuthUser.mockResolvedValueOnce({
      userId: "u1",
      role: "driver",
      companyId: null,
      driverId: "d1",
      accessToken: "tok",
    });

    const request: {
      headers: { authorization: string };
      authUser?: unknown;
      supabaseUser?: unknown;
    } = {
      headers: { authorization: "Bearer tok" },
    };

    const ok = await guard.canActivate({
      switchToHttp: () => ({ getRequest: () => request }),
    } as never);

    expect(ok).toBe(true);
    expect(request.authUser).toMatchObject({ userId: "u1", role: "driver" });
    expect(request.supabaseUser).toBe(fakeClient);
    expect(userClients.createForAccessToken).toHaveBeenCalledWith("tok");
  });
});
