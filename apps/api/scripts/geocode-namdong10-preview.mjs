/**
 * Preview-only: Kakao geocode 10 Namdong-gu test addresses.
 * Does NOT insert DB. Never prints API keys.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const env = loadEnv(path.join(__dirname, "..", ".env"));
const key = env.KAKAO_REST_API_KEY;
if (!key) {
  console.log(JSON.stringify({ ok: false, error: "KAKAO_REST_API_KEY missing" }));
  process.exit(1);
}

const rows = [
  {
    customer: "김하준",
    product: "생수",
    quantity: 3,
    area: "서창",
    kind: "아파트",
    base: "인천광역시 남동구 서창남순환로 55",
    detail: "테스트아파트 101동 1201호",
  },
  {
    customer: "이서윤",
    product: "베개",
    quantity: 1,
    area: "구월",
    kind: "상가/오피스",
    base: "인천광역시 남동구 인주대로 593",
    detail: "테스트상가 3층 301호",
  },
  {
    customer: "박도윤",
    product: "세탁세제",
    quantity: 2,
    area: "논현",
    kind: "업무시설",
    base: "인천광역시 남동구 논현로46번길 23",
    detail: "테스트수령데스크 1층",
  },
  {
    customer: "최하린",
    product: "화장지",
    quantity: 4,
    area: "만수",
    kind: "공동주택",
    base: "인천광역시 남동구 만수서로 55",
    detail: "테스트빌라 201호",
  },
  {
    customer: "정시우",
    product: "식료품",
    quantity: 2,
    area: "간석",
    kind: "아파트",
    base: "인천광역시 남동구 간석로 36",
    detail: "테스트타워 1502호",
  },
  {
    customer: "강서아",
    product: "의류",
    quantity: 1,
    area: "구월",
    kind: "복합상가",
    base: "인천광역시 남동구 예술로 198",
    detail: "테스트오피스 지하1층 수령처",
  },
  {
    customer: "윤지호",
    product: "반려동물용품",
    quantity: 3,
    area: "논현",
    kind: "아파트",
    base: "인천광역시 남동구 소래역남로 40",
    detail: "테스트아파트 305동 502호",
  },
  {
    customer: "한예린",
    product: "주방용품",
    quantity: 2,
    area: "만수",
    kind: "상가/공동주택",
    base: "인천광역시 남동구 장아산로 158",
    detail: "테스트상가 2층 매장",
  },
  {
    customer: "임민준",
    product: "생활용품",
    quantity: 5,
    area: "간석",
    kind: "아파트",
    base: "인천광역시 남동구 호구포로 803",
    detail: "테스트아파트 701동 1103호",
  },
  {
    customer: "송유나",
    product: "음료",
    quantity: 2,
    area: "서창",
    kind: "공동주택",
    base: "인천광역시 남동구 서창남로 17",
    detail: "테스트빌 401호",
  },
];

async function geocode(query) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  url.searchParams.set("query", query);
  const t0 = Date.now();
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${key}` },
  });
  const ms = Date.now() - t0;
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const doc = body?.documents?.[0];
  const addr = doc?.road_address || doc?.address;
  return {
    httpStatus: res.status,
    ms,
    ok: res.status === 200 && !!addr,
    addressName: addr?.address_name || null,
    lat: addr ? Number(addr.y) : null,
    lng: addr ? Number(addr.x) : null,
    buildingName: addr?.building_name || null,
    docCount: Array.isArray(body?.documents) ? body.documents.length : 0,
  };
}

const out = [];
for (const r of rows) {
  const g = await geocode(r.base);
  out.push({
    customer: r.customer,
    product: r.product,
    quantity: r.quantity,
    area: r.area,
    kind: r.kind,
    baseAddress: r.base,
    detailAddress: r.detail,
    geocodeOk: g.ok,
    httpStatus: g.httpStatus,
    geocodeMs: g.ms,
    matchedAddress: g.addressName,
    latitude: g.lat,
    longitude: g.lng,
    buildingName: g.buildingName,
    docCount: g.docCount,
  });
  await new Promise((x) => setTimeout(x, 120));
}

const failed = out.filter((x) => !x.geocodeOk);
const qtySum = out.reduce((s, x) => s + x.quantity, 0);
const report = {
  ok: failed.length === 0,
  total: out.length,
  geocodeSuccess: out.filter((x) => x.geocodeOk).length,
  quantitySum: qtySum,
  failedBases: failed.map((f) => ({
    baseAddress: f.baseAddress,
    httpStatus: f.httpStatus,
    docCount: f.docCount,
  })),
  items: out,
};

const outPath = path.join(
  process.env.TEMP || "/tmp",
  "ds-namdong10-geocode-preview.json",
);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ ...report, savedTo: outPath }, null, 2));
