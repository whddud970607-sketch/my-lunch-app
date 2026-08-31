import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const KEY_VERSION = 1;
const NONCE_BYTES = 12;

/**
 * AES-256-GCM for delivery_point_access_secrets.
 * Never log plaintext. Key from ACCESS_INFO_KEY (64-char hex or 32-byte base64).
 */
@Injectable()
export class AccessInfoCryptoService {
  private readonly logger = new Logger(AccessInfoCryptoService.name);
  private readonly key: Buffer | null;

  constructor(config: ConfigService) {
    this.key = parseAccessInfoKey(config.get<string>("ACCESS_INFO_KEY"));
    if (!this.key) {
      this.logger.warn("ACCESS_INFO_KEY not set; access-info encrypt/decrypt disabled");
    }
  }

  get keyVersion(): number {
    return KEY_VERSION;
  }

  isReady(): boolean {
    return this.key != null;
  }

  encrypt(plaintext: string): {
    ciphertext: Buffer;
    nonce: Buffer;
    keyVersion: number;
  } {
    const key = this.requireKey();
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    const enc = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return {
      ciphertext: Buffer.concat([enc, tag]),
      nonce,
      keyVersion: KEY_VERSION,
    };
  }

  decrypt(ciphertext: Buffer, nonce: Buffer, keyVersion: number): string {
    if (keyVersion !== KEY_VERSION) {
      throw new ServiceUnavailableException("unsupported access_info key version");
    }
    const key = this.requireKey();
    if (ciphertext.length < 17) {
      throw new ServiceUnavailableException("access_info ciphertext corrupt");
    }
    const tag = ciphertext.subarray(ciphertext.length - 16);
    const data = ciphertext.subarray(0, ciphertext.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8",
    );
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new ServiceUnavailableException("access-info crypto not configured");
    }
    return this.key;
  }
}

function parseAccessInfoKey(raw: string | undefined): Buffer | null {
  const v = raw?.trim();
  if (!v) return null;
  if (/^[0-9a-fA-F]{64}$/.test(v)) {
    return Buffer.from(v, "hex");
  }
  try {
    const b = Buffer.from(v, "base64");
    if (b.length === 32) return b;
  } catch {
    // ignore
  }
  return null;
}
