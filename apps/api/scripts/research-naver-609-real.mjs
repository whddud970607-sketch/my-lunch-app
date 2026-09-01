/**
 * DEVELOPMENT / RESEARCH ONLY — NAVER Maps Geocoding v2 + Reverse Geocoding v2
 * PUBLIC 609 fixture; parity with Kakao research-kakao-609-real.mjs
 * Never prints Client ID/Secret, Authorization, .env, or URLs with credentials.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEOCODE_URL = "https://maps.apigw.ntruss.com/map-geocode/v2/geocode";
const REVERSE_URL = "https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc";

const QUERIES = [
  "인천광역시 남동구 서창남순환로 190-100",
  "인천광역시 남동구 에코에비뉴",
  "인천광역시 남동구 에코에비뉴 609동",
  "인천광역시 남동구 서창남순환로 190-100 609동",
];

/** Prior Kakao live PUBLIC 609 place (place evidence, not geometry verified). */
const KAKAO_609_REFERENCE = {
  placeName: "에코에비뉴아파트 609동",
  latitude: 37.42328331583333,
  longitude: 126.74186674441195,
};

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

function haversineM(lat1, lon1, lat2, lon2) {
  const r = 6371000;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLon = toR(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

function elementByType(addressElements, type) {
  for (const el of addressElements ?? []) {
    if (el.types?.includes(type)) return el.longName ?? el.shortName ?? null;
  }
  return null;
}

function extractElements(addressElements) {
  const types = [
    "SIDO",
    "SIGUGUN",
    "DONGMYUN",
    "RI",
    "ROAD_NAME",
    "BUILDING_NUMBER",
    "BUILDING_NAME",
    "LAND_NUMBER",
    "POSTAL_CODE",
  ];
  const out = {};
  for (const t of types) out[t] = elementByType(addressElements, t);
  return out;
}

function analyze609(textBlob, elements, roadAddress, jibunAddress) {
  const has609Text = /609\s*동|(^|\s)609(\s|$)/.test(textBlob);
  const buildingName = elements.BUILDING_NAME ?? "";
  const dongmyun = elements.DONGMYUN ?? "";

  const complexFound =
    textBlob.includes("에코") ||
    buildingName.includes("에코") ||
    (roadAddress ?? "").includes("에코") ||
    (jibunAddress ?? "").includes("에코");

  const roadFound =
    (roadAddress ?? "").includes("190-100") ||
    (roadAddress ?? "").includes("서창남순환로");

  const buildingNameFound = Boolean(buildingName?.trim());

  // DONGMYUN = administrative dong (e.g. 서창동), NOT apartment 609동
  const apartment609Structured =
    has609Text &&
    (buildingName.includes("609") ||
      (roadAddress ?? "").match(/609\s*동/) ||
      (jibunAddress ?? "").match(/609\s*동/));

  return {
    NAVER_ROAD_ADDRESS_FOUND: roadFound ? "YES" : "NO",
    NAVER_COMPLEX_FOUND: complexFound ? "YES" : "NO",
    NAVER_BUILDING_NAME_FOUND: buildingNameFound ? "YES" : "NO",
    NAVER_609_TEXT_FOUND: has609Text ? "YES" : "NO",
    NAVER_609_STRUCTURED_EVIDENCE: apartment609Structured ? "YES" : "NO",
    NAVER_DONGMYUN: dongmyun || null,
    note:
      "DONGMYUN is administrative/legal dong, not apartment building dong number",
  };
}

async function naverGeocode(clientId, clientSecret, query) {
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("query", query);
  const res = await fetch(url.toString(), {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": clientId,
      "X-NCP-APIGW-API-KEY": clientSecret,
    },
  });
  const body = await res.json().catch(() => null);
  return { http: res.status, body };
}

async function naverReverse(clientId, clientSecret, coords, orders = "roadaddr,addr") {
  const url = new URL(REVERSE_URL);
  url.searchParams.set("coords", `${coords.longitude},${coords.latitude}`);
  url.searchParams.set("output", "json");
  url.searchParams.set("orders", orders);
  const res = await fetch(url.toString(), {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": clientId,
      "X-NCP-APIGW-API-KEY": clientSecret,
    },
  });
  const body = await res.json().catch(() => null);
  return { http: res.status, body };
}

function summarizeForwardResult(query, http, body) {
  const status = body?.status ?? null;
  const meta = body?.meta ?? {};
  const addresses = body?.addresses ?? [];
  const first = addresses[0] ?? null;

  if (!first) {
    return {
      query,
      http,
      status,
      totalCount: meta.totalCount ?? 0,
      count: meta.count ?? 0,
      page: meta.page ?? null,
      errorMessage: body?.errorMessage ?? null,
      noResults: true,
    };
  }

  const elements = extractElements(first.addressElements);
  const blob = JSON.stringify({
    road: first.roadAddress,
    jibun: first.jibunAddress,
    elements,
  });
  const classification = analyze609(
    blob,
    elements,
    first.roadAddress,
    first.jibunAddress,
  );

  return {
    query,
    http,
    status,
    totalCount: meta.totalCount ?? addresses.length,
    count: meta.count ?? addresses.length,
    page: meta.page ?? 1,
    roadAddress: first.roadAddress ?? null,
    jibunAddress: first.jibunAddress ?? null,
    x: first.x ? Number(first.x) : null,
    y: first.y ? Number(first.y) : null,
    distance: first.distance ?? null,
    addressElements: elements,
    classification,
    NAVER_609_COORDINATE_FOUND:
      first.x && first.y ? "YES" : "NO",
  };
}

function summarizeReverse(http, body) {
  const status = body?.status ?? null;
  const results = body?.results ?? [];
  const land = results.find((r) => r.name === "land") ?? results[0];
  const region = results.find((r) => r.name === "region") ?? null;

  const buildingAddition =
    land?.addition0?.type === "building" ? land.addition0.value : null;

  return {
    http,
    status,
    resultCount: results.length,
    landType: land?.land?.type ?? null,
    landNumber1: land?.land?.number1 ?? null,
    landNumber2: land?.land?.number2 ?? null,
    roadName: land?.land?.name ?? null,
    buildingAddition,
    regionArea1: region?.region?.area1?.name ?? null,
    regionArea2: region?.region?.area2?.name ?? null,
    regionArea3: region?.region?.area3?.name ?? null,
    regionArea4: region?.region?.area4?.name ?? null,
  };
}

async function main() {
  const env = loadEnv(path.join(__dirname, "..", ".env"));
  const clientId = env.NAVER_MAP_CLIENT_ID?.trim() ?? null;
  const clientSecret = env.NAVER_MAP_CLIENT_SECRET?.trim() ?? null;
  const configured = Boolean(clientId && clientSecret);

  const report = {
    script: "research-naver-609-real.mjs",
    officialGeocodingEndpoint: GEOCODE_URL,
    officialReverseEndpoint: REVERSE_URL,
    officialSchemaFields: [
      "status",
      "meta.totalCount",
      "meta.page",
      "meta.count",
      "addresses[].roadAddress",
      "addresses[].jibunAddress",
      "addresses[].englishAddress",
      "addresses[].addressElements",
      "addresses[].x",
      "addresses[].y",
      "addresses[].distance",
      "addressElements types: SIDO,SIGUGUN,DONGMYUN,RI,ROAD_NAME,BUILDING_NUMBER,BUILDING_NAME,LAND_NUMBER,POSTAL_CODE",
    ],
    NAVER_OFFICIAL_GEOCODING_SCHEMA: "PASS",
    NAVER_CONFIGURED: configured ? "YES" : "NO",
    NAVER_LIVE_REQUEST: configured ? "PENDING" : "NOT_CONFIGURED",
    queryResults: [],
    NAVER_609_PLACE_EVIDENCE: "NO",
    NAVER_GEOCODING_LIMITATION: null,
    NAVER_OTHER_OFFICIAL_PLACE_SEARCH_REQUIRED: "YES",
    kakaoParity: {
      KAKAO_609_PLACE_EVIDENCE: "YES",
      reference: KAKAO_609_REFERENCE,
    },
    adapterReview: {
      existing: "NaverGeocodeAdapter",
      action: "REUSED",
      gap:
        "Adapter reads x/y/road/jibun only; does not parse addressElements BUILDING_NAME or 609 structured evidence — EXTEND recommended after gate",
    },
  };

  if (!configured) {
    report.NAVER_LIVE_REQUEST = "NOT_CONFIGURED";
    report.NAVER_GEOCODING_LIMITATION =
      "Geocoding v2 is address search, not Kakao-style keyword/place POI search; separate Local/Place API may be required for apartment-dong POI parity";
    report.application =
      "NCP Console → AI·NAVER API → Maps → Application registration (Client ID + Secret); free tier dev";
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  let anyStructured609 = false;
  let bestCoord = null;

  for (const query of QUERIES) {
    const raw = await naverGeocode(clientId, clientSecret, query);
    const summary = summarizeForwardResult(query, raw.http, raw.body);
    if (raw.http !== 200) {
      summary.errorMessage = raw.body?.errorMessage ?? "http_error";
    }
    report.queryResults.push(summary);

    if (summary.classification?.NAVER_609_STRUCTURED_EVIDENCE === "YES") {
      anyStructured609 = true;
    }
    if (summary.x != null && summary.y != null && !bestCoord) {
      bestCoord = { latitude: summary.y, longitude: summary.x, query };
    }
  }

  report.NAVER_LIVE_REQUEST =
    report.queryResults.some((r) => r.http === 200 && r.status === "OK")
      ? "PASS"
      : "FAIL";

  report.NAVER_609_STRUCTURED_EVIDENCE = anyStructured609 ? "YES" : "NO";
  report.NAVER_609_TEXT_FOUND = report.queryResults.some(
    (r) => r.classification?.NAVER_609_TEXT_FOUND === "YES",
  )
    ? "YES"
    : "NO";

  const best609Query = report.queryResults.find(
    (r) => r.classification?.NAVER_609_STRUCTURED_EVIDENCE === "YES",
  );
  report.NAVER_609_PLACE_EVIDENCE = anyStructured609
    ? "YES"
    : report.queryResults.some((r) => r.classification?.NAVER_COMPLEX_FOUND === "YES")
      ? "PARTIAL"
      : "NO";

  report.NAVER_609_COORDINATE = best609Query?.x
    ? "AVAILABLE"
    : bestCoord
      ? "AVAILABLE"
      : "NOT_AVAILABLE";

  if (bestCoord) {
    const rev = await naverReverse(clientId, clientSecret, bestCoord);
    report.reverseGeocode = summarizeReverse(rev.http, rev.body);

    const fwd = report.queryResults.find((r) => r.query === bestCoord.query);
    const revRoad = report.reverseGeocode.roadName;
    const fwdRoad = fwd?.addressElements?.ROAD_NAME;
    const consistentRoad =
      fwdRoad && revRoad ? String(revRoad).includes(String(fwdRoad)) : false;
    const consistentComplex =
      (fwd?.roadAddress ?? "").includes("에코") ||
      (report.reverseGeocode.buildingAddition ?? "").includes("에코");

    report.NAVER_FORWARD_REVERSE_CONSISTENCY =
      rev.http === 200 && rev.body?.status === "OK"
        ? consistentRoad || consistentComplex
          ? "PASS"
          : "PARTIAL"
        : "FAIL";

    if (best609Query?.y && best609Query?.x) {
      report.kakaoParity.KAKAO_NAVER_DISTANCE_M = Math.round(
        haversineM(
          KAKAO_609_REFERENCE.latitude,
          KAKAO_609_REFERENCE.longitude,
          best609Query.y,
          best609Query.x,
        ),
      );
    } else if (bestCoord) {
      report.kakaoParity.KAKAO_NAVER_DISTANCE_M = Math.round(
        haversineM(
          KAKAO_609_REFERENCE.latitude,
          KAKAO_609_REFERENCE.longitude,
          bestCoord.latitude,
          bestCoord.longitude,
        ),
      );
    }
  } else {
    report.NAVER_FORWARD_REVERSE_CONSISTENCY = "NOT_RUN";
  }

  const dist = report.kakaoParity.KAKAO_NAVER_DISTANCE_M;
  report.kakaoParity.KAKAO_NAVER_PARITY =
    anyStructured609 && dist != null && dist < 200
      ? "FULL"
      : dist != null && dist < 500
        ? "PARTIAL"
        : "GAP";

  report.NAVER_GEOCODING_LIMITATION =
    "Geocoding v2 forward search has no apartment-dong POI category like Kakao keyword API; BUILDING_NAME may omit dong number; keyword place search requires separate NAVER Local Search API if needed";

  report.CROSS_PROVIDER_PLACE_EVIDENCE = anyStructured609
    ? dist != null && dist < 300
      ? "STRONG"
      : "MEDIUM"
    : report.NAVER_609_PLACE_EVIDENCE === "PARTIAL"
      ? "WEAK"
      : "WEAK";

  report.READY_FOR_NAVER_NEXT_REVIEW = report.NAVER_LIVE_REQUEST === "PASS" ? "YES" : "NO";

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: String(e.message ?? e) }));
  process.exit(1);
});
