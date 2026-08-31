/**
 * Repair bytea storage for Seoul fixture access_secret only.
 * Updates ciphertext + nonce on existing row — no point/shipment/PII changes.
 *
 * Usage:
 *   node scripts/repair-seoul-access-secret.mjs --dry-run   # plan only
 *   node scripts/repair-seoul-access-secret.mjs --apply     # execute update + verify
 */
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import {
  coerceBytea,
  decryptAesGcm,
  encryptAesGcm,
  parseAccessInfoKey,
  toPgByteaHex,
} from "./access-info-bytea.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_KEY = "fixture:seoul-parc1-sim:01";
// Approved fixture door code — never logged.
const ACCESS_PLAIN = "# 2580";

function loadEnv(file) {
  const map = {};
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    map[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return map;
}

function printPlan(pointId) {
  console.log("REPAIR_PLAN");
  console.log("table=delivery_point_access_secrets");
  console.log(`row_filter=point_id=${pointId}`);
  console.log(`fixture_key=${FIXTURE_KEY}`);
  console.log("columns_to_update=access_info_ciphertext,access_info_nonce");
  console.log(
    "columns_unchanged=point_id,job_id,driver_id,access_info_key_version,access_info_expires_at,access_info_purged_at",
  );
  console.log("key_version=1");
  console.log("format=postgresql_bytea_hex");
}

async function verifyRow(admin, pointId, key) {
  const { data: row, error: selErr } = await admin
    .from("delivery_point_access_secrets")
    .select(
      "point_id, access_info_key_version, access_info_ciphertext, access_info_nonce",
    )
    .eq("point_id", pointId)
    .maybeSingle();
  if (selErr || !row?.point_id) {
    console.log("VERIFY secretRowExists=false");
    return false;
  }

  const cipherBuf = coerceBytea(row.access_info_ciphertext);
  const nonceBuf = coerceBytea(row.access_info_nonce);
  const looksJson = cipherBuf.subarray(0, 2).toString("hex") === "7b22";

  let decryptOk = false;
  try {
    decryptAesGcm(key, cipherBuf, nonceBuf, row.access_info_key_version ?? 1);
    decryptOk = true;
  } catch {
    decryptOk = false;
  }

  console.log(
    [
      "VERIFY",
      `secretRowExists=true`,
      `keyVersion=${row.access_info_key_version ?? 0}`,
      `nonceByteLength=${nonceBuf.length}`,
      `ciphertextByteLength=${cipherBuf.length}`,
      `looksJsonBufferSerialization=${looksJson}`,
      `decryptSuccess=${decryptOk}`,
    ].join(" "),
  );
  return decryptOk && nonceBuf.length === 12 && !looksJson;
}

async function main() {
  const apply = process.argv.includes("--apply");

  const env = loadEnv(path.join(__dirname, "..", ".env"));
  const url = env.SUPABASE_URL?.replace(/\/$/, "");
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  const key = parseAccessInfoKey(env.ACCESS_INFO_KEY);
  if (!url || !service || !key) {
    console.error("REPAIR_FAIL env_incomplete");
    process.exit(1);
  }

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: point, error: pointErr } = await admin
    .from("delivery_points")
    .select("id")
    .eq("tracking_or_order_key", FIXTURE_KEY)
    .maybeSingle();
  if (pointErr || !point?.id) {
    console.error("REPAIR_FAIL point_not_found");
    process.exit(1);
  }

  printPlan(point.id);

  if (!apply) {
    console.log("mode=dry_run no_db_write");
    process.exit(0);
  }

  const enc = encryptAesGcm(key, ACCESS_PLAIN);
  const { error: updErr } = await admin
    .from("delivery_point_access_secrets")
    .update({
      access_info_ciphertext: toPgByteaHex(enc.ciphertext),
      access_info_nonce: toPgByteaHex(enc.nonce),
    })
    .eq("point_id", point.id);

  if (updErr) {
    console.error("REPAIR_FAIL update");
    process.exit(1);
  }

  console.log("REPAIR_APPLIED ok=true");
  const ok = await verifyRow(admin, point.id, key);
  process.exit(ok ? 0 : 1);
}

main().catch(() => {
  console.error("REPAIR_FAIL unexpected");
  process.exit(1);
});
