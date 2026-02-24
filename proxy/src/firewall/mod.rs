use std::time::{Duration, Instant};

use dashmap::DashMap;
use regex::Regex;

// ---------------------------------------------------------------------------
// Action / result enums
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub enum FirewallAction {
    /// The request should be blocked; carries a human-readable reason.
    Block(String),
    /// The request should bypass all remaining proxy logic (e.g. passthrough).
    Bypass,
    /// No rule matched – continue with normal processing.
    Continue,
}

#[derive(Debug, Clone)]
pub enum RegistryAction {
    Allow,
    Deny(String),
}

#[derive(Debug, Clone)]
pub enum LimitAction {
    /// Usage is within acceptable bounds.
    Ok,
    /// Usage has crossed the alert threshold. Carries the current usage value.
    Alert(i64),
    /// Usage has hit the hard limit. Carries the current usage value.
    HardBlock(i64),
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

pub struct FirewallRule {
    pub rule_type: String,
    pub pattern: String,
    pub action: String,
    pub priority: i32,
}

pub struct RegistryRule {
    pub domain: String,
    pub allowed_methods: Vec<String>,
    pub path_pattern: String,
    pub rate_limit: Option<i32>,
}

pub struct AlertConfig {
    pub limit_type: String,
    pub threshold: i64,
    pub hard_limit: Option<i64>,
}

/// A concurrent, sliding-window rate-limit tracker.
///
/// Each unique `(app_id, domain)` pair is tracked independently.  The window
/// is fixed at 60 seconds.
pub struct RateLimitTracker {
    counts: DashMap<String, Vec<Instant>>,
}

const RATE_LIMIT_WINDOW: Duration = Duration::from_secs(60);

impl RateLimitTracker {
    /// Creates a new, empty tracker.
    pub fn new() -> Self {
        Self {
            counts: DashMap::new(),
        }
    }

    /// Records a new request for the given key and prunes timestamps that have
    /// fallen outside the sliding window.
    fn record_and_count(&self, key: &str) -> usize {
        let now = Instant::now();
        let mut entry = self.counts.entry(key.to_string()).or_default();
        // Prune expired timestamps.
        entry.retain(|ts| now.duration_since(*ts) < RATE_LIMIT_WINDOW);
        entry.push(now);
        entry.len()
    }
}

impl Default for RateLimitTracker {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Evaluates a list of [`FirewallRule`]s against the incoming request.
///
/// Rules are sorted by ascending `priority` (lower number = higher priority)
/// and the first match wins.  The `rule_type` field determines what the
/// `pattern` is matched against:
///
/// * `"host"` – compared to `host`
/// * `"path"` – compared to `path`
/// * `"header"` – pattern is `Name: value-regex`; matched against headers
///
/// The `action` field on the rule maps to `"block"`, `"bypass"`, or anything
/// else is treated as `Continue`.
pub fn check_firewall(
    rules: &[FirewallRule],
    host: &str,
    path: &str,
    headers: &[(String, String)],
) -> FirewallAction {
    // Sort rules by priority (stable – preserves insertion order for ties).
    let mut sorted: Vec<&FirewallRule> = rules.iter().collect();
    sorted.sort_by_key(|r| r.priority);

    for rule in sorted {
        let matched = match rule.rule_type.as_str() {
            "host" => matches_pattern(&rule.pattern, host),
            "path" => matches_pattern(&rule.pattern, path),
            "header" => match_header_rule(&rule.pattern, headers),
            _ => false,
        };

        if matched {
            return match rule.action.as_str() {
                "block" => FirewallAction::Block(format!(
                    "blocked by firewall rule (type={}, pattern={})",
                    rule.rule_type, rule.pattern
                )),
                "bypass" => FirewallAction::Bypass,
                _ => FirewallAction::Continue,
            };
        }
    }

    FirewallAction::Continue
}

/// Checks whether the request is allowed by the registry rules for a given
/// domain.  The `method` and `path` of the request are validated against the
/// rule's `allowed_methods` and `path_pattern` (interpreted as a regex).
pub fn check_registry(rules: &[RegistryRule], method: &str, path: &str) -> RegistryAction {
    if rules.is_empty() {
        return RegistryAction::Allow;
    }

    for rule in rules {
        // Method check (case-insensitive).
        let method_allowed = rule.allowed_methods.is_empty()
            || rule
                .allowed_methods
                .iter()
                .any(|m| m.eq_ignore_ascii_case(method));

        if !method_allowed {
            return RegistryAction::Deny(format!(
                "method {} not allowed for domain {}",
                method, rule.domain
            ));
        }

        // Path pattern check.
        if !rule.path_pattern.is_empty() {
            match Regex::new(&rule.path_pattern) {
                Ok(re) => {
                    if !re.is_match(path) {
                        return RegistryAction::Deny(format!(
                            "path {} does not match pattern {} for domain {}",
                            path, rule.path_pattern, rule.domain
                        ));
                    }
                }
                Err(_) => {
                    // If the pattern is invalid we deny defensively.
                    return RegistryAction::Deny(format!(
                        "invalid path_pattern regex for domain {}",
                        rule.domain
                    ));
                }
            }
        }
    }

    RegistryAction::Allow
}

/// Checks whether the request is within the per-app, per-domain rate limit.
///
/// Returns `true` if the request should be **allowed** (i.e. the caller is
/// within the limit).  A `limit` of `None` means no rate limit is enforced.
pub fn check_rate_limit(
    tracker: &RateLimitTracker,
    app_id: &str,
    domain: &str,
    limit: Option<i32>,
) -> bool {
    let max = match limit {
        Some(l) if l > 0 => l as usize,
        _ => return true, // No limit configured.
    };

    let key = format!("{}:{}", app_id, domain);
    let count = tracker.record_and_count(&key);
    count <= max
}

/// Compares the current daily token usage against the alert / hard-limit
/// thresholds defined in `alert_config`.
pub fn check_token_limit(daily_usage: i64, alert_config: &AlertConfig) -> LimitAction {
    if let Some(hard) = alert_config.hard_limit {
        if daily_usage >= hard {
            return LimitAction::HardBlock(daily_usage);
        }
    }

    if daily_usage >= alert_config.threshold {
        return LimitAction::Alert(daily_usage);
    }

    LimitAction::Ok
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Matches `pattern` against `value`.  If the pattern looks like a regex
/// (contains typical meta-characters) it is compiled as one; otherwise an
/// exact case-insensitive comparison is performed.
fn matches_pattern(pattern: &str, value: &str) -> bool {
    if pattern.contains('*') || pattern.contains('?') || pattern.contains('[') || pattern.starts_with('^') {
        // Treat as regex.
        Regex::new(pattern)
            .map(|re| re.is_match(value))
            .unwrap_or(false)
    } else {
        value.eq_ignore_ascii_case(pattern)
    }
}

/// A header rule pattern has the form `Header-Name: value_regex`.  We split
/// on the first `: ` and then check whether any header matches.
fn match_header_rule(pattern: &str, headers: &[(String, String)]) -> bool {
    let (name, value_pattern) = match pattern.split_once(": ") {
        Some(parts) => parts,
        None => return false,
    };

    let re = match Regex::new(value_pattern) {
        Ok(r) => r,
        Err(_) => return false,
    };

    headers
        .iter()
        .any(|(h, v)| h.eq_ignore_ascii_case(name) && re.is_match(v))
}
