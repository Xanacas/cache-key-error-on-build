pub mod crypto;
pub mod db;
pub mod firewall;
pub mod llm;
pub mod mock;
pub mod oauth;
pub mod proxy;
pub mod websocket;

use std::sync::atomic::AtomicU64;

use dashmap::DashMap;
use hyper::StatusCode;

use crate::proxy::tls::CaAuthority;

// ---------------------------------------------------------------------------
// Application-wide error type
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Hyper error: {0}")]
    Hyper(#[from] hyper::Error),

    #[error("HTTP error: {0}")]
    Http(#[from] hyper::http::Error),

    #[error("SQLx error: {0}")]
    Sqlx(#[from] sqlx::Error),

    #[error("TLS error: {0}")]
    Tls(#[from] tokio_rustls::rustls::Error),

    #[error("Reqwest error: {0}")]
    Reqwest(#[from] reqwest::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Rcgen error: {0}")]
    Rcgen(#[from] rcgen::Error),

    #[error("Base64 decode error: {0}")]
    Base64(#[from] base64::DecodeError),

    #[error("URL parse error: {0}")]
    UrlParse(#[from] url::ParseError),

    #[error("Request blocked: {0}")]
    Blocked(String),

    #[error("Rate limited")]
    RateLimited,

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Internal: {0}")]
    Internal(String),
}

impl AppError {
    pub fn status_code(&self) -> StatusCode {
        match self {
            AppError::Blocked(_) => StatusCode::FORBIDDEN,
            AppError::RateLimited => StatusCode::TOO_MANY_REQUESTS,
            AppError::NotFound(_) => StatusCode::NOT_FOUND,
            AppError::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

// ---------------------------------------------------------------------------
// Shared application state
// ---------------------------------------------------------------------------

/// Proxy statistics counters.
pub struct ProxyStats {
    pub total_requests: AtomicU64,
    pub blocked_requests: AtomicU64,
    pub forwarded_requests: AtomicU64,
    pub manipulated_requests: AtomicU64,
    pub errors: AtomicU64,
}

impl ProxyStats {
    pub fn new() -> Self {
        Self {
            total_requests: AtomicU64::new(0),
            blocked_requests: AtomicU64::new(0),
            forwarded_requests: AtomicU64::new(0),
            manipulated_requests: AtomicU64::new(0),
            errors: AtomicU64::new(0),
        }
    }
}

impl Default for ProxyStats {
    fn default() -> Self {
        Self::new()
    }
}

pub struct AppState {
    /// Unified database layer (tables match the Prisma schema in admin/).
    pub database: db::Database,
    pub cert_cache: DashMap<String, (rustls::pki_types::CertificateDer<'static>, rustls::pki_types::PrivateKeyDer<'static>)>,
    pub ca: CaAuthority,
    /// Raw 32-byte AES-256 master key used by the `crypto` module.
    pub encryption_key: [u8; 32],
    /// Per-app-per-domain rate limit tracker (from the firewall module).
    pub rate_limiter: firewall::RateLimitTracker,
    pub stats: ProxyStats,
}
