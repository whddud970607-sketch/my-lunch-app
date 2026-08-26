import {
  assertRequiredAccessClaims,
  decodeJwtHeaderAlg,
} from "./jwt-claim-validator";

describe("jwt-claim-validator", () => {
  const claims = {
    issuer: "https://example.supabase.co/auth/v1",
    audience: "authenticated",
  };

  it("decodes alg from header", () => {
    const header = Buffer.from(JSON.stringify({ alg: "ES256", typ: "JWT" })).toString(
      "base64url",
    );
    expect(decodeJwtHeaderAlg(`${header}.e30.`)).toBe("ES256");
  });

  it("requires sub and exp", () => {
    expect(() =>
      assertRequiredAccessClaims(
        {
          iss: claims.issuer,
          aud: claims.audience,
          exp: Math.floor(Date.now() / 1000) + 60,
        },
        claims,
      ),
    ).toThrow(/sub/);
  });
});
