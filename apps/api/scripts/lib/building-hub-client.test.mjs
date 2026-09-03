import assert from "node:assert/strict";
import test from "node:test";
import { paginationPlan, fetchAllRegisterPages } from "./building-hub-client.mjs";
import { mapParcelResolverToReport } from "./benchmark-report.mjs";

test("pagination plan for 19 items is 1 page", () => {
  const p = paginationPlan(19, 100);
  assert.equal(p.pageCount, 1);
  assert.equal(p.pages.length, 1);
});

test("pagination plan for 250 items is 3 pages", () => {
  const p = paginationPlan(250, 100);
  assert.equal(p.pageCount, 3);
});

test("pagination budget exceeded when totalCount requires more than maxPages", async () => {
  const result = await fetchAllRegisterPages(
    async (pageNo) => ({
      httpStatus: 200,
      body: {
        response: {
          header: { resultCode: "00" },
          body: {
            totalCount: 501,
            items: { item: [{ dongNm: `P${pageNo}` }] },
          },
        },
      },
    }),
    { maxPages: 5 },
  );
  assert.equal(result.ok, false);
  assert.equal(result.kind, "BUDGET_EXCEEDED");
  assert.equal(result.reason, "NETWORK_BUDGET_EXCEEDED");
  assert.equal(result.requiredPages, 6);
});

test("blocked parcel resolver -> zero downstream calls", () => {
  const r = mapParcelResolverToReport({
    status: "BLOCKED",
    reason: "PARCEL_SEED_GATE_PENDING",
    parcel: null,
  });
  assert.equal(r.buildingHubCalls, 0);
  assert.equal(r.vworldCalls, 0);
  assert.equal(r.failureReason, "PARCEL_UNRESOLVED");
});
