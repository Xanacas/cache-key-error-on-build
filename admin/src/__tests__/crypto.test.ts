import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";

// We need to set up the master key before importing the module
const TEST_KEY = crypto.randomBytes(32);
const tmpKeyFile = path.join(os.tmpdir(), `test-master-key-${Date.now()}`);
fs.writeFileSync(tmpKeyFile, TEST_KEY);
process.env.MASTER_KEY_PATH = tmpKeyFile;

// Clear any cached key from prior imports
delete require.cache[require.resolve("@/lib/crypto")];

import { encrypt, decrypt, isEncryptionAvailable } from "@/lib/crypto";

afterAll(() => {
  try {
    fs.unlinkSync(tmpKeyFile);
  } catch {
    // ignore
  }
});

describe("crypto module", () => {
  test("encrypt/decrypt roundtrip", () => {
    const plaintext = "hello, world! this is a secret.";
    const ciphertext = encrypt(plaintext);
    const decrypted = decrypt(ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  test("different encryptions produce different ciphertexts", () => {
    const plaintext = "test data";
    const enc1 = encrypt(plaintext);
    const enc2 = encrypt(plaintext);
    // Random nonce means different ciphertexts each time
    expect(enc1).not.toBe(enc2);
  });

  test("ciphertext is valid base64", () => {
    const ciphertext = encrypt("test");
    const decoded = Buffer.from(ciphertext, "base64");
    // nonce (12) + at least 1 byte ciphertext + tag (16) = 29+ bytes
    expect(decoded.length).toBeGreaterThanOrEqual(29);
  });

  test("decrypt fails with corrupted data", () => {
    const ciphertext = encrypt("test");
    const corrupted =
      ciphertext.substring(0, ciphertext.length - 4) + "AAAA";
    expect(() => decrypt(corrupted)).toThrow();
  });

  test("decrypt fails with too-short input", () => {
    const short = Buffer.from("too short").toString("base64");
    expect(() => decrypt(short)).toThrow("Ciphertext too short");
  });

  test("isEncryptionAvailable returns true with key file", () => {
    expect(isEncryptionAvailable()).toBe(true);
  });

  test("handles empty string", () => {
    const ciphertext = encrypt("");
    const decrypted = decrypt(ciphertext);
    expect(decrypted).toBe("");
  });

  test("handles unicode strings", () => {
    const plaintext = "Hello \u{1F600} \u4E16\u754C";
    const ciphertext = encrypt(plaintext);
    const decrypted = decrypt(ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  test("format is compatible with Rust aes-gcm (nonce || ciphertext || tag)", () => {
    const ciphertext = encrypt("test");
    const decoded = Buffer.from(ciphertext, "base64");
    // First 12 bytes = nonce
    const nonce = decoded.subarray(0, 12);
    expect(nonce.length).toBe(12);
    // Last 16 bytes = auth tag
    const tag = decoded.subarray(decoded.length - 16);
    expect(tag.length).toBe(16);
    // Middle = encrypted data
    const encrypted = decoded.subarray(12, decoded.length - 16);
    expect(encrypted.length).toBe(4); // "test" = 4 bytes
  });
});
