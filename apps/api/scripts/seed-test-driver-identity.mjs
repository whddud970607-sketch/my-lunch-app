/**
 * TEST-ONLY — inserts user_identity_profiles for fixture E2E.
 * Production signup uses UserIdentityProfilesService.provisionOnSignup (Phase B).
 *
 * Insert user_identity_profiles for the fixture test driver (identity row only).
 * Prompts for phone and birth date at runtime — never logs or stores them in source.
 *
 * Usage (local PowerShell):
 *   Set-Location apps/api
 *   node scripts/seed-test-driver-identity.mjs
 *
 * Optional env: TEST_DRIVER_USER_ID (defaults to fixture UUID)
 * Requires in apps/api/.env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_USER_ID = "ea1cd252-9792-4311-bb7f-6aad27b63ec1";

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

function normalizeKrPhoneToE164(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("82") && digits.length >= 11) return `+${digits}`;
  if (digits.startsWith("0") && digits.length >= 10) return `+82${digits.slice(1)}`;
  return null;
}

async function promptIdentityFields() {
  const rl = readline.createInterface({ input, output });
  try {
    output.write(
      "테스트 기사 identity fixture — 휴대폰번호와 생년월일을 입력하세요.\n" +
        "(입력값은 로그에 출력되지 않습니다.)\n",
    );
    const phoneRaw = (await rl.question("휴대폰번호: ")).trim();
    const birthDate = (await rl.question("생년월일 (YYYY-MM-DD): ")).trim();
    return { phoneRaw, birthDate };
  } finally {
    rl.close();
  }
}

async function main() {
  const env = loadEnv(path.join(__dirname, "..", ".env"));
  const url = env.SUPABASE_URL?.replace(/\/$/, "");
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = env.TEST_DRIVER_USER_ID || DEFAULT_USER_ID;

  if (!url || !service) {
    console.log("SEED_IDENTITY_FAIL reason=env_incomplete");
    process.exit(1);
  }

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const existing = await admin
    .from("user_identity_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing.data) {
    console.log(
      "SEED_IDENTITY_SKIP reason=already_exists userIdPrefix=" + userId.slice(0, 8),
    );
    console.log("SEED_IDENTITY_SKIP action=no_update_performed");
    process.exit(2);
  }

  const profileRes = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  if (profileRes.error || !profileRes.data?.display_name) {
    console.log("SEED_IDENTITY_FAIL reason=profile_not_found");
    process.exit(1);
  }

  const { phoneRaw, birthDate } = await promptIdentityFields();

  if (!phoneRaw || !birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    console.log("SEED_IDENTITY_FAIL reason=invalid_input_format");
    process.exit(1);
  }

  const phoneE164 = normalizeKrPhoneToE164(phoneRaw);
  if (!phoneE164) {
    console.log("SEED_IDENTITY_FAIL reason=invalid_phone");
    process.exit(1);
  }

  const insert = await admin.from("user_identity_profiles").insert({
    user_id: userId,
    legal_name: profileRes.data.display_name,
    birth_date: birthDate,
    phone_e164: phoneE164,
    phone_verified_at: new Date().toISOString(),
  });
  if (insert.error) {
    console.log("SEED_IDENTITY_FAIL reason=insert code=" + insert.error.code);
    process.exit(1);
  }

  console.log("SEED_IDENTITY_OK action=inserted userIdPrefix=" + userId.slice(0, 8));
}

main().catch(() => {
  console.log("SEED_IDENTITY_FAIL reason=unexpected");
  process.exit(1);
});
