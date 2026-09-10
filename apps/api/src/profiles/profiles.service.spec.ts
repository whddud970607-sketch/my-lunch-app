import { ProfilesService } from "./profiles.service";

function chainResult(data: unknown, error: unknown = null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data, error }),
  };
}

describe("ProfilesService resolveAuthUser + buildMePayload", () => {
  const serviceClient = { getOrNull: jest.fn().mockReturnValue(null) };
  const service = new ProfilesService(serviceClient as never);

  it("fetches profile and driver once each (parallel), no second pass", async () => {
    const profile = {
      id: "u1",
      role: "driver",
      company_id: "c1",
      display_name: "Pat",
    };
    const driver = {
      id: "d1",
      user_id: "u1",
      company_id: "c1",
      work_status: "available",
    };

    let profilesSelects = 0;
    let driversSelects = 0;
    const userClient = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          profilesSelects += 1;
          return chainResult(profile);
        }
        if (table === "drivers") {
          driversSelects += 1;
          return chainResult(driver);
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };

    const resolved = await service.resolveAuthUser(
      userClient as never,
      "u1",
      "tok",
      "pat@example.com",
    );

    expect(profilesSelects).toBe(1);
    expect(driversSelects).toBe(1);
    expect(resolved.user.driverId).toBe("d1");
    expect(resolved.profile.display_name).toBe("Pat");
    expect(resolved.driver?.id).toBe("d1");

    const payload = service.buildMePayload(
      resolved.user,
      resolved.profile,
      resolved.driver,
    );
    expect(payload).toEqual({
      userId: "u1",
      email: "pat@example.com",
      role: "driver",
      companyId: "c1",
      displayName: "Pat",
      driver: {
        id: "d1",
        companyId: "c1",
        workStatus: "available",
      },
    });
    // buildMePayload must not touch client again
    expect(profilesSelects).toBe(1);
    expect(driversSelects).toBe(1);
  });

  it("rejects when profile missing after resolve", async () => {
    const userClient = {
      from: jest.fn((table: string) => {
        if (table === "profiles") return chainResult(null);
        if (table === "drivers") return chainResult(null);
        throw new Error(`unexpected table ${table}`);
      }),
    };
    // bootstrap unavailable → ServiceUnavailable; force profile null without bootstrap
    // by making getOrNull null and both missing — throws ServiceUnavailableException
    await expect(
      service.resolveAuthUser(userClient as never, "u1", "tok"),
    ).rejects.toBeTruthy();
  });

  it("buildMePayload contract matches prior getMePayload shape", () => {
    const user = {
      userId: "u1",
      email: "a@b.c",
      role: "driver" as const,
      companyId: null,
      driverId: "d1",
      accessToken: "t",
    };
    const profile = {
      id: "u1",
      role: "driver" as const,
      company_id: null,
      display_name: "A",
    };
    const driver = {
      id: "d1",
      user_id: "u1",
      company_id: null,
      work_status: "offline",
    };
    expect(service.buildMePayload(user, profile, driver)).toEqual({
      userId: "u1",
      email: "a@b.c",
      role: "driver",
      companyId: null,
      displayName: "A",
      driver: { id: "d1", companyId: null, workStatus: "offline" },
    });
    expect(service.buildMePayload(user, profile, null).driver).toBeNull();
  });
});
