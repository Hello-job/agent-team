use std::collections::BTreeMap;

use async_trait::async_trait;
use futures::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, USER_AGENT};
use serde::Deserialize;

use crate::error::AppError;
use crate::llm::provider::{
    estimate_tokens, LLMProvider, LLMResponse, Message, MessageRole, TokenUsage,
};
use crate::tools::definition::{ToolCall, ToolDefinition};

#[derive(Clone)]
pub struct AnthropicProvider {
    client: reqwest::Client,
    model: String,
    base_url: String,
}

impl AnthropicProvider {
    pub fn new(api_key: String, model: String, base_url: Option<String>) -> Result<Self, AppError> {
        let base_url = normalize_anthropic_base_url(base_url);

        let mut headers = HeaderMap::new();
        headers.insert(
            "x-api-key",
            HeaderValue::from_str(&api_key).map_err(|e| AppError::Message(e.to_string()))?,
        );
        headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(
            USER_AGENT,
            HeaderValue::from_static(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            ),
        );

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .map_err(|e| AppError::Message(e.to_string()))?;

        Ok(Self {
            client,
            model,
            base_url,
        })
    }

    fn endpoint(&self) -> String {
        format!("{}/v1/messages", self.base_url.trim_end_matches('/'))
    }

    fn convert_messages(&self, messages: Vec<Message>) -> (Option<String>, Vec<serde_json::Value>) {
        let mut system: Option<String> = None;
        let mut out = Vec::new();
        for msg in messages {
            match msg.role {
                MessageRole::System => system = msg.content,
                MessageRole::User => out.push(serde_json::json!({"role": "user", "content": msg.content.unwrap_or_default()})),
                MessageRole::Assistant => out.push(serde_json::json!({"role": "assistant", "content": msg.content.unwrap_or_default()})),
                MessageRole::Tool => {
                    // Tool messages are not supported in this minimal implementation; treat as user text.
                    out.push(serde_json::json!({"role": "user", "content": msg.content.unwrap_or_default()}))
                }
            }
        }
        (system, out)
    }

    fn convert_messages_with_tools(
        &self,
        messages: Vec<Message>,
    ) -> (Option<String>, Vec<serde_json::Value>) {
        let mut system_parts: Vec<String> = Vec::new();
        let mut out = Vec::new();

        for msg in messages {
            match msg.role {
                MessageRole::System => {
                    if let Some(text) = msg.content {
                        if !text.trim().is_empty() {
                            system_parts.push(text);
                        }
                    }
                }
                MessageRole::User => {
                    out.push(serde_json::json!({
                        "role": "user",
                        "content": [{ "type": "text", "text": msg.content.unwrap_or_default() }]
                    }));
                }
                MessageRole::Assistant => {
                    let mut blocks = Vec::new();
                    if let Some(text) = msg.content {
                        if !text.trim().is_empty() {
                            blocks.push(serde_json::json!({ "type": "text", "text": text }));
                        }
                    }
                    if let Some(tool_calls) = msg.tool_calls {
                        for tc in tool_calls {
                            blocks.push(serde_json::json!({
                                "type": "tool_use",
                                "id": tc.id,
                                "name": tc.name,
                                "input": tc.arguments
                            }));
                        }
                    }
                    if blocks.is_empty() {
                        blocks.push(serde_json::json!({ "type": "text", "text": "" }));
                    }
                    out.push(serde_json::json!({ "role": "assistant", "content": blocks }));
                }
                MessageRole::Tool => {
                    let tool_use_id = msg.tool_call_id.unwrap_or_default();
                    out.push(serde_json::json!({
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": tool_use_id,
                            "content": msg.content.unwrap_or_default()
                        }]
                    }));
                }
            }
        }

        let system = if system_parts.is_empty() {
            None
        } else {
            Some(system_parts.join("\n\n"))
        };
        (system, out)
    }
}

/// Normalize a user-supplied base URL to the host portion that [`endpoint`]
/// appends `/v1/messages` to. Tolerant of the common ways people paste it:
/// trailing slashes, an included `/v1`, or even the full `/v1/messages` path.
/// Mirrors `normalize_openai_compatible_base_url` so Anthropic-compatible
/// gateways are just as plug-and-play.
///
/// [`endpoint`]: AnthropicProvider::endpoint
pub fn normalize_anthropic_base_url(base_url: Option<String>) -> String {
    const DEFAULT_URL: &str = "https://api.anthropic.com";
    let Some(base) = base_url else {
        return DEFAULT_URL.to_string();
    };
    let base = base.trim().trim_end_matches('/');
    if base.is_empty() {
        return DEFAULT_URL.to_string();
    }
    // Strip an already-included endpoint suffix so we don't double it up.
    let base = base
        .strip_suffix("/v1/messages")
        .or_else(|| base.strip_suffix("/v1"))
        .unwrap_or(base)
        .trim_end_matches('/');
    if base.is_empty() {
        DEFAULT_URL.to_string()
    } else {
        base.to_string()
    }
}

/// Whether this model accepts a `temperature` parameter. Claude Opus 4.7 and
/// later removed sampling parameters (`temperature`/`top_p`/`top_k`) — sending
/// `temperature` to them returns HTTP 400. Every other Anthropic model still
/// accepts it, so we send it for them and omit it for Opus 4.7+.
fn anthropic_supports_temperature(model_id: &str) -> bool {
    !opus_minor_version_at_least(model_id, 7)
}

/// True when `model_id` names a Claude Opus 4.x at minor version `>= min_minor`
/// (e.g. `claude-opus-4-8`, `anthropic.claude-opus-4-9`). Forward-compatible:
/// a future `opus-4-10` parses as minor 10.
fn opus_minor_version_at_least(model_id: &str, min_minor: u32) -> bool {
    const MARKER: &str = "opus-4-";
    let Some(idx) = model_id.find(MARKER) else {
        return false;
    };
    let minor: String = model_id[idx + MARKER.len()..]
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    minor
        .parse::<u32>()
        .map(|n| n >= min_minor)
        .unwrap_or(false)
}

#[async_trait]
impl LLMProvider for AnthropicProvider {
    fn provider_name(&self) -> &'static str {
        "anthropic"
    }

    fn model_id(&self) -> &str {
        &self.model
    }

    async fn chat(
        &self,
        messages: Vec<Message>,
        temperature: f64,
        max_tokens: u32,
    ) -> Result<LLMResponse, AppError> {
        let (system, converted) = self.convert_messages(messages);

        let mut body = serde_json::json!({
            "model": self.model,
            "messages": converted,
            "max_tokens": max_tokens
        });
        if anthropic_supports_temperature(&self.model) {
            body["temperature"] = serde_json::json!(temperature);
        }
        if let Some(system) = system {
            body["system"] = serde_json::Value::String(system);
        }

        let resp = self
            .client
            .post(self.endpoint())
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Message(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_else(|_| "".to_string());
            return Err(AppError::Message(format!(
                "Anthropic error: {status} {text}"
            )));
        }

        let parsed: AnthropicMessageResponse = resp
            .json()
            .await
            .map_err(|e| AppError::Message(e.to_string()))?;

        let mut content = String::new();
        for block in parsed.content {
            if block.r#type == "text" {
                content.push_str(&block.text.unwrap_or_default());
            }
        }

        let prompt_tokens = parsed.usage.input_tokens;
        let completion_tokens = parsed.usage.output_tokens;
        let estimated = prompt_tokens.is_none() || completion_tokens.is_none();
        let input_tokens = prompt_tokens.unwrap_or_else(|| estimate_tokens(&body.to_string()));
        let output_tokens = completion_tokens.unwrap_or_else(|| estimate_tokens(&content));

        Ok(LLMResponse {
            content,
            usage: TokenUsage {
                input_tokens,
                output_tokens,
                estimated,
            },
            model: parsed.model.unwrap_or_else(|| self.model.clone()),
            finish_reason: parsed.stop_reason,
            tool_calls: Vec::new(),
        })
    }

    async fn chat_with_tools(
        &self,
        messages: Vec<Message>,
        tools: &[ToolDefinition],
        temperature: f64,
        max_tokens: u32,
    ) -> Result<LLMResponse, AppError> {
        if tools.is_empty() {
            return self.chat(messages, temperature, max_tokens).await;
        }

        let (system, converted) = self.convert_messages_with_tools(messages);
        let tool_defs = tools
            .iter()
            .map(|t| {
                serde_json::json!({
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.parameters
                })
            })
            .collect::<Vec<_>>();

        let mut body = serde_json::json!({
            "model": self.model,
            "messages": converted,
            "max_tokens": max_tokens,
            "tools": tool_defs
        });
        if anthropic_supports_temperature(&self.model) {
            body["temperature"] = serde_json::json!(temperature);
        }
        if let Some(system) = system {
            body["system"] = serde_json::Value::String(system);
        }

        let resp = self
            .client
            .post(self.endpoint())
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Message(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_else(|_| "".to_string());
            return Err(AppError::Message(format!(
                "Anthropic error: {status} {text}"
            )));
        }

        let parsed: AnthropicMessageResponse = resp
            .json()
            .await
            .map_err(|e| AppError::Message(e.to_string()))?;

        let mut content = String::new();
        let mut tool_calls: Vec<ToolCall> = Vec::new();
        for block in parsed.content {
            match block.r#type.as_str() {
                "text" => {
                    if let Some(text) = block.text {
                        content.push_str(&text);
                    }
                }
                "tool_use" => {
                    if let (Some(id), Some(name), Some(input)) = (block.id, block.name, block.input)
                    {
                        tool_calls.push(ToolCall {
                            id,
                            name,
                            arguments: input,
                        });
                    }
                }
                _ => {}
            }
        }

        let prompt_tokens = parsed.usage.input_tokens;
        let completion_tokens = parsed.usage.output_tokens;
        let estimated = prompt_tokens.is_none() || completion_tokens.is_none();

        let output_estimate_text = if tool_calls.is_empty() {
            content.clone()
        } else {
            format!(
                "{content}\n{}",
                serde_json::to_string(&tool_calls).unwrap_or_default()
            )
        };

        Ok(LLMResponse {
            content,
            usage: TokenUsage {
                input_tokens: prompt_tokens.unwrap_or_else(|| estimate_tokens(&body.to_string())),
                output_tokens: completion_tokens
                    .unwrap_or_else(|| estimate_tokens(&output_estimate_text)),
                estimated,
            },
            model: parsed.model.unwrap_or_else(|| self.model.clone()),
            finish_reason: parsed.stop_reason,
            tool_calls,
        })
    }

    async fn chat_stream(
        &self,
        messages: Vec<Message>,
        tools: &[ToolDefinition],
        temperature: f64,
        max_tokens: u32,
        on_delta: &mut (dyn for<'a> FnMut(&'a str) + Send),
    ) -> Result<LLMResponse, AppError> {
        let (system, converted) = self.convert_messages_with_tools(messages);

        let mut body = serde_json::json!({
            "model": self.model,
            "messages": converted,
            "max_tokens": max_tokens,
            "stream": true
        });
        if anthropic_supports_temperature(&self.model) {
            body["temperature"] = serde_json::json!(temperature);
        }
        if let Some(system) = system {
            body["system"] = serde_json::Value::String(system);
        }
        if !tools.is_empty() {
            let tool_defs = tools
                .iter()
                .map(|t| {
                    serde_json::json!({
                        "name": t.name,
                        "description": t.description,
                        "input_schema": t.parameters
                    })
                })
                .collect::<Vec<_>>();
            body["tools"] = serde_json::Value::Array(tool_defs);
        }

        let resp = self
            .client
            .post(self.endpoint())
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Message(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Message(format!(
                "Anthropic error: {status} {text}"
            )));
        }

        let mut stream = resp.bytes_stream();
        let mut buf: Vec<u8> = Vec::new();
        let mut acc = AnthropicStreamAcc::default();

        while let Some(chunk) = stream.next().await {
            let bytes = chunk.map_err(|e| AppError::Message(e.to_string()))?;
            buf.extend_from_slice(&bytes);

            while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
                let line = String::from_utf8_lossy(&buf[..pos]).trim().to_string();
                buf.drain(..=pos);
                // Anthropic SSE: only the `data:` lines carry JSON; the embedded
                // `type` field tells us what each event is.
                let Some(data) = line.strip_prefix("data:") else {
                    continue;
                };
                let data = data.trim();
                if data.is_empty() {
                    continue;
                }
                apply_anthropic_event(&mut acc, data, on_delta);
            }
        }

        let tool_calls: Vec<ToolCall> = acc
            .tool_blocks
            .into_values()
            .filter(|(id, name, _)| !id.is_empty() || !name.is_empty())
            .map(|(id, name, json)| {
                let arguments = if json.trim().is_empty() {
                    serde_json::json!({})
                } else {
                    serde_json::from_str(&json).unwrap_or(serde_json::Value::String(json))
                };
                ToolCall {
                    id,
                    name,
                    arguments,
                }
            })
            .collect();

        let estimated = acc.input_tokens.is_none() || acc.output_tokens.is_none();
        Ok(LLMResponse {
            content: acc.content.clone(),
            usage: TokenUsage {
                input_tokens: acc
                    .input_tokens
                    .unwrap_or_else(|| estimate_tokens(&body.to_string())),
                output_tokens: acc
                    .output_tokens
                    .unwrap_or_else(|| estimate_tokens(&acc.content)),
                estimated,
            },
            model: acc.model.unwrap_or_else(|| self.model.clone()),
            finish_reason: acc.stop_reason,
            tool_calls,
        })
    }
}

/// Accumulated state while parsing an Anthropic SSE stream.
#[derive(Default)]
struct AnthropicStreamAcc {
    content: String,
    /// index → (tool_use id, name, accumulated input JSON)
    tool_blocks: BTreeMap<usize, (String, String, String)>,
    input_tokens: Option<u32>,
    output_tokens: Option<u32>,
    stop_reason: Option<String>,
    model: Option<String>,
}

/// Apply one decoded SSE `data:` event to the accumulator, streaming any text
/// fragment to `on_delta`. Pure (no I/O) so it can be unit-tested directly.
fn apply_anthropic_event(
    acc: &mut AnthropicStreamAcc,
    data: &str,
    on_delta: &mut (dyn for<'a> FnMut(&'a str) + Send),
) {
    let Ok(event) = serde_json::from_str::<AnthropicStreamEvent>(data) else {
        return;
    };
    match event.r#type.as_str() {
        "message_start" => {
            if let Some(message) = event.message {
                if message.model.is_some() {
                    acc.model = message.model;
                }
                if let Some(usage) = message.usage {
                    if usage.input_tokens.is_some() {
                        acc.input_tokens = usage.input_tokens;
                    }
                }
            }
        }
        "content_block_start" => {
            if let (Some(index), Some(block)) = (event.index, event.content_block) {
                if block.r#type == "tool_use" {
                    acc.tool_blocks.insert(
                        index,
                        (
                            block.id.unwrap_or_default(),
                            block.name.unwrap_or_default(),
                            String::new(),
                        ),
                    );
                }
            }
        }
        "content_block_delta" => {
            if let Some(delta) = event.delta {
                if let Some(text) = delta.text {
                    if !text.is_empty() {
                        acc.content.push_str(&text);
                        on_delta(&text);
                    }
                }
                if let Some(partial) = delta.partial_json {
                    if let Some(index) = event.index {
                        if let Some(entry) = acc.tool_blocks.get_mut(&index) {
                            entry.2.push_str(&partial);
                        }
                    }
                }
            }
        }
        "message_delta" => {
            if let Some(usage) = event.usage {
                if usage.output_tokens.is_some() {
                    acc.output_tokens = usage.output_tokens;
                }
            }
            if let Some(delta) = event.delta {
                if delta.stop_reason.is_some() {
                    acc.stop_reason = delta.stop_reason;
                }
            }
        }
        _ => {}
    }
}

#[derive(Debug, Deserialize)]
struct AnthropicStreamEvent {
    r#type: String,
    #[serde(default)]
    index: Option<usize>,
    #[serde(default)]
    message: Option<StreamMessageStart>,
    #[serde(default)]
    content_block: Option<StreamContentBlock>,
    #[serde(default)]
    delta: Option<StreamDelta>,
    #[serde(default)]
    usage: Option<AnthropicUsage>,
}

#[derive(Debug, Deserialize)]
struct StreamMessageStart {
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    usage: Option<AnthropicUsage>,
}

#[derive(Debug, Deserialize)]
struct StreamContentBlock {
    r#type: String,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct StreamDelta {
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    partial_json: Option<String>,
    #[serde(default)]
    stop_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicMessageResponse {
    pub model: Option<String>,
    pub content: Vec<AnthropicContentBlock>,
    pub stop_reason: Option<String>,
    pub usage: AnthropicUsage,
}

#[derive(Debug, Deserialize)]
struct AnthropicContentBlock {
    pub r#type: String,
    pub text: Option<String>,
    pub id: Option<String>,
    pub name: Option<String>,
    pub input: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct AnthropicUsage {
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stream_accumulates_text_and_usage() {
        let mut acc = AnthropicStreamAcc::default();
        let mut deltas: Vec<String> = Vec::new();
        let mut on_delta = |s: &str| deltas.push(s.to_string());

        apply_anthropic_event(
            &mut acc,
            r#"{"type":"message_start","message":{"model":"claude","usage":{"input_tokens":10,"output_tokens":0}}}"#,
            &mut on_delta,
        );
        apply_anthropic_event(
            &mut acc,
            r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}"#,
            &mut on_delta,
        );
        apply_anthropic_event(
            &mut acc,
            r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"lo"}}"#,
            &mut on_delta,
        );
        apply_anthropic_event(
            &mut acc,
            r#"{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}"#,
            &mut on_delta,
        );

        assert_eq!(acc.content, "Hello");
        assert_eq!(deltas, vec!["Hel".to_string(), "lo".to_string()]);
        assert_eq!(acc.input_tokens, Some(10));
        assert_eq!(acc.output_tokens, Some(5));
        assert_eq!(acc.stop_reason.as_deref(), Some("end_turn"));
        assert_eq!(acc.model.as_deref(), Some("claude"));
    }

    #[test]
    fn stream_accumulates_tool_use_input_json() {
        let mut acc = AnthropicStreamAcc::default();
        let mut on_delta = |_: &str| {};

        apply_anthropic_event(
            &mut acc,
            r#"{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"t1","name":"read_file"}}"#,
            &mut on_delta,
        );
        apply_anthropic_event(
            &mut acc,
            r#"{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"path\""}}"#,
            &mut on_delta,
        );
        apply_anthropic_event(
            &mut acc,
            r#"{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":":\"a.txt\"}"}}"#,
            &mut on_delta,
        );

        let (id, name, json) = acc.tool_blocks.get(&0).expect("tool block present");
        assert_eq!(id, "t1");
        assert_eq!(name, "read_file");
        assert_eq!(json, r#"{"path":"a.txt"}"#);
    }

    #[test]
    fn stream_ignores_unknown_and_malformed_events() {
        let mut acc = AnthropicStreamAcc::default();
        let mut on_delta = |_: &str| {};
        apply_anthropic_event(&mut acc, r#"{"type":"ping"}"#, &mut on_delta);
        apply_anthropic_event(&mut acc, "not json", &mut on_delta);
        assert_eq!(acc.content, "");
        assert!(acc.tool_blocks.is_empty());
    }

    #[test]
    fn normalize_base_url_handles_common_pastings() {
        let n = |s: Option<&str>| normalize_anthropic_base_url(s.map(|x| x.to_string()));
        assert_eq!(n(None), "https://api.anthropic.com");
        assert_eq!(n(Some("")), "https://api.anthropic.com");
        assert_eq!(n(Some("  ")), "https://api.anthropic.com");
        assert_eq!(
            n(Some("https://api.anthropic.com")),
            "https://api.anthropic.com"
        );
        assert_eq!(
            n(Some("https://api.anthropic.com/")),
            "https://api.anthropic.com"
        );
        // Users who include the /v1 segment or the full endpoint must not double it.
        assert_eq!(
            n(Some("https://api.anthropic.com/v1")),
            "https://api.anthropic.com"
        );
        assert_eq!(
            n(Some("https://api.anthropic.com/v1/messages")),
            "https://api.anthropic.com"
        );
        // A gateway path is preserved.
        assert_eq!(
            n(Some("https://gw.example.com/anthropic")),
            "https://gw.example.com/anthropic"
        );
        assert_eq!(
            n(Some("https://gw.example.com/anthropic/v1/messages")),
            "https://gw.example.com/anthropic"
        );
    }

    #[test]
    fn temperature_omitted_only_for_opus_4_7_plus() {
        // Opus 4.7+ removed sampling params → must omit temperature.
        assert!(!anthropic_supports_temperature("claude-opus-4-7"));
        assert!(!anthropic_supports_temperature("claude-opus-4-8"));
        assert!(!anthropic_supports_temperature("anthropic.claude-opus-4-8")); // Bedrock prefix
        assert!(!anthropic_supports_temperature("claude-opus-4-10")); // forward-compat

        // Everything else still accepts temperature.
        assert!(anthropic_supports_temperature("claude-opus-4-6"));
        assert!(anthropic_supports_temperature("claude-opus-4-5"));
        assert!(anthropic_supports_temperature("claude-sonnet-4-6"));
        assert!(anthropic_supports_temperature("claude-haiku-4-5"));
        assert!(anthropic_supports_temperature("claude-3-5-sonnet-20241022"));
    }
}
