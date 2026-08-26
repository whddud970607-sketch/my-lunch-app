/**
 * Cleanup leftover E2E resources from e2e-summary.json (no secrets printed).
 */
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadDotEnv();
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) throw new Error("missing env");

  const summaryPath = path.join(__dirname, "e2e-summary.json");
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  const create = summary.steps?.createUser || {};
  const seed = summary.steps?.seed_jobs || {};
  const emailA = create.emailA || "whddud970607+e2e-driver-a@gmail.com";
  const emailB = create.emailB || "whddud970607+e2e-driver-b@gmail.com";

  const admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const pointIds = [seed.pointIdA, seed.pointIdB].filter(Boolean);
  const jobIds = [seed.jobIdA, seed.jobIdB].filter(Boolean);

  if (pointIds.length) {
    await admin.from("delivery_point_access_secrets").delete().in("point_id", pointIds);
    await admin.from("delivery_points").delete().in("id", pointIds);
  }
  if (jobIds.length) {
    await admin.from("delivery_jobs").delete().in("id", jobIds);
  }

  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const users = listed.data?.users || [];
  let deletedUsers = 0;
  for (const u of users) {
    if (u.email === emailA || u.email === emailB) {
      const { error } = await admin.auth.admin.deleteUser(u.id);
      if (!error) deletedUsers += 1;
    }
  }

  console.log(
    JSON.stringify({
      cleanedPoints: pointIds.length,
      cleanedJobs: jobIds.length,
      deletedUsers,
    }),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : "cleanup failed");
  process.exit(1);
});
