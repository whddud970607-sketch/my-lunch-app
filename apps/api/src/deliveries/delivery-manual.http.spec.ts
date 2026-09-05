import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";

describe("manual address HTTP auth", () => {
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

  it("UNAUTHENTICATED_SUGGEST_401", async () => {
    const res = await request(app.getHttpServer()).get(
      "/v1/delivery/manual/address/suggest?q=서울",
    );
    expect(res.status).toBe(401);
  });

  it("UNAUTHENTICATED_REGISTER_401", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/delivery/manual/register")
      .send({ commitIdempotencyKey: "k" });
    expect(res.status).toBe(401);
  });

  it("UNAUTHENTICATED_INVOICE_EVIDENCE_401", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/delivery/manual/points/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/invoice-evidence")
      .send({ contentType: "image/jpeg", bytesBase64: "e30=" });
    expect(res.status).toBe(401);

    const read = await request(app.getHttpServer()).get(
      "/v1/delivery/manual/points/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/invoice-evidence",
    );
    expect(read.status).toBe(401);
  });

  it("PHASE_B_SEARCH_UNCHANGED_401", async () => {
    const res = await request(app.getHttpServer()).get(
      "/v1/delivery/today/search?q=x",
    );
    expect(res.status).toBe(401);
  });
});
