/**
 * Live Auth + RLS E2E (Auth Admin API only).
 * Never logs passwords, access_tokens, or service_role keys.
 * Writes scripts/e2e-summary.json with status outcomes only.
 */
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const summary = {
  startedAt: new Date().toISOString(),
  steps: {},
};

function step(name, data) {
  summary.steps[name] = data;
}

function writeSummary() {
  fs.writeFileSync(
    path.join(__dirname, "e2e-summary.json"),
    JSON.stringify(summary, null, 2),
  );
}

function loadDotEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) throw new Error("apps/api/.env missing");
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function decodeAlg(token) {
  try {
    return JSON.parse(
      Buffer.from(token.split(".")[0], "base64url").toString("utf8"),
    ).alg;
  } catch {
    return null;
  }
}

function randomPassword() {
  return `E2e!${crypto.randomBytes(24).toString("base64url")}`;
}

async function waitHealth(apiBase, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${apiBase}/health`);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function main() {
  loadDotEnv();
  const url = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const anon = requireEnv("SUPABASE_ANON_KEY");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const apiBase = (process.env.API_BASE || "http://127.0.0.1:4000/v1").replace(
    /\/$/,
    "",
  );

  const emailA = "whddud970607+e2e-driver-a@gmail.com";
  const emailB = "whddud970607+e2e-driver-b@gmail.com";
  const passwordA = randomPassword();
  const passwordB = randomPassword();

  const admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- create users (Admin API); delete leftover E2E users with same emails first ---
  async function deleteExistingByEmail(email) {
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listed.error) return { ok: false, error: listed.error.message };
    const found = (listed.data.users || []).filter((u) => u.email === email);
    const deleted = [];
    for (const u of found) {
      const { error } = await admin.auth.admin.deleteUser(u.id);
      deleted.push({ id: u.id, ok: !error });
    }
    return { ok: true, deletedCount: deleted.length };
  }

  step("pre_cleanup", {
    A: await deleteExistingByEmail(emailA),
    B: await deleteExistingByEmail(emailB),
  });

  async function createE2eUser(email, password, label) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        purpose: "e2e_live_auth_rls",
        label,
        display_name: label,
      },
    });
    if (error) throw new Error(`createUser ${label}: ${error.message}`);
    return data.user;
  }

  let userA;
  let userB;
  try {
    userA = await createE2eUser(emailA, passwordA, "e2e_driver_a");
    userB = await createE2eUser(emailB, passwordB, "e2e_driver_b");
  } catch (e) {
    step("createUser", {
      ok: false,
      error: e instanceof Error ? e.message : "create failed",
    });
    writeSummary();
    process.exit(1);
  }

  step("createUser", {
    ok: true,
    emailA,
    emailB,
    userIdA: userA.id,
    userIdB: userB.id,
    metadataPurpose: "e2e_live_auth_rls",
  });

  // Separate anon clients for A/B sign-in so sessions never pollute probes.
  const loginClientA = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const loginClientB = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const loginA = await loginClientA.auth.signInWithPassword({
    email: emailA,
    password: passwordA,
  });
  const loginB = await loginClientB.auth.signInWithPassword({
    email: emailB,
    password: passwordB,
  });
  if (loginA.error || !loginA.data.session) {
    step("signIn", {
      ok: false,
      which: "A",
      errorName: loginA.error?.name ?? null,
      errorMessage: loginA.error?.message ?? null,
      errorCode: loginA.error?.code ?? null,
      status: loginA.error?.status ?? null,
    });
    step("cleanup", await cleanupAuth(admin, userA?.id, userB?.id));
    writeSummary();
    process.exit(1);
  }
  if (loginB.error || !loginB.data.session) {
    step("signIn", {
      ok: false,
      which: "B",
      errorName: loginB.error?.name ?? null,
      errorMessage: loginB.error?.message ?? null,
      errorCode: loginB.error?.code ?? null,
      status: loginB.error?.status ?? null,
    });
    step("cleanup", await cleanupAuth(admin, userA?.id, userB?.id));
    writeSummary();
    process.exit(1);
  }

  const tokenA = loginA.data.session.access_token;
  const tokenB = loginB.data.session.access_token;
  const algA = decodeAlg(tokenA);
  const algB = decodeAlg(tokenB);
  step("signIn", { ok: true, via: "anon_client" });
  step("jwt_alg", { algA, algB });

  // --- profiles / drivers ---
  async function loadMeRows(token, userId) {
    const c = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const profile = await c
      .from("profiles")
      .select("id, role, company_id")
      .eq("id", userId)
      .maybeSingle();
    const driver = await c
      .from("drivers")
      .select("id, user_id, work_status")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      profileOk: profile.data?.role === "driver",
      role: profile.data?.role ?? null,
      driverOk: !!driver.data?.id,
      driverId: driver.data?.id ?? null,
      profileErr: profile.error?.code ?? null,
      driverErr: driver.error?.code ?? null,
    };
  }

  const rowsA = await loadMeRows(tokenA, userA.id);
  const rowsB = await loadMeRows(tokenB, userB.id);
  step("profiles_drivers", { A: rowsA, B: rowsB });

  if (!rowsA.driverId || !rowsB.driverId || rowsA.role !== "driver" || rowsB.role !== "driver") {
    step("abort", { reason: "profiles/drivers not ready as driver" });
    await cleanupAuth(admin, userA.id, userB.id);
    writeSummary();
    process.exit(1);
  }

  // --- seed delivery jobs/points/secret (service role, fake data) ---
  const marker = "e2e_live_auth_rls";
  const jobInsA = await admin
    .from("delivery_jobs")
    .insert({
      driver_id: rowsA.driverId,
      status: "active",
      service_date: new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  const jobInsB = await admin
    .from("delivery_jobs")
    .insert({
      driver_id: rowsB.driverId,
      status: "active",
      service_date: new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();

  if (jobInsA.error || jobInsB.error) {
    step("seed_jobs", {
      ok: false,
      a: jobInsA.error?.message ?? null,
      b: jobInsB.error?.message ?? null,
    });
    await cleanupAuth(admin, userA.id, userB.id);
    writeSummary();
    process.exit(1);
  }

  const jobIdA = jobInsA.data.id;
  const jobIdB = jobInsB.data.id;

  const pointA = await admin
    .from("delivery_points")
    .insert({
      job_id: jobIdA,
      driver_id: rowsA.driverId,
      sequence_no: 1,
      display_label: `${marker}_point_a`,
      status: "pending",
    })
    .select("id")
    .single();
  const pointB = await admin
    .from("delivery_points")
    .insert({
      job_id: jobIdB,
      driver_id: rowsB.driverId,
      sequence_no: 1,
      display_label: `${marker}_point_b`,
      status: "pending",
    })
    .select("id")
    .single();

  const secretIns = await admin.from("delivery_point_access_secrets").insert({
    point_id: pointA.data.id,
    job_id: jobIdA,
    driver_id: rowsA.driverId,
    access_info_ciphertext: Buffer.from("e2e-fake-ciphertext"),
    access_info_nonce: Buffer.from("e2e-fake-nonce-12"),
    access_info_key_version: 1,
  });

  step("seed_jobs", {
    ok: !pointA.error && !pointB.error && !secretIns.error,
    jobIdA,
    jobIdB,
    pointIdA: pointA.data?.id ?? null,
    pointIdB: pointB.data?.id ?? null,
    secretOk: !secretIns.error,
  });

  // --- start Nest if needed ---
  let nestProc = null;
  const healthyAlready = await waitHealth(apiBase, 2);
  if (!healthyAlready) {
    const distMain = path.join(__dirname, "..", "dist", "main.js");
    nestProc = spawn(process.execPath, [distMain], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env },
      stdio: ["ignore", "ignore", "ignore"],
      windowsHide: true,
    });
    const ok = await waitHealth(apiBase, 80);
    step("nest_start", { started: true, healthy: ok });
    if (!ok) {
      step("abort", { reason: "Nest health not ready" });
      await cleanupAll(admin, {
        userIdA: userA.id,
        userIdB: userB.id,
        jobIdA,
        jobIdB,
        pointIdA: pointA.data?.id,
        pointIdB: pointB.data?.id,
      }).then((c) => step("cleanup", c));
      if (nestProc) {
        try {
          nestProc.kill();
        } catch {
          // ignore
        }
      }
      writeSummary();
      process.exit(1);
    }
  } else {
    step("nest_start", { started: false, healthy: true });
  }

  async function hit(method, pathName, token) {
    const res = await fetch(`${apiBase}${pathName}`, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return {
      status: res.status,
      role: body?.role ?? null,
      userId: body?.userId ?? null,
      hasDriver: !!body?.driver,
      id: body?.id ?? null,
    };
  }

  const meA = await hit("GET", "/me", tokenA);
  const meB = await hit("GET", "/me", tokenB);
  step("nest_me", {
    A: { status: meA.status, role: meA.role, hasDriver: meA.hasDriver, userMatch: meA.userId === userA.id },
    B: { status: meB.status, role: meB.role, hasDriver: meB.hasDriver, userMatch: meB.userId === userB.id },
  });

  const aOwn = await hit("GET", `/delivery/jobs/${jobIdA}`, tokenA);
  const aCross = await hit("GET", `/delivery/jobs/${jobIdB}`, tokenA);
  const bOwn = await hit("GET", `/delivery/jobs/${jobIdB}`, tokenB);
  const bCross = await hit("GET", `/delivery/jobs/${jobIdA}`, tokenB);
  step("nest_jobs", {
    A_own: { status: aOwn.status },
    A_cross_B: { status: aCross.status },
    B_own: { status: bOwn.status },
    B_cross_A: { status: bCross.status },
  });

  // anon delivery access
  const anonJobs = await anonClient.from("delivery_jobs").select("id").limit(5);
  step("anon_delivery_jobs", {
    errorCode: anonJobs.error?.code ?? null,
    rowCount: anonJobs.data?.length ?? 0,
    blocked:
      !!anonJobs.error ||
      !anonJobs.data ||
      anonJobs.data.length === 0,
  });

  // access secrets with authenticated A
  const userClientA = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${tokenA}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const secrets = await userClientA
    .from("delivery_point_access_secrets")
    .select("point_id")
    .limit(5);
  step("access_secrets_authenticated", {
    errorCode: secrets.error?.code ?? null,
    rowCount: secrets.data?.length ?? 0,
    blocked:
      !!secrets.error ||
      !secrets.data ||
      secrets.data.length === 0,
  });

  // RLS direct: A should only see own job among the two
  const aJobs = await userClientA
    .from("delivery_jobs")
    .select("id")
    .in("id", [jobIdA, jobIdB]);
  step("rls_direct_jobs_as_A", {
    idsReturned: (aJobs.data || []).map((r) => r.id),
    onlyOwn:
      (aJobs.data || []).length === 1 && (aJobs.data || [])[0]?.id === jobIdA,
    errorCode: aJobs.error?.code ?? null,
  });

  // --- cleanup ---
  const cleanup = await cleanupAll(admin, {
    userIdA: userA.id,
    userIdB: userB.id,
    jobIdA,
    jobIdB,
    pointIdA: pointA.data?.id,
    pointIdB: pointB.data?.id,
  });
  step("cleanup", cleanup);

  if (nestProc) {
    try {
      nestProc.kill();
    } catch {
      // ignore
    }
  }

  summary.finishedAt = new Date().toISOString();
  writeSummary();
  // eslint-disable-next-line no-console
  console.log("E2E complete — see scripts/e2e-summary.json (no secrets).");
}

async function cleanupAuth(admin, userIdA, userIdB) {
  const result = { usersDeleted: [] };
  for (const id of [userIdA, userIdB].filter(Boolean)) {
    const { error } = await admin.auth.admin.deleteUser(id);
    result.usersDeleted.push({ id, ok: !error, error: error?.message ?? null });
  }
  return result;
}

async function cleanupAll(admin, ids) {
  const out = {
    secrets: null,
    points: null,
    jobs: null,
    users: null,
  };

  if (ids.pointIdA || ids.pointIdB) {
    const pointIds = [ids.pointIdA, ids.pointIdB].filter(Boolean);
    const s = await admin
      .from("delivery_point_access_secrets")
      .delete()
      .in("point_id", pointIds);
    out.secrets = { ok: !s.error, error: s.error?.message ?? null };
    const p = await admin.from("delivery_points").delete().in("id", pointIds);
    out.points = { ok: !p.error, error: p.error?.message ?? null };
  }

  if (ids.jobIdA || ids.jobIdB) {
    const jobIds = [ids.jobIdA, ids.jobIdB].filter(Boolean);
    const j = await admin.from("delivery_jobs").delete().in("id", jobIds);
    out.jobs = { ok: !j.error, error: j.error?.message ?? null };
  }

  out.users = await cleanupAuth(admin, ids.userIdA, ids.userIdB);
  return out;
}

main().catch(async (e) => {
  step("fatal", { message: e instanceof Error ? e.message : "unknown" });
  try {
    // Best-effort cleanup if env still loadable
    const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const metaPath = path.join(__dirname, "e2e-seed-meta.json");
    if (url && serviceRole && fs.existsSync(metaPath)) {
      // no-op placeholder — cleanup uses ids from summary when available
    }
  } catch {
    // ignore
  }
  writeSummary();
  console.error("E2E failed — see e2e-summary.json");
  process.exit(1);
});
