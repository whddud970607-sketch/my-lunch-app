/**
 * Diagnose signInWithPassword "Invalid API key" — no secret values printed.
 */
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const report = { checkedAt: new Date().toISOString(), findings: {} };

function loadDotEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  const map = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    map[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return map;
}

function sha8(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex").slice(0, 8);
}

function decodeJwtPayload(jwt) {
  try {
    const part = jwt.split(".")[1];
    if (!part) return null;
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function classifyKey(value) {
  if (!value) return { kind: "missing" };
  if (value.startsWith("sb_publishable_")) return { kind: "publishable_sb" };
  if (value.startsWith("sb_secret_")) return { kind: "secret_sb" };
  if (value.startsWith("eyJ")) return { kind: "legacy_jwt" };
  // Do not print the raw prefix; only a coarse family for diagnosis.
  const coarse =
    value.startsWith("sb_")
      ? "sb_other"
      : /^[A-Za-z0-9_-]+$/.test(value.slice(0, 12))
        ? "opaque_alnum"
        : "other";
  return { kind: "unknown_prefix", coarse };
}

async function main() {
  const env = loadDotEnv();
  const url = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const anon = env.SUPABASE_ANON_KEY || "";
  const service = env.SUPABASE_SERVICE_ROLE_KEY || "";

  const urlHost = (() => {
    try {
      return new URL(url).host;
    } catch {
      return null;
    }
  })();
  const urlRef = urlHost?.split(".")[0] ?? null;

  const anonMeta = classifyKey(anon);
  const serviceMeta = classifyKey(service);
  if (anon.startsWith("eyJ")) {
    const payload = decodeJwtPayload(anon);
    anonMeta.jwtRole = payload?.role ?? null;
    anonMeta.jwtRef = payload?.ref ?? null;
    anonMeta.jwtIss = payload?.iss ?? null;
    anonMeta.refMatchesUrl = Boolean(urlRef && payload?.ref === urlRef);
  }
  if (service.startsWith("eyJ")) {
    const payload = decodeJwtPayload(service);
    serviceMeta.jwtRole = payload?.role ?? null;
    serviceMeta.jwtRef = payload?.ref ?? null;
    serviceMeta.refMatchesUrl = Boolean(urlRef && payload?.ref === urlRef);
  }

  report.findings.env = {
    hasUrl: Boolean(url),
    urlHost,
    urlRef,
    hasAnon: Boolean(anon),
    hasServiceRole: Boolean(service),
    anonFingerprint: anon ? sha8(anon) : null,
    serviceFingerprint: service ? sha8(service) : null,
    anonMeta,
    serviceMeta,
    sameProjectHint:
      anonMeta.refMatchesUrl === true && serviceMeta.refMatchesUrl === true
        ? "url_anon_service_ref_aligned"
        : anonMeta.refMatchesUrl === false || serviceMeta.refMatchesUrl === false
          ? "ref_mismatch_detected"
          : "incomplete_jwt_claims",
  };

  // Expected emails from approved E2E plan
  const emailA = "whddud970607+e2e-driver-a@gmail.com";
  const emailB = "whddud970607+e2e-driver-b@gmail.com";
  report.findings.plannedEmails = { emailA, emailB };

  if (!url || !service) {
    report.findings.authUsers = { skipped: true, reason: "missing url or service role" };
  } else {
    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listed.error) {
      report.findings.authUsers = {
        ok: false,
        errorName: listed.error.name,
        errorMessage: listed.error.message,
        status: listed.error.status ?? null,
      };
    } else {
      const users = listed.data.users || [];
      const pick = (email) => {
        const u = users.find((x) => x.email === email);
        if (!u) return { exists: false };
        return {
          exists: true,
          idPrefix: u.id.slice(0, 8),
          emailExactMatch: u.email === email,
          emailConfirmed: Boolean(u.email_confirmed_at),
          banned: Boolean(u.banned_until),
          metadataPurpose: u.user_metadata?.purpose ?? null,
          metadataLabel: u.user_metadata?.label ?? null,
        };
      };
      report.findings.authUsers = {
        ok: true,
        totalListed: users.length,
        A: pick(emailA),
        B: pick(emailB),
      };
    }
  }

  // Probe anon key acceptance without revealing credentials.
  // 1) Health-ish: Auth settings endpoint often validates apikey
  // 2) signIn with nonsense password — if key invalid → Invalid API key;
  //    if key valid → invalid credentials
  if (url && anon) {
    const anonClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const probeEmail = emailA;
    const probe = await anonClient.auth.signInWithPassword({
      email: probeEmail,
      password: "definitely-not-the-real-password-for-probe-only",
    });
    report.findings.signInProbe = {
      usedClient: "anon_from_env",
      emailUsed: probeEmail,
      errorName: probe.error?.name ?? null,
      errorMessage: probe.error?.message ?? null,
      errorCode: probe.error?.code ?? null,
      status: probe.error?.status ?? null,
      interpretation: /invalid api key/i.test(probe.error?.message || "")
        ? "API_KEY_REJECTED"
        : /invalid login credentials|email not confirmed|user not found/i.test(
              probe.error?.message || "",
            )
          ? "API_KEY_ACCEPTED_AUTH_REJECTED_LOGIN"
          : probe.error
            ? "OTHER_AUTH_ERROR"
            : "UNEXPECTED_SUCCESS",
    };
  } else {
    report.findings.signInProbe = { skipped: true, reason: "missing url or anon" };
  }

  // Optional: compare fingerprints passed via env EXPECT_ANON_SHA8 / EXPECT_PUB_SHA8
  if (process.env.EXPECT_ANON_SHA8) {
    report.findings.dashboardCompare = {
      localAnonMatchesDashboardAnon:
        report.findings.env.anonFingerprint === process.env.EXPECT_ANON_SHA8,
      expectAnonSha8: process.env.EXPECT_ANON_SHA8,
      localAnonSha8: report.findings.env.anonFingerprint,
      expectPublishableSha8: process.env.EXPECT_PUB_SHA8 || null,
      localMatchesPublishable:
        process.env.EXPECT_PUB_SHA8 &&
        report.findings.env.anonFingerprint === process.env.EXPECT_PUB_SHA8,
    };
  }

  const out = path.join(__dirname, "e2e-signin-diagnosis.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ fatal: e instanceof Error ? e.message : "unknown" }));
  process.exit(1);
});
