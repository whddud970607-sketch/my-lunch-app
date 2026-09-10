import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { CanActivate, ExecutionContext } from "@nestjs/common";
import request from "supertest";
import { MeController } from "./me.controller";
import { AuthGuard } from "../auth/auth.guard";
import { ProfilesService } from "../profiles/profiles.service";

class AllowDriverGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.authUser = {
      userId: "user-a",
      email: "driver-a@example.com",
      role: "driver",
      companyId: null,
      driverId: "driver-a",
      accessToken: "test-access-token",
    };
    req.authProfile = {
      id: "user-a",
      role: "driver",
      company_id: null,
      display_name: "driver-a",
    };
    req.authDriver = {
      id: "driver-a",
      user_id: "user-a",
      company_id: null,
      work_status: "available",
    };
    req.supabaseUser = { from: jest.fn() };
    return true;
  }
}

describe("GET /v1/me authenticated success path", () => {
  let app: INestApplication;
  let buildMePayload: jest.Mock;

  beforeAll(async () => {
    buildMePayload = jest.fn().mockImplementation((user, profile, driver) => ({
      userId: user.userId,
      email: user.email ?? null,
      role: profile.role,
      companyId: profile.company_id,
      displayName: profile.display_name,
      driver: driver
        ? {
            id: driver.id,
            companyId: driver.company_id,
            workStatus: driver.work_status,
          }
        : null,
    }));

    const moduleRef = await Test.createTestingModule({
      controllers: [MeController],
      providers: [
        {
          provide: ProfilesService,
          useValue: {
            buildMePayload,
            getMePayload: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useClass(AllowDriverGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("v1");
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns driver me payload from guard context without getMePayload", async () => {
    const res = await request(app.getHttpServer()).get("/v1/me");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      userId: "user-a",
      role: "driver",
      displayName: "driver-a",
      driver: { id: "driver-a", workStatus: "available" },
    });
    expect(buildMePayload).toHaveBeenCalledTimes(1);
  });
});
