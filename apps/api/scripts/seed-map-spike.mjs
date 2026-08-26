/**
 * Phase 1 map spike: Kakao address + apartment-dong keyword resolve, seed one job/point.
 * Does not print API keys, tokens, or secrets.
 */
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { resolveKakaoDeliveryPin } from "./kakao-resolve-pin.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRIVER_EMAIL = "whddud97@naver.com";
const GEOCODE_QUERY = "인천광역시 남동구 서창남순환로 55";
const DETAIL_ADDRESS = "서창센트럴푸르지오 504동 2003호";
const SPIKE_KEY = "phase1-map-spike-kakao";

function loadEnv(file) {
  const map = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    map[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return map;
}

async function main() {
  const env = loadEnv(path.join(__dirname, "..", ".env"));
  const url = env.SUPABASE_URL?.replace(/\/$/, "");
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  const kakao = env.KAKAO_REST_API_KEY;
  if (!url || !service || !kakao) {
    throw new Error("api env incomplete (url/service/kakao)");
  }

  const geo = await resolveKakaoDeliveryPin(kakao, {
    roadAddress: GEOCODE_QUERY,
    detailAddress: DETAIL_ADDRESS,
  });

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listed.error) throw new Error(listed.error.message);
  const user = (listed.data?.users || []).find((u) => u.email === DRIVER_EMAIL);
  if (!user) throw new Error("driver auth user not found");

  const { data: driver, error: driverErr } = await admin
    .from("drivers")
    .select("id, user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (driverErr || !driver) {
    throw new Error(driverErr?.message || "driver row not found");
  }

  const { data: oldPoints } = await admin
    .from("delivery_points")
    .select("id, job_id")
    .eq("tracking_or_order_key", SPIKE_KEY);
  for (const p of oldPoints || []) {
    await admin.from("delivery_proofs").delete().eq("point_id", p.id);
    await admin.from("delivery_point_pii").delete().eq("point_id", p.id);
    await admin.from("delivery_points").delete().eq("id", p.id);
    if (p.job_id) {
      await admin.from("delivery_jobs").delete().eq("id", p.job_id);
    }
  }

  const { data: job, error: jobErr } = await admin
    .from("delivery_jobs")
    .insert({
      driver_id: driver.id,
      status: "active",
      service_date: new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  if (jobErr || !job) throw new Error(jobErr?.message || "job insert failed");

  const locationCandidates = [
    `SRID=4326;POINT(${geo.longitude} ${geo.latitude})`,
    {
      type: "Point",
      coordinates: [geo.longitude, geo.latitude],
      crs: { type: "name", properties: { name: "EPSG:4326" } },
    },
  ];

  let point = null;
  let lastErr = null;
  for (const location of locationCandidates) {
    const { data, error } = await admin
      .from("delivery_points")
      .insert({
        job_id: job.id,
        driver_id: driver.id,
        sequence_no: 1,
        display_label: "베개",
        location,
        pin_accuracy: geo.pinAccuracy,
        quantity: 1,
        carrier_code: "쿠팡",
        tracking_or_order_key: SPIKE_KEY,
        status: "pending",
      })
      .select("id, pin_accuracy, carrier_code, display_label, quantity, status")
      .single();
    if (!error && data) {
      point = data;
      break;
    }
    lastErr = error;
  }

  if (!point) {
    await admin.from("delivery_jobs").delete().eq("id", job.id);
    throw new Error(lastErr?.message || "point insert failed");
  }

  const { error: piiErr } = await admin.from("delivery_point_pii").insert({
    point_id: point.id,
    job_id: job.id,
    driver_id: driver.id,
    customer_name: "테스트 고객",
    raw_address: GEOCODE_QUERY,
    normalized_address: geo.addressName,
    detail_address: DETAIL_ADDRESS,
    contact_type: "none",
  });
  if (piiErr) {
    await admin.from("delivery_points").delete().eq("id", point.id);
    await admin.from("delivery_jobs").delete().eq("id", job.id);
    throw new Error(piiErr.message);
  }

  console.log(
    JSON.stringify({
      ok: true,
      geocode: {
        provider: geo.provider,
        geocodeSource: geo.geocodeSource,
        latitude: geo.latitude,
        longitude: geo.longitude,
        pinAccuracy: geo.pinAccuracy,
        placeName: geo.placeName,
        buildingName: geo.buildingName,
      },
      jobIdPrefix: job.id.slice(0, 8),
      pointIdPrefix: point.id.slice(0, 8),
      driverIdPrefix: driver.id.slice(0, 8),
    }),
  );
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
