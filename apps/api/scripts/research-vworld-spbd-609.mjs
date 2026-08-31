/**
 * VWorld WFS lt_c_spbd — official schema + PUBLIC 609동 probe.
 * Never prints API keys, serviceKey, or .env contents.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "build", "research");
const WFS_BASE = "https://api.vworld.kr/req/wfs";

const FIXTURE = {
  roadAddress: "인천광역시 남동구 서창남순환로 190-100",
  complexName: "에코에비뉴",
  dong: "609",
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

function pick(env, keys) {
  for (const k of keys) if (env[k]?.trim()) return env[k].trim();
  return null;
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
    return { longitude: x, latitude: y, method: "FIRST_VERTEX_FALLBACK" };
  }
  a *= 0.5;
  return { longitude: cx / (6 * a), latitude: cy / (6 * a), method: "CENTROID" };
}

function summarizeProps(p) {
  const safe = {};
  for (const [k, v] of Object.entries(p ?? {})) {
    if (v == null || v === "") continue;
    safe[k] = typeof v === "string" ? v.slice(0, 80) : v;
  }
  return safe;
}

function match609Structured(props) {
  const blob = JSON.stringify(props ?? {});
  const dongFields = [
    props?.buld_nm_dc,
    props?.buld_nm,
    props?.pos_bul_nm,
    props?.BULD_NM_DC,
    props?.BULD_NM,
  ]
    .filter(Boolean)
    .map(String);

  const dongAttrMatch = dongFields.some((v) =>
    /(^|\s)609(\s*동|$)/.test(v.trim()),
  );
  const roadMatch =
    String(props?.rd_nm ?? props?.RD_NM ?? "").includes("서창남순환로") &&
    (String(props?.bld_s ?? props?.BULD_MNNM ?? "") === "190" ||
      String(props?.bld_e ?? props?.BULD_SLNO ?? "") === "100" ||
      blob.includes("190") && blob.includes("100"));

  const complexMatch = dongFields.some((v) => v.includes("에코")) ||
    String(props?.buld_nm ?? props?.BULD_NM ?? "").includes("에코");

  return {
    dongAttrMatch,
    roadMatch,
    complexMatch,
    deterministic609: dongAttrMatch && (complexMatch || roadMatch),
    dongFields,
  };
}

async function wfsRequest(params, key, domain) {
  const url = new URL(WFS_BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", key);
  url.searchParams.set("domain", domain);
  const res = await fetch(url.toString());
  const text = await res.text();
  return { http: res.status, text, contentType: res.headers.get("content-type") };
}

async function kakaoSeed(restKey, query) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  url.searchParams.set("query", query);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${restKey}` },
  });
  const body = await res.json().catch(() => null);
  const doc = body?.documents?.[0];
  if (!doc?.x || !doc?.y) return { ok: false };
  return {
    ok: true,
    latitude: Number(doc.y),
    longitude: Number(doc.x),
    buildingName: doc.road_address?.building_name ?? null,
  };
}

async function kakaoKeyword(restKey, query, x, y) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", query);
  url.searchParams.set("x", String(x));
  url.searchParams.set("y", String(y));
  url.searchParams.set("radius", "800");
  url.searchParams.set("size", "10");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${restKey}` },
  });
  const body = await res.json().catch(() => null);
  const doc = body?.documents?.find(
    (d) =>
      String(d.category_name ?? "").includes("아파트 동") &&
      String(d.place_name ?? "").includes("609동"),
  );
  if (!doc?.x || !doc?.y) return null;
  return { latitude: Number(doc.y), longitude: Number(doc.x), placeName: doc.place_name };
}

async function naverGeocode(clientId, clientSecret, query) {
  const url = new URL(
    "https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode",
  );
  url.searchParams.set("query", query);
  const res = await fetch(url.toString(), {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": clientId,
      "X-NCP-APIGW-API-KEY": clientSecret,
    },
  });
  const body = await res.json().catch(() => null);
  const a = body?.addresses?.[0];
  if (!a?.x || !a?.y) return null;
  return { latitude: Number(a.y), longitude: Number(a.x) };
}

function parseDescribeFeatureType(xml) {
  const fields = [];
  const elRe =
    /<xsd:element[^>]*name="([^"]+)"[^>]*(?:type="([^"]+)")?[^>]*\/?>/g;
  let m;
  while ((m = elRe.exec(xml))) {
    fields.push({ name: m[1], type: m[2] ?? null });
  }
  const targetNs =
    xml.match(/targetNamespace="([^"]+)"/)?.[1] ??
    xml.match(/xmlns:([^=]+)="([^"]+)"/)?.[2] ??
    null;
  return { fields, targetNamespace: targetNs };
}

function extractTypenamesFromCapabilities(xml) {
  const names = [];
  const re = /<Name>([^<]+)<\/Name>/g;
  let m;
  while ((m = re.exec(xml))) if (!names.includes(m[1])) names.push(m[1]);
  return names;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const env = loadEnv(path.join(__dirname, "..", ".env"));
  const vworldKey = pick(env, ["VWORLD_API_KEY", "VWORLD_KEY", "VWORLD_DEV_KEY"]);
  const domain = pick(env, ["VWORLD_DOMAIN", "VWORLD_SERVICE_DOMAIN"]) || "localhost";
  const kakaoKey = pick(env, ["KAKAO_REST_API_KEY"]);
  const naverId = pick(env, ["NAVER_MAP_CLIENT_ID"]);
  const naverSecret = pick(env, ["NAVER_MAP_CLIENT_SECRET"]);
  const bldKey = pick(env, [
    "DATA_GO_KR_SERVICE_KEY",
    "PUBLIC_DATA_SERVICE_KEY",
    "BUILDING_REGISTER_SERVICE_KEY",
  ]);

  const report = {
    vworldKey: vworldKey ? "CONFIGURED" : "NOT_CONFIGURED",
    getCapabilitiesVerified: "NO",
    describeFeatureType: "FAIL",
    vworldTypename: null,
    geometryField: "ag_geom (per VWorld WFS column guide — verify in DescribeFeatureType)",
    crs: "EPSG:4326 for bbox queries; native may vary",
    fieldSchema: [],
    bd_mgt_sn_exists: "UNKNOWN",
    buld_mnnm_exists: "UNKNOWN",
    featureQuery: null,
    featureCount: 0,
    candidate609: [],
    kakaoComparison: null,
    naverComparison: null,
    buildingHubJoin: "NO",
    joinKey: [],
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
  if (caps.http === 200 && caps.text.includes("WFS_Capabilities")) {
    report.getCapabilitiesVerified = "YES";
    const types = extractTypenamesFromCapabilities(caps.text);
    report.spbdInCapabilities = types.includes("lt_c_spbd") ? "YES" : "NO";
    report.vworldTypename = types.includes("lt_c_spbd") ? "lt_c_spbd" : null;
  } else {
    report.error = "GetCapabilities failed — verify key/domain registration";
    report.http = caps.http;
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const dft = await wfsRequest(
    {
      service: "WFS",
      request: "DescribeFeatureType",
      version: "1.1.0",
      typename: "lt_c_spbd",
    },
    vworldKey,
    domain,
  );
  if (dft.http === 200 && dft.text.includes("schema")) {
    report.describeFeatureType = "PASS";
    const parsed = parseDescribeFeatureType(dft.text);
    report.targetNamespace = parsed.targetNamespace;
    report.rawFieldCount = parsed.fields.length;

    const officialMeanings = {
      bd_mgt_sn: {
        meaning:
          "건물관리번호(25자리). 공식: 법정동코드10+산여부1+지번본번4+지번부번4+시스템일련번호6 (도로명주소 건물DB, juso.go.kr)",
        joinCandidate: "PNU-parcel + building serial; NOT mgmBldrgstPk",
      },
      buld_mnnm: {
        meaning: "건물본번 — 도로명주소 체계의 건물 본번 (NOT 공동주택 동번호)",
        joinCandidate: "road address match with RN_CD + BULD_MNNM/BULD_SLNO",
      },
      buld_slno: {
        meaning: "건물부번 — 도로명주소 체계의 건물 부번",
        joinCandidate: "road address match",
      },
      buld_nm: {
        meaning: "건축물대장 건물명",
        joinCandidate: "weak — requires structured dong field, not fuzzy alone",
      },
      buld_nm_dc: {
        meaning: "상세건물명(동 등 부가 명칭)",
        joinCandidate: "dong resolution if contains structured 609동",
      },
      pnu: { meaning: "필지고유번호(19자리)", joinCandidate: "parcel-level join to register query keys" },
      sig_cd: { meaning: "시군구코드(5)", joinCandidate: "sigunguCd" },
      emd_cd: { meaning: "읍면동코드", joinCandidate: "partial bjdong" },
      lnbr_mnnm: { meaning: "지번본번", joinCandidate: "bun" },
      lnbr_slno: { meaning: "지번부번", joinCandidate: "ji" },
      bul_man_no: { meaning: "건물일련번호(7)+시군구=12자리 건물식별", joinCandidate: "VWorld internal building id" },
    };

    for (const f of parsed.fields) {
      const lower = f.name.toLowerCase();
      const meta = officialMeanings[lower];
      report.fieldSchema.push({
        FIELD_NAME: f.name,
        OFFICIAL_MEANING: meta?.meaning ?? "See VWorld lt_c_spbd column definition download",
        TYPE: f.type,
        EXAMPLE_SAFE_VALUE: null,
        JOIN_CANDIDATE: meta?.joinCandidate ?? "TBD",
      });
    }

    report.bd_mgt_sn_exists = parsed.fields.some((f) =>
      f.name.toLowerCase().includes("bd_mgt_sn"),
    )
      ? "YES"
      : "NO";
    report.buld_mnnm_exists = parsed.fields.some((f) =>
      f.name.toLowerCase().includes("buld_mnnm"),
    )
      ? "YES"
      : "NO";
  }

  report.bd_mgt_sn_official_meaning =
    "25-digit building management number (juso BD_MGT_SN); separate from mgmBldrgstPk";
  report.bd_mgt_sn_relation_to_mgm_bldrgst_pk = "UNRELATED";
  report.buld_mnnm_official_meaning =
    "Road-name building main number (도로명 건물본번), NOT apartment dong number";
  report.buld_mnnm_is_dong_number = "NO";

  let seed = { latitude: 37.42436, longitude: 126.74074 };
  if (kakaoKey) {
    const g = await kakaoSeed(kakaoKey, FIXTURE.roadAddress);
    if (g.ok) seed = { latitude: g.latitude, longitude: g.longitude };
    report.kakaoSeed = { ok: g.ok, buildingNameHint: g.buildingName ?? null };
  }

  const d = 0.003;
  const bbox = `${seed.latitude - d},${seed.longitude - d},${seed.latitude + d},${seed.longitude + d},EPSG:4326`;
  const gf = await wfsRequest(
    {
      service: "WFS",
      request: "GetFeature",
      version: "1.1.0",
      typename: "lt_c_spbd",
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
      const json = JSON.parse(gf.text);
      features = json.features ?? [];
      report.featureQuery = { ok: true, featureCount: features.length };
      report.featureCount = features.length;
      report.geometryTypes = [
        ...new Set(features.map((f) => f.geometry?.type).filter(Boolean)),
      ];
    } catch {
      report.featureQuery = { ok: false, parseError: true, snippet: gf.text.slice(0, 200) };
    }
  } else {
    report.featureQuery = { ok: false, http: gf.http, snippet: gf.text.slice(0, 200) };
  }

  const candidates = [];
  for (const f of features) {
    const props = f.properties ?? {};
    const m = match609Structured(props);
    const geom = f.geometry;
    let center = null;
    if (geom?.type === "Polygon") center = polygonCentroid(geom.coordinates);
    if (geom?.type === "MultiPolygon" && geom.coordinates?.[0])
      center = polygonCentroid(geom.coordinates[0]);

    const entry = {
      id: f.id ?? null,
      geometryType: geom?.type ?? null,
      hasBdMgtSn: Boolean(props.bd_mgt_sn ?? props.BD_MGT_SN),
      match: m,
      center,
      props: summarizeProps(props),
    };
    if (m.dongAttrMatch || m.roadMatch || m.complexMatch) candidates.push(entry);
  }

  report.candidate609 = candidates;
  report["609_feature_candidates"] = candidates.length;
  report["609_structured_attribute_match"] = candidates.some((c) => c.match.deterministic609)
    ? "YES"
    : "NO";
  report["609_building_identity_verified"] = candidates.some((c) => c.match.deterministic609)
    ? "YES"
    : "NO";
  report["609_polygon_found"] = candidates.some(
    (c) => c.geometryType === "Polygon" || c.geometryType === "MultiPolygon",
  )
    ? "YES"
    : "NO";
  report["609_geometry_verified"] =
    report["609_building_identity_verified"] === "YES" &&
    report["609_polygon_found"] === "YES"
      ? "YES"
      : "NO";

  const verified = candidates.find((c) => c.match.deterministic609 && c.center);
  report["609_building_center_method"] = verified?.center
    ? verified.center.method
    : "NOT_AVAILABLE";
  if (verified?.center) {
    report["609_building_center"] = {
      latitude: verified.center.latitude,
      longitude: verified.center.longitude,
    };
  }

  report.dong_specific_attribute = [
    "buld_nm_dc (상세건물명/동)",
    "pos_bul_nm",
    "buld_nm (complex name only, not dong alone)",
  ];

  report.joinKey = [
    "PRIMARY: bd_mgt_sn ↔ road-building DB (NOT mgmBldrgstPk)",
    "SECONDARY: sig_cd + emd_cd + lnbr_mnnm + lnbr_slno ↔ sigunguCd/bjdongCd/bun/ji (parcel)",
    "SECONDARY: rn_cd + buld_mnnm + buld_slno ↔ road address 190-100",
    "DONG: buld_nm_dc structured match ↔ register dongNm (INDIRECT, not deterministic PK join)",
  ];
  report.buildingHubJoin = bldKey ? "PARTIAL" : "NO";

  if (kakaoKey && verified?.center) {
    const kw = await kakaoKeyword(
      kakaoKey,
      `${FIXTURE.complexName} ${FIXTURE.dong}동`,
      seed.longitude,
      seed.latitude,
    );
    if (kw) {
      report.kakaoComparison = {
        keyword609: kw.placeName,
        distanceMeters: Math.round(
          haversineM(kw.latitude, kw.longitude, verified.center.latitude, verified.center.longitude),
        ),
      };
    }
    report.kakaoComparison ??= {
      roadGeocodeDistanceMeters: Math.round(
        haversineM(seed.latitude, seed.longitude, verified.center.latitude, verified.center.longitude),
      ),
    };
  }

  if (naverId && naverSecret && verified?.center) {
    const nv = await naverGeocode(naverId, naverSecret, FIXTURE.roadAddress);
    if (nv) {
      report.naverComparison = {
        distanceMeters: Math.round(
          haversineM(nv.latitude, nv.longitude, verified.center.latitude, verified.center.longitude),
        ),
      };
    }
  }

  report.readyForBuildingGeometryResolver =
    report["609_geometry_verified"] === "YES" ? "YES" : "NO";

  fs.writeFileSync(
    path.join(OUT_DIR, "vworld-spbd-609.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: String(e.message ?? e) }));
  process.exit(1);
});
