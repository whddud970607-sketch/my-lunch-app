/**
 * AES-256-GCM access-info crypto unit tests.
 * Assertions never print plaintext/key material.
 */
import { randomBytes } from "crypto";
import { AccessInfoCryptoService } from "./access-info-crypto.service";
import { ConfigService } from "@nestjs/config";

describe("AccessInfoCryptoService", () => {
  const hexKey = randomBytes(32).toString("hex");

  function svc(): AccessInfoCryptoService {
    return new AccessInfoCryptoService({
      get: (k: string) => (k === "ACCESS_INFO_KEY" ? hexKey : undefined),
    } as ConfigService);
  }

  it("round-trips without exposing key length mismatch", () => {
    const c = svc();
    const plain = "TEST-SECRET-PLACEHOLDER";
    const enc = c.encrypt(plain);
    expect(enc.keyVersion).toBe(1);
    expect(enc.nonce.length).toBe(12);
    expect(enc.ciphertext.length).toBeGreaterThan(16);
    const out = c.decrypt(enc.ciphertext, enc.nonce, enc.keyVersion);
    expect(out).toBe(plain);
  });

  it("rejects wrong auth tag", () => {
    const c = svc();
    const enc = c.encrypt("x");
    const tampered = Buffer.from(enc.ciphertext);
    tampered[0] ^= 0xff;
    expect(() => c.decrypt(tampered, enc.nonce, 1)).toThrow();
  });
});
