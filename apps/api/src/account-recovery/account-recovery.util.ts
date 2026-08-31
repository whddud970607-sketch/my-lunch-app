import { createHash } from "crypto";

export const MIN_IDENTITY_AGE = 18;

export function normalizeKrPhoneToE164(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("82") && digits.length >= 11) {
    return `+${digits}`;
  }
  if (digits.startsWith("0") && digits.length >= 10) {
    return `+82${digits.slice(1)}`;
  }
  if (digits.length >= 10 && digits.length <= 11) {
    return `+82${digits.startsWith("0") ? digits.slice(1) : digits}`;
  }
  return null;
}

export type BirthDateValidationResult =
  | { ok: true; value: string }
  | { ok: false; reason: "length" | "invalid" };

function todayUtcDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Accepts pasted formats (YYYYMMDD, YYYY-MM-DD, slashes, dots, spaces).
 * Returns canonical YYYY-MM-DD or a user-facing validation reason.
 */
export function validateBirthDate(
  input: string,
  referenceDate: Date = todayUtcDate(),
): BirthDateValidationResult {
  const digits = input.trim().replace(/\D/g, "");
  if (digits.length !== 8) {
    return { ok: false, reason: "length" };
  }

  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return { ok: false, reason: "invalid" };
  }

  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return { ok: false, reason: "invalid" };
  }

  if (utc.getTime() > referenceDate.getTime()) {
    return { ok: false, reason: "invalid" };
  }

  const cutoff = new Date(
    Date.UTC(
      referenceDate.getUTCFullYear() - MIN_IDENTITY_AGE,
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate(),
    ),
  );
  if (utc.getTime() > cutoff.getTime()) {
    return { ok: false, reason: "invalid" };
  }

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return { ok: true, value: `${year}-${mm}-${dd}` };
}

export function normalizeBirthDate(input: string): string | null {
  const result = validateBirthDate(input);
  return result.ok ? result.value : null;
}

export function birthDateErrorMessage(result: BirthDateValidationResult): string {
  if (result.ok) return "";
  return result.reason === "length"
    ? "생년월일 8자리를 입력해주세요."
    : "생년월일을 다시 확인해주세요.";
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  if (local.length <= 2) {
    return `${local[0] ?? "*"}***@${domain}`;
  }
  return `${local.slice(0, 2)}***@${domain}`;
}

export function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export function isValidBirthDate(value: string): boolean {
  return normalizeBirthDate(value) !== null;
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8;
}
