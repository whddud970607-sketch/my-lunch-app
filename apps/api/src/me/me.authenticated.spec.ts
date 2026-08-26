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
    req.supabaseUser = { from: jest.fn() };
    return true;
  }
}

describe("GET /v1/me authenticated success path", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MeController],
      providers: [
        {
          provide: ProfilesService,
          useValue: {
            getMePayload: jest.fn().mockResolvedValue({
              userId: "user-a",
              email: "driver-a@example.com",
              role: "driver",
              companyId: null,
              displayName: "driver-a",
              driver: {
                id: "driver-a",
                companyId: null,
                workStatus: "available",
              },
            }),
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

  it("returns driver me payload", async () => {
    const res = await request(app.getHttpServer()).get("/v1/me");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      userId: "user-a",
      role: "driver",
      driver: { id: "driver-a" },
    });
  });
});
