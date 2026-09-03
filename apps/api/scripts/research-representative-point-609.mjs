/**
 * Research-only: EXACT_609 representative point gate.
 * Runs local geometry tests first, then optional single GetFeature recall.
 *
 * Never logs API keys, key URLs, or raw geometry.
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "url";
import {
  computeRepresentativePoints,
  fmtCoord,
} from "./lib/representative-geometry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PNU = "2820010500106950000";
const BULD_NM_DC = "609동";
const EXPECTED_COMPLEX = "에코에비뉴";

function loadKey() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return null;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if ((k === "VWORLD_API_KEY" || k === "VWORLD_KEY" || k === "VWORLD_DEV_KEY") && v) {
      return v;
    }
  }
  return null;
}

function normalizeName(s) {
  return (s ?? "").replace(/\s+/g, "").trim();
}

function getProp(props, name) {
  const hit = Object.entries(props ?? {}).find(
    ([k]) => k.toLowerCase() === name.toLowerCase(),
  );
  return hit ? hit[1] : null;
}

function runLocalGeometryTests() {
  const testFile = path.join(__dirname, "lib", "representative-geometry.test.mjs");
  const result = spawnSync(process.execPath, ["--test", testFile], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    pass: result.status === 0,
    status: result.status,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
}

async function fetchExact609Feature(key) {
  const filterXml = `<Filter xmlns="http://www.opengis.net/ogc"><And><PropertyIsEqualTo><PropertyName>pnu</PropertyName><Literal>${PNU}</Literal></PropertyIsEqualTo><PropertyIsEqualTo><PropertyName>buld_nm_dc</PropertyName><Literal>${BULD_NM_DC}</Literal></PropertyIsEqualTo></And></Filter>`;
  const url = new URL("https://api.vworld.kr/req/wfs");
  url.searchParams.set("service", "WFS");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("version", "1.1.0");
  url.searchParams.set("typename", "lt_c_spbd");
  url.searchParams.set("srsname", "EPSG:4326");
  url.searchParams.set("output", "application/json");
  url.searchParams.set("maxfeatures", "1");
  url.searchParams.set("filter", filterXml);
  url.searchParams.set("key", key);

  const res = await fetch(url.toString());
  const text = await res.text();
  return { res, text };
}

async function main() {
  const testOnly = process.argv.includes("--test-only");
  const out = {
    GEOMETRY_IMPLEMENTATION: "CUSTOM_INTERIOR_POINT",
    GEOMETRY_LIBRARY_REUSED: "NO",
    LOCAL_GEOMETRY_TESTS: "NOT_RUN",
    GET_FEATURE_RECALL: "NOT_RUN",
    NETWORK_REQUEST_COUNT: 0,
    PROXIMITY_GUESS_USED: "NO",
    NEAREST_POLYGON_USED: "NO",
    RAW_GEOMETRY_OUTPUT: "NO",
    SECRET_OUTPUT: "NO",
    DATABASE_WRITE: "NO",
    PRODUCTION_CHANGE: "NO",
    GIT_CHANGE: "NO",
    PIN_PROVENANCE: "BUILDING_CENTER",
    BUILDING_ENTRANCE_VERIFIED: "NO",
    VEHICLE_ACCESS_POINT_VERIFIED: "NO",
  };

  const tests = runLocalGeometryTests();
  out.LOCAL_GEOMETRY_TESTS = tests.pass ? "PASS" : "FAIL";
  if (!tests.pass) {
    out.SOURCE_FEATURE_IDENTITY = "FAILED";
    out.BUILDING_CENTER_VERIFIED = "NO";
    out.REAL_609_PIN_READY = "NO";
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  if (testOnly) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const key = loadKey();
  if (!key) {
    out.GET_FEATURE_RECALL = "FAIL";
    out.SOURCE_FEATURE_IDENTITY = "FAILED";
    out.BUILDING_CENTER_VERIFIED = "NO";
    out.REAL_609_PIN_READY = "NO";
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  out.NETWORK_REQUEST_COUNT = 1;
  let res;
  let text;
  try {
    ({ res, text } = await fetchExact609Feature(key));
  } catch {
    out.GET_FEATURE_RECALL = "FAIL";
    out.SOURCE_FEATURE_IDENTITY = "FAILED";
    out.BUILDING_CENTER_VERIFIED = "NO";
    out.REAL_609_PIN_READY = "NO";
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  if (res.status !== 200 || text.toUpperCase().includes("SERVICEEXCEPTION")) {
    out.GET_FEATURE_RECALL = "FAIL";
    out.SOURCE_FEATURE_IDENTITY = "FAILED";
    out.BUILDING_CENTER_VERIFIED = "NO";
    out.REAL_609_PIN_READY = "NO";
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  let features = [];
  try {
    features = JSON.parse(text).features ?? [];
  } catch {
    out.GET_FEATURE_RECALL = "FAIL";
    out.SOURCE_FEATURE_IDENTITY = "FAILED";
    out.BUILDING_CENTER_VERIFIED = "NO";
    out.REAL_609_PIN_READY = "NO";
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  out.GET_FEATURE_RECALL = "PASS";
  out.FEATURE_COUNT = features.length;

  if (features.length !== 1) {
    out.SOURCE_FEATURE_IDENTITY = "FAILED";
    out.BUILDING_CENTER_VERIFIED = "NO";
    out.REAL_609_PIN_READY = "NO";
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const f = features[0];
  const props = f.properties ?? {};
  out.PNU_MATCH = getProp(props, "pnu") === PNU ? "YES" : "NO";
  out.DONG_609_MATCH = getProp(props, "buld_nm_dc") === BULD_NM_DC ? "YES" : "NO";
  out.BULD_NM_NORMALIZED_MATCH =
    normalizeName(getProp(props, "buld_nm")) === EXPECTED_COMPLEX ? "YES" : "NO";

  if (
    out.PNU_MATCH !== "YES" ||
    out.DONG_609_MATCH !== "YES" ||
    out.BULD_NM_NORMALIZED_MATCH !== "YES" ||
    !f.geometry
  ) {
    out.SOURCE_FEATURE_IDENTITY = "FAILED";
    out.BUILDING_CENTER_VERIFIED = "NO";
    out.REAL_609_PIN_READY = "NO";
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  out.SOURCE_FEATURE_IDENTITY = "EXACT_609";
  out.SOURCE_GEOMETRY_TYPE = f.geometry.type;

  const rep = computeRepresentativePoints(f.geometry);
  if (!rep) {
    out.BUILDING_CENTER_VERIFIED = "NO";
    out.REAL_609_PIN_READY = "NO";
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  out.CENTROID_COMPUTED = rep.centroid ? "YES" : "NO";
  out.CENTROID_INSIDE_GEOMETRY = rep.centroidInside ? "YES" : "NO";
  if (rep.centroid) {
    out.CENTROID_LNG = fmtCoord(rep.centroid[0]);
    out.CENTROID_LAT = fmtCoord(rep.centroid[1]);
  }

  out.INTERIOR_POINT_METHOD = rep.interior.method;
  out.INTERIOR_POINT_STRATEGY = rep.interior.strategy;
  out.INTERIOR_POINT_COMPUTED = rep.interior.point ? "YES" : "NO";
  out.INTERIOR_POINT_INSIDE_GEOMETRY = rep.interiorInside ? "YES" : "NO";
  if (rep.interior.point) {
    out.INTERIOR_POINT_LNG = fmtCoord(rep.interior.point[0]);
    out.INTERIOR_POINT_LAT = fmtCoord(rep.interior.point[1]);
  }

  if (rep.interiorInside) {
    out.SELECTED_METHOD = "CUSTOM_INTERIOR_POINT";
    out.SELECTED_LNG = out.INTERIOR_POINT_LNG;
    out.SELECTED_LAT = out.INTERIOR_POINT_LAT;
  } else if (rep.centroidInside) {
    out.SELECTED_METHOD = "centroid";
    out.SELECTED_LNG = out.CENTROID_LNG;
    out.SELECTED_LAT = out.CENTROID_LAT;
  } else {
    out.SELECTED_METHOD = "NONE";
  }

  out.BUILDING_CENTER_VERIFIED = out.SELECTED_METHOD !== "NONE" ? "YES" : "NO";
  out.REAL_609_PIN_READY = out.BUILDING_CENTER_VERIFIED;

  console.log(JSON.stringify(out, null, 2));
}

main().catch(() => {
  process.exit(1);
});
