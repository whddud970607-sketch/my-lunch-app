/**
 * DEVELOPMENT / RESEARCH ONLY — NAVER Directions 5 live PUBLIC test.
 * Never prints Client ID/Secret or full URLs with credentials.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIRECTIONS_5 = "https://maps.apigw.ntruss.com/map-direction/v1/driving";
const DIRECTIONS_15 = "https://maps.apigw.ntruss.com/map-direction-15/v1/driving";

/** PUBLIC fixture coords — no PII */
const START = { lng: 126.744960443984, lat: 37.4232096600755, label: "POC_DRIVER_START" };
const GOAL = { lng: 126.74186674441195, lat: 37.42328331583333, label: "KAKAO_609_PLACE_REF" };

function loadEnv(file) {
  const m = {};
  if (!fs.existsSync(file)) return m;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    m[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return m;
}

async function directions(baseUrl, clientId, clientSecret, waypoints = null) {
  const url = new URL(baseUrl);
  url.searchParams.set("start", `${START.lng},${START.lat}`);
  url.searchParams.set("goal", `${GOAL.lng},${GOAL.lat}`);
  url.searchParams.set("option", "traoptimal");
  if (waypoints) url.searchParams.set("waypoints", waypoints);
  const res = await fetch(url.toString(), {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": clientId,
      "X-NCP-APIGW-API-KEY": clientSecret,
    },
  });
  const body = await res.json().catch(() => null);
  return { http: res.status, body };
}

function summarize(http, body) {
  if (http !== 200 || !body) {
    return {
      http,
      ok: false,
      apiCode: body?.code ?? null,
      message: body?.message ?? null,
    };
  }
  const route = body.route?.traoptimal?.[0];
  if (!route) {
    return { http, ok: false, apiCode: body.code, message: body.message, routeCount: 0 };
  }
  const s = route.summary ?? {};
  return {
    http,
    ok: body.code === 0,
    apiCode: body.code,
    message: body.message,
    distanceM: s.distance ?? null,
    durationMs: s.duration ?? null,
    pathPointCount: route.path?.length ?? 0,
    sectionCount: route.section?.length ?? 0,
    guideCount: route.guide?.length ?? 0,
    tollFare: s.tollFare ?? null,
    fuelPrice: s.fuelPrice ?? null,
    hasTrafficSection: (route.section ?? []).some((x) => x.congestion != null),
    guideSample: route.guide?.[0]
      ? {
          type: route.guide[0].type,
          instructionsLen: String(route.guide[0].instructions ?? "").length,
        }
      : null,
  };
}

async function main() {
  const env = loadEnv(path.join(__dirname, "..", ".env"));
  const clientId = env.NAVER_MAP_CLIENT_ID?.trim() ?? null;
  const clientSecret = env.NAVER_MAP_CLIENT_SECRET?.trim() ?? null;
  const configured = Boolean(clientId && clientSecret);

  const report = {
    script: "research-naver-directions-609.mjs",
    NAVER_DIRECTIONS_CONFIGURED: configured ? "YES" : "NO",
    endpoints: {
      directions5: DIRECTIONS_5,
      directions15: DIRECTIONS_15,
    },
    publicRoute: { start: START, goal: GOAL },
    directions5: null,
    directions15: null,
    NAVER_DIRECTIONS_LIVE_TEST: configured ? "PENDING" : "NOT_CONFIGURED",
  };

  if (!configured) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const d5 = await directions(DIRECTIONS_5, clientId, clientSecret);
  const d15 = await directions(DIRECTIONS_15, clientId, clientSecret);
  report.directions5 = summarize(d5.http, d5.body);
  report.directions15 = summarize(d15.http, d15.body);
  report.NAVER_DIRECTIONS_LIVE_TEST =
    report.directions5.ok || report.directions15.ok ? "PASS" : "FAIL";

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: String(e.message ?? e) }));
  process.exit(1);
});
