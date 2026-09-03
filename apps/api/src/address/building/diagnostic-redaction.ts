/** Sanitize provider/diagnostic output — no credentials or customer PII. */

const CREDENTIAL_PATTERNS = [
  /KakaoAK\s+[A-Za-z0-9_-]+/gi,
  /serviceKey=[^&\s]+/gi,
  /apiKey=[^&\s]+/gi,
  /key=[A-Za-z0-9_-]{8,}/gi,
  /Authorization:\s*\S+/gi,
];

const PII_PATTERNS = [
  /\b01[0-9]-?\d{3,4}-?\d{4}\b/g,
  /\d{3,4}호/g,
  /비밀번호|출입|공동현관/gi,
];

export function redactCredentials(text: string): string {
  let out = text;
  for (const re of CREDENTIAL_PATTERNS) {
    out = out.replace(re, "[REDACTED_CREDENTIAL]");
  }
  return out;
}

export function redactCustomerPii(text: string): string {
  let out = text;
  for (const re of PII_PATTERNS) {
    out = out.replace(re, "[REDACTED_PII]");
  }
  return out;
}

export function sanitizeOperationalError(input: {
  provider: string;
  httpStatus?: number;
  code?: string;
  message?: string;
  url?: string;
}): Record<string, string | number> {
  const safe: Record<string, string | number> = {
    provider: input.provider,
  };
  if (input.httpStatus != null) safe.httpStatus = input.httpStatus;
  if (input.code) safe.code = input.code;
  if (input.message) {
    safe.message = redactCustomerPii(redactCredentials(input.message));
  }
  if (input.url) {
    safe.urlPath = redactCredentials(input.url).split("?")[0] ?? "[REDACTED_URL]";
  }
  return safe;
}

export function assertNoSensitiveLeak(text: string): boolean {
  const combined = `${text}`;
  for (const re of [...CREDENTIAL_PATTERNS, ...PII_PATTERNS]) {
    re.lastIndex = 0;
    if (re.test(combined)) return false;
  }
  return true;
}
