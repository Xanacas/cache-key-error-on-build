use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rand::RngCore;
use std::path::Path;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum CryptoError {
    #[error("encryption failed: {0}")]
    EncryptionFailed(String),

    #[error("decryption failed: {0}")]
    DecryptionFailed(String),

    #[error("base64 decode error: {0}")]
    Base64Decode(#[from] base64::DecodeError),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("invalid key length")]
    InvalidKeyLength,

    #[error("invalid ciphertext: too short")]
    CiphertextTooShort,
}

/// Nonce size for AES-256-GCM (96 bits / 12 bytes).
const NONCE_SIZE: usize = 12;

/// Load an existing master key from the given file path, or generate a new one
/// and persist it to disk. The key is 32 bytes (256 bits) suitable for
/// AES-256-GCM.
pub fn load_or_generate_master_key(path: &str) -> Result<[u8; 32], CryptoError> {
    let key_path = Path::new(path);

    if key_path.exists() {
        let raw = std::fs::read(key_path)?;
        if raw.len() != 32 {
            return Err(CryptoError::InvalidKeyLength);
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(&raw);
        Ok(key)
    } else {
        // Ensure parent directory exists.
        if let Some(parent) = key_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let mut key = [0u8; 32];
        OsRng.fill_bytes(&mut key);
        std::fs::write(key_path, &key)?;
        Ok(key)
    }
}

/// Encrypt `plaintext` using AES-256-GCM with the provided 256-bit `key`.
///
/// A random 12-byte nonce is generated and prepended to the ciphertext before
/// the combined bytes are base64-encoded. The returned string is safe to store
/// in a database text column.
pub fn encrypt(plaintext: &str, key: &[u8; 32]) -> Result<String, CryptoError> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;

    let mut nonce_bytes = [0u8; NONCE_SIZE];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;

    // Prepend the nonce to the ciphertext so we can recover it during
    // decryption.
    let mut combined = Vec::with_capacity(NONCE_SIZE + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);

    Ok(BASE64.encode(&combined))
}

/// Decrypt a base64-encoded ciphertext that was produced by [`encrypt`].
///
/// The first 12 bytes of the decoded payload are treated as the nonce; the
/// remainder is the AES-256-GCM ciphertext + authentication tag.
pub fn decrypt(ciphertext: &str, key: &[u8; 32]) -> Result<String, CryptoError> {
    let combined = BASE64.decode(ciphertext)?;

    if combined.len() < NONCE_SIZE {
        return Err(CryptoError::CiphertextTooShort);
    }

    let (nonce_bytes, encrypted) = combined.split_at(NONCE_SIZE);
    let nonce = Nonce::from_slice(nonce_bytes);

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| CryptoError::DecryptionFailed(e.to_string()))?;

    let plaintext = cipher
        .decrypt(nonce, encrypted)
        .map_err(|e| CryptoError::DecryptionFailed(e.to_string()))?;

    String::from_utf8(plaintext)
        .map_err(|e| CryptoError::DecryptionFailed(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let key = {
            let mut k = [0u8; 32];
            OsRng.fill_bytes(&mut k);
            k
        };

        let original = "hello, world! this is a secret message.";
        let encrypted = encrypt(original, &key).expect("encryption should succeed");
        let decrypted = decrypt(&encrypted, &key).expect("decryption should succeed");

        assert_eq!(original, decrypted);
    }

    #[test]
    fn test_different_encryptions_produce_different_ciphertexts() {
        let key = {
            let mut k = [0u8; 32];
            OsRng.fill_bytes(&mut k);
            k
        };

        let original = "test data";
        let enc1 = encrypt(original, &key).unwrap();
        let enc2 = encrypt(original, &key).unwrap();

        // Because the nonce is random each time, the ciphertexts must differ.
        assert_ne!(enc1, enc2);
    }

    #[test]
    fn test_decrypt_with_wrong_key_fails() {
        let key1 = {
            let mut k = [0u8; 32];
            OsRng.fill_bytes(&mut k);
            k
        };
        let key2 = {
            let mut k = [0u8; 32];
            OsRng.fill_bytes(&mut k);
            k
        };

        let encrypted = encrypt("secret", &key1).unwrap();
        let result = decrypt(&encrypted, &key2);
        assert!(result.is_err());
    }

    #[test]
    fn test_ciphertext_too_short() {
        let key = [0u8; 32];
        let short = BASE64.encode(&[0u8; 5]);
        let result = decrypt(&short, &key);
        assert!(matches!(result, Err(CryptoError::CiphertextTooShort)));
    }
}
