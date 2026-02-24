use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use hyper::body::Incoming;
use hyper::Request;
use thiserror::Error;
use tokio_tungstenite::tungstenite::handshake::derive_accept_key;
use tokio_tungstenite::tungstenite::protocol::Message;
use tokio_tungstenite::{connect_async, WebSocketStream};

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
pub enum WebSocketError {
    #[error("missing Host header")]
    MissingHost,
    #[error("upstream connection failed: {0}")]
    UpstreamConnect(String),
    #[error("websocket upgrade failed: {0}")]
    UpgradeFailed(String),
    #[error("hyper error: {0}")]
    Hyper(#[from] hyper::Error),
    #[error("tungstenite error: {0}")]
    Tungstenite(#[from] tokio_tungstenite::tungstenite::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

pub type Result<T> = std::result::Result<T, WebSocketError>;

// ---------------------------------------------------------------------------
// Minimal AppState placeholder – the real one lives in the main crate.
// ---------------------------------------------------------------------------

/// A minimal representation of the shared application state.  In practice
/// this struct would live in the top-level crate; we define it here so that
/// this module can compile independently.
pub struct AppState {
    pub upstream_base: String,
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/// Returns `true` if the request headers indicate a WebSocket upgrade.
///
/// Checks for:
/// * `Connection: Upgrade`
/// * `Upgrade: websocket`
pub fn is_websocket_upgrade(headers: &[(String, String)]) -> bool {
    let mut has_upgrade_connection = false;
    let mut has_websocket_upgrade = false;

    for (name, value) in headers {
        let name_lower = name.to_lowercase();
        let value_lower = value.to_lowercase();

        if name_lower == "connection" && value_lower.contains("upgrade") {
            has_upgrade_connection = true;
        }
        if name_lower == "upgrade" && value_lower.contains("websocket") {
            has_websocket_upgrade = true;
        }
    }

    has_upgrade_connection && has_websocket_upgrade
}

/// Performs the full WebSocket proxy flow:
///
/// 1. Extracts the target URL from the original request.
/// 2. Connects to the upstream WebSocket server, optionally injecting the
///    real authentication token (`real_auth`) into the handshake request.
/// 3. Upgrades the *client* connection to a WebSocket.
/// 4. Spawns two tasks that forward frames bidirectionally between the client
///    and upstream until either side closes.
///
/// Returns a `hyper::Response` that completes the HTTP 101 upgrade on the
/// client side.
pub async fn handle_websocket_upgrade(
    req: Request<Incoming>,
    app_state: Arc<AppState>,
    real_auth: Option<String>,
) -> Result<hyper::Response<http_body_util::Empty<bytes::Bytes>>> {
    // ------------------------------------------------------------------
    // 1. Build upstream URL
    // ------------------------------------------------------------------
    let host = req
        .headers()
        .get("host")
        .and_then(|v| v.to_str().ok())
        .ok_or(WebSocketError::MissingHost)?;

    let path_and_query = req
        .uri()
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/");

    let scheme = if app_state.upstream_base.starts_with("wss") {
        "wss"
    } else {
        "ws"
    };

    let upstream_url = format!("{}://{}{}", scheme, host, path_and_query);

    // ------------------------------------------------------------------
    // 2. Build upstream handshake request
    // ------------------------------------------------------------------
    let mut upstream_request =
        tokio_tungstenite::tungstenite::handshake::client::Request::builder()
            .uri(&upstream_url);

    // Forward headers from the original request.
    for (name, value) in req.headers() {
        let name_str = name.as_str().to_lowercase();
        // Skip hop-by-hop headers that tungstenite manages itself.
        if matches!(
            name_str.as_str(),
            "host" | "connection" | "upgrade" | "sec-websocket-key" | "sec-websocket-version"
        ) {
            continue;
        }

        // Replace authorisation with the real credential if supplied.
        if name_str == "authorization" {
            if let Some(ref auth) = real_auth {
                upstream_request = upstream_request.header("Authorization", auth.as_str());
                continue;
            }
        }

        if let Ok(v) = value.to_str() {
            upstream_request = upstream_request.header(name.as_str(), v);
        }
    }

    // If the original request had no Authorization but we do have a real_auth,
    // inject it.
    if real_auth.is_some() && !req.headers().contains_key("authorization") {
        if let Some(ref auth) = real_auth {
            upstream_request = upstream_request.header("Authorization", auth.as_str());
        }
    }

    let upstream_request = upstream_request
        .body(())
        .map_err(|e| WebSocketError::UpstreamConnect(e.to_string()))?;

    // ------------------------------------------------------------------
    // 3. Connect to upstream
    // ------------------------------------------------------------------
    let (upstream_ws, _upstream_resp) = connect_async(upstream_request)
        .await
        .map_err(|e| WebSocketError::UpstreamConnect(e.to_string()))?;

    // ------------------------------------------------------------------
    // 4. Upgrade the client connection
    // ------------------------------------------------------------------
    let (client_ws, response) = upgrade_client_connection(req).await?;

    // ------------------------------------------------------------------
    // 5. Bidirectional forwarding
    // ------------------------------------------------------------------
    spawn_bidirectional_pipe(client_ws, upstream_ws);

    Ok(response)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Upgrades the inbound HTTP request to a WebSocket connection on the client
/// side using `hyper`'s upgrade mechanism, returning the WebSocket stream and
/// the 101 Switching Protocols response.
async fn upgrade_client_connection(
    req: Request<Incoming>,
) -> Result<(
    WebSocketStream<hyper_util::rt::TokioIo<hyper::upgrade::Upgraded>>,
    hyper::Response<http_body_util::Empty<bytes::Bytes>>,
)> {
    // Derive the `Sec-WebSocket-Accept` value from the client's key.
    let ws_key = req
        .headers()
        .get("sec-websocket-key")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let accept_value = derive_accept_key(ws_key.as_bytes());

    // Build the 101 response.
    let response = hyper::Response::builder()
        .status(hyper::StatusCode::SWITCHING_PROTOCOLS)
        .header("Upgrade", "websocket")
        .header("Connection", "Upgrade")
        .header("Sec-WebSocket-Accept", accept_value)
        .body(http_body_util::Empty::new())
        .map_err(|e| WebSocketError::UpgradeFailed(e.to_string()))?;

    // Perform the actual upgrade on the underlying connection.
    let upgraded = hyper::upgrade::on(req)
        .await
        .map_err(|e| WebSocketError::UpgradeFailed(e.to_string()))?;

    let io = hyper_util::rt::TokioIo::new(upgraded);
    let ws = WebSocketStream::from_raw_socket(
        io,
        tokio_tungstenite::tungstenite::protocol::Role::Server,
        None,
    )
    .await;

    Ok((ws, response))
}

/// Spawns two `tokio` tasks that forward frames in both directions.  When
/// either direction closes or errors the other is also shut down.
fn spawn_bidirectional_pipe<S, U>(client: WebSocketStream<S>, upstream: WebSocketStream<U>)
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
    U: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let (mut client_sink, mut client_stream) = client.split();
    let (mut upstream_sink, mut upstream_stream) = upstream.split();

    // Client -> Upstream
    let c2u = tokio::spawn(async move {
        while let Some(msg) = client_stream.next().await {
            match msg {
                Ok(Message::Close(_)) | Err(_) => break,
                Ok(frame) => {
                    if upstream_sink.send(frame).await.is_err() {
                        break;
                    }
                }
            }
        }
        let _ = upstream_sink.close().await;
    });

    // Upstream -> Client
    let u2c = tokio::spawn(async move {
        while let Some(msg) = upstream_stream.next().await {
            match msg {
                Ok(Message::Close(_)) | Err(_) => break,
                Ok(frame) => {
                    if client_sink.send(frame).await.is_err() {
                        break;
                    }
                }
            }
        }
        let _ = client_sink.close().await;
    });

    // When one direction finishes, abort the other so we don't leak tasks.
    tokio::spawn(async move {
        tokio::select! {
            _ = c2u => {}
            _ = u2c => {}
        }
    });
}

