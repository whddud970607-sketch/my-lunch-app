import type { JwtPayload } from "jsonwebtoken";

export type JwtClaimExpectations = {
  issuer: string;
  audience: string;
};

/**
 * Post-verify claim checks (issuer/aud/exp handled by library; sub/role tightened here).
 * Never log token contents.
 */
export function assertRequiredAccessClaims(
  payload: JwtPayload,
  expectations: JwtClaimExpectations,
): { userId: string; email?: string } {
  if (payload.iss !== expectations.issuer) {
    throw new Error("Invalid token issuer");
  }

  const aud = payload.aud;
  const audOk =
    aud === expectations.audience ||
    (Array.isArray(aud) && aud.includes(expectations.audience));
  if (!audOk) {
    throw new Error("Invalid token audience");
  }

  if (typeof payload.exp !== "number") {
    throw new Error("Token missing exp");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp < nowSec) {
    throw new Error("Token expired");
  }

  const userId = typeof payload.sub === "string" ? payload.sub.trim() : "";
  if (!userId) {
    throw new Error("Token missing sub");
  }

  const email =
    typeof payload.email === "string" ? payload.email : undefined;

  return { userId, email };
}

export function decodeJwtHeaderAlg(token: string): string | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[0], "base64url").toString("utf8");
    const header = JSON.parse(json) as { alg?: unknown };
    return typeof header.alg === "string" ? header.alg : null;
  } catch {
    return null;
  }
}
