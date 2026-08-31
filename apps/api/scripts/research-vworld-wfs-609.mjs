/**
 * Research-only: VWorld WFS GetCapabilities + building layer probe.
 * Never prints API keys or .env contents.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "build", "research");
const WFS_BASE = "https://api.vworld.kr/req/wfs";

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

function pickVworldKey(env) {
  for (const k of ["VWORLD_API_KEY", "VWORLD_KEY", "VWORLD_DEV_KEY"]) {
    if (env[k]?.trim()) return env[k].trim();
  }
  return null;
}

function pickDomain(env) {
  return (
    env.VWORLD_DOMAIN?.trim() ||
    env.VWORLD_SERVICE_DOMAIN?.trim() ||
    "localhost"
  );
}

function extractFeatureTypes(xml) {
  const names = [];
  const re = /<Name>([^<]+)<\/Name>/g;
  let m;
  while ((m = re.exec(xml))) {
    if (!names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

function buildingLayerCandidates(featureTypes) {
  const keywords = ["spbd", "bldg", "building", "bd", "addr"];
  return featureTypes.filter((n) =>
    keywords.some((k) => n.toLowerCase().includes(k)),
  );
}

async function wfsGetCapabilities(key, domain) {
  const url = new URL(WFS_BASE);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("request", "GetCapabilities");
  url.searchParams.set("version", "1.1.0");
  url.searchParams.set("key", key);
  url.searchParams.set("domain", domain);
  const res = await fetch(url.toString());
  const text = await res.text();
  return { http: res.status, text, ok: res.status === 200 && text.includes("WFS_Capabilities") };
}

async function wfsGetFeature(key, domain, typename, bbox4326, maxFeatures = 50) {
  const [ymin, xmin, ymax, xmax] = bbox4326;
  const url = new URL(WFS_BASE);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("version", "1.1.0");
  url.searchParams.set("key", key);
  url.searchParams.set("domain", domain);
  url.searchParams.set("typename", typename);
  url.searchParams.set("srsname", "EPSG:4326");
  url.searchParams.set("bbox", `${ymin},${xmin},${ymax},${xmax},EPSG:4326`);
  url.searchParams.set("maxfeatures", String(maxFeatures));
  url.searchParams.set("output", "application/json");
  const res = await fetch(url.toString());
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return { http: res.status, ok: true, json, featureCount: json.features?.length ?? 0 };
  } catch {
    return { http: res.status, ok: false, snippet: text.slice(0, 300), featureCount: 0 };
  }
}

function summarizeFeatureProps(feature) {
  const p = feature.properties ?? {};
  const keys = Object.keys(p);
  const dongHints = keys.filter((k) => /dong|bd|bld|name|addr|mgt|pk|id/i.test(k));
  const sample = {};
  for (const k of dongHints.slice(0, 20)) {
    sample[k] = p[k];
  }
  const geom = feature.geometry;
  return {
    id: feature.id ?? null,
    geometryType: geom?.type ?? null,
    propertyKeys: keys.slice(0, 40),
    dongRelatedSample: sample,
  };
}

function match609Features(features, complexName) {
  return features.filter((f) => {
    const p = f.properties ?? {};
    const blob = JSON.stringify(p);
    const dongOk = /609\s*동|"609"|'609'|609동/.test(blob);
    const complexOk = blob.includes(complexName) || blob.includes("190-100");
    return dongOk && complexOk;
  });
}

// Approximate PUBLIC seed from road-level geocode literature; refined after Kakao seed in paired script.
const SEED_WGS84 = { latitude: 37.42436, longitude: 126.74074 };
const DELTA = 0.004;

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const env = loadEnv(path.join(__dirname, "..", ".env"));
  const key = pickVworldKey(env);
  const domain = pickDomain(env);

  const report = {
    wfsEndpoint: WFS_BASE,
    apiConfigured: Boolean(key),
    getCapabilitiesVerified: "NO",
    officialBuildingTypenames: [],
    buildingLayerCandidates: [],
    crsNotes: "Official VWorld WFS 1.1.0; EPSG:4326 bbox order ymin,xmin,ymax,xmax per guide",
    dongAttributeAvailable: "UNKNOWN",
    buildingIdentifierAvailable: "UNKNOWN",
    registerJoinKey: [],
    featureProbe: [],
    candidate609: [],
    polygonVerified609: "NO",
    buildingCenter609: "NOT_AVAILABLE",
  };

  if (!key) {
    report.requiredEnv = "VWORLD_API_KEY (+ VWORLD_DOMAIN, default localhost)";
    report.application = "https://www.vworld.kr/dev/v4dv_apikey2_s001.do — free dev key";
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const caps = await wfsGetCapabilities(key, domain);
  if (!caps.ok) {
    report.getCapabilitiesVerified = "NO";
    report.error = "GetCapabilities failed — check key/domain registration";
    report.http = caps.http;
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  report.getCapabilitiesVerified = "YES";
  const allTypes = extractFeatureTypes(caps.text);
  report.totalFeatureTypes = allTypes.length;
  const buildingTypes = buildingLayerCandidates(allTypes);
  report.buildingLayerCandidates = buildingTypes;

  const officialDocBuilding = ["lt_c_spbd", "lt_c_bldginfo"].filter((t) =>
    allTypes.includes(t),
  );
  report.officialBuildingTypenames = officialDocBuilding;

  const bbox = [
    SEED_WGS84.latitude - DELTA,
    SEED_WGS84.longitude - DELTA,
    SEED_WGS84.latitude + DELTA,
    SEED_WGS84.longitude + DELTA,
  ];

  for (const typename of officialDocBuilding) {
    const probe = await wfsGetFeature(key, domain, typename, bbox, 100);
    const features = probe.json?.features ?? [];
    report.featureProbe.push({
      typename,
      http: probe.http,
      featureCount: probe.featureCount,
      geometryTypes: [...new Set(features.map((f) => f.geometry?.type).filter(Boolean))],
      sampleSummaries: features.slice(0, 3).map(summarizeFeatureProps),
    });

    const matched = match609Features(features, "에코에비뉴");
    if (matched.length) {
      report.candidate609.push({
        typename,
        count: matched.length,
        summaries: matched.slice(0, 5).map(summarizeFeatureProps),
      });
    }

    if (features.length) {
      const keys = new Set();
      for (const f of features) {
        Object.keys(f.properties ?? {}).forEach((k) => keys.add(k));
      }
      const keyList = [...keys];
      if (/dong|bd_nm|bld_nm|bd_mgt|buld|mgm|pk|reg/i.test(keyList.join(","))) {
        report.dongAttributeAvailable = keyList.some((k) => /dong|bd_nm|bld_nm/i.test(k))
          ? "YES"
          : "PARTIAL";
        report.buildingIdentifierAvailable = keyList.some((k) =>
          /mgt|pk|id|sn|reg|pnu|bd_mgt/i.test(k),
        )
          ? "YES"
          : "PARTIAL";
      }
      report.registerJoinKey = keyList.filter((k) =>
        /mgt|pk|pnu|reg|bd_mgt|buld_mnnm|buld_slno|road|addr|sig|bjd|plat/i.test(k),
      );
    }
  }

  if (report.candidate609.length > 0) {
    const first = report.candidate609[0].summaries[0];
    if (first?.geometryType === "Polygon" || first?.geometryType === "MultiPolygon") {
      report.polygonVerified609 = "YES";
    }
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "vworld-wfs-609.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: String(e.message ?? e) }));
  process.exit(1);
});
