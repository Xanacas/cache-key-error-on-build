mod crypto;
mod firewall;
mod llm;
mod mock;
mod oauth;
mod proxy;
mod websocket;

use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use aes_gcm::{Aes256Gcm, KeyInit};
use aes_gcm::aead::generic_array::GenericArray;
use dashmap::DashMap;
use hyper::body::Incoming;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use http_body_util::{BodyExt, Full};
use bytes::Bytes;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;
use tokio::net::TcpListener;
use tokio::signal;
use tokio::sync::Notify;
use tracing::{error, info, warn};

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

/// Per-key sliding-window rate limit tracker.
pub struct RateLimitTracker {
    /// Map from key_id -> list of request timestamps (unix millis).
    pub windows: DashMap<String, Vec<i64>>,
}

impl RateLimitTracker {
    pub fn new() -> Self {
        Self {
            windows: DashMap::new(),
        }
    }

    /// Record a hit and return `true` if the request is within limits.
    /// `max_rpm` is the maximum requests per minute for this key.
    pub fn check_and_record(&self, key_id: &str, max_rpm: i64) -> bool {
        if max_rpm <= 0 {
            return true; // unlimited
        }
        let now = chrono::Utc::now().timestamp_millis();
        let window_start = now - 60_000; // 1-minute sliding window

        let mut entry = self.windows.entry(key_id.to_string()).or_insert_with(Vec::new);
        // Evict old entries
        entry.retain(|&ts| ts > window_start);

        if (entry.len() as i64) >= max_rpm {
            return false;
        }
        entry.push(now);
        true
    }
}

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

pub struct AppState {
    pub db: SqlitePool,
    pub cert_cache: DashMap<String, (rustls::pki_types::CertificateDer<'static>, rustls::pki_types::PrivateKeyDer<'static>)>,
    pub ca: CaAuthority,
    pub encryption_key: Aes256Gcm,
    pub rate_limiter: RateLimitTracker,
    pub stats: ProxyStats,
}

// ---------------------------------------------------------------------------
// Encryption helpers
// ---------------------------------------------------------------------------

/// Load or generate the 256-bit master key persisted to `master.key`.
fn load_or_generate_master_key() -> Aes256Gcm {
    use rand::RngCore;
    use std::fs;
    use std::path::Path;

    let key_path = Path::new("master.key");
    let key_bytes: [u8; 32] = if key_path.exists() {
        let data = fs::read(key_path).expect("Failed to read master.key");
        let mut buf = [0u8; 32];
        buf.copy_from_slice(&data[..32]);
        buf
    } else {
        let mut buf = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut buf);
        fs::write(key_path, &buf).expect("Failed to write master.key");
        buf
    };

    let key = GenericArray::from_slice(&key_bytes);
    Aes256Gcm::new(key)
}

// ---------------------------------------------------------------------------
// Management API (port 8889)
// ---------------------------------------------------------------------------

async fn management_api_handler(
    req: Request<Incoming>,
    state: Arc<AppState>,
) -> Result<Response<Full<Bytes>>, AppError> {
    let path = req.uri().path().to_string();
    let method = req.method().clone();

    match (method, path.as_str()) {
        (Method::GET, "/health") => {
            let body = serde_json::json!({ "status": "ok" });
            Ok(Response::builder()
                .status(200)
                .header("Content-Type", "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(Full::new(Bytes::from(serde_json::to_vec(&body)?)))?)
        }

        (Method::POST, "/oauth/callback") => {
            let body_bytes = req.collect().await?.to_bytes();
            let payload: serde_json::Value = serde_json::from_slice(&body_bytes)
                .unwrap_or(serde_json::json!({}));

            info!(?payload, "Received OAuth callback");

            // Extract code and state from the payload
            let code = payload.get("code").and_then(|v| v.as_str()).unwrap_or("");
            let oauth_state = payload.get("state").and_then(|v| v.as_str()).unwrap_or("");

            if code.is_empty() {
                let err_body = serde_json::json!({ "error": "missing code parameter" });
                return Ok(Response::builder()
                    .status(400)
                    .header("Content-Type", "application/json")
                    .header("Access-Control-Allow-Origin", "*")
                    .body(Full::new(Bytes::from(serde_json::to_vec(&err_body)?)))?);
            }

            // Store the callback in the database for the admin to pick up
            sqlx::query(
                "INSERT INTO oauth_callbacks (code, state, received_at) VALUES (?, ?, datetime('now'))"
            )
            .bind(code)
            .bind(oauth_state)
            .execute(&state.db)
            .await
            .ok();

            let resp_body = serde_json::json!({ "status": "received" });
            Ok(Response::builder()
                .status(200)
                .header("Content-Type", "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(Full::new(Bytes::from(serde_json::to_vec(&resp_body)?)))?)
        }

        (Method::GET, "/stats") => {
            let stats = &state.stats;
            let body = serde_json::json!({
                "total_requests": stats.total_requests.load(Ordering::Relaxed),
                "blocked_requests": stats.blocked_requests.load(Ordering::Relaxed),
                "forwarded_requests": stats.forwarded_requests.load(Ordering::Relaxed),
                "manipulated_requests": stats.manipulated_requests.load(Ordering::Relaxed),
                "errors": stats.errors.load(Ordering::Relaxed),
                "active_rate_limit_keys": state.rate_limiter.windows.len(),
                "cached_certs": state.cert_cache.len(),
            });
            Ok(Response::builder()
                .status(200)
                .header("Content-Type", "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(Full::new(Bytes::from(serde_json::to_vec(&body)?)))?)
        }

        (Method::OPTIONS, _) => {
            // CORS preflight
            Ok(Response::builder()
                .status(204)
                .header("Access-Control-Allow-Origin", "*")
                .header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                .header("Access-Control-Allow-Headers", "Content-Type, Authorization")
                .body(Full::new(Bytes::new()))?)
        }

        _ => {
            let body = serde_json::json!({ "error": "not found" });
            Ok(Response::builder()
                .status(404)
                .header("Content-Type", "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(Full::new(Bytes::from(serde_json::to_vec(&body)?)))?)
        }
    }
}

// ---------------------------------------------------------------------------
// Database initialization
// ---------------------------------------------------------------------------

async fn init_database(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS apps (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS api_keys (
            id TEXT PRIMARY KEY,
            app_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            dummy_key TEXT NOT NULL UNIQUE,
            real_key_encrypted BLOB NOT NULL,
            nonce BLOB NOT NULL,
            rate_limit_rpm INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (app_id) REFERENCES apps(id)
        );

        CREATE TABLE IF NOT EXISTS firewall_rules (
            id TEXT PRIMARY KEY,
            app_id TEXT NOT NULL,
            rule_type TEXT NOT NULL,
            pattern TEXT NOT NULL,
            action TEXT NOT NULL DEFAULT 'block',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (app_id) REFERENCES apps(id)
        );

        CREATE TABLE IF NOT EXISTS registry_rules (
            id TEXT PRIMARY KEY,
            app_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            method TEXT NOT NULL,
            path_pattern TEXT NOT NULL,
            is_allowed INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (app_id) REFERENCES apps(id)
        );

        CREATE TABLE IF NOT EXISTS request_logs (
            id TEXT PRIMARY KEY,
            app_id TEXT,
            api_key_id TEXT,
            method TEXT NOT NULL,
            url TEXT NOT NULL,
            status_code INTEGER,
            action TEXT NOT NULL,
            duration_ms INTEGER,
            request_body_size INTEGER DEFAULT 0,
            response_body_size INTEGER DEFAULT 0,
            tokens_used INTEGER DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS oauth_callbacks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL,
            state TEXT,
            received_at TEXT NOT NULL
        );
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // ---- Tracing / logging ----
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_target(true)
        .init();

    info!("Starting API proxy...");

    // ---- SQLite pool ----
    let database_url =
        std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:proxy.db?mode=rwc".to_string());

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    init_database(&pool).await?;
    info!("Database initialized");

    // ---- Encryption ----
    let encryption_key = load_or_generate_master_key();
    info!("Encryption module ready");

    // ---- CA certificate ----
    let ca = CaAuthority::load_or_generate()?;
    info!("CA certificate ready");

    // ---- Shared state ----
    let state = Arc::new(AppState {
        db: pool,
        cert_cache: DashMap::new(),
        ca,
        encryption_key,
        rate_limiter: RateLimitTracker::new(),
        stats: ProxyStats::new(),
    });

    // ---- Shutdown signal ----
    let shutdown = Arc::new(Notify::new());

    // ---- Management API (port 8889) ----
    let mgmt_port: u16 = std::env::var("MGMT_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8889);

    let mgmt_addr = SocketAddr::from(([0, 0, 0, 0], mgmt_port));
    let mgmt_listener = TcpListener::bind(mgmt_addr).await?;
    info!("Management API listening on {}", mgmt_addr);

    let mgmt_state = Arc::clone(&state);
    let mgmt_shutdown = Arc::clone(&shutdown);

    let mgmt_handle = tokio::spawn(async move {
        loop {
            tokio::select! {
                accept = mgmt_listener.accept() => {
                    match accept {
                        Ok((stream, _addr)) => {
                            let st = Arc::clone(&mgmt_state);
                            tokio::spawn(async move {
                                let io = TokioIo::new(stream);
                                let svc = service_fn(move |req| {
                                    let st = Arc::clone(&st);
                                    async move {
                                        match management_api_handler(req, st).await {
                                            Ok(resp) => Ok::<_, hyper::Error>(resp),
                                            Err(e) => {
                                                error!("Management API error: {}", e);
                                                let body = serde_json::json!({ "error": e.to_string() });
                                                let resp = Response::builder()
                                                    .status(e.status_code())
                                                    .header("Content-Type", "application/json")
                                                    .body(Full::new(Bytes::from(
                                                        serde_json::to_vec(&body).unwrap_or_default(),
                                                    )))
                                                    .unwrap();
                                                Ok(resp)
                                            }
                                        }
                                    }
                                });
                                if let Err(e) = http1::Builder::new()
                                    .serve_connection(io, svc)
                                    .await
                                {
                                    warn!("Management connection error: {}", e);
                                }
                            });
                        }
                        Err(e) => {
                            error!("Management accept error: {}", e);
                        }
                    }
                }
                _ = mgmt_shutdown.notified() => {
                    info!("Management API shutting down");
                    break;
                }
            }
        }
    });

    // ---- Proxy listener (port 8888) ----
    let proxy_port: u16 = std::env::var("PROXY_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8888);

    let proxy_addr = SocketAddr::from(([0, 0, 0, 0], proxy_port));
    let proxy_listener = TcpListener::bind(proxy_addr).await?;
    info!("Proxy listening on {}", proxy_addr);

    let proxy_state = Arc::clone(&state);
    let proxy_shutdown = Arc::clone(&shutdown);

    let proxy_handle = tokio::spawn(async move {
        loop {
            tokio::select! {
                accept = proxy_listener.accept() => {
                    match accept {
                        Ok((stream, addr)) => {
                            let st = Arc::clone(&proxy_state);
                            tokio::spawn(async move {
                                if let Err(e) = proxy::handle_connection(stream, addr, st).await {
                                    warn!("Proxy connection error from {}: {}", addr, e);
                                }
                            });
                        }
                        Err(e) => {
                            error!("Proxy accept error: {}", e);
                        }
                    }
                }
                _ = proxy_shutdown.notified() => {
                    info!("Proxy shutting down");
                    break;
                }
            }
        }
    });

    // ---- Wait for CTRL+C ----
    info!("Proxy ready. Press Ctrl+C to stop.");
    signal::ctrl_c().await?;
    info!("Shutdown signal received");

    shutdown.notify_waiters();

    // Give tasks a moment to finish
    let _ = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        async {
            let _ = mgmt_handle.await;
            let _ = proxy_handle.await;
        },
    )
    .await;

    info!("Proxy stopped");
    Ok(())
}
