/**
 * Explicit algorithm allowlists — unexpected alg values are rejected.
 * Supabase: legacy shared secret = HS256; asymmetric JWKS = ES256 / RS256 (+ EdDSA).
 */
export const SYMMETRIC_ALG_ALLOWLIST = ["HS256"] as const;
export const ASYMMETRIC_ALG_ALLOWLIST = ["ES256", "RS256", "EdDSA"] as const;

export type SymmetricAlg = (typeof SYMMETRIC_ALG_ALLOWLIST)[number];
export type AsymmetricAlg = (typeof ASYMMETRIC_ALG_ALLOWLIST)[number];
export type AllowedJwtAlg = SymmetricAlg | AsymmetricAlg;

export function isSymmetricAlg(alg: string): alg is SymmetricAlg {
  return (SYMMETRIC_ALG_ALLOWLIST as readonly string[]).includes(alg);
}

export function isAsymmetricAlg(alg: string): alg is AsymmetricAlg {
  return (ASYMMETRIC_ALG_ALLOWLIST as readonly string[]).includes(alg);
}

export function parseAlgAllowlist(
  raw: string | undefined,
  fallback: readonly string[],
): string[] {
  if (!raw?.trim()) return [...fallback];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
