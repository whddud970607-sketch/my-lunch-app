/**
 * Resolve real building names via Kakao Local only.
 * No DB insert. Never prints API keys.
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

const headers = { Authorization: `KakaoAK ${key}` };

/** Keep base addresses + qty/product/customer; unit lines are synthetic test labels only. */
const rows = [
  {
    customer: "김하준",
    product: "생수",
    quantity: 3,
    area: "서창",
    base: "인천광역시 남동구 서창남순환로 55",
    unitTest: "101동 1층 101호",
  },
  {
    customer: "이서윤",
    product: "베개",
    quantity: 1,
    area: "구월",
    base: "인천광역시 남동구 인주대로 593",
    unitTest: "3층 301호",
  },
  {
    customer: "박도윤",
    product: "세탁세제",
    quantity: 2,
    area: "논현",
    base: "인천광역시 남동구 논현로46번길 23",
    unitTest: "1층 수령데스크",
  },
  {
    customer: "최하린",
    product: "화장지",
    quantity: 4,
    area: "만수",
    base: "인천광역시 남동구 만수서로 55",
    unitTest: "203동 1층 102호",
  },
  {
    customer: "정시우",
    product: "식료품",
    quantity: 2,
    area: "간석",
    base: "인천광역시 남동구 간석로 36",
    unitTest: "1502호",
  },
  {
    customer: "강서아",
    product: "의류",
    quantity: 1,
    area: "구월",
    base: "인천광역시 남동구 예술로 198",
    unitTest: "지하1층 수령처",
  },
  {
    customer: "윤지호",
    product: "반려동물용품",
    quantity: 3,
    area: "논현",
    base: "인천광역시 남동구 소래역남로 40",
    unitTest: "305동 1층 502호",
  },
  {
    customer: "한예린",
    product: "주방용품",
    quantity: 2,
    area: "만수",
    base: "인천광역시 남동구 장아산로 158",
    unitTest: "2층 매장",
  },
  {
    customer: "임민준",
    product: "생활용품",
    quantity: 5,
    area: "간석",
    base: "인천광역시 남동구 호구포로 803",
    unitTest: "701동 1층 1103호",
  },
  {
    customer: "송유나",
    product: "음료",
    quantity: 2,
    area: "서창",
    base: "인천광역시 남동구 서창남로 17",
    unitTest: "401동 1층 401호",
  },
];

async function addressSearch(query) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  url.searchParams.set("query", query);
  const res = await fetch(url, { headers });
  const body = await res.json();
  const doc = body?.documents?.[0];
  const road = doc?.road_address;
  const addr = road || doc?.address;
  return {
    httpStatus: res.status,
    ok: res.status === 200 && !!addr,
    matchedAddress: addr?.address_name || null,
    buildingName: (road?.building_name || "").trim() || null,
    lat: addr ? Number(addr.y) : null,
    lng: addr ? Number(addr.x) : null,
  };
}

async function keywordSearch(query, x, y) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", query);
  if (x != null && y != null) {
    url.searchParams.set("x", String(x));
    url.searchParams.set("y", String(y));
    url.searchParams.set("radius", "50");
    url.searchParams.set("sort", "distance");
  }
  const res = await fetch(url, { headers });
  const body = await res.json();
  const docs = Array.isArray(body?.documents) ? body.documents : [];
  return {
    httpStatus: res.status,
    docs: docs.slice(0, 8).map((d) => ({
      placeName: d.place_name,
      addressName: d.address_name,
      roadAddressName: d.road_address_name,
      category: d.category_name,
      distance: d.distance,
      x: d.x,
      y: d.y,
    })),
  };
}

function roadNumberKey(roadAddress) {
  // "인천광역시 남동구 인주대로 593" -> compare tail "인주대로 593"
  const parts = roadAddress.replace(/^인천광역시\s+/, "인천 ").trim();
  return parts;
}

function pickPlaceBuilding(base, lat, lng, places) {
  const want = roadNumberKey(base)
    .replace(/^인천광역시\s+/, "인천 ")
    .replace(/\s+/g, " ");
  const wantShort = want.replace(/^인천\s+남동구\s+/, "");

  const exactRoad = places.filter((p) => {
    const r = (p.roadAddressName || "").replace(/\s+/g, " ");
    return (
      r === want ||
      r === `인천 남동구 ${wantShort}` ||
      r.endsWith(wantShort)
    );
  });

  const pool = exactRoad.length ? exactRoad : places.filter((p) => {
    const r = (p.roadAddressName || "").replace(/\s+/g, " ");
    return r.includes(wantShort.split(" ").slice(-2).join(" "));
  });

  // Prefer apartment / building-like place names over shops when multiple.
  const scored = pool.map((p) => {
    let score = 0;
    const cat = p.category || "";
    const name = p.placeName || "";
    if (/아파트|주택|빌라|오피스텔|단지/.test(cat) || /아파트|푸르지오|캐슬|래미안|힐스테이트|베라체|포레|타워/.test(name)) {
      score += 50;
    }
    if (/대형마트|영화관|관공서|공공기관|빌딩|상가/.test(cat)) score += 30;
    if (p.distance != null && p.distance !== "") {
      const d = Number(p.distance);
      if (!Number.isNaN(d)) score += Math.max(0, 20 - d);
    }
    return { ...p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const items = [];
for (const r of rows) {
  const addr = await addressSearch(r.base);
  await sleep(100);

  let buildingName = addr.buildingName;
  let buildingSource = buildingName ? "address.building_name" : null;
  let placeCandidates = [];

  if (!buildingName) {
    const kw1 = await keywordSearch(r.base, addr.lng, addr.lat);
    await sleep(100);
    placeCandidates = kw1.docs;
    let picked = pickPlaceBuilding(r.base, addr.lat, addr.lng, kw1.docs);

    if (!picked) {
      // Broader radius
      const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
      url.searchParams.set("query", r.base);
      url.searchParams.set("x", String(addr.lng));
      url.searchParams.set("y", String(addr.lat));
      url.searchParams.set("radius", "100");
      url.searchParams.set("sort", "distance");
      const res = await fetch(url, { headers });
      const body = await res.json();
      const docs = (body?.documents || []).map((d) => ({
        placeName: d.place_name,
        addressName: d.address_name,
        roadAddressName: d.road_address_name,
        category: d.category_name,
        distance: d.distance,
        x: d.x,
        y: d.y,
      }));
      placeCandidates = docs;
      picked = pickPlaceBuilding(r.base, addr.lat, addr.lng, docs);
      await sleep(100);
    }

    if (picked) {
      buildingName = picked.placeName;
      buildingSource = "keyword.place_name";
    }
  }

  const displayLine = buildingName
    ? `${r.base}\n${buildingName} ${r.unitTest}`
    : null;

  items.push({
    customer: r.customer,
    product: r.product,
    quantity: r.quantity,
    area: r.area,
    baseAddress: r.base,
    geocodeOk: addr.ok,
    httpStatus: addr.httpStatus,
    matchedAddress: addr.matchedAddress,
    latitude: addr.lat,
    longitude: addr.lng,
    buildingName,
    buildingSource,
    unitTestLabel: r.unitTest,
    unitTestNote: "synthetic_test_only_not_verified_unit",
    displayAddress: displayLine,
    placeCandidates: placeCandidates.slice(0, 5),
  });
}

const unresolved = items.filter((x) => !x.buildingName);
const report = {
  ok: unresolved.length === 0 && items.every((x) => x.geocodeOk),
  total: items.length,
  buildingResolved: items.filter((x) => !!x.buildingName).length,
  quantitySum: items.reduce((s, x) => s + x.quantity, 0),
  unresolvedBases: unresolved.map((u) => u.baseAddress),
  items,
};

const outPath = path.join(
  __dirname,
  "fixtures",
  "namdong10-building-names-preview.json",
);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ ...report, savedTo: outPath }, null, 2));
