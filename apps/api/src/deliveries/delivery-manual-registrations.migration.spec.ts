import * as fs from "fs";
import * as path from "path";

const MIGRATION_026 = path.resolve(
  __dirname,
  "../../../../supabase/migrations/026_delivery_manual_registrations.sql",
);

describe("migration 026 SQL contract (STATIC)", () => {
  const sql = fs.readFileSync(MIGRATION_026, "utf8");

  it("is additive and does not touch completion proofs", () => {
    expect(sql).toMatch(/CREATE TABLE public\.delivery_manual_registrations/);
    expect(sql).not.toMatch(/\bDROP TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP COLUMN\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/ALTER TABLE public\.delivery_points\b/);
    expect(sql).not.toMatch(/ALTER TABLE public\.delivery_proofs\b/);
    expect(sql).not.toMatch(/INSERT INTO storage\.buckets/);
  });

  it("keeps point uniqueness, driver FK, and evidence path shape", () => {
    expect(sql).toMatch(
      /point_id uuid PRIMARY KEY REFERENCES public\.delivery_points \(id\) ON DELETE CASCADE/,
    );
    expect(sql).toMatch(
      /driver_id uuid NOT NULL REFERENCES public\.drivers \(id\) ON DELETE RESTRICT/,
    );
    expect(sql).toMatch(/registration_method text NOT NULL DEFAULT 'manual'/);
    expect(sql).toMatch(/manual_reason text NOT NULL/);
    expect(sql).toMatch(/barcode_scan_failed/);
    expect(sql).toMatch(/manual_entry/);
    expect(sql).toMatch(/storage_path text/);
    expect(sql).toMatch(/created_at timestamptz NOT NULL DEFAULT now\(\)/);
    expect(sql).toMatch(/updated_at timestamptz NOT NULL DEFAULT now\(\)/);
    expect(sql).toMatch(/manual-invoice\//);
    expect(sql).toMatch(/delivery_manual_registrations_driver_id_idx/);
  });

  it("is service_role server-only with no client write policies", () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE public\.delivery_manual_registrations FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT ALL ON TABLE public\.delivery_manual_registrations TO service_role/,
    );
    expect(sql).not.toMatch(/CREATE POLICY /);
    expect(sql).not.toMatch(/GRANT .+ TO authenticated/);
  });
});
