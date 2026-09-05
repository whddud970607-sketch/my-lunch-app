/** Safe PostgREST/Supabase error summary. Never includes tokens, keys, or PII. */

const REDACT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+|Bearer\s+\S+|sb_secret_[A-Za-z0-9]+|sb_publishable_[A-Za-z0-9]+/gi;

export function normalizeConfigSecret(raw: string | undefined | null): string {
  return (raw ?? "").trim().replace(/^['"]+|['"]+$/g, "");
}

function sanitizeErrorText(raw: unknown): string {
  if (typeof raw !== "string") return "none";
  const cleaned = raw.replace(REDACT, "[redacted]").replace(/\s+/g, " ").trim();
  if (!cleaned) return "none";
  return cleaned.slice(0, 180);
}

export function summarizeSupabaseError(error: unknown): string {
  if (error == null || typeof error !== "object") {
    return "code=none status=none message=none details=none hint=none";
  }
  const e = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
    status?: unknown;
  };
  const code =
    typeof e.code === "string" && e.code.trim() ? e.code.trim() : "none";
  const status = typeof e.status === "number" ? String(e.status) : "none";
  return [
    `code=${code}`,
    `status=${status}`,
    `message=${sanitizeErrorText(e.message)}`,
    `details=${sanitizeErrorText(e.details)}`,
    `hint=${sanitizeErrorText(e.hint)}`,
  ].join(" ");
}
