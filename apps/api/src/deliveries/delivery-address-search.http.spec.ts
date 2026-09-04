import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";

/**
 * HTTP wiring for GET /v1/delivery/today/search.
 * Unauthenticated 401 only — no live Supabase mutation.
 */
describe("GET /v1/delivery/today/search HTTP", () => {
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

  it("UNAUTHENTICATED_SEARCH_401 without token", async () => {
    const res = await request(app.getHttpServer()).get(
      "/v1/delivery/today/search?q=x",
    );
    expect(res.status).toBe(401);
  });

  it("UNAUTHENTICATED_SEARCH_401 garbage bearer", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/delivery/today/search?q=x")
      .set("Authorization", "Bearer not-a-valid-jwt");
    expect(res.status).toBe(401);
  });
});
