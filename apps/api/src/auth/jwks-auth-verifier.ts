import { createPublicKey, type KeyObject, type JsonWebKey as CryptoJwk } from "crypto";
import * as jwt from "jsonwebtoken";
import type { AuthVerifier, VerifiedAccessToken } from "./auth-verifier";
import type { AsymmetricAlg } from "./jwt-algorithm-policy";
import {
  assertRequiredAccessClaims,
  type JwtClaimExpectations,
} from "./jwt-claim-validator";

export type JwksAuthVerifierOptions = {
  jwksUri: string;
  claims: JwtClaimExpectations;
  allowedAlgorithms: readonly AsymmetricAlg[];
  /** Injected for tests — skip network. */
  fetchJwks?: () => Promise<CryptoJwk[]>;
  cacheMaxAgeMs?: number;
};

type JwkRecord = CryptoJwk & { kid?: string; alg?: string; use?: string };

/**
 * JWKS verifier using Node crypto + fetch (no jose/jwks-rsa).
 * Compatible with Supabase /auth/v1/.well-known/jwks.json (ES256/RS256/…).
 */
export class JwksAuthVerifier implements AuthVerifier {
  private cache: { keys: JwkRecord[]; fetchedAt: number } | null = null;
  private readonly cacheMaxAgeMs: number;

  constructor(private readonly options: JwksAuthVerifierOptions) {
    this.cacheMaxAgeMs = options.cacheMaxAgeMs ?? 10 * 60 * 1000;
  }

  async verifyAccessToken(token: string): Promise<VerifiedAccessToken> {
    const algorithms = [...this.options.allowedAlgorithms];
    if (algorithms.length === 0) {
      throw new Error("No asymmetric algorithms allowed");
    }

    const header = jwt.decode(token, { complete: true })?.header;
    if (!header?.kid) {
      throw new Error("Token missing kid");
    }
    if (header.alg && !algorithms.includes(header.alg as AsymmetricAlg)) {
      throw new Error("Algorithm not allowed");
    }

    const key = await this.resolvePublicKey(header.kid);
    const payload = await new Promise<jwt.JwtPayload>((resolve, reject) => {
      jwt.verify(
        token,
        key,
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

  private async resolvePublicKey(kid: string): Promise<KeyObject> {
    const keys = await this.getKeys();
    const jwk = keys.find((k) => k.kid === kid);
    if (!jwk) {
      // One refresh in case of rotation
      this.cache = null;
      const refreshed = await this.getKeys();
      const again = refreshed.find((k) => k.kid === kid);
      if (!again) {
        throw new Error("Signing key not found");
      }
      return createPublicKey({ key: again, format: "jwk" });
    }
    return createPublicKey({ key: jwk, format: "jwk" });
  }

  private async getKeys(): Promise<JwkRecord[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.fetchedAt < this.cacheMaxAgeMs) {
      return this.cache.keys;
    }

    const keys = this.options.fetchJwks
      ? ((await this.options.fetchJwks()) as JwkRecord[])
      : await this.fetchRemoteKeys();

    this.cache = { keys, fetchedAt: now };
    return keys;
  }

  private async fetchRemoteKeys(): Promise<JwkRecord[]> {
    const res = await fetch(this.options.jwksUri, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error("JWKS fetch failed");
    }
    const body = (await res.json()) as { keys?: JwkRecord[] };
    if (!Array.isArray(body.keys)) {
      throw new Error("JWKS response missing keys");
    }
    return body.keys;
  }
}
