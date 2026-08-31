/**
 * Research-only: Building Register (getBrTitleInfo) + address seed via Kakao.
 * Never prints serviceKey, API keys, or .env contents.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "build", "research");

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

function pickServiceKey(env) {
  for (const k of [
    "DATA_GO_KR_SERVICE_KEY",
    "PUBLIC_DATA_SERVICE_KEY",
    "BUILDING_REGISTER_SERVICE_KEY",
    "SERVICE_KEY",
  ]) {
    if (env[k]?.trim()) return env[k].trim();
  }
  return null;
}

function pad4(n) {
  return String(n ?? "0").padStart(4, "0");
}

async function kakaoAddressGeocode(restKey, query) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  url.searchParams.set("query", query);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${restKey}` },
  });
  const body = await res.json().catch(() => null);
  const doc = body?.documents?.[0];
  if (res.status !== 200 || !doc) {
    return { ok: false, http: res.status, message: body?.message ?? "no document" };
  }
  const addr = doc.address ?? doc.road_address ?? {};
  const bCode = addr.b_code ?? doc.address?.b_code ?? doc.road_address?.b_code;
  return {
    ok: true,
    addressName: doc.address_name ?? null,
    addressType: doc.address_type ?? null,
    buildingName: doc.road_address?.building_name ?? null,
    bCode: bCode ?? null,
    mountainYn: addr.mountain_yn ?? "N",
    mainNo: addr.main_address_no ?? doc.road_address?.main_building_no ?? null,
    subNo: addr.sub_address_no ?? doc.road_address?.sub_building_no ?? "0",
    x: doc.x ? Number(doc.x) : null,
    y: doc.y ? Number(doc.y) : null,
  };
}

function parcelFromBCode(bCode, mountainYn, mainNo, subNo) {
  if (!bCode || bCode.length < 10) return null;
  const platGbCd = mountainYn === "Y" ? "1" : "0";
  return {
    sigunguCd: bCode.slice(0, 5),
    bjdongCd: bCode.slice(5, 10),
    platGbCd,
    bun: pad4(mainNo),
    ji: pad4(subNo || "0"),
  };
}

async function getBrTitleInfo(serviceKey, parcel, pageNo = 1, numOfRows = 100) {
  const base =
    "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo";
  const url = new URL(base);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("sigunguCd", parcel.sigunguCd);
  url.searchParams.set("bjdongCd", parcel.bjdongCd);
  url.searchParams.set("platGbCd", parcel.platGbCd);
  url.searchParams.set("bun", parcel.bun);
  url.searchParams.set("ji", parcel.ji);
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("_type", "json");

  const res = await fetch(url.toString());
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, http: res.status, parseError: true, snippet: text.slice(0, 200) };
  }
  const header = body?.response?.header ?? body?.header ?? {};
  const resultCode = header.resultCode ?? header.resultcode ?? null;
  const resultMsg = header.resultMsg ?? header.resultmsg ?? null;
  const items =
    body?.response?.body?.items?.item ??
    body?.response?.body?.items ??
    body?.body?.items?.item ??
    [];
  const list = Array.isArray(items) ? items : items ? [items] : [];
  const totalCount =
    body?.response?.body?.totalCount ??
    body?.response?.body?.totalcount ??
    list.length;
  return {
    ok: res.status === 200 && (resultCode === "00" || resultCode === "0" || resultCode === "NORMAL_CODE"),
    http: res.status,
    resultCode,
    resultMsg,
    totalCount: Number(totalCount) || list.length,
    items: list,
  };
}

function sanitizeTitleItem(item) {
  return {
    dongNm: item.dongNm ?? null,
    bldNm: item.bldNm ?? null,
    platPlc: item.platPlc ?? null,
    newPlatPlc: item.newPlatPlc ?? null,
    sigunguCd: item.sigunguCd ?? null,
    bjdongCd: item.bjdongCd ?? null,
    platGbCd: item.platGbCd ?? null,
    bun: item.bun ?? null,
    ji: item.ji ?? null,
    mgmBldrgstPkPresent: Boolean(item.mgmBldrgstPk),
    mgmUpBldrgstPkPresent: Boolean(item.mgmUpBldrgstPk),
    regstrKindCdNm: item.regstrKindCdNm ?? null,
    regstrGbCdNm: item.regstrGbCdNm ?? null,
    mainPurpsCdNm: item.mainPurpsCdNm ?? null,
    naRoadCd: item.naRoadCd ?? null,
    naBjdongCd: item.naBjdongCd ?? null,
    naMainBun: item.naMainBun ?? null,
    naSubBun: item.naSubBun ?? null,
  };
}

function match609(items, complexName) {
  const dongTargets = ["609", "609동"];
  return items.filter((it) => {
    const dong = String(it.dongNm ?? "").trim();
    const dongOk =
      dong === "609" ||
      dong === "609동" ||
      dongTargets.some((t) => dong.includes(t));
    const bld = String(it.bldNm ?? "").trim();
    const road = String(it.newPlatPlc ?? it.platPlc ?? "");
    const complexOk =
      bld.includes(complexName) ||
      road.includes("190-100") ||
      road.includes("서창남순환로 190-100");
    return dongOk && (bld.includes(complexName) || complexOk);
  });
}

const FIXTURE = {
  roadAddress: "인천광역시 남동구 서창남순환로 190-100",
  complexName: "에코에비뉴",
  dong: "609",
};

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const env = loadEnv(path.join(__dirname, "..", ".env"));
  const serviceKey = pickServiceKey(env);
  const kakaoKey = env.KAKAO_REST_API_KEY?.trim() ?? null;

  const report = {
    officialEndpoint: "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo",
    officialOperation: "getBrTitleInfo",
    requestParameters: {
      required: ["serviceKey", "sigunguCd", "bjdongCd", "platGbCd", "bun", "ji"],
      optional: ["numOfRows", "pageNo", "_type", "mgmBldrgstPk"],
      notes:
        "Confirmed via data.go.kr dataset 15134735 + live probe; JSON via _type=json",
    },
    apiConfigured: Boolean(serviceKey),
    kakaoConfigured: Boolean(kakaoKey),
    apiRealRequest: "NOT_CONFIGURED",
    addressSeed: null,
    parcel: null,
    titleQuery: null,
    totalTitleRows: 0,
    dong609Candidates: [],
    complexMatches: [],
    buildingIdentityVerified: false,
    vworldJoinNotes: [],
  };

  if (!serviceKey) {
    report.apiRealRequest = "NOT_CONFIGURED";
    report.requiredEnv = "DATA_GO_KR_SERVICE_KEY (or PUBLIC_DATA_SERVICE_KEY)";
    report.application =
      "https://www.data.go.kr/data/15134735/openapi.do — dev account 10,000/day free";
    if (kakaoKey) {
      const geo = await kakaoAddressGeocode(kakaoKey, FIXTURE.roadAddress);
      report.addressSeed = {
        provider: "kakao_address_search",
        ok: geo.ok,
        addressName: geo.ok ? geo.addressName : null,
        buildingNameHint: geo.ok ? geo.buildingName : null,
        wgs84:
          geo.ok && geo.x != null
            ? { latitude: geo.y, longitude: geo.x }
            : null,
      };
      if (geo.ok) {
        report.parcel = parcelFromBCode(
          geo.bCode,
          geo.mountainYn,
          geo.mainNo,
          geo.subNo,
        );
        report.parcelDerivation =
          "Derived from Kakao address b_code + main/sub building numbers — not guessed";
      }
    }
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (!kakaoKey) {
    report.apiRealRequest = "FAIL";
    report.error = "KAKAO_REST_API_KEY missing — cannot derive sigunguCd/bjdongCd/bun/ji from PUBLIC road address without guessing";
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const geo = await kakaoAddressGeocode(kakaoKey, FIXTURE.roadAddress);
  report.addressSeed = {
    provider: "kakao_address_search",
    ok: geo.ok,
    addressName: geo.ok ? geo.addressName : null,
    addressType: geo.ok ? geo.addressType : null,
    buildingNameHint: geo.ok ? geo.buildingName : null,
    wgs84: geo.ok && geo.x != null ? { latitude: geo.y, longitude: geo.x } : null,
  };

  if (!geo.ok) {
    report.apiRealRequest = "FAIL";
    report.error = "Kakao address geocode failed for PUBLIC road address";
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const parcel = parcelFromBCode(geo.bCode, geo.mountainYn, geo.mainNo, geo.subNo);
  report.parcel = parcel;

  const allItems = [];
  let page = 1;
  let total = 0;
  let queryOk = false;
  let resultCode = null;
  let resultMsg = null;

  do {
    const q = await getBrTitleInfo(serviceKey, parcel, page, 100);
    resultCode = q.resultCode;
    resultMsg = q.resultMsg;
    if (!q.ok && page === 1) {
      report.titleQuery = {
        http: q.http,
        resultCode: q.resultCode,
        resultMsg: q.resultMsg,
        parseError: q.parseError ?? false,
      };
      report.apiRealRequest = "FAIL";
      report.error = q.resultMsg ?? "getBrTitleInfo request failed";
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    queryOk = true;
    total = q.totalCount;
    allItems.push(...q.items);
    page += 1;
  } while (allItems.length < total && page <= 20);

  report.apiRealRequest = queryOk ? "PASS" : "FAIL";
  report.titleQuery = { resultCode, resultMsg, totalCount: total, fetched: allItems.length };
  report.totalTitleRows = allItems.length;

  const sanitized = allItems.map(sanitizeTitleItem);
  const dong609 = match609(allItems, FIXTURE.complexName);
  report.dong609Candidates = dong609.map(sanitizeTitleItem);
  report.complexMatches = sanitized.filter((it) =>
    String(it.bldNm ?? "").includes(FIXTURE.complexName),
  );

  const dongMatch = dong609.some((it) => {
    const d = String(it.dongNm ?? "");
    return d === "609" || d === "609동" || d.includes("609");
  });
  const complexMatch = dong609.some((it) =>
    String(it.bldNm ?? "").includes(FIXTURE.complexName),
  );
  const roadMatch = dong609.some((it) =>
    String(it.newPlatPlc ?? "").includes("190-100"),
  );

  report["609_register_object_found"] = dong609.length > 0 ? "YES" : "NO";
  report["609_dong_match"] = dongMatch ? "YES" : "NO";
  report["609_complex_match"] = complexMatch ? "YES" : "NO";
  report["609_mgm_bldrgst_pk_available"] = dong609.some((it) => it.mgmBldrgstPk)
    ? "YES"
    : "NO";
  report["609_parent_pk_available"] = dong609.some((it) => it.mgmUpBldrgstPk)
    ? "YES"
    : "NO";

  report.buildingIdentityVerified =
    dong609.length > 0 && dongMatch && (complexMatch || roadMatch);

  report.vworldJoinIdentifier = [
    "mgmBldrgstPk — building register PK; VWorld lt_c_spbd/lt_c_bldginfo typically do NOT expose this field (join unlikely direct)",
    "PNU-like parcel key: sigunguCd+bjdongCd+platGbCd+bun+ji — may match land parcel, not individual dong polygon",
    "Road address codes: naRoadCd, naBjdongCd, naMainBun, naSubBun — candidate join to VWorld lt_c_spbd (도로명주소건물) if same official road-building ID exists",
    "bdMgtSn / building management serial — investigate in VWorld lt_c_spbd column metadata via GetCapabilities",
  ];
  report.deterministicVworldJoin = "NO";
  report.readyForIdentityToGeometryTest =
    report.buildingIdentityVerified ? "YES" : "PARTIAL";

  const outFile = path.join(OUT_DIR, "building-register-609.json");
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: String(e.message ?? e) }));
  process.exit(1);
});
