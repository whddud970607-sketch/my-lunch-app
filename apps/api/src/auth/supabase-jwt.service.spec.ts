import { ConfigService } from "@nestjs/config";
import * as jwt from "jsonwebtoken";
import {
  generateKeyPairSync,
  type KeyObject,
  type JsonWebKey as CryptoJwk,
} from "crypto";
import { SupabaseJwtService } from "./supabase-jwt.service";
import { Hs256AuthVerifier } from "./hs256-auth-verifier";
import { JwksAuthVerifier } from "./jwks-auth-verifier";

const issuer = "https://example.supabase.co/auth/v1";
const audience = "authenticated";
const secret = "test-jwt-secret-for-unit-only";

function exportJwk(publicKey: KeyObject): CryptoJwk & {
  kid?: string;
  alg?: string;
  use?: string;
} {
  return publicKey.export({ format: "jwk" }) as CryptoJwk & {
    kid?: string;
    alg?: string;
    use?: string;
  };
}

function hs256Service(): SupabaseJwtService {
  const service = new SupabaseJwtService({
    get: (key: string) => {
      if (key === "SUPABASE_URL") return "https://example.supabase.co";
      if (key === "SUPABASE_JWT_SECRET") return secret;
      if (key === "SUPABASE_JWKS_URL") return "";
      return undefined;
    },
  } as unknown as ConfigService);
  service.configureForTests({
    hs256: new Hs256AuthVerifier({
      secret,
      claims: { issuer, audience },
      allowedAlgorithms: ["HS256"],
    }),
    jwks: null,
    symmetricAlgs: ["HS256"],
    asymmetricAlgs: ["ES256", "RS256", "EdDSA"],
  });
  return service;
}

function signHs256(
  payload: Record<string, unknown>,
  opts: jwt.SignOptions = {},
): string {
  return jwt.sign(
    {
      email: "driver@example.com",
      role: "authenticated",
      ...payload,
    },
    secret,
    {
      algorithm: "HS256",
      issuer,
      audience,
      expiresIn: "5m",
      ...opts,
    },
  );
}

describe("SupabaseJwtService (HS256 path)", () => {
  const service = hs256Service();

  it("verifies a valid Supabase-shaped access token", async () => {
    const token = signHs256({ sub: "user-driver-1" });
    const verified = await service.verifyAccessToken(token);
    expect(verified.userId).toBe("user-driver-1");
    expect(verified.email).toBe("driver@example.com");
  });

  it("rejects invalid signature", async () => {
    const token = jwt.sign(
      { sub: "u1", aud: audience },
      "wrong-secret",
      { algorithm: "HS256", issuer, expiresIn: "5m" },
    );
    await expect(service.verifyAccessToken(token)).rejects.toBeTruthy();
  });

  it("rejects expired token", async () => {
    const token = jwt.sign(
      {
        sub: "u1",
        email: "driver@example.com",
        role: "authenticated",
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      secret,
      { algorithm: "HS256", issuer, audience },
    );
    await expect(service.verifyAccessToken(token)).rejects.toBeTruthy();
  });

  it("rejects wrong issuer", async () => {
    const token = signHs256(
      { sub: "u1" },
      { issuer: "https://evil.example/auth/v1" },
    );
    await expect(service.verifyAccessToken(token)).rejects.toBeTruthy();
  });

  it("rejects wrong audience", async () => {
    const token = signHs256({ sub: "u1" }, { audience: "anon" });
    await expect(service.verifyAccessToken(token)).rejects.toBeTruthy();
  });

  it("rejects disallowed algorithm (none)", async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" }),
    ).toString("base64url");
    const body = Buffer.from(
      JSON.stringify({
        sub: "u1",
        aud: audience,
        iss: issuer,
        exp: Math.floor(Date.now() / 1000) + 60,
      }),
    ).toString("base64url");
    const token = `${header}.${body}.`;
    await expect(service.verifyAccessToken(token)).rejects.toThrow(
      /Algorithm not allowed/,
    );
  });

  it("rejects disallowed algorithm (HS384)", async () => {
    const token = jwt.sign(
      { sub: "u1", email: "x@y.z", role: "authenticated" },
      secret,
      { algorithm: "HS384", issuer, audience, expiresIn: "5m" },
    );
    await expect(service.verifyAccessToken(token)).rejects.toThrow(
      /Algorithm not allowed/,
    );
  });

  it("rejects asymmetric alg when JWKS verifier is not configured", async () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const token = jwt.sign(
      { sub: "u1", email: "x@y.z", role: "authenticated" },
      privateKey,
      { algorithm: "ES256", issuer, audience, expiresIn: "5m", keyid: "k1" },
    );
    await expect(service.verifyAccessToken(token)).rejects.toThrow(
      /Algorithm not allowed/,
    );
  });
});

describe("SupabaseJwtService (JWKS routing)", () => {
  it("routes ES256 to JWKS verifier", async () => {
    const jwks = {
      verifyAccessToken: jest.fn().mockResolvedValue({
        userId: "jwks-user",
        email: "j@example.com",
        payload: { sub: "jwks-user" },
      }),
    };
    const service = new SupabaseJwtService({
      get: () => undefined,
    } as unknown as ConfigService);
    service.configureForTests({
      hs256: null,
      jwks: jwks as never,
      symmetricAlgs: ["HS256"],
      asymmetricAlgs: ["ES256"],
    });

    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const token = jwt.sign(
      { sub: "jwks-user", email: "j@example.com" },
      privateKey,
      { algorithm: "ES256", issuer, audience, expiresIn: "5m", keyid: "k1" },
    );

    const verified = await service.verifyAccessToken(token);
    expect(verified.userId).toBe("jwks-user");
    expect(jwks.verifyAccessToken).toHaveBeenCalledWith(token);
  });
});

describe("JwksAuthVerifier", () => {
  it("verifies ES256 token against injected JWKS", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    const jwk = exportJwk(publicKey);
    jwk.kid = "test-kid";
    jwk.alg = "ES256";
    jwk.use = "sig";

    const verifier = new JwksAuthVerifier({
      jwksUri: "https://example.invalid/jwks.json",
      claims: { issuer, audience },
      allowedAlgorithms: ["ES256"],
      fetchJwks: async () => [jwk],
    });

    const token = jwt.sign(
      {
        sub: "es-user",
        email: "es@example.com",
        role: "authenticated",
      },
      privateKey,
      {
        algorithm: "ES256",
        issuer,
        audience,
        expiresIn: "5m",
        keyid: "test-kid",
      },
    );

    const verified = await verifier.verifyAccessToken(token);
    expect(verified.userId).toBe("es-user");
  });

  it("rejects bad signature", async () => {
    const { publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const other = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const jwk = exportJwk(publicKey);
    jwk.kid = "test-kid";
    jwk.alg = "ES256";

    const verifier = new JwksAuthVerifier({
      jwksUri: "https://example.invalid/jwks.json",
      claims: { issuer, audience },
      allowedAlgorithms: ["ES256"],
      fetchJwks: async () => [jwk],
    });

    const token = jwt.sign(
      { sub: "u1", role: "authenticated" },
      other.privateKey,
      {
        algorithm: "ES256",
        issuer,
        audience,
        expiresIn: "5m",
        keyid: "test-kid",
      },
    );

    await expect(verifier.verifyAccessToken(token)).rejects.toBeTruthy();
  });

  it("rejects missing kid key", async () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const verifier = new JwksAuthVerifier({
      jwksUri: "https://example.invalid/jwks.json",
      claims: { issuer, audience },
      allowedAlgorithms: ["ES256"],
      fetchJwks: async () => [],
    });
    const token = jwt.sign(
      { sub: "u1" },
      privateKey,
      { algorithm: "ES256", issuer, audience, expiresIn: "5m", keyid: "missing" },
    );
    await expect(verifier.verifyAccessToken(token)).rejects.toBeTruthy();
  });
});
