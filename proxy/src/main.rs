use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::Ordering;

use dashmap::DashMap;
use hyper::body::Incoming;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, Response};
use hyper_util::rt::TokioIo;
use http_body_util::{BodyExt, Full};
use bytes::Bytes;
use tokio::net::TcpListener;
use tokio::signal;
use tokio::sync::Notify;
use tracing::{error, info, warn};

use api_proxy::{AppError, AppState, ProxyStats};
use api_proxy::{crypto, db, firewall, proxy};
use api_proxy::proxy::tls::CaAuthority;

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
        (Method::GET, "/ca.pem") => {
            let pem = state.ca.ca_cert_pem();
            Ok(Response::builder()
                .status(200)
                .header("Content-Type", "application/x-pem-file")
                .header("Content-Disposition", "attachment; filename=\"api-proxy-ca.pem\"")
                .header("Access-Control-Allow-Origin", "*")
                .body(Full::new(Bytes::from(pem)))?)
        }

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

            sqlx::query(
                "INSERT INTO oauth_callbacks (code, state, received_at) VALUES (?, ?, datetime('now'))"
            )
            .bind(code)
            .bind(oauth_state)
            .execute(state.database.pool())
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
                "cached_certs": state.cert_cache.len(),
            });
            Ok(Response::builder()
                .status(200)
                .header("Content-Type", "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(Full::new(Bytes::from(serde_json::to_vec(&body)?)))?)
        }

        (Method::OPTIONS, _) => {
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
// Entry point
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_target(true)
        .init();

    info!("Starting API proxy...");

    // ---- Database (unified schema matching Prisma) ----
    let database_path =
        std::env::var("DATABASE_PATH").unwrap_or_else(|_| "data/proxy.db".to_string());
    let database = db::Database::new(&database_path)
        .await
        .map_err(|e| AppError::Internal(format!("Database init failed: {}", e)))?;
    info!("Database initialized (unified schema)");

    // ---- Encryption (shared master key) ----
    let key_path = std::env::var("MASTER_KEY_PATH")
        .unwrap_or_else(|_| "master.key".to_string());
    let encryption_key = crypto::load_or_generate_master_key(&key_path)
        .map_err(|e| AppError::Internal(format!("Master key error: {}", e)))?;
    info!("Encryption module ready");

    // ---- CA certificate ----
    let ca = CaAuthority::load_or_generate()?;
    info!("CA certificate ready");

    // ---- Shared state ----
    let state = Arc::new(AppState {
        database,
        cert_cache: DashMap::new(),
        ca,
        encryption_key,
        rate_limiter: firewall::RateLimitTracker::new(),
        stats: ProxyStats::new(),
    });

    // ---- Shutdown signal ----
    let shutdown = Arc::new(Notify::new());

    // ---- Management API ----
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

    // ---- Proxy listener ----
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

    info!("Proxy ready. Press Ctrl+C to stop.");
    signal::ctrl_c().await?;
    info!("Shutdown signal received");

    shutdown.notify_waiters();

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
