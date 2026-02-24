use regex::Regex;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// Represents a recorded (or manually configured) request/response pair.
///
/// When `is_simulation` is `true` the capture is treated as a mock that can
/// be matched against incoming requests via [`check_mock`].
pub struct MockCapture {
    pub method: String,
    pub url_pattern: String,
    pub request_headers: Option<String>,
    pub request_body: Option<String>,
    pub response_status: u16,
    pub response_headers: Option<String>,
    pub response_body: Option<String>,
    pub is_simulation: bool,
}

/// A fully-resolved mock response ready to be sent back to the client.
pub struct MockResponse {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Searches through the provided captures for the first active simulation
/// whose `method` and `url_pattern` match the incoming request.
///
/// `url_pattern` is interpreted as a regex.  The match is anchored (full URL
/// must match).
///
/// Returns `Some(MockResponse)` when a matching simulation is found, `None`
/// otherwise.
pub fn check_mock(method: &str, url: &str, captures: &[MockCapture]) -> Option<MockResponse> {
    for capture in captures {
        // Only consider entries that have been marked as simulations.
        if !capture.is_simulation {
            continue;
        }

        // Method must match (case-insensitive).
        if !capture.method.eq_ignore_ascii_case(method) {
            continue;
        }

        // URL pattern match.
        let pattern_matches = match Regex::new(&capture.url_pattern) {
            Ok(re) => re.is_match(url),
            Err(_) => {
                // Fall back to plain string contains if the pattern is not
                // valid regex.
                url.contains(&capture.url_pattern)
            }
        };

        if !pattern_matches {
            continue;
        }

        // Build the mock response.
        let headers = parse_headers(capture.response_headers.as_deref());
        let body = capture.response_body.clone().unwrap_or_default();

        return Some(MockResponse {
            status: capture.response_status,
            headers,
            body,
        });
    }

    None
}

/// Records live traffic into a [`MockCapture`].
///
/// The resulting capture has `is_simulation` set to `false` – it is raw
/// recorded traffic that can later be promoted to a simulation.
pub fn record_traffic(
    method: &str,
    url: &str,
    req_headers: &str,
    req_body: &str,
    resp_status: u16,
    resp_headers: &str,
    resp_body: &str,
) -> MockCapture {
    // Escape the URL so it can be used as a literal regex pattern.
    let url_pattern = regex::escape(url);

    MockCapture {
        method: method.to_uppercase(),
        url_pattern,
        request_headers: if req_headers.is_empty() {
            None
        } else {
            Some(req_headers.to_string())
        },
        request_body: if req_body.is_empty() {
            None
        } else {
            Some(req_body.to_string())
        },
        response_status: resp_status,
        response_headers: if resp_headers.is_empty() {
            None
        } else {
            Some(resp_headers.to_string())
        },
        response_body: if resp_body.is_empty() {
            None
        } else {
            Some(resp_body.to_string())
        },
        is_simulation: false,
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Parses a header string in the format `Name: Value\r\nName2: Value2\r\n`
/// into a vec of `(name, value)` tuples.  Supports both `\r\n` and `\n`
/// line endings, as well as JSON-encoded header maps (`{"key":"value"}`).
fn parse_headers(raw: Option<&str>) -> Vec<(String, String)> {
    let raw = match raw {
        Some(r) if !r.is_empty() => r,
        _ => return Vec::new(),
    };

    // Try JSON first.
    if raw.trim_start().starts_with('{') {
        if let Ok(map) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(raw) {
            return map
                .into_iter()
                .map(|(k, v)| {
                    let val = match v {
                        serde_json::Value::String(s) => s,
                        other => other.to_string(),
                    };
                    (k, val)
                })
                .collect();
        }
    }

    // Fall back to `Name: Value` lines.
    raw.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }
            let (name, value) = line.split_once(':')?;
            Some((name.trim().to_string(), value.trim().to_string()))
        })
        .collect()
}
