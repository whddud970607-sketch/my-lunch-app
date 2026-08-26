import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";

/**
 * HTTP smoke against Nest wiring (no live Supabase required for 401 path).
 * Live token/RLS cases: set RUN_LIVE_SMOKE=1 + apps/api/.env (see rls.live-smoke.spec.ts).
 */
describe("Phase 1C HTTP smoke", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("v1");
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("keeps health endpoint", async () => {
    const res = await request(app.getHttpServer()).get("/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "ok",
      service: "delivery-shield-api",
      phase: "1c",
    });
  });

  it("rejects unauthenticated GET /v1/me", async () => {
    const res = await request(app.getHttpServer()).get("/v1/me");
    expect(res.status).toBe(401);
  });

  it("rejects garbage bearer on GET /v1/me", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/me")
      .set("Authorization", "Bearer not-a-valid-jwt");
    expect(res.status).toBe(401);
  });

  it("denies client platform_admin promotion", async () => {
    const res = await request(app.getHttpServer()).post(
      "/v1/admin/promote-platform-admin",
    );
    expect([401, 403]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });
});
