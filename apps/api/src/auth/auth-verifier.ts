import type { JwtPayload } from "jsonwebtoken";

/**
 * Pluggable access-token verifier.
 * Swap HS256 / JWKS implementations without changing AuthGuard.
 */
export interface AuthVerifier {
  verifyAccessToken(token: string): Promise<VerifiedAccessToken>;
}

export type VerifiedAccessToken = {
  userId: string;
  email?: string;
  payload: JwtPayload;
};

export const AUTH_VERIFIER = Symbol("AUTH_VERIFIER");
