use crate::error::AppError;
use crate::llm::provider::{estimate_tokens, LLMProvider, LLMResponse, Message, TokenUsage};
use crate::tools::definition::{ToolCall, ToolDefinition};
use async_trait::async_trait;
use futures::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE, USER_AGENT};
use serde::Deserialize;

#[derive(Clone)]
pub struct OpenAICompatibleProvider {
    client: reqwest::Client,
    model: String,
    base_url: String,
}

impl OpenAICompatibleProvider {
    pub fn new(api_key: String, model: String, base_url: Option<String>) -> Result<Self, AppError> {
        let base_url = normalize_openai_compatible_base_url(base_url);
        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", api_key))
                .map_err(|e| AppError::Message(e.to_string()))?,
        );
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
        format!("{}/chat/completions", self.base_url.trim_end_matches('/'))
    }
}

#[async_trait]
impl LLMProvider for OpenAICompatibleProvider {
    fn provider_name(&self) -> &'static str {
        "openai_compatible"
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
        let body = serde_json::json!({
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        });

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
                "OpenAI-compatible error: {status} {text}"
            )));
        }

        let parsed: ChatResponse = resp
            .json()
            .await
            .map_err(|e| AppError::Message(e.to_string()))?;

        let choice = parsed
            .choices
            .first()
            .ok_or_else(|| AppError::Message("No choices".to_string()))?;
        let content = choice.message.content.clone().unwrap_or_default();

        let prompt_tokens = parsed.usage.as_ref().and_then(|u| u.prompt_tokens);
        let completion_tokens = parsed.usage.as_ref().and_then(|u| u.completion_tokens);
        let estimated = prompt_tokens.is_none() || completion_tokens.is_none();

        Ok(LLMResponse {
            content,
            usage: TokenUsage {
                input_tokens: prompt_tokens.unwrap_or_else(|| estimate_tokens(&body.to_string())),
                output_tokens: completion_tokens.unwrap_or_else(|| {
                    estimate_tokens(&choice.message.content.clone().unwrap_or_default())
                }),
                estimated,
            },
            model: parsed.model.unwrap_or_else(|| self.model.clone()),
            finish_reason: choice.finish_reason.clone(),
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
        let tool_defs = tools
            .iter()
            .map(|t| {
                serde_json::json!({
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters
                    }
                })
            })
            .collect::<Vec<_>>();

        let openai_messages = messages
            .into_iter()
            .map(to_openai_message)
            .collect::<Result<Vec<_>, AppError>>()?;

        let body = serde_json::json!({
            "model": self.model,
            "messages": openai_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "tools": tool_defs,
            "tool_choice": "auto"
        });

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
                "OpenAI-compatible error: {status} {text}"
            )));
        }

        let parsed: ChatResponse = resp
            .json()
            .await
            .map_err(|e| AppError::Message(e.to_string()))?;

        let choice = parsed
            .choices
            .first()
            .ok_or_else(|| AppError::Message("No choices".to_string()))?;

        let content = choice.message.content.clone().unwrap_or_default();
        let tool_calls: Vec<ToolCall> = choice
            .message
            .tool_calls
            .clone()
            .unwrap_or_default()
            .into_iter()
            .map(|tc| {
                let args_value = serde_json::from_str(&tc.function.arguments)
                    .unwrap_or(serde_json::Value::String(tc.function.arguments));
                ToolCall {
                    id: tc.id,
                    name: tc.function.name,
                    arguments: args_value,
                }
            })
            .collect();

        let prompt_tokens = parsed.usage.as_ref().and_then(|u| u.prompt_tokens);
        let completion_tokens = parsed.usage.as_ref().and_then(|u| u.completion_tokens);
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
            finish_reason: choice.finish_reason.clone(),
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
        let openai_messages = messages
            .into_iter()
            .map(to_openai_message)
            .collect::<Result<Vec<_>, AppError>>()?;

        let mut body = serde_json::json!({
            "model": self.model,
            "messages": openai_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": true,
            "stream_options": { "include_usage": true }
        });
        if !tools.is_empty() {
            let tool_defs = tools
                .iter()
                .map(|t| {
                    serde_json::json!({
                        "type": "function",
                        "function": {
                            "name": t.name,
                            "description": t.description,
                            "parameters": t.parameters
                        }
                    })
                })
                .collect::<Vec<_>>();
            body["tools"] = serde_json::Value::Array(tool_defs);
            body["tool_choice"] = serde_json::Value::String("auto".to_string());
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
                "OpenAI-compatible error: {status} {text}"
            )));
        }

        let mut stream = resp.bytes_stream();
        let mut buf: Vec<u8> = Vec::new();
        let mut content = String::new();
        // (id, name, accumulated-arguments) per tool-call index.
        let mut acc_tools: Vec<(String, String, String)> = Vec::new();
        let mut finish_reason: Option<String> = None;
        let mut usage: Option<ChatUsage> = None;
        let mut model: Option<String> = None;

        while let Some(chunk) = stream.next().await {
            let bytes = chunk.map_err(|e| AppError::Message(e.to_string()))?;
            buf.extend_from_slice(&bytes);

            // Split on newlines; decode only complete lines (\n is a safe UTF-8 boundary).
            while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
                let line = String::from_utf8_lossy(&buf[..pos]).trim().to_string();
                buf.drain(..=pos);

                let Some(data) = line.strip_prefix("data:") else {
                    continue;
                };
                let data = data.trim();
                if data.is_empty() || data == "[DONE]" {
                    continue;
                }
                let Ok(parsed) = serde_json::from_str::<StreamChunk>(data) else {
                    continue;
                };
                if parsed.usage.is_some() {
                    usage = parsed.usage;
                }
                if let Some(m) = parsed.model {
                    model = Some(m);
                }
                for choice in parsed.choices {
                    if let Some(fr) = choice.finish_reason {
                        finish_reason = Some(fr);
                    }
                    if let Some(text) = choice.delta.content {
                        if !text.is_empty() {
                            content.push_str(&text);
                            on_delta(&text);
                        }
                    }
                    for tc in choice.delta.tool_calls.unwrap_or_default() {
                        while acc_tools.len() <= tc.index {
                            acc_tools.push((String::new(), String::new(), String::new()));
                        }
                        let entry = &mut acc_tools[tc.index];
                        if let Some(id) = tc.id {
                            if !id.is_empty() {
                                entry.0 = id;
                            }
                        }
                        if let Some(f) = tc.function {
                            if let Some(name) = f.name {
                                if !name.is_empty() {
                                    entry.1 = name;
                                }
                            }
                            if let Some(args) = f.arguments {
                                entry.2.push_str(&args);
                            }
                        }
                    }
                }
            }
        }

        let tool_calls: Vec<ToolCall> = acc_tools
            .into_iter()
            .filter(|(id, name, _)| !id.is_empty() || !name.is_empty())
            .map(|(id, name, args)| {
                let arguments =
                    serde_json::from_str(&args).unwrap_or(serde_json::Value::String(args));
                ToolCall {
                    id,
                    name,
                    arguments,
                }
            })
            .collect();

        let prompt_tokens = usage.as_ref().and_then(|u| u.prompt_tokens);
        let completion_tokens = usage.as_ref().and_then(|u| u.completion_tokens);
        let estimated = prompt_tokens.is_none() || completion_tokens.is_none();

        Ok(LLMResponse {
            content: content.clone(),
            usage: TokenUsage {
                input_tokens: prompt_tokens.unwrap_or_else(|| estimate_tokens(&body.to_string())),
                output_tokens: completion_tokens.unwrap_or_else(|| estimate_tokens(&content)),
                estimated,
            },
            model: model.unwrap_or_else(|| self.model.clone()),
            finish_reason,
            tool_calls,
        })
    }
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    pub choices: Vec<ChatChoice>,
    pub model: Option<String>,
    pub usage: Option<ChatUsage>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    pub message: ChatMessage,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    pub content: Option<String>,
    pub tool_calls: Option<Vec<OpenAIToolCall>>,
}

#[derive(Debug, Deserialize)]
struct ChatUsage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
struct OpenAIToolCall {
    pub id: String,
    #[allow(dead_code)]
    #[serde(rename = "type")]
    pub r#type: String,
    pub function: OpenAIFunctionCall,
}

#[derive(Debug, Clone, Deserialize)]
struct OpenAIFunctionCall {
    pub name: String,
    pub arguments: String,
}

// ---- Streaming (SSE) chunk shapes ----

#[derive(Debug, Deserialize)]
struct StreamChunk {
    #[serde(default)]
    choices: Vec<StreamChoice>,
    #[serde(default)]
    usage: Option<ChatUsage>,
    #[serde(default)]
    model: Option<String>,
}

#[derive(Debug, Deserialize)]
struct StreamChoice {
    #[serde(default)]
    delta: StreamDelta,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct StreamDelta {
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<StreamToolCallDelta>>,
}

#[derive(Debug, Deserialize)]
struct StreamToolCallDelta {
    #[serde(default)]
    index: usize,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    function: Option<StreamFunctionDelta>,
}

#[derive(Debug, Deserialize)]
struct StreamFunctionDelta {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    arguments: Option<String>,
}

fn to_openai_message(msg: Message) -> Result<serde_json::Value, AppError> {
    let role = match msg.role {
        crate::llm::provider::MessageRole::System => "system",
        crate::llm::provider::MessageRole::User => "user",
        crate::llm::provider::MessageRole::Assistant => "assistant",
        crate::llm::provider::MessageRole::Tool => "tool",
    };

    let mut out = serde_json::Map::new();
    out.insert(
        "role".to_string(),
        serde_json::Value::String(role.to_string()),
    );
    out.insert(
        "content".to_string(),
        msg.content
            .map(serde_json::Value::String)
            .unwrap_or(serde_json::Value::Null),
    );

    if let Some(name) = msg.name {
        out.insert("name".to_string(), serde_json::Value::String(name));
    }

    if let Some(tool_call_id) = msg.tool_call_id {
        out.insert(
            "tool_call_id".to_string(),
            serde_json::Value::String(tool_call_id),
        );
    }

    if let Some(tool_calls) = msg.tool_calls {
        let mapped = tool_calls
            .into_iter()
            .map(|tc| {
                let args = serde_json::to_string(&tc.arguments)
                    .map_err(|e| AppError::Message(e.to_string()))?;
                Ok(serde_json::json!({
                    "id": tc.id,
                    "type": "function",
                    "function": { "name": tc.name, "arguments": args }
                }))
            })
            .collect::<Result<Vec<_>, AppError>>()?;
        out.insert("tool_calls".to_string(), serde_json::Value::Array(mapped));
    }

    Ok(serde_json::Value::Object(out))
}

pub fn normalize_openai_compatible_base_url(base_url: Option<String>) -> String {
    let default_url = "https://api.openai.com/v1".to_string();
    let Some(mut base) = base_url else {
        return default_url;
    };
    base = base.trim().to_string();
    if base.is_empty() {
        return default_url;
    }

    // Users sometimes paste full endpoint.
    let trimmed = base.trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        base = trimmed
            .strip_suffix("/chat/completions")
            .unwrap_or(trimmed)
            .to_string();
    }

    // Only append /v1 when no path provided.
    match url::Url::parse(&base) {
        Ok(url) => {
            let path = url.path();
            if path.is_empty() || path == "/" {
                return format!("{}/v1", base.trim_end_matches('/'));
            }
            if base.ends_with("/v1/") {
                return base[..base.len() - 1].to_string();
            }
            base.trim_end_matches('/').to_string()
        }
        Err(_) => base.trim_end_matches('/').to_string(),
    }
}
