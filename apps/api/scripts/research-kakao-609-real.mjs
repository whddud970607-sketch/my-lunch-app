/** Kakao real PUBLIC query — no key output */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
const key = loadEnv(path.join(__dirname, "..", ".env")).KAKAO_REST_API_KEY;
if (!key) {
  console.log(JSON.stringify({ configured: false }));
  process.exit(0);
}
const road = "인천광역시 남동구 서창남순환로 190-100";
const hdr = { Authorization: `KakaoAK ${key}` };
const addr = await fetch(
  "https://dapi.kakao.com/v2/local/search/address.json?query=" +
    encodeURIComponent(road),
  { headers: hdr },
).then((r) => r.json());
const d = addr.documents?.[0];
const queries = [
  "에코에비뉴",
  "에코에비뉴 609동",
  "서창남순환로 190-100",
  "서창남순환로 190-100 609동",
];
const out = {
  configured: true,
  road: d
    ? {
        address_name: d.address_name,
        lat: Number(d.y),
        lng: Number(d.x),
        building_name: d.road_address?.building_name ?? null,
        b_code: d.address?.b_code ?? d.road_address?.b_code ?? null,
      }
    : null,
  keyword: {},
};
for (const q of queries) {
  const kw = await fetch(
    `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&x=${d?.x}&y=${d?.y}&radius=1500&size=15`,
    { headers: hdr },
  ).then((r) => r.json());
  out.keyword[q] = (kw.documents ?? []).slice(0, 8).map((p) => ({
    place_name: p.place_name,
    category_name: p.category_name,
    address_name: p.address_name,
    lat: Number(p.y),
    lng: Number(p.x),
    id: p.id,
    dong609:
      String(p.place_name).includes("609동") &&
      String(p.category_name).includes("아파트 동"),
  }));
}
console.log(JSON.stringify(out, null, 2));
