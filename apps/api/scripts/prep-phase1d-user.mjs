/**
 * Prep Phase 1D runtime auth user (Admin API only). No secrets printed.
 */
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
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

function randomPassword() {
  return `E2e!${crypto.randomBytes(18).toString("base64url")}`;
}

async function main() {
  const apiEnv = loadEnv(path.join(__dirname, "..", "..", "api", ".env"));
  const url = apiEnv.SUPABASE_URL?.replace(/\/$/, "");
  const service = apiEnv.SUPABASE_SERVICE_ROLE_KEY;
  const anon = apiEnv.SUPABASE_ANON_KEY;
  if (!url || !service || !anon) throw new Error("api env incomplete");
  if (anon.startsWith("sb_secret_")) throw new Error("anon must not be secret");

  const email = "whddud970607+phase1d-driver@gmail.com";
  const password = randomPassword();

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of listed.data?.users || []) {
    if (u.email === email) {
      await admin.auth.admin.deleteUser(u.id);
    }
  }

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      purpose: "phase1d_runtime",
      label: "e2e_driver",
      display_name: "Phase1D Driver",
    },
  });
  if (created.error) throw new Error(created.error.message);

  const anonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await anonClient.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session) {
    throw new Error(login.error?.message || "sign-in failed");
  }

  const outDir = path.join(__dirname, "..", "..", "mobile", "integration_test");
  fs.mkdirSync(outDir, { recursive: true });
  const credPath = path.join(outDir, ".e2e_creds.json");
  fs.writeFileSync(
    credPath,
    JSON.stringify({ email, password, userId: created.data.user.id }, null, 2),
  );

  const alg = JSON.parse(
    Buffer.from(
      login.data.session.access_token.split(".")[0],
      "base64url",
    ).toString(),
  ).alg;

  console.log(
    JSON.stringify({
      ok: true,
      email,
      userIdPrefix: created.data.user.id.slice(0, 8),
      signInOk: true,
      alg,
    }),
  );
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
