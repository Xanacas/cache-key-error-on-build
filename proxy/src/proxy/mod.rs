pub mod handler;
pub mod tls;

use std::net::SocketAddr;
use std::sync::Arc;

use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::body::Incoming;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use tokio::net::TcpStream;
use tracing::{debug, error, info, warn};

use crate::{AppError, AppState};

// ---------------------------------------------------------------------------
// Connection entry point
// ---------------------------------------------------------------------------

/// Handle a single inbound TCP connection from a proxy client.
///
/// We peek at the first line to decide whether this is:
///   - An HTTP CONNECT tunnel request (HTTPS proxy)
///   - A plain HTTP proxy request
pub async fn handle_connection(
    stream: TcpStream,
    addr: SocketAddr,
    state: Arc<AppState>,
) -> Result<(), AppError> {
    debug!("New connection from {}", addr);

    // Read the first chunk to determine the request type.
    // We use hyper's HTTP/1 server in "proxy" mode for plain HTTP, but for
    // CONNECT we need to handle the tunnel handshake ourselves.
    //
    // Strategy: let hyper parse the first request. If it is CONNECT, we take
    // over the underlying I/O. Otherwise we process it as a normal HTTP
    // proxy request.

    let io = TokioIo::new(stream);

    // We use `with_upgrades()` so that CONNECT requests can be upgraded to
    // a raw TCP stream after we send `200 Connection Established`.
    http1::Builder::new()
        .preserve_header_case(true)
        .title_case_headers(true)
        .serve_connection(
            io,
            service_fn(move |req: Request<Incoming>| {
                let state = Arc::clone(&state);
                async move {
                    match handle_proxy_request(req, state).await {
                        Ok(resp) => Ok::<_, hyper::Error>(resp),
                        Err(e) => {
                            error!("Proxy request error: {}", e);
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
            }),
        )
        .with_upgrades()
        .await
        .map_err(AppError::Hyper)?;

    Ok(())
}

// ---------------------------------------------------------------------------
// HTTP / CONNECT dispatcher
// ---------------------------------------------------------------------------

async fn handle_proxy_request(
    req: Request<Incoming>,
    state: Arc<AppState>,
) -> Result<Response<Full<Bytes>>, AppError> {
    if req.method() == Method::CONNECT {
        handle_connect(req, state).await
    } else {
        handle_http(req, state).await
    }
}

// ---------------------------------------------------------------------------
// Plain HTTP proxy
// ---------------------------------------------------------------------------

async fn handle_http(
    req: Request<Incoming>,
    state: Arc<AppState>,
) -> Result<Response<Full<Bytes>>, AppError> {
    let method = req.method().to_string();
    let uri = req.uri().to_string();

    // Build the absolute URL. Proxy-style requests already contain the full URL.
    let url = if uri.starts_with("http://") || uri.starts_with("https://") {
        uri.clone()
    } else {
        // Fallback: reconstruct from Host header
        let host = req
            .headers()
            .get("host")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("localhost");
        format!("http://{}{}", host, uri)
    };

    // Collect headers
    let headers: Vec<(String, String)> = req
        .headers()
        .iter()
        .map(|(k, v)| (k.as_str().to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    // Read body
    let body = req.collect().await?.to_bytes();

    handler::handle_request(&state, &method, &url, &headers, body).await
}

// ---------------------------------------------------------------------------
// HTTPS CONNECT tunnel with MITM
// ---------------------------------------------------------------------------

async fn handle_connect(
    req: Request<Incoming>,
    state: Arc<AppState>,
) -> Result<Response<Full<Bytes>>, AppError> {
    // The CONNECT target is in the URI authority, e.g. "api.openai.com:443"
    let authority = req
        .uri()
        .authority()
        .map(|a| a.to_string())
        .or_else(|| {
            req.uri().host().map(|h| {
                let port = req.uri().port_u16().unwrap_or(443);
                format!("{}:{}", h, port)
            })
        })
        .unwrap_or_default();

    let (host, _port) = parse_authority(&authority);
    let domain = host.to_string();

    info!(domain = %domain, "CONNECT tunnel requested");

    // Respond with 200 to the client so it starts the TLS handshake.
    // We use hyper's upgrade mechanism to get the underlying TCP stream.
    tokio::spawn(async move {
        match hyper::upgrade::on(req).await {
            Ok(upgraded) => {
                if let Err(e) = tunnel_mitm(upgraded, domain, state).await {
                    warn!("MITM tunnel error: {}", e);
                }
            }
            Err(e) => {
                warn!("Upgrade error: {}", e);
            }
        }
    });

    // 200 tells the client the tunnel is established
    Ok(Response::builder()
        .status(StatusCode::OK)
        .body(Full::new(Bytes::new()))?)
}

/// Perform MITM TLS interception on an upgraded CONNECT stream.
///
/// 1. Accept the client TLS handshake using a dynamically generated cert
///    for the target domain.
/// 2. Parse the decrypted HTTP request from the client.
/// 3. Route through the request handler pipeline.
/// 4. Send the response back through the TLS stream.
async fn tunnel_mitm(
    upgraded: hyper::upgrade::Upgraded,
    domain: String,
    state: Arc<AppState>,
) -> Result<(), AppError> {
    let tls_acceptor = tls::get_tls_acceptor(&state, &domain)?;

    let io = TokioIo::new(upgraded);
    let stream = tls_acceptor
        .accept(io)
        .await
        .map_err(|e| AppError::Internal(format!("TLS accept failed for {}: {}", domain, e)))?;

    let tls_io = TokioIo::new(stream);

    let domain_clone = domain.clone();
    let state_clone = Arc::clone(&state);

    http1::Builder::new()
        .preserve_header_case(true)
        .title_case_headers(true)
        .serve_connection(
            tls_io,
            service_fn(move |req: Request<Incoming>| {
                let state = Arc::clone(&state_clone);
                let domain = domain_clone.clone();
                async move {
                    match handle_mitm_request(req, &domain, state).await {
                        Ok(resp) => Ok::<_, hyper::Error>(resp),
                        Err(e) => {
                            error!("MITM request error: {}", e);
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
            }),
        )
        .await
        .map_err(AppError::Hyper)?;

    Ok(())
}

/// Handle a single request inside a MITM TLS tunnel.
async fn handle_mitm_request(
    req: Request<Incoming>,
    domain: &str,
    state: Arc<AppState>,
) -> Result<Response<Full<Bytes>>, AppError> {
    let method = req.method().to_string();
    let path_and_query = req
        .uri()
        .path_and_query()
        .map(|pq| pq.to_string())
        .unwrap_or_else(|| "/".to_string());

    // Reconstruct the full HTTPS URL
    let url = format!("https://{}{}", domain, path_and_query);

    let headers: Vec<(String, String)> = req
        .headers()
        .iter()
        .map(|(k, v)| (k.as_str().to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let body = req.collect().await?.to_bytes();

    handler::handle_request(&state, &method, &url, &headers, body).await
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Parse "host:port" or just "host" from an authority string.
fn parse_authority(authority: &str) -> (&str, u16) {
    if let Some(colon_pos) = authority.rfind(':') {
        let host = &authority[..colon_pos];
        let port = authority[colon_pos + 1..]
            .parse::<u16>()
            .unwrap_or(443);
        (host, port)
    } else {
        (authority, 443)
    }
}
