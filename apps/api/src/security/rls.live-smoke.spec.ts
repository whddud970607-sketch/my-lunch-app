/**
 * Optional live RLS smoke (skipped unless RUN_LIVE_SMOKE=1).
 *
 * Required env (never log values):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET (or JWKS)
 *   LIVE_DRIVER_A_ACCESS_TOKEN — driver A session
 *   LIVE_DRIVER_B_JOB_ID — job owned by driver B (UUID)
 *   LIVE_COMPANY_ADMIN_TOKEN — company_admin for company X (optional)
 *   LIVE_OTHER_COMPANY_JOB_ID — job in company Y (optional)
 *
 * Run: RUN_LIVE_SMOKE=1 npm test -- --testPathPatterns=rls.live
 */
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";

const live = process.env.RUN_LIVE_SMOKE === "1";

(live ? describe : describe.skip)("Phase 1C live RLS smoke", () => {
  let app: INestApplication;
  const driverAToken = process.env.LIVE_DRIVER_A_ACCESS_TOKEN ?? "";
  const otherJobId = process.env.LIVE_DRIVER_B_JOB_ID ?? "";
  const companyAdminToken = process.env.LIVE_COMPANY_ADMIN_TOKEN ?? "";
  const otherCompanyJobId = process.env.LIVE_OTHER_COMPANY_JOB_ID ?? "";

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

  it("GET /v1/me succeeds with driver access token", async () => {
    expect(driverAToken).toBeTruthy();
    const res = await request(app.getHttpServer())
      .get("/v1/me")
      .set("Authorization", `Bearer ${driverAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("driver");
    expect(res.body.userId).toBeTruthy();
  });

  it("driver A cannot read driver B job via API+RLS", async () => {
    expect(driverAToken && otherJobId).toBeTruthy();
    const res = await request(app.getHttpServer())
      .get(`/v1/delivery/jobs/${otherJobId}`)
      .set("Authorization", `Bearer ${driverAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it("company_admin cannot read other-company job", async () => {
    if (!companyAdminToken || !otherCompanyJobId) {
      return;
    }
    const res = await request(app.getHttpServer())
      .get(`/v1/delivery/jobs/${otherCompanyJobId}`)
      .set("Authorization", `Bearer ${companyAdminToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it("authenticated user cannot promote to platform_admin", async () => {
    expect(driverAToken).toBeTruthy();
    const res = await request(app.getHttpServer())
      .post("/v1/admin/promote-platform-admin")
      .set("Authorization", `Bearer ${driverAToken}`);
    expect(res.status).toBe(403);
  });
});
