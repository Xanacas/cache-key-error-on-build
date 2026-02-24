use serde_json::Value;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

pub struct LlmUsage {
    pub model: Option<String>,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
}

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

/// Known LLM API host fragments used to recognise LLM traffic.
const LLM_HOSTS: &[&str] = &[
    "api.openai.com",
    "api.anthropic.com",
    "generativelanguage.googleapis.com",
    "openrouter.ai",
    "gateway.ai.vercel.app",
];

/// Returns `true` when `host` belongs to a recognised LLM provider.
pub fn is_llm_request(host: &str) -> bool {
    let h = host.to_lowercase();
    LLM_HOSTS.iter().any(|known| h.contains(known))
}

// ---------------------------------------------------------------------------
// Token-usage extraction (non-streaming)
// ---------------------------------------------------------------------------

/// Attempts to parse the JSON response body from an LLM provider and extract
/// token-usage information.  Returns `None` when the body cannot be parsed or
/// does not contain the expected fields.
pub fn extract_token_usage(host: &str, response_body: &[u8]) -> Option<LlmUsage> {
    let body: Value = serde_json::from_slice(response_body).ok()?;
    let h = host.to_lowercase();

    if h.contains("api.anthropic.com") {
        extract_anthropic(&body)
    } else if h.contains("generativelanguage.googleapis.com") {
        extract_google(&body)
    } else {
        // OpenAI, OpenRouter, Vercel AI Gateway all use the OpenAI format.
        extract_openai(&body)
    }
}

// ---------------------------------------------------------------------------
// Streaming usage extraction
// ---------------------------------------------------------------------------

/// For SSE streaming responses the usage data typically appears in the very
/// last `data:` chunk.  This function scans backwards through the provided
/// chunks and tries to extract usage from the final non-empty JSON chunk.
pub fn extract_streaming_usage(host: &str, chunks: &[&str]) -> Option<LlmUsage> {
    // Walk backwards to find the last chunk that contains parseable JSON with
    // usage information.
    for chunk in chunks.iter().rev() {
        // Each chunk may be a raw SSE line like `data: {...}`.  Strip the
        // `data: ` prefix if present.
        let json_str = chunk
            .strip_prefix("data: ")
            .or_else(|| chunk.strip_prefix("data:"))
            .unwrap_or(chunk)
            .trim();

        if json_str.is_empty() || json_str == "[DONE]" {
            continue;
        }

        if let Ok(body) = serde_json::from_str::<Value>(json_str) {
            let h = host.to_lowercase();
            let usage = if h.contains("api.anthropic.com") {
                extract_anthropic(&body)
            } else if h.contains("generativelanguage.googleapis.com") {
                extract_google(&body)
            } else {
                extract_openai(&body)
            };
            if usage.is_some() {
                return usage;
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Per-provider extractors
// ---------------------------------------------------------------------------

/// OpenAI / OpenRouter / Vercel format:
/// ```json
/// { "model": "...", "usage": { "prompt_tokens": N, "completion_tokens": N, "total_tokens": N } }
/// ```
fn extract_openai(body: &Value) -> Option<LlmUsage> {
    let usage = body.get("usage")?;
    let input = usage.get("prompt_tokens")?.as_i64().unwrap_or(0);
    let output = usage.get("completion_tokens")?.as_i64().unwrap_or(0);
    let total = usage
        .get("total_tokens")
        .and_then(|v| v.as_i64())
        .unwrap_or(input + output);
    let model = body.get("model").and_then(|v| v.as_str()).map(String::from);

    Some(LlmUsage {
        model,
        input_tokens: input,
        output_tokens: output,
        total_tokens: total,
    })
}

/// Anthropic format:
/// ```json
/// { "model": "...", "usage": { "input_tokens": N, "output_tokens": N } }
/// ```
fn extract_anthropic(body: &Value) -> Option<LlmUsage> {
    let usage = body.get("usage")?;
    let input = usage.get("input_tokens")?.as_i64().unwrap_or(0);
    let output = usage.get("output_tokens")?.as_i64().unwrap_or(0);
    let model = body.get("model").and_then(|v| v.as_str()).map(String::from);

    Some(LlmUsage {
        model,
        input_tokens: input,
        output_tokens: output,
        total_tokens: input + output,
    })
}

/// Google (Gemini) format:
/// ```json
/// { "modelVersion": "...", "usageMetadata": { "promptTokenCount": N, "candidatesTokenCount": N, "totalTokenCount": N } }
/// ```
fn extract_google(body: &Value) -> Option<LlmUsage> {
    let usage = body.get("usageMetadata")?;
    let input = usage.get("promptTokenCount")?.as_i64().unwrap_or(0);
    let output = usage
        .get("candidatesTokenCount")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let total = usage
        .get("totalTokenCount")
        .and_then(|v| v.as_i64())
        .unwrap_or(input + output);

    // Google uses `modelVersion` at the top-level; fall back to `model`.
    let model = body
        .get("modelVersion")
        .or_else(|| body.get("model"))
        .and_then(|v| v.as_str())
        .map(String::from);

    Some(LlmUsage {
        model,
        input_tokens: input,
        output_tokens: output,
        total_tokens: total,
    })
}
