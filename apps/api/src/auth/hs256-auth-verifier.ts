import * as jwt from "jsonwebtoken";
import type { AuthVerifier, VerifiedAccessToken } from "./auth-verifier";
import type { SymmetricAlg } from "./jwt-algorithm-policy";
import {
  assertRequiredAccessClaims,
  type JwtClaimExpectations,
} from "./jwt-claim-validator";

export type Hs256AuthVerifierOptions = {
  secret: string;
  claims: JwtClaimExpectations;
  allowedAlgorithms: readonly SymmetricAlg[];
};

/**
 * Shared-secret (HS256) verifier for legacy Supabase JWT secret.
 * Prefer JWKS/asymmetric when the project issues those tokens.
 */
export class Hs256AuthVerifier implements AuthVerifier {
  constructor(private readonly options: Hs256AuthVerifierOptions) {}

  async verifyAccessToken(token: string): Promise<VerifiedAccessToken> {
    const algorithms = [...this.options.allowedAlgorithms];
    if (algorithms.length === 0) {
      throw new Error("No symmetric algorithms allowed");
    }

    const payload = await new Promise<jwt.JwtPayload>((resolve, reject) => {
      jwt.verify(
        token,
        this.options.secret,
        {
          algorithms: algorithms as jwt.Algorithm[],
          audience: this.options.claims.audience,
          issuer: this.options.claims.issuer,
          complete: false,
        },
        (err, decoded) => {
          if (err || !decoded || typeof decoded === "string") {
            reject(err ?? new Error("Invalid token payload"));
            return;
          }
          resolve(decoded);
        },
      );
    });

    const { userId, email } = assertRequiredAccessClaims(
      payload,
      this.options.claims,
    );
    return { userId, email, payload };
  }
}
