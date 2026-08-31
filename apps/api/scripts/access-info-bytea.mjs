/**
 * AES-256-GCM + PostgreSQL bytea helpers for delivery_point_access_secrets.
 * Never logs keys, plaintext door codes, or decrypted values.
 */
import * as crypto from "crypto";

export const ACCESS_INFO_KEY_VERSION = 1;
const NONCE_BYTES = 12;

export function parseAccessInfoKey(raw) {
  const v = raw?.trim();
  if (!v) return null;
  if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, "hex");
  try {
    const b = Buffer.from(v, "base64");
    if (b.length === 32) return b;
  } catch {
    // ignore
  }
  return null;
}

/** PostgREST / Supabase bytea wire format: \\x + hex (raw bytes, not JSON Buffer). */
export function toPgByteaHex(buf) {
  return `\\x${Buffer.from(buf).toString("hex")}`;
}

export function encryptAesGcm(key, plaintext) {
  const nonce = crypto.randomBytes(NONCE_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([enc, tag]),
    nonce,
    keyVersion: ACCESS_INFO_KEY_VERSION,
  };
}

export function decryptAesGcm(key, ciphertext, nonce, keyVersion = ACCESS_INFO_KEY_VERSION) {
  if (keyVersion !== ACCESS_INFO_KEY_VERSION) {
    throw new Error("unsupported_key_version");
  }
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Match Nest coerceBytea + service-role fetch shapes. */
export function coerceBytea(value) {
  if (Buffer.isBuffer(value)) return value;
  const s = String(value);
  if (s.startsWith("\\x") || s.startsWith("\\\\x")) {
    const hex = s.replace(/^\\+x/i, "");
    return Buffer.from(hex, "hex");
  }
  return Buffer.from(s, "base64");
}
