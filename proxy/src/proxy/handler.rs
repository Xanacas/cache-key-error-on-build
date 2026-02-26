use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::time::Instant;

use bytes::Bytes;
use http_body_util::Full;
use hyper::{Response, StatusCode};
use tracing::{debug, info, warn};

use crate::{AppError, AppState};
use crate::crypto;
use crate::db::{self, RequestLogEntry, TokenUsageEntry};
use crate::firewall;
use crate::llm;
use crate::mock;

// ---------------------------------------------------------------------------
// Upstream response (intermediate representation)
// ---------------------------------------------------------------------------

struct UpstreamResponse {
    status: u16,
    headers: Vec<(String, String)>,
    body: Bytes,
}

impl UpstreamResponse {
    fn into_hyper_response(self) -> Result<Response<Full<Bytes>>, AppError> {
        let mut builder = Response::builder().status(self.status);
        for (k, v) in &self.headers {
            builder = builder.header(k.as_str(), v.as_str());
        }
        Ok(builder.body(Full::new(self.body))?)
    }
}

// ---------------------------------------------------------------------------
// Public handler entry-point
// ---------------------------------------------------------------------------

/// Process a proxied HTTP request through the full pipeline:
///
/// 1. Identify the calling application (via dummy API key)
/// 2. Evaluate firewall rules
/// 3. Check for mock simulations
/// 4. Resolve real credentials (API key or OAuth token)
/// 5. Forward to upstream with credential substitution
/// 6. Extract LLM token usage from response (if applicable)
/// 7. Log the request
pub async fn handle_request(
    state: &Arc<AppState>,
    method: &str,
    url: &str,
    headers: &[(String, String)],
    body: Bytes,
) -> Result<Response<Full<Bytes>>, AppError> {
    let start = Instant::now();
    state.stats.total_requests.fetch_add(1, Ordering::Relaxed);

    // ---- Parse URL ----
    let parsed_url = url::Url::parse(url)
        .map_err(|e| AppError::Internal(format!("Invalid URL: {}", e)))?;
    let host = parsed_url.host_str().unwrap_or("").to_string();
    let path = parsed_url.path().to_string();

    debug!(method, url, host = %host, "Processing request");

    // ---- 1. Identify application by dummy API key ----
    let auth_header = headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case("authorization"))
        .map(|(_, v)| v.clone());

    let app = if let Some(ref auth) = auth_header {
        let dummy_key = extract_bearer_or_basic(auth);
        state
            .database
            .find_app_by_dummy_key(&dummy_key)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
    } else {
        None
    };

    let app = match app {
        Some(a) if a.is_active.unwrap_or(true) => a,
        Some(_) => {
            state.stats.blocked_requests.fetch_add(1, Ordering::Relaxed);
            let resp = blocked_json("App is disabled");
            log_entry(&state.database, None, method, &host, &path, 403, "blocked", start).await;
            return resp;
        }
        None => {
            // No matching app – passthrough without manipulation
            state.stats.forwarded_requests.fetch_add(1, Ordering::Relaxed);
            let upstream = forward_request(method, url, headers, body, None).await?;
            log_entry(&state.database, None, method, &host, &path, upstream.status, "passthrough", start).await;
            return upstream.into_hyper_response();
        }
    };

    // ---- 2. Evaluate firewall rules ----
    let fw_records = state.database.get_firewall_rules(Some(&app.id)).await.unwrap_or_default();
    let fw_rules: Vec<firewall::FirewallRule> = fw_records
        .iter()
        .map(|r| firewall::FirewallRule {
            rule_type: r.rule_type.clone().unwrap_or_default(),
            pattern: r.pattern.clone().unwrap_or_default(),
            action: r.action.clone().unwrap_or_default(),
            priority: r.priority.unwrap_or(0) as i32,
        })
        .collect();

    match firewall::check_firewall(&fw_rules, &host, &path, headers) {
        firewall::FirewallAction::Block(reason) => {
            state.stats.blocked_requests.fetch_add(1, Ordering::Relaxed);
            warn!(url, reason = %reason, "Blocked by firewall");
            log_entry(&state.database, Some(&app.id), method, &host, &path, 403, "blocked", start).await;
            return blocked_json(&reason);
        }
        firewall::FirewallAction::Bypass => {
            state.stats.forwarded_requests.fetch_add(1, Ordering::Relaxed);
            let upstream = forward_request(method, url, headers, body, None).await?;
            log_entry(&state.database, Some(&app.id), method, &host, &path, upstream.status, "bypassed", start).await;
            return upstream.into_hyper_response();
        }
        firewall::FirewallAction::Continue => {}
    }

    // ---- 3. Check for mock simulation ----
    if let Ok(Some(mock_rec)) = state.database.get_mock_capture(method, url).await {
        if mock_rec.is_simulation.unwrap_or(false) {
            let captures = vec![mock::MockCapture {
                method: mock_rec.method.clone().unwrap_or_default(),
                url_pattern: mock_rec.url_pattern.clone().unwrap_or_default(),
                request_headers: mock_rec.request_headers.clone(),
                request_body: mock_rec.request_body.clone(),
                response_status: mock_rec.response_status.unwrap_or(200) as u16,
                response_headers: mock_rec.response_headers.clone(),
                response_body: mock_rec.response_body.clone(),
                is_simulation: true,
            }];

            if let Some(mock_resp) = mock::check_mock(method, url, &captures) {
                info!(url, "Returning mock response");
                let mut builder = Response::builder().status(mock_resp.status);
                for (k, v) in &mock_resp.headers {
                    builder = builder.header(k.as_str(), v.as_str());
                }
                if !mock_resp.headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("content-type")) {
                    builder = builder.header("Content-Type", "application/json");
                }
                let resp = builder.body(Full::new(Bytes::from(mock_resp.body)))?;
                log_entry(&state.database, Some(&app.id), method, &host, &path, mock_resp.status, "mocked", start).await;
                return Ok(resp);
            }
        }
    }

    // ---- 4. Resolve the provider and real credentials ----
    let provider = state
        .database
        .find_provider_by_base_url(&host)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    // Check registry rules for the provider's domain
    if provider.is_some() {
        let reg_records = state.database.get_registry_rules(&app.id).await.unwrap_or_default();
        let domain_rules: Vec<firewall::RegistryRule> = reg_records
            .iter()
            .filter(|r| r.domain.as_deref().map_or(false, |d| host.contains(d)))
            .map(|r| {
                let methods: Vec<String> = r
                    .allowed_methods
                    .as_deref()
                    .and_then(|m| serde_json::from_str(m).ok())
                    .unwrap_or_default();
                firewall::RegistryRule {
                    domain: r.domain.clone().unwrap_or_default(),
                    allowed_methods: methods,
                    path_pattern: r.path_pattern.clone().unwrap_or_default(),
                    rate_limit: r.rate_limit.map(|l| l as i32),
                }
            })
            .collect();

        if !domain_rules.is_empty() {
            // Check method/path allowlist
            if let firewall::RegistryAction::Deny(reason) =
                firewall::check_registry(&domain_rules, method, &path)
            {
                state.stats.blocked_requests.fetch_add(1, Ordering::Relaxed);
                log_entry(&state.database, Some(&app.id), method, &host, &path, 403, "blocked", start).await;
                return blocked_json(&reason);
            }

            // Check per-domain rate limit
            if let Some(rule) = domain_rules.first() {
                if !firewall::check_rate_limit(&state.rate_limiter, &app.id, &host, rule.rate_limit)
                {
                    state.stats.blocked_requests.fetch_add(1, Ordering::Relaxed);
                    log_entry(&state.database, Some(&app.id), method, &host, &path, 429, "rate_limited", start).await;
                    return blocked_json("Rate limit exceeded");
                }
            }
        }
    }

    // Check token-usage hard limits
    if let Some(ref prov) = provider {
        let alerts = state.database.get_alert_configs(&app.id).await.unwrap_or_default();
        for alert in &alerts {
            if !alert.is_active.unwrap_or(true) {
                continue;
            }
            let daily = state
                .database
                .get_daily_usage(&app.id, alert.provider_id.as_deref())
                .await
                .unwrap_or(0);
            let config = firewall::AlertConfig {
                limit_type: alert.limit_type.clone().unwrap_or_default(),
                threshold: alert.threshold.unwrap_or(i64::MAX),
                hard_limit: alert.hard_limit,
            };
            if let firewall::LimitAction::HardBlock(_) = firewall::check_token_limit(daily, &config) {
                state.stats.blocked_requests.fetch_add(1, Ordering::Relaxed);
                warn!(app_id = %app.id, provider = %prov.id, "Token usage hard limit reached");
                log_entry(&state.database, Some(&app.id), method, &host, &path, 429, "token_limit", start).await;
                return blocked_json("Token usage limit exceeded");
            }
        }
    }

    // Resolve actual credential (API key or OAuth token)
    let real_auth = if let Some(ref prov) = provider {
        resolve_real_auth(state, &app, prov).await
    } else {
        None
    };

    let action_label = if real_auth.is_some() {
        state.stats.manipulated_requests.fetch_add(1, Ordering::Relaxed);
        info!(url, app_id = %app.id, "Manipulating auth header");
        "manipulated"
    } else {
        state.stats.forwarded_requests.fetch_add(1, Ordering::Relaxed);
        "forwarded"
    };

    // ---- 5. Forward request ----
    let upstream = forward_request(method, url, headers, body, real_auth.as_deref()).await?;

    // ---- 6. Extract LLM token usage ----
    if let Some(ref prov) = provider {
        if (prov.is_llm_provider.unwrap_or(false) || llm::is_llm_request(&host))
            && upstream.status >= 200
            && upstream.status < 300
        {
            if let Some(usage) = llm::extract_token_usage(&host, &upstream.body) {
                let entry = TokenUsageEntry {
                    id: uuid::Uuid::new_v4().to_string(),
                    provider_id: Some(prov.id.clone()),
                    app_id: Some(app.id.clone()),
                    model: usage.model,
                    input_tokens: Some(usage.input_tokens),
                    output_tokens: Some(usage.output_tokens),
                    total_tokens: Some(usage.total_tokens),
                    request_path: Some(path.clone()),
                    created_at: None,
                };
                if let Err(e) = state.database.record_token_usage(&entry).await {
                    warn!("Failed to record token usage: {}", e);
                }
            }
        }
    }

    // ---- 7. Log ----
    log_entry(
        &state.database,
        Some(&app.id),
        method,
        &host,
        &path,
        upstream.status,
        action_label,
        start,
    )
    .await;

    upstream.into_hyper_response()
}

// ---------------------------------------------------------------------------
// Credential resolution
// ---------------------------------------------------------------------------

async fn resolve_real_auth(
    state: &Arc<AppState>,
    app: &db::AppInstance,
    provider: &db::Provider,
) -> Option<String> {
    let cred = state
        .database
        .get_credential_for_app_provider(&app.id, &provider.id)
        .await
        .ok()??;

    // Try API key first
    if let Some(ref api_key_enc) = cred.api_key_encrypted {
        if !api_key_enc.is_empty() {
            match crypto::decrypt(api_key_enc, &state.encryption_key) {
                Ok(real_key) => return Some(real_key),
                Err(e) => {
                    warn!(credential_id = %cred.id, "Failed to decrypt API key: {}", e);
                    // Fall through – the value might be stored in plaintext
                    // during development (before encryption was wired in).
                    if api_key_enc.len() > 10 && !api_key_enc.contains(' ') {
                        return Some(api_key_enc.clone());
                    }
                }
            }
        }
    }

    // Try OAuth token
    let token = state
        .database
        .get_token_for_app_provider(&app.id, &provider.id)
        .await
        .ok()??;

    if let Some(ref enc) = token.access_token_encrypted {
        match crypto::decrypt(enc, &state.encryption_key) {
            Ok(access_token) => return Some(access_token),
            Err(e) => {
                warn!("Failed to decrypt OAuth token: {}", e);
            }
        }
    }

    None
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

fn blocked_json(reason: &str) -> Result<Response<Full<Bytes>>, AppError> {
    let body = serde_json::json!({
        "error": "blocked",
        "reason": reason,
    });
    Ok(Response::builder()
        .status(StatusCode::FORBIDDEN)
        .header("Content-Type", "application/json")
        .body(Full::new(Bytes::from(serde_json::to_vec(&body)?)))?)
}

// ---------------------------------------------------------------------------
// Forwarding
// ---------------------------------------------------------------------------

async fn forward_request(
    method: &str,
    url: &str,
    original_headers: &[(String, String)],
    body: Bytes,
    real_auth: Option<&str>,
) -> Result<UpstreamResponse, AppError> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()?;

    let reqwest_method = method
        .parse::<reqwest::Method>()
        .map_err(|_| AppError::Internal(format!("Invalid HTTP method: {}", method)))?;

    let mut builder = client.request(reqwest_method, url);

    for (key, value) in original_headers {
        if key.eq_ignore_ascii_case("authorization") {
            if let Some(real) = real_auth {
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

    let status = upstream_resp.status().as_u16();
    let headers: Vec<(String, String)> = upstream_resp
        .headers()
        .iter()
        .filter_map(|(k, v)| {
            let ks = k.as_str();
            if ks == "transfer-encoding" || ks == "connection" {
                None
            } else {
                Some((ks.to_string(), v.to_str().unwrap_or("").to_string()))
            }
        })
        .collect();

    let resp_body = upstream_resp.bytes().await?;

    Ok(UpstreamResponse {
        status,
        headers,
        body: resp_body,
    })
}

// ---------------------------------------------------------------------------
// Request logging
// ---------------------------------------------------------------------------

async fn log_entry(
    database: &db::Database,
    app_id: Option<&str>,
    method: &str,
    host: &str,
    path: &str,
    status: u16,
    action: &str,
    start: Instant,
) {
    let entry = RequestLogEntry {
        id: uuid::Uuid::new_v4().to_string(),
        app_id: app_id.map(String::from),
        method: Some(method.to_string()),
        host: Some(host.to_string()),
        path: Some(path.to_string()),
        status_code: Some(status as i64),
        action: Some(action.to_string()),
        details: None,
        duration: Some(start.elapsed().as_millis() as i64),
        created_at: None,
    };

    if let Err(e) = database.log_request(&entry).await {
        warn!("Failed to log request: {}", e);
    }
}
