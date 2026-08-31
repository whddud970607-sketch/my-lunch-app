/**
 * DEVELOPMENT / RESEARCH ONLY — VWorld lt_c_spbd schema + PUBLIC 609 probe.
 *
 * - GetCapabilities / DescribeFeatureType / GetFeature (lt_c_spbd)
 * - No DB, no production wiring, no Kakao/NAVER calls
 * - Never logs API keys, .env, Authorization, or URLs containing keys
 * - stdout sanitized summary only (no filesystem write)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WFS_BASE = "https://api.vworld.kr/req/wfs";

/** PUBLIC fixture bbox center — road address level reference (no unit/customer PII). */
const PUBLIC_SEED_WGS84 = {
  latitude: 37.4243645028928,
  longitude: 126.740740734492,
  note: "인천 남동구 서창남순환로 190-100 road-level reference",
};

const BBOX_DELTA = 0.003;

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

function envPresence(env) {
  return {
    VWORLD_API_KEY: env.VWORLD_API_KEY?.trim() ? "PRESENT" : "ABSENT",
    VWORLD_KEY: env.VWORLD_KEY?.trim() ? "PRESENT" : "ABSENT",
    VWORLD_DEV_KEY: env.VWORLD_DEV_KEY?.trim() ? "PRESENT" : "ABSENT",
    VWORLD_DOMAIN: env.VWORLD_DOMAIN?.trim() ? "PRESENT" : "ABSENT",
    KAKAO_REST_API_KEY: "NOT_USED_BY_THIS_SCRIPT",
    NAVER_MAP_CLIENT_ID: "NOT_USED_BY_THIS_SCRIPT",
  };
}

function pickVworldKey(env) {
  for (const k of ["VWORLD_API_KEY", "VWORLD_KEY", "VWORLD_DEV_KEY"]) {
    if (env[k]?.trim()) return env[k].trim();
  }
  return null;
}

function sanitizedWfsEndpoint(params) {
  return `${WFS_BASE}?service=${params.service ?? "WFS"}&request=${params.request}&version=${params.version ?? "1.1.0"}&typename=${params.typename ?? ""}&key=REDACTED&domain=REDACTED`;
}

async function wfsRequest(params, key, domain) {
  const url = new URL(WFS_BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", key);
  url.searchParams.set("domain", domain);
  const res = await fetch(url.toString());
  const text = await res.text();
  return {
    http: res.status,
    text,
    sanitizedRequest: sanitizedWfsEndpoint({ ...params, domain: "REDACTED" }),
  };
}

function extractTypenames(xml) {
  const names = [];
  const re = /<Name>([^<]+)<\/Name>/g;
  let m;
  while ((m = re.exec(xml))) if (!names.includes(m[1])) names.push(m[1]);
  return names;
}

function parseDescribeFeatureType(xml) {
  const fields = [];
  const re = /<xsd:element[^>]*name="([^"]+)"[^>]*(?:type="([^"]+)")?[^>]*\/?>/g;
  let m;
  while ((m = re.exec(xml))) fields.push({ name: m[1], type: m[2] ?? null });
  return {
    targetNamespace: xml.match(/targetNamespace="([^"]+)"/)?.[1] ?? null,
    fields,
  };
}

const OFFICIAL_FIELD_MEANINGS = {
  bd_mgt_sn: {
    meaning:
      "건물관리번호(25). juso.go.kr 공식: 법정동10+산1+지번본4+지번부4+시스템일련6",
    join: "INDIRECTLY_MAPPABLE to parcel; UNRELATED to mgmBldrgstPk",
  },
  buld_mnnm: {
    meaning: "도로명주소 건물본번 (NOT 공동주택 동번호)",
    join: "road address composite with rn_cd + buld_slno",
  },
  buld_slno: { meaning: "도로명주소 건물부번", join: "road address" },
  buld_nm: { meaning: "건축물대장 건물명", join: "weak identity hint" },
  buld_nm_dc: { meaning: "상세건물명(동 등)", join: "dong if structured e.g. 609동" },
  bul_man_no: { meaning: "건물일련번호(시군구+7)", join: "VWorld building id" },
  pnu: { meaning: "필지고유번호(19)", join: "parcel ↔ register bun/ji" },
  sig_cd: { meaning: "시군구코드", join: "sigunguCd" },
  emd_cd: { meaning: "읍면동코드", join: "partial bjdongCd" },
  lnbr_mnnm: { meaning: "지번본번", join: "bun" },
  lnbr_slno: { meaning: "지번부번", join: "ji" },
  rd_nm: { meaning: "도로명", join: "road name match" },
  rn_cd: { meaning: "도로명코드", join: "road id" },
};

function summarizeProps(props) {
  const out = {};
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === "") continue;
    out[k] = typeof v === "string" ? v.slice(0, 80) : v;
  }
  return out;
}

function match609Deterministic(props) {
  const dongFields = [
    props?.buld_nm_dc,
    props?.buld_nm,
    props?.pos_bul_nm,
    props?.BULD_NM_DC,
    props?.BULD_NM,
  ]
    .filter(Boolean)
    .map(String);

  const dongAttrMatch = dongFields.some((v) => /(^|\s)609(\s*동|$)/.test(v.trim()));
  const complexMatch =
    dongFields.some((v) => v.includes("에코")) ||
    String(props?.buld_nm ?? props?.BULD_NM ?? "").includes("에코");

  const roadMain = String(props?.buld_mnnm ?? props?.BULD_MNNM ?? props?.bld_s ?? "");
  const roadSub = String(props?.buld_slno ?? props?.BULD_SLNO ?? props?.bld_e ?? "");
  const roadMatch =
    String(props?.rd_nm ?? props?.RD_NM ?? "").includes("서창남순환로") &&
    roadMain === "190" &&
    roadSub === "100";

  return {
    dongAttrMatch,
    complexMatch,
    roadMatch,
    deterministic609: dongAttrMatch && (complexMatch || roadMatch),
    dongFields,
  };
}

function polygonCentroid(coords) {
  const ring = coords?.[0];
  if (!ring?.length) return null;
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-12) {
    const [x, y] = ring[0];
    return { latitude: y, longitude: x, method: "FIRST_VERTEX_FALLBACK" };
  }
  a *= 0.5;
  return { latitude: cy / (6 * a), longitude: cx / (6 * a), method: "CENTROID" };
}

async function main() {
  const env = loadEnv(path.join(__dirname, "..", ".env"));
  const vworldKey = pickVworldKey(env);
  const domain =
    env.VWORLD_DOMAIN?.trim() || env.VWORLD_SERVICE_DOMAIN?.trim() || "localhost";

  const report = {
    script: "research-vworld-building-609.mjs",
    envPresence: envPresence(env),
    vworldKey: vworldKey ? "CONFIGURED" : "NOT_CONFIGURED",
    wfsEndpoint: WFS_BASE,
    publicSeed: PUBLIC_SEED_WGS84,
    getCapabilities: "NOT_RUN",
    describeFeatureType: "NOT_RUN",
    lt_c_spbd_confirmed: "NO",
    typename: null,
    geometryField: null,
    crs: "EPSG:4326 (bbox query); default srsname per VWorld WFS 1.1.0 guide",
    fieldSchema: [],
    bd_mgt_sn: "NOT_FOUND",
    buld_mnnm: "NOT_FOUND",
    dongRelatedFields: [],
    featureSummary: null,
    candidate609Count: 0,
    feature609Identified: "NO",
    polygon609: "NO",
    buildingCenter609: "NOT_AVAILABLE",
    buildingCenterMethod: "NOT_AVAILABLE",
  };

  if (!vworldKey) {
    report.application = "https://www.vworld.kr/dev/v4dv_apikey2_s001.do";
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const caps = await wfsRequest(
    { service: "WFS", request: "GetCapabilities", version: "1.1.0" },
    vworldKey,
    domain,
  );
  if (caps.http !== 200 || !caps.text.includes("WFS_Capabilities")) {
    report.getCapabilities = "FAIL";
    report.http = caps.http;
    report.sanitizedRequest = caps.sanitizedRequest;
    report.errorSnippet = caps.text.slice(0, 120).replace(/key=[^&]+/gi, "key=REDACTED");
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  report.getCapabilities = "PASS";
  const typenames = extractTypenames(caps.text);
  report.lt_c_spbd_confirmed = typenames.includes("lt_c_spbd") ? "YES" : "NO";
  report.typename = typenames.includes("lt_c_spbd") ? "lt_c_spbd" : null;

  if (!report.typename) {
    report.error = "lt_c_spbd not listed in GetCapabilities";
    report.buildingTypenameCandidates = typenames.filter((t) => /spbd|bldg/i.test(t));
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const dft = await wfsRequest(
    {
      service: "WFS",
      request: "DescribeFeatureType",
      version: "1.1.0",
      typename: report.typename,
    },
    vworldKey,
    domain,
  );

  if (dft.http === 200 && dft.text.includes("schema")) {
    report.describeFeatureType = "PASS";
    const parsed = parseDescribeFeatureType(dft.text);
    report.targetNamespace = parsed.targetNamespace;
    report.geometryField =
      parsed.fields.find((f) => /geom/i.test(f.name))?.name ?? "ag_geom (per VWorld column guide)";

    for (const f of parsed.fields) {
      const meta = OFFICIAL_FIELD_MEANINGS[f.name.toLowerCase()];
      report.fieldSchema.push({
        FIELD_NAME: f.name,
        OFFICIAL_MEANING: meta?.meaning ?? "VWorld lt_c_spbd column definition",
        TYPE: f.type,
        JOIN_CANDIDATE: meta?.join ?? "TBD",
      });
      const lower = f.name.toLowerCase();
      if (/dong|buld_nm|pos_bul|nm_dc/i.test(lower)) report.dongRelatedFields.push(f.name);
    }

    report.bd_mgt_sn = parsed.fields.some((f) => f.name.toLowerCase() === "bd_mgt_sn")
      ? "FOUND"
      : "NOT_FOUND";
    report.buld_mnnm = parsed.fields.some((f) => f.name.toLowerCase() === "buld_mnnm")
      ? "FOUND"
      : "NOT_FOUND";
  } else {
    report.describeFeatureType = "FAIL";
    report.errorSnippet = dft.text.slice(0, 120).replace(/key=[^&]+/gi, "key=REDACTED");
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const lat = PUBLIC_SEED_WGS84.latitude;
  const lng = PUBLIC_SEED_WGS84.longitude;
  const d = BBOX_DELTA;
  const bbox = `${lat - d},${lng - d},${lat + d},${lng + d},EPSG:4326`;

  const gf = await wfsRequest(
    {
      service: "WFS",
      request: "GetFeature",
      version: "1.1.0",
      typename: report.typename,
      srsname: "EPSG:4326",
      bbox,
      maxfeatures: "200",
      output: "application/json",
    },
    vworldKey,
    domain,
  );

  let features = [];
  if (gf.http === 200) {
    try {
      features = JSON.parse(gf.text).features ?? [];
      report.publicQuery = "PASS";
    } catch {
      report.publicQuery = "FAIL";
      report.errorSnippet = gf.text.slice(0, 120).replace(/key=[^&]+/gi, "key=REDACTED");
    }
  } else {
    report.publicQuery = "FAIL";
    report.http = gf.http;
    report.errorSnippet = gf.text.slice(0, 120).replace(/key=[^&]+/gi, "key=REDACTED");
  }

  const geometryTypes = [...new Set(features.map((f) => f.geometry?.type).filter(Boolean))];
  report.featureSummary = {
    featureCount: features.length,
    geometryTypes,
    samplePropertyKeys: features[0]?.properties
      ? Object.keys(features[0].properties).slice(0, 30)
      : [],
  };

  const candidates = [];
  for (const f of features) {
    const props = f.properties ?? {};
    const match = match609Deterministic(props);
    if (!match.dongAttrMatch && !match.complexMatch && !match.roadMatch) continue;

    const geom = f.geometry;
    let center = null;
    if (geom?.type === "Polygon") center = polygonCentroid(geom.coordinates);
    if (geom?.type === "MultiPolygon" && geom.coordinates?.[0])
      center = polygonCentroid(geom.coordinates[0]);

    candidates.push({
      featureId: f.id ?? null,
      geometryType: geom?.type ?? null,
      hasBdMgtSn: Boolean(props.bd_mgt_sn ?? props.BD_MGT_SN),
      hasBuldMnnm: Boolean(props.buld_mnnm ?? props.BULD_MNNM),
      match,
      center: center
        ? { latitude: center.latitude, longitude: center.longitude, method: center.method }
        : null,
      safeAttributes: summarizeProps(props),
    });
  }

  report.candidate609Count = candidates.length;
  report.candidates = candidates.slice(0, 10);
  report.feature609Identified = candidates.some((c) => c.match.deterministic609)
    ? "YES"
    : "NO";
  report.polygon609 = candidates.some(
    (c) =>
      c.match.deterministic609 &&
      (c.geometryType === "Polygon" || c.geometryType === "MultiPolygon"),
  )
    ? "YES"
    : "NO";

  const verified = candidates.find((c) => c.match.deterministic609 && c.center);
  if (verified?.center) {
    report.buildingCenter609 = {
      latitude: verified.center.latitude,
      longitude: verified.center.longitude,
    };
    report.buildingCenterMethod = verified.center.method;
  }

  report.bd_mgt_sn_official_meaning = OFFICIAL_FIELD_MEANINGS.bd_mgt_sn.meaning;
  report.bd_mgt_sn_vs_mgmBldrgstPk = "UNRELATED";
  report.buld_mnnm_official_meaning = OFFICIAL_FIELD_MEANINGS.buld_mnnm.meaning;
  report.buld_mnnm_is_dong_number = "NO";

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: String(e.message ?? e) }));
  process.exit(1);
});
