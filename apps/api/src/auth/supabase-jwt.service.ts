import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AuthVerifier, VerifiedAccessToken } from "./auth-verifier";
import { Hs256AuthVerifier } from "./hs256-auth-verifier";
import { JwksAuthVerifier } from "./jwks-auth-verifier";
import {
  ASYMMETRIC_ALG_ALLOWLIST,
  SYMMETRIC_ALG_ALLOWLIST,
  isAsymmetricAlg,
  isSymmetricAlg,
  parseAlgAllowlist,
  type AsymmetricAlg,
  type SymmetricAlg,
} from "./jwt-algorithm-policy";
import { decodeJwtHeaderAlg } from "./jwt-claim-validator";

/**
 * Facade AuthVerifier: routes by JWT header alg to HS256 or JWKS.
 * Does not log tokens, secrets, or service_role keys.
 */
@Injectable()
export class SupabaseJwtService implements AuthVerifier, OnModuleInit {
  private readonly logger = new Logger(SupabaseJwtService.name);
  private hs256: AuthVerifier | null = null;
  private jwks: AuthVerifier | null = null;
  private symmetricAlgs: SymmetricAlg[] = [];
  private asymmetricAlgs: AsymmetricAlg[] = [];
  private enabledAlgs = new Set<string>();

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>("SUPABASE_URL")?.replace(/\/$/, "");
    const secret = this.config.get<string>("SUPABASE_JWT_SECRET");
    const jwksUri =
      this.config.get<string>("SUPABASE_JWKS_URL") ??
      (url ? `${url}/auth/v1/.well-known/jwks.json` : undefined);

    const claims = {
      issuer: url ? `${url}/auth/v1` : "",
      audience: this.config.get<string>("SUPABASE_JWT_AUDIENCE") ?? "authenticated",
    };

    this.symmetricAlgs = parseAlgAllowlist(
      this.config.get<string>("AUTH_JWT_SYMMETRIC_ALGS"),
      SYMMETRIC_ALG_ALLOWLIST,
    ).filter(isSymmetricAlg);

    this.asymmetricAlgs = parseAlgAllowlist(
      this.config.get<string>("AUTH_JWT_ASYMMETRIC_ALGS"),
      ASYMMETRIC_ALG_ALLOWLIST,
    ).filter(isAsymmetricAlg);

    if (secret && claims.issuer && this.symmetricAlgs.length > 0) {
      this.hs256 = new Hs256AuthVerifier({
        secret,
        claims,
        allowedAlgorithms: this.symmetricAlgs,
      });
      for (const alg of this.symmetricAlgs) this.enabledAlgs.add(alg);
    }

    if (jwksUri && claims.issuer && this.asymmetricAlgs.length > 0) {
      this.jwks = new JwksAuthVerifier({
        jwksUri,
        claims,
        allowedAlgorithms: this.asymmetricAlgs,
      });
      for (const alg of this.asymmetricAlgs) this.enabledAlgs.add(alg);
    }

    if (!this.hs256 && !this.jwks) {
      this.logger.warn(
        "No JWT verifier configured (need SUPABASE_URL + JWKS and/or SUPABASE_JWT_SECRET)",
      );
    } else {
      this.logger.log(
        `JWT verifiers ready: hs256=${Boolean(this.hs256)} jwks=${Boolean(this.jwks)} algs=${[...this.enabledAlgs].join(",")}`,
      );
    }
  }

  /** Test / DI helper when constructing outside Nest lifecycle. */
  configureForTests(args: {
    hs256?: AuthVerifier | null;
    jwks?: AuthVerifier | null;
    symmetricAlgs?: SymmetricAlg[];
    asymmetricAlgs?: AsymmetricAlg[];
  }) {
    this.hs256 = args.hs256 ?? null;
    this.jwks = args.jwks ?? null;
    this.symmetricAlgs = args.symmetricAlgs ?? [...SYMMETRIC_ALG_ALLOWLIST];
    this.asymmetricAlgs = args.asymmetricAlgs ?? [...ASYMMETRIC_ALG_ALLOWLIST];
    this.enabledAlgs = new Set([
      ...this.symmetricAlgs,
      ...this.asymmetricAlgs,
    ]);
    if (!this.hs256) {
      this.enabledAlgs = new Set(
        [...this.enabledAlgs].filter((a) => !isSymmetricAlg(a)),
      );
    }
    if (!this.jwks) {
      this.enabledAlgs = new Set(
        [...this.enabledAlgs].filter((a) => !isAsymmetricAlg(a)),
      );
    }
  }

  async verifyAccessToken(token: string): Promise<VerifiedAccessToken> {
    const alg = decodeJwtHeaderAlg(token);
    if (!alg) {
      throw new Error("Invalid token header");
    }

    if (!this.enabledAlgs.has(alg)) {
      throw new Error("Algorithm not allowed");
    }

    if (isSymmetricAlg(alg)) {
      if (!this.hs256) {
        throw new Error("Symmetric JWT verifier is not configured");
      }
      return this.hs256.verifyAccessToken(token);
    }

    if (isAsymmetricAlg(alg)) {
      if (!this.jwks) {
        throw new Error("JWKS JWT verifier is not configured");
      }
      return this.jwks.verifyAccessToken(token);
    }

    throw new Error("Algorithm not allowed");
  }
}
