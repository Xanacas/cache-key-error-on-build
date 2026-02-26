import crypto from "crypto";
import fs from "fs";

const NONCE_SIZE = 12;

/**
 * AES-256-GCM encryption/decryption compatible with the Rust proxy's crypto module.
 *
 * Format: base64( nonce[12 bytes] || ciphertext || auth_tag[16 bytes] )
 *
 * The Rust `aes-gcm` crate appends the 16-byte authentication tag to the
 * ciphertext automatically. Node.js exposes it separately via `getAuthTag()`,
 * so we concatenate manually to produce the same wire format.
 */

let _masterKey: Buffer | null = null;

function loadMasterKey(): Buffer {
  // Option 1: hex-encoded key in env var
  if (process.env.ENCRYPTION_KEY) {
    const buf = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
    if (buf.length !== 32) {
      throw new Error(
        `ENCRYPTION_KEY must be 64 hex chars (32 bytes), got ${buf.length} bytes`,
      );
    }
    return buf;
  }

  // Option 2: raw 32-byte key file
  const keyPath = process.env.MASTER_KEY_PATH || "../proxy/master.key";
  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `Master key not found at ${keyPath}. Set ENCRYPTION_KEY or MASTER_KEY_PATH.`,
    );
  }

  const buf = fs.readFileSync(keyPath);
  if (buf.length !== 32) {
    throw new Error(
      `Master key file must be exactly 32 bytes, got ${buf.length}`,
    );
  }
  return buf;
}

function getMasterKey(): Buffer {
  if (!_masterKey) {
    _masterKey = loadMasterKey();
  }
  return _masterKey;
}

/**
 * Encrypt plaintext with AES-256-GCM using the shared master key.
 * Returns a base64 string: base64( nonce || ciphertext || tag ).
 */
export function encrypt(plaintext: string): string {
  const key = getMasterKey();
  const nonce = crypto.randomBytes(NONCE_SIZE);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag(); // 16 bytes

  // nonce + ciphertext + tag (matches Rust aes-gcm output)
  const combined = Buffer.concat([nonce, encrypted, tag]);
  return combined.toString("base64");
}

/**
 * Decrypt a base64-encoded ciphertext produced by `encrypt()` or by the Rust
 * proxy's `crypto::encrypt` function.
 */
export function decrypt(ciphertextB64: string): string {
  const key = getMasterKey();
  const combined = Buffer.from(ciphertextB64, "base64");

  if (combined.length < NONCE_SIZE + 16) {
    throw new Error("Ciphertext too short");
  }

  const nonce = combined.subarray(0, NONCE_SIZE);
  // aes-gcm puts the 16-byte tag at the end of the ciphertext blob
  const encrypted = combined.subarray(NONCE_SIZE, combined.length - 16);
  const tag = combined.subarray(combined.length - 16);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Returns true when the encryption subsystem is configured (master key
 * available). When false, credentials will be stored in plaintext with a
 * console warning.
 */
export function isEncryptionAvailable(): boolean {
  try {
    getMasterKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypt a value if encryption is available, otherwise return the plaintext
 * with a warning. This allows the system to work without a master key during
 * development while still encrypting in production.
 */
export function encryptIfAvailable(plaintext: string): string {
  if (isEncryptionAvailable()) {
    return encrypt(plaintext);
  }
  console.warn(
    "WARNING: Encryption key not configured. Storing credential in plaintext.",
  );
  return plaintext;
}
