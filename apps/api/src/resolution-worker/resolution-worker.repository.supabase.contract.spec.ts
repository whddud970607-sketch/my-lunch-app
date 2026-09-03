import * as fs from "node:fs";
import * as path from "node:path";

const MIGRATION_025 = path.resolve(
  __dirname,
  "../../../../supabase/migrations/025_resolution_worker_claim_and_queue.sql",
);

describe("migration 025 SQL contract (STATIC)", () => {
  const sql = fs.readFileSync(MIGRATION_025, "utf8");

  it("remains draft and additive (no legacy coordinate mutation)", () => {
    expect(sql).toMatch(/DRAFT ONLY/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.delivery_points\s+SET\s+location\s*=/i);
    expect(sql).toMatch(/pin_accuracy IS DISTINCT FROM 'driver_verified'/);
  });

  it("bounds claimed_by length", () => {
    expect(sql).toMatch(/delivery_points_claimed_by_bounded/);
    expect(sql).toMatch(/length\(resolution_claimed_by\) <= 128/);
  });

  it("defines atomic claim with FOR UPDATE SKIP LOCKED and DB now()", () => {
    expect(sql).toMatch(/resolution_worker_claim_batch/);
    expect(sql).toMatch(/FOR UPDATE OF dp SKIP LOCKED/);
    expect(sql).toMatch(
      /resolution_lease_expires_at = now\(\) \+ \(v_lease_ms \* interval '1 millisecond'\)/,
    );
    expect(sql).not.toMatch(
      /resolution_lease_expires_at\s*=\s*p_.*expires/i,
    );
  });

  it("execution-start CAS increments attempt_count under lease predicates", () => {
    expect(sql).toMatch(/resolution_worker_execution_start/);
    expect(sql).toMatch(
      /resolution_attempt_count = dp\.resolution_attempt_count \+ 1/,
    );
    expect(sql).toMatch(/resolution_lease_expires_at > now\(\)/);
  });

  it("heartbeat extends from DB now() with bounded duration", () => {
    expect(sql).toMatch(/resolution_worker_heartbeat/);
    expect(sql).toMatch(/v_lease_ms < 1000 OR v_lease_ms > 3600000/);
    expect(sql).toMatch(
      /resolution_lease_expires_at = now\(\) \+ \(v_lease_ms \* interval '1 millisecond'\)/,
    );
    expect(sql).toMatch(/resolution_lease_heartbeat_count < v_max_hb/);
  });

  it("persist uses DB now() for lease, resolved_at, and next_attempt", () => {
    expect(sql).toMatch(/resolution_worker_persist/);
    expect(sql).toMatch(/v_resolved_at := now\(\)/);
    expect(sql).toMatch(
      /v_next_attempt := now\(\) \+ \(v_delay_ms \* interval '1 millisecond'\)/,
    );
    expect(sql).toMatch(/resolution_lease_expires_at > now\(\)/);
    expect(sql).toMatch(/UPDATE public\.delivery_point_pii/);
  });

  it("revokes worker RPCs from PUBLIC/anon/authenticated and grants service_role only", () => {
    const rpcs = [
      "resolution_worker_list_eligible_drivers()",
      "resolution_worker_claim_batch(text, int, jsonb)",
      "resolution_worker_fetch_pii(uuid[])",
      "resolution_worker_execution_start(uuid, uuid, text, smallint)",
      "resolution_worker_heartbeat(uuid, uuid, text, smallint, int, int)",
      "resolution_worker_release_claim(uuid, uuid, text)",
      "resolution_worker_manual_requeue(uuid)",
      "resolution_worker_get_point(uuid)",
    ];
    const normalized = sql.replace(/\r\n/g, "\n");
    for (const sig of rpcs) {
      expect(normalized).toContain(
        `REVOKE ALL ON FUNCTION public.${sig}\n  FROM PUBLIC, anon, authenticated`,
      );
      expect(normalized).toContain(
        `GRANT EXECUTE ON FUNCTION public.${sig}\n  TO service_role`,
      );
    }
    expect(normalized).toMatch(
      /REVOKE ALL ON FUNCTION public\.resolution_worker_persist\([\s\S]*?\) FROM PUBLIC, anon, authenticated/,
    );
    expect(normalized).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.resolution_worker_persist\([\s\S]*?\) TO service_role/,
    );
  });

  it("uses SECURITY DEFINER with fixed search_path", () => {
    const definerCount = (sql.match(/SECURITY DEFINER/g) ?? []).length;
    expect(definerCount).toBeGreaterThanOrEqual(8);
    expect(sql).toMatch(/SET search_path = public, extensions, pg_temp/);
  });

  it("PII fetch selects only address fields", () => {
    expect(sql).toMatch(/resolution_worker_fetch_pii/);
    expect(sql).toMatch(/'rawAddress', p\.raw_address/);
    expect(sql).toMatch(/'detailAddress', p\.detail_address/);
    expect(sql).toMatch(/'normalizedAddress', p\.normalized_address/);
    expect(sql).not.toMatch(
      /resolution_worker_fetch_pii[\s\S]*customer_name/,
    );
    expect(sql).not.toMatch(/resolution_worker_fetch_pii[\s\S]*delivery_memo/);
    expect(sql).not.toMatch(/resolution_worker_fetch_pii[\s\S]*contact_value/);
  });

  it("queue index excludes driver_verified and exhausted retries", () => {
    expect(sql).toMatch(/delivery_points_resolution_queue_v2_idx/);
    expect(sql).toMatch(/resolution_retry_exhausted = false/);
    expect(sql).toMatch(/pin_accuracy IS DISTINCT FROM 'driver_verified'/);
  });
});
