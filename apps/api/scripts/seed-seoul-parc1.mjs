/**
 * Seed Seoul Parc1 test fixture (1 point) onto existing namdong10 job.
 * Does NOT modify namdong10 rows.
 *
 * Security:
 * - Reads SUPABASE_* / ACCESS_INFO_KEY / KAKAO from apps/api/.env
 * - Never prints key values, fingerprints, lengths, phone, or door codes
 * - service_role used only for this fixture + access_secret ciphertext insert
 *
 * Usage: node scripts/seed-seoul-parc1.mjs
 */
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { resolveKakaoDeliveryPin } from "./kakao-resolve-pin.mjs";
import {
  encryptAesGcm,
  parseAccessInfoKey,
  toPgByteaHex,
} from "./access-info-bytea.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRIVER_ID = "7d46eba2-ec02-445d-9cae-7eee4056e9a6";
const JOB_ID = "cb035fb0-1a55-42b2-a9ce-db5b9c1db26d";
const FIXTURE_KEY = "fixture:seoul-parc1-sim:01";
const TRACKING = "CP-TEST-SEOUL-01-01";
const ROAD = "서울특별시 영등포구 여의대로 108";
const DETAIL = "파크원타워 1008호";

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

function printSafeSummary(s) {
  console.log(
    [
      `ok=${s.ok}`,
      `alreadySeeded=${s.alreadySeeded}`,
      `seoulPoints=${s.seoulPoints}`,
      `seoulShipments=${s.seoulShipments}`,
      `contact_type=${s.contactType}`,
      `hasAccessInfo=${s.hasAccessInfo}`,
      `access_secret_rows=${s.accessSecretRows}`,
      `namdong10_unchanged=${s.namdong10Unchanged}`,
      `namdong10_count=${s.namdong10Count}`,
    ].join(" "),
  );
}

async function main() {
  const envPath = path.join(__dirname, "..", ".env");
  const env = loadEnv(envPath);
  const url = env.SUPABASE_URL?.replace(/\/$/, "");
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  const kakao = env.KAKAO_REST_API_KEY;
  const accessKey = parseAccessInfoKey(env.ACCESS_INFO_KEY);
  if (!url || !service || !kakao || !accessKey) {
    console.error("SEED_FAIL env_incomplete");
    process.exit(1);
  }

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { count: namdongBefore, error: namdongErr } = await admin
    .from("delivery_points")
    .select("id", { count: "exact", head: true })
    .like("tracking_or_order_key", "fixture:namdong10-sim:%");
  if (namdongErr || namdongBefore !== 10) {
    console.error("SEED_FAIL namdong10_precheck");
    process.exit(1);
  }

  const { data: existing } = await admin
    .from("delivery_points")
    .select("id")
    .eq("tracking_or_order_key", FIXTURE_KEY)
    .maybeSingle();

  if (existing?.id) {
    const { count: shipCount } = await admin
      .from("delivery_shipments")
      .select("id", { count: "exact", head: true })
      .eq("point_id", existing.id);
    const { count: secretCount } = await admin
      .from("delivery_point_access_secrets")
      .select("point_id", { count: "exact", head: true })
      .eq("point_id", existing.id)
      .is("access_info_purged_at", null)
      .not("access_info_ciphertext", "is", null);
    const { data: pii } = await admin
      .from("delivery_point_pii")
      .select("contact_type")
      .eq("point_id", existing.id)
      .maybeSingle();
    const { count: namdongAfter } = await admin
      .from("delivery_points")
      .select("id", { count: "exact", head: true })
      .like("tracking_or_order_key", "fixture:namdong10-sim:%");

    printSafeSummary({
      ok: true,
      alreadySeeded: true,
      seoulPoints: 1,
      seoulShipments: shipCount ?? 0,
      contactType: pii?.contact_type ?? "unknown",
      hasAccessInfo: (secretCount ?? 0) > 0,
      accessSecretRows: secretCount ?? 0,
      namdong10Unchanged: namdongAfter === 10,
      namdong10Count: namdongAfter ?? 0,
    });
    return;
  }

  const pin = await resolveKakaoDeliveryPin(kakao, {
    roadAddress: ROAD,
    detailAddress: DETAIL,
    buildingHint: "파크원타워",
  });

  const { data: maxRow } = await admin
    .from("delivery_points")
    .select("sequence_no")
    .eq("job_id", JOB_ID)
    .order("sequence_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sequenceNo = (maxRow?.sequence_no ?? 10) + 1;

  const location = `SRID=4326;POINT(${pin.longitude} ${pin.latitude})`;
  const { data: point, error: pointErr } = await admin
    .from("delivery_points")
    .insert({
      job_id: JOB_ID,
      driver_id: DRIVER_ID,
      sequence_no: sequenceNo,
      display_label: "생수 1팩",
      carrier_code: "쿠팡",
      tracking_or_order_key: FIXTURE_KEY,
      quantity: 1,
      status: "pending",
      pin_accuracy: pin.pinAccuracy ?? "building",
      location,
      building_entrance_hint: "FIXTURE:seoul-parc1-sim",
    })
    .select("id")
    .single();
  if (pointErr || !point) {
    console.error("SEED_FAIL point_insert");
    process.exit(1);
  }

  const { error: piiErr } = await admin.from("delivery_point_pii").insert({
    point_id: point.id,
    job_id: JOB_ID,
    driver_id: DRIVER_ID,
    customer_name: "김정애",
    raw_address: ROAD,
    normalized_address: pin.addressName ?? ROAD,
    detail_address: DETAIL,
    delivery_memo: "문앞 배송",
    contact_type: "virtual_number",
    contact_value: "01012345678",
    contact_provider: "fixture_test",
  });
  if (piiErr) {
    console.error("SEED_FAIL pii_insert");
    process.exit(1);
  }

  const { error: shipErr } = await admin.from("delivery_shipments").insert({
    point_id: point.id,
    job_id: JOB_ID,
    driver_id: DRIVER_ID,
    sequence_no: 1,
    tracking_code: TRACKING,
    status: "pending",
  });
  if (shipErr) {
    console.error("SEED_FAIL shipment_insert");
    process.exit(1);
  }

  // Door code used only for encrypt+insert — never logged.
  const enc = encryptAesGcm(accessKey, "# 2580");
  const expires = new Date();
  expires.setDate(expires.getDate() + 14);
  const { error: secErr } = await admin
    .from("delivery_point_access_secrets")
    .insert({
      point_id: point.id,
      job_id: JOB_ID,
      driver_id: DRIVER_ID,
      access_info_ciphertext: toPgByteaHex(enc.ciphertext),
      access_info_nonce: toPgByteaHex(enc.nonce),
      access_info_key_version: enc.keyVersion,
      access_info_expires_at: expires.toISOString(),
    });
  if (secErr) {
    console.error("SEED_FAIL access_secret_insert");
    process.exit(1);
  }

  const { count: namdongAfter } = await admin
    .from("delivery_points")
    .select("id", { count: "exact", head: true })
    .like("tracking_or_order_key", "fixture:namdong10-sim:%");
  const { count: seoulPoints } = await admin
    .from("delivery_points")
    .select("id", { count: "exact", head: true })
    .eq("tracking_or_order_key", FIXTURE_KEY);
  const { count: seoulShipments } = await admin
    .from("delivery_shipments")
    .select("id", { count: "exact", head: true })
    .eq("point_id", point.id);
  const { count: secretCount } = await admin
    .from("delivery_point_access_secrets")
    .select("point_id", { count: "exact", head: true })
    .eq("point_id", point.id)
    .is("access_info_purged_at", null)
    .not("access_info_ciphertext", "is", null);

  printSafeSummary({
    ok: true,
    alreadySeeded: false,
    seoulPoints: seoulPoints ?? 0,
    seoulShipments: seoulShipments ?? 0,
    contactType: "virtual_number",
    hasAccessInfo: (secretCount ?? 0) > 0,
    accessSecretRows: secretCount ?? 0,
    namdong10Unchanged: namdongAfter === 10 && namdongBefore === 10,
    namdong10Count: namdongAfter ?? 0,
  });
}

main().catch(() => {
  console.error("SEED_FAIL unexpected");
  process.exit(1);
});
