use chrono::NaiveDateTime;
use reqwest::Client;
use serde::Deserialize;
use thiserror::Error;

use crate::crypto;

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
pub enum OAuthError {
    #[error("missing provider auth_url")]
    MissingAuthUrl,
    #[error("missing provider token_url")]
    MissingTokenUrl,
    #[error("missing client_id on credential")]
    MissingClientId,
    #[error("missing client_secret on credential")]
    MissingClientSecret,
    #[error("missing redirect_url on provider")]
    MissingRedirectUrl,
    #[error("encryption error: {0}")]
    Encryption(String),
    #[error("decryption error: {0}")]
    Decryption(String),
    #[error("http request failed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("token response missing access_token")]
    MissingAccessToken,
}

pub type Result<T> = std::result::Result<T, OAuthError>;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

pub struct TokenData {
    pub access_token_encrypted: String,
    pub refresh_token_encrypted: Option<String>,
    pub expires_at: Option<NaiveDateTime>,
    pub token_type: String,
    pub scope: Option<String>,
}

pub struct Provider {
    pub auth_url: Option<String>,
    pub token_url: Option<String>,
    pub refresh_url: Option<String>,
    pub scopes: Option<String>,
    pub redirect_url: Option<String>,
}

pub struct Credential {
    pub client_id: Option<String>,
    pub client_secret_encrypted: Option<String>,
}

// ---------------------------------------------------------------------------
// Internal: raw token response from the OAuth provider
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
    token_type: Option<String>,
    scope: Option<String>,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Builds the full OAuth authorization URL that the end-user should be
/// redirected to.  Includes `client_id`, `redirect_uri`, `scope`, `state`,
/// and `response_type=code`.
pub fn generate_auth_url(provider: &Provider, credential: &Credential, state: &str) -> String {
    let base = provider.auth_url.as_deref().unwrap_or_default();
    let client_id = credential.client_id.as_deref().unwrap_or_default();
    let redirect_uri = provider.redirect_url.as_deref().unwrap_or_default();
    let scopes = provider.scopes.as_deref().unwrap_or_default();

    let separator = if base.contains('?') { '&' } else { '?' };

    format!(
        "{base}{sep}response_type=code&client_id={client_id}&redirect_uri={redirect_uri}&scope={scopes}&state={state}",
        base = base,
        sep = separator,
        client_id = urlencoding(client_id),
        redirect_uri = urlencoding(redirect_uri),
        scopes = urlencoding(scopes),
        state = urlencoding(state),
    )
}

/// Exchanges an authorization `code` for an access / refresh token pair.
///
/// The returned tokens are encrypted with the supplied `encryption_key` before
/// being placed into [`TokenData`].
pub async fn exchange_code_for_token(
    provider: &Provider,
    credential: &Credential,
    code: &str,
    encryption_key: &[u8; 32],
) -> Result<TokenData> {
    let token_url = provider.token_url.as_deref().ok_or(OAuthError::MissingTokenUrl)?;
    let client_id = credential.client_id.as_deref().ok_or(OAuthError::MissingClientId)?;
    let client_secret_enc = credential
        .client_secret_encrypted
        .as_deref()
        .ok_or(OAuthError::MissingClientSecret)?;
    let redirect_uri = provider
        .redirect_url
        .as_deref()
        .ok_or(OAuthError::MissingRedirectUrl)?;

    let client_secret = crypto::decrypt(client_secret_enc, encryption_key)
        .map_err(|e| OAuthError::Decryption(e.to_string()))?;

    let params = [
        ("grant_type", "authorization_code"),
        ("code", code),
        ("client_id", client_id),
        ("client_secret", &client_secret),
        ("redirect_uri", redirect_uri),
    ];

    let client = Client::new();
    let resp = client
        .post(token_url)
        .form(&params)
        .send()
        .await?
        .error_for_status()?;

    let body: TokenResponse = resp.json().await?;
    token_response_to_data(body, encryption_key)
}

/// Refreshes an access token using an encrypted refresh token.
///
/// The refresh token is decrypted, sent to the provider, and the new tokens
/// are encrypted before being returned.
pub async fn refresh_access_token(
    provider: &Provider,
    credential: &Credential,
    refresh_token_encrypted: &str,
    encryption_key: &[u8; 32],
) -> Result<TokenData> {
    let token_url = provider
        .refresh_url
        .as_deref()
        .or(provider.token_url.as_deref())
        .ok_or(OAuthError::MissingTokenUrl)?;

    let client_id = credential.client_id.as_deref().ok_or(OAuthError::MissingClientId)?;
    let client_secret_enc = credential
        .client_secret_encrypted
        .as_deref()
        .ok_or(OAuthError::MissingClientSecret)?;

    let client_secret = crypto::decrypt(client_secret_enc, encryption_key)
        .map_err(|e| OAuthError::Decryption(e.to_string()))?;
    let refresh_token = crypto::decrypt(refresh_token_encrypted, encryption_key)
        .map_err(|e| OAuthError::Decryption(e.to_string()))?;

    let params = [
        ("grant_type", "refresh_token"),
        ("refresh_token", &refresh_token),
        ("client_id", client_id),
        ("client_secret", &client_secret),
    ];

    let client = Client::new();
    let resp = client
        .post(token_url)
        .form(&params)
        .send()
        .await?
        .error_for_status()?;

    let body: TokenResponse = resp.json().await?;
    token_response_to_data(body, encryption_key)
}

/// Returns `true` when the token has expired (or if `expires_at` is `None`,
/// conservatively returns `true`).
pub fn is_token_expired(expires_at: Option<&NaiveDateTime>) -> bool {
    match expires_at {
        Some(exp) => chrono::Utc::now().naive_utc() >= *exp,
        None => true,
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn token_response_to_data(resp: TokenResponse, key: &[u8; 32]) -> Result<TokenData> {
    let access_token = resp.access_token.ok_or(OAuthError::MissingAccessToken)?;

    let access_token_encrypted =
        crypto::encrypt(&access_token, key).map_err(|e| OAuthError::Encryption(e.to_string()))?;

    let refresh_token_encrypted = match resp.refresh_token {
        Some(rt) => Some(
            crypto::encrypt(&rt, key).map_err(|e| OAuthError::Encryption(e.to_string()))?,
        ),
        None => None,
    };

    let expires_at = resp.expires_in.map(|secs| {
        (chrono::Utc::now() + chrono::Duration::seconds(secs)).naive_utc()
    });

    Ok(TokenData {
        access_token_encrypted,
        refresh_token_encrypted,
        expires_at,
        token_type: resp.token_type.unwrap_or_else(|| "Bearer".to_string()),
        scope: resp.scope,
    })
}

/// Minimal percent-encoding for URL query parameter values.
fn urlencoding(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for b in input.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}
