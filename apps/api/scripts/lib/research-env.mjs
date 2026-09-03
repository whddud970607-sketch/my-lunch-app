/**
 * Research-only credential/env helpers. Never logs secret values.
 */

import fs from "fs";

export function loadResearchEnv(filePath) {
  const map = {};
  if (!fs.existsSync(filePath)) return map;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    map[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return map;
}

export function pickCredential(env, keys) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return null;
}

export function credentialPresence(env) {
  return {
    KAKAO_REST_API_KEY: pickCredential(env, ["KAKAO_REST_API_KEY"]) ? "CONFIGURED" : "NOT_CONFIGURED",
    DATA_GO_KR_SERVICE_KEY: pickCredential(env, [
      "DATA_GO_KR_SERVICE_KEY",
      "PUBLIC_DATA_SERVICE_KEY",
      "BUILDING_REGISTER_SERVICE_KEY",
      "SERVICE_KEY",
    ])
      ? "CONFIGURED"
      : "NOT_CONFIGURED",
    VWORLD_API_KEY: pickCredential(env, ["VWORLD_API_KEY", "VWORLD_KEY", "VWORLD_DEV_KEY"])
      ? "CONFIGURED"
      : "NOT_CONFIGURED",
  };
}

export function createNetworkBudgetTracker(totalBudget) {
  let used = 0;
  return {
    consume(n = 1) {
      used += n;
    },
    remaining() {
      return totalBudget - used;
    },
    used() {
      return used;
    },
    totalBudget,
  };
}
