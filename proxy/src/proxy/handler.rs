use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::time::Instant;

use aes_gcm::aead::Aead;
use aes_gcm::Nonce;
use bytes::Bytes;
use http_body_util::Full;
use hyper::{Response, StatusCode};
use regex::Regex;
use tracing::{debug, info, warn};

use crate::{AppError, AppState};

// ---------------------------------------------------------------------------
// Database row types
// ---------------------------------------------------------------------------

#[derive(Debug, sqlx::FromRow)]
struct ApiKeyRow {
    id: String,
    app_id: String,
    provider: String,
    real_key_encrypted: Vec<u8>,
    nonce: Vec<u8>,
    rate_limit_rpm: i64,
    is_active: bool,
}

#[derive(Debug, sqlx::FromRow)]
struct FirewallRuleRow {
    id: String,
    rule_type: String,
    pattern: String,
    action: String,
}

#[derive(Debug, sqlx::FromRow)]
struct RegistryRuleRow {
    id: String,
    method: String,
    path_pattern: String,
    is_allowed: bool,
}

// ---------------------------------------------------------------------------
// Request action result
// ---------------------------------------------------------------------------

#[derive(Debug)]
enum RequestAction {
    /// Replace the dummy auth with the real credential and forward.
    Manipulate {
        api_key_row: ApiKeyRow,
        real_key: String,
    },
    /// Forward the request unchanged (no matching dummy key).
    Passthrough,
    /// Block the request entirely.
    Block(String),
}

// ---------------------------------------------------------------------------
// Public handler entry-point
// ---------------------------------------------------------------------------

/// Process a proxied HTTP request. This is the main request pipeline.
///
/// Returns an HTTP response to send back to the client.
pub async fn handle_request(
    state: &Arc<AppState>,
    method: &str,
    url: &str,
    headers: &[(String, String)],
    body: Bytes,
) -> Result<Response<Full<Bytes>>, AppError> {
    let start = Instant::now();

    state.stats.total_requests.fetch_add(1, Ordering::Relaxed);

    // ---- Extract host from URL ----
    let parsed_url = url::Url::parse(url)
        .map_err(|e| AppError::Internal(format!("Invalid URL: {}", e)))?;
    let host = parsed_url
        .host_str()
        .unwrap_or("")
        .to_string();
    let path = parsed_url.path().to_string();

    debug!(method, url, host = %host, "Processing request");

    // ---- Extract Authorization header ----
    let auth_header = headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case("authorization"))
        .map(|(_, v)| v.clone());

    // ---- Determine action ----
    let action = determine_action(state, &host, &path, method, auth_header.as_deref()).await?;

    // ---- Execute action ----
    let (response, action_label, app_id, api_key_id) = match action {
        RequestAction::Block(reason) => {
            state.stats.blocked_requests.fetch_add(1, Ordering::Relaxed);
            warn!(url, reason = %reason, "Request blocked");
            let body_json = serde_json::json!({
                "error": "blocked",
                "reason": reason,
            });
            let resp = Response::builder()
                .status(StatusCode::FORBIDDEN)
                .header("Content-Type", "application/json")
                .body(Full::new(Bytes::from(serde_json::to_vec(&body_json)?)))?;
            (resp, "blocked", None, None)
        }

        RequestAction::Passthrough => {
            state.stats.forwarded_requests.fetch_add(1, Ordering::Relaxed);
            debug!(url, "Passthrough (no matching key)");
            let resp = forward_request(method, url, headers, body, None).await?;
            (resp, "passthrough", None, None)
        }

        RequestAction::Manipulate { api_key_row, real_key } => {
            state.stats.manipulated_requests.fetch_add(1, Ordering::Relaxed);
            info!(url, app_id = %api_key_row.app_id, "Manipulating auth header");
            let app_id = Some(api_key_row.app_id.clone());
            let key_id = Some(api_key_row.id.clone());
            let resp = forward_request(method, url, headers, body, Some(&real_key)).await?;
            (resp, "manipulated", app_id, key_id)
        }
    };

    // ---- Logging ----
    let duration_ms = start.elapsed().as_millis() as i64;
    let status_code = response.status().as_u16() as i64;

    let resp_body_size = {
        use hyper::body::Body;
        response.body().size_hint().lower() as i64
    };

    // Estimate token usage for LLM APIs
    let tokens_used = estimate_tokens(&host, &path, status_code);

    log_request(
        state,
        app_id.as_deref(),
        api_key_id.as_deref(),
        method,
        url,
        status_code,
        action_label,
        duration_ms,
        0,
        resp_body_size,
        tokens_used,
    )
    .await;

    Ok(response)
}

// ---------------------------------------------------------------------------
// Pipeline: determine what to do with this request
// ---------------------------------------------------------------------------

async fn determine_action(
    state: &Arc<AppState>,
    host: &str,
    path: &str,
    method: &str,
    auth_header: Option<&str>,
) -> Result<RequestAction, AppError> {
    // 1. Try to match the Authorization header to a dummy key in the DB.
    let api_key_row = if let Some(auth) = auth_header {
        let dummy_key = extract_bearer_or_basic(auth);
        lookup_api_key(state, &dummy_key).await?
    } else {
        None
    };

    let api_key_row = match api_key_row {
        Some(row) => row,
        None => return Ok(RequestAction::Passthrough),
    };

    // We matched a dummy key, so we have an app context.

    // 2. Check if key is active.
    if !api_key_row.is_active {
        return Ok(RequestAction::Block("API key is disabled".to_string()));
    }

    // 3. Check firewall rules for this app.
    if let Some(reason) = check_firewall(state, &api_key_row.app_id, host, path).await? {
        return Ok(RequestAction::Block(reason));
    }

    // 4. Check registry rules (allowed methods/paths).
    if !check_registry(state, &api_key_row.app_id, &api_key_row.provider, method, path).await? {
        return Ok(RequestAction::Block(format!(
            "Method/path not allowed: {} {}",
            method, path
        )));
    }

    // 5. Check rate limits.
    if !state
        .rate_limiter
        .check_and_record(&api_key_row.id, api_key_row.rate_limit_rpm)
    {
        return Ok(RequestAction::Block("Rate limit exceeded".to_string()));
    }

    // 6. Decrypt the real key.
    let real_key = decrypt_real_key(state, &api_key_row)?;

    Ok(RequestAction::Manipulate {
        api_key_row,
        real_key,
    })
}

// ---------------------------------------------------------------------------
// Database lookups
// ---------------------------------------------------------------------------

async fn lookup_api_key(
    state: &Arc<AppState>,
    dummy_key: &str,
) -> Result<Option<ApiKeyRow>, AppError> {
    let row = sqlx::query_as::<_, ApiKeyRow>(
        "SELECT id, app_id, provider, real_key_encrypted, nonce, rate_limit_rpm, is_active \
         FROM api_keys WHERE dummy_key = ?",
    )
    .bind(dummy_key)
    .fetch_optional(&state.db)
    .await?;

    Ok(row)
}

async fn check_firewall(
    state: &Arc<AppState>,
    app_id: &str,
    host: &str,
    path: &str,
) -> Result<Option<String>, AppError> {
    let rules = sqlx::query_as::<_, FirewallRuleRow>(
        "SELECT id, rule_type, pattern, action \
         FROM firewall_rules WHERE app_id = ? AND is_active = 1",
    )
    .bind(app_id)
    .fetch_all(&state.db)
    .await?;

    let full_url = format!("{}{}", host, path);

    for rule in &rules {
        let matched = match rule.rule_type.as_str() {
            "domain" => {
                // Exact domain match or glob
                if rule.pattern.contains('*') {
                    let re_pattern = rule
                        .pattern
                        .replace('.', "\\.")
                        .replace('*', ".*");
                    Regex::new(&format!("^{}$", re_pattern))
                        .map(|re| re.is_match(host))
                        .unwrap_or(false)
                } else {
                    host == rule.pattern
                }
            }
            "path" => path.starts_with(&rule.pattern),
            "url" => full_url.starts_with(&rule.pattern),
            "regex" => Regex::new(&rule.pattern)
                .map(|re| re.is_match(&full_url))
                .unwrap_or(false),
            _ => false,
        };

        if matched {
            match rule.action.as_str() {
                "block" => {
                    return Ok(Some(format!(
                        "Blocked by firewall rule {} ({})",
                        rule.id, rule.rule_type
                    )));
                }
                "allow" => {
                    // Explicit allow overrides subsequent blocks
                    return Ok(None);
                }
                _ => {}
            }
        }
    }

    Ok(None)
}

async fn check_registry(
    state: &Arc<AppState>,
    app_id: &str,
    provider: &str,
    method: &str,
    path: &str,
) -> Result<bool, AppError> {
    let rules = sqlx::query_as::<_, RegistryRuleRow>(
        "SELECT id, method, path_pattern, is_allowed \
         FROM registry_rules WHERE app_id = ? AND provider = ?",
    )
    .bind(app_id)
    .bind(provider)
    .fetch_all(&state.db)
    .await?;

    // If no registry rules exist, allow by default.
    if rules.is_empty() {
        return Ok(true);
    }

    // Check each rule; the first matching rule wins.
    for rule in &rules {
        let method_matches = rule.method == "*" || rule.method.eq_ignore_ascii_case(method);
        let path_matches = if rule.path_pattern.contains('*') {
            let re_pattern = rule.path_pattern.replace('*', ".*");
            Regex::new(&format!("^{}$", re_pattern))
                .map(|re| re.is_match(path))
                .unwrap_or(false)
        } else {
            path.starts_with(&rule.path_pattern)
        };

        if method_matches && path_matches {
            return Ok(rule.is_allowed);
        }
    }

    // No rule matched -- default deny when registry rules exist.
    Ok(false)
}

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------

fn decrypt_real_key(state: &Arc<AppState>, row: &ApiKeyRow) -> Result<String, AppError> {
    let nonce = Nonce::from_slice(&row.nonce);
    let plaintext = state
        .encryption_key
        .decrypt(nonce, row.real_key_encrypted.as_ref())
        .map_err(|e| AppError::Internal(format!("Decryption failed: {}", e)))?;

    String::from_utf8(plaintext)
        .map_err(|e| AppError::Internal(format!("Decrypted key is not valid UTF-8: {}", e)))
}

fn extract_bearer_or_basic(auth: &str) -> String {
    if let Some(token) = auth.strip_prefix("Bearer ") {
        token.trim().to_string()
    } else if let Some(token) = auth.strip_prefix("bearer ") {
        token.trim().to_string()
    } else if let Some(token) = auth.strip_prefix("Basic ") {
        token.trim().to_string()
    } else {
        auth.trim().to_string()
    }
}

// ---------------------------------------------------------------------------
// Forwarding
// ---------------------------------------------------------------------------

/// Forward the request to the real upstream server.
///
/// If `real_auth` is `Some`, the Authorization header is replaced.
async fn forward_request(
    method: &str,
    url: &str,
    original_headers: &[(String, String)],
    body: Bytes,
    real_auth: Option<&str>,
) -> Result<Response<Full<Bytes>>, AppError> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()?;

    let reqwest_method = method
        .parse::<reqwest::Method>()
        .map_err(|_| AppError::Internal(format!("Invalid HTTP method: {}", method)))?;

    let mut builder = client.request(reqwest_method, url);

    // Copy headers, replacing Authorization if needed
    for (key, value) in original_headers {
        if key.eq_ignore_ascii_case("authorization") {
            if let Some(real) = real_auth {
                // Determine the original scheme
                let scheme = if value.starts_with("Basic ") || value.starts_with("basic ") {
                    "Basic"
                } else {
                    "Bearer"
                };
                builder = builder.header("Authorization", format!("{} {}", scheme, real));
            } else {
                builder = builder.header(key.as_str(), value.as_str());
            }
        } else if !key.eq_ignore_ascii_case("host")
            && !key.eq_ignore_ascii_case("content-length")
            && !key.eq_ignore_ascii_case("transfer-encoding")
            && !key.eq_ignore_ascii_case("connection")
            && !key.eq_ignore_ascii_case("proxy-connection")
        {
            builder = builder.header(key.as_str(), value.as_str());
        }
    }

    if !body.is_empty() {
        builder = builder.body(body);
    }

    let upstream_resp = builder.send().await?;

    // Convert reqwest response back to hyper response
    let status = upstream_resp.status();
    let mut response_builder = Response::builder().status(status.as_u16());

    for (key, value) in upstream_resp.headers() {
        // Skip hop-by-hop headers
        let k = key.as_str();
        if k == "transfer-encoding" || k == "connection" {
            continue;
        }
        response_builder = response_builder.header(key, value);
    }

    let resp_body = upstream_resp.bytes().await?;
    let response = response_builder.body(Full::new(resp_body))?;

    Ok(response)
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

async fn log_request(
    state: &Arc<AppState>,
    app_id: Option<&str>,
    api_key_id: Option<&str>,
    method: &str,
    url: &str,
    status_code: i64,
    action: &str,
    duration_ms: i64,
    request_body_size: i64,
    response_body_size: i64,
    tokens_used: i64,
) {
    let id = uuid::Uuid::new_v4().to_string();
    let result = sqlx::query(
        "INSERT INTO request_logs (id, app_id, api_key_id, method, url, status_code, action, \
         duration_ms, request_body_size, response_body_size, tokens_used, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
    )
    .bind(&id)
    .bind(app_id)
    .bind(api_key_id)
    .bind(method)
    .bind(url)
    .bind(status_code)
    .bind(action)
    .bind(duration_ms)
    .bind(request_body_size)
    .bind(response_body_size)
    .bind(tokens_used)
    .execute(&state.db)
    .await;

    if let Err(e) = result {
        warn!("Failed to log request: {}", e);
    }
}

// ---------------------------------------------------------------------------
// LLM token usage estimation
// ---------------------------------------------------------------------------

/// Crude heuristic to estimate token usage for known LLM API providers.
fn estimate_tokens(host: &str, path: &str, status_code: i64) -> i64 {
    if status_code < 200 || status_code >= 300 {
        return 0;
    }

    let is_llm = host.contains("openai.com")
        || host.contains("anthropic.com")
        || host.contains("cohere.com")
        || host.contains("ai.google")
        || host.contains("generativelanguage.googleapis.com");

    let is_completion_path = path.contains("/chat/completions")
        || path.contains("/completions")
        || path.contains("/messages")
        || path.contains("/generate");

    if is_llm && is_completion_path {
        // Placeholder -- real implementation would parse the response body
        // for `usage.total_tokens` from the upstream JSON.
        -1 // Sentinel: means "tokens present but not yet counted from response"
    } else {
        0
    }
}
