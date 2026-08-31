/** READ-ONLY env presence check — never prints secret values */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
const env = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
}
const keys = [
  "KAKAO_REST_API_KEY",
  "NAVER_MAP_CLIENT_ID",
  "NAVER_MAP_CLIENT_SECRET",
  "VWORLD_API_KEY",
  "VWORLD_KEY",
  "VWORLD_DEV_KEY",
  "DATA_GO_KR_SERVICE_KEY",
];
const presence = {};
for (const k of keys) presence[k] = env[k]?.trim() ? "PRESENT" : "ABSENT";
console.log(JSON.stringify({ envFileExists: fs.existsSync(envPath), presence }, null, 2));
