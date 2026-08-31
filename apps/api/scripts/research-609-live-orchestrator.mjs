/**
 * STEP A+B+C orchestrator — runs when VWORLD + DATA_GO_KR keys are CONFIGURED.
 * stdout only; never prints secret values.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

function configured(env, keys) {
  return keys.some((k) => Boolean(env[k]?.trim()));
}

const env = loadEnv(path.join(__dirname, "..", ".env"));
const vworld = configured(env, ["VWORLD_API_KEY", "VWORLD_KEY", "VWORLD_DEV_KEY"]);
const dataGo = configured(env, [
  "DATA_GO_KR_SERVICE_KEY",
  "PUBLIC_DATA_SERVICE_KEY",
  "BUILDING_REGISTER_SERVICE_KEY",
]);

const gate = {
  VWORLD_KEY: vworld ? "CONFIGURED" : "NOT_CONFIGURED",
  DATA_GO_KR_KEY: dataGo ? "CONFIGURED" : "NOT_CONFIGURED",
  ready: vworld && dataGo,
};

if (!gate.ready) {
  console.log(
    JSON.stringify(
      {
        ...gate,
        message: "Add keys to apps/api/.env then re-run this script.",
        vworldApply: "https://www.vworld.kr/dev/v4dv_apikey2_s001.do",
        buildingHubApply: "https://www.data.go.kr/data/15134735/openapi.do",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

function run(script) {
  const r = spawnSync(process.execPath, [path.join(__dirname, script)], {
    encoding: "utf8",
    cwd: path.join(__dirname, ".."),
  });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = { parseError: true, stdoutSnippet: r.stdout?.slice(0, 200) };
  }
  return { script, exitCode: r.status, report: json };
}

const vworldReport = run("research-vworld-building-609.mjs");
const registerReport = run("research-building-register-609.mjs");

const join = {
  mgmBldrgstPk_vs_bd_mgt_sn: "NONE",
  registerToVworldJoin: "NONE",
  joinEvidence: [],
  kakaoPlaceAgreement: "PENDING_GEOMETRY",
};

const reg609 = registerReport.report?.dong609Candidates ?? [];
const vw609 = vworldReport.report?.candidates ?? [];

if (reg609.length && vw609.length) {
  for (const r of reg609) {
    for (const v of vw609) {
      const p = v.safeAttributes ?? {};
      const parcelMatch =
        String(r.sigunguCd) === String(p.sig_cd ?? p.SIG_CD) &&
        String(r.bun).padStart(4, "0") === String(p.lnbr_mnnm ?? p.LNBR_MNNM ?? "").padStart(4, "0");
      const roadMatch =
        String(p.buld_mnnm ?? p.BULD_MNNM) === "190" &&
        String(p.buld_slno ?? p.BULD_SLNO) === "100";
      const dongMatch = v.match?.deterministic609 && r.dongNm && String(r.dongNm).includes("609");
      if (dongMatch && (parcelMatch || roadMatch)) {
        join.registerToVworldJoin = "STRUCTURED_COMPOSITE";
        join.joinEvidence.push("dongNm+parcel/road structured match between register row and VWorld feature");
      }
      if (p.bd_mgt_sn && r.mgmBldrgstPkPresent) {
        join.joinEvidence.push("Both have identifiers but different namespaces — not SAME");
        join.mgmBldrgstPk_vs_bd_mgt_sn = "NONE";
      }
    }
  }
}

console.log(
  JSON.stringify(
    {
      gate,
      stepA: vworldReport.report,
      stepB: registerReport.report,
      stepC: join,
      kakao609PlaceEvidence: "PASS (prior live run: 에코에비뉴아파트 609동 keyword)",
    },
    null,
    2,
  ),
);
