use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::tools::definition::ToolCall;
use crate::tools::definition::ToolDefinition;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    System,
    User,
    Assistant,
    Tool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: MessageRole,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
    #[serde(default)]
    pub estimated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMResponse {
    pub content: String,
    pub usage: TokenUsage,
    pub model: String,
    #[serde(default)]
    pub finish_reason: Option<String>,
    #[serde(default)]
    pub tool_calls: Vec<ToolCall>,
}

#[async_trait]
pub trait LLMProvider: Send + Sync {
    #[allow(dead_code)]
    fn provider_name(&self) -> &'static str;
    #[allow(dead_code)]
    fn model_id(&self) -> &str;

    async fn chat(
        &self,
        messages: Vec<Message>,
        temperature: f64,
        max_tokens: u32,
    ) -> Result<LLMResponse, AppError>;

    async fn chat_with_tools(
        &self,
        messages: Vec<Message>,
        tools: &[ToolDefinition],
        temperature: f64,
        max_tokens: u32,
    ) -> Result<LLMResponse, AppError> {
        let _ = tools;
        self.chat(messages, temperature, max_tokens).await
    }

    /// Streaming variant: text fragments are pushed to `on_delta` as they
    /// arrive, and the fully-assembled [`LLMResponse`] (content + tool calls +
    /// usage) is returned at the end. Providers that don't implement real
    /// streaming fall back to a single non-streaming call that emits the whole
    /// content as one delta, so callers can always use this path uniformly.
    async fn chat_stream(
        &self,
        messages: Vec<Message>,
        tools: &[ToolDefinition],
        temperature: f64,
        max_tokens: u32,
        on_delta: &mut (dyn for<'a> FnMut(&'a str) + Send),
    ) -> Result<LLMResponse, AppError> {
        let resp = if tools.is_empty() {
            self.chat(messages, temperature, max_tokens).await?
        } else {
            self.chat_with_tools(messages, tools, temperature, max_tokens)
                .await?
        };
        // Clone to a local so the borrow for `on_delta` doesn't span the move of `resp`.
        let content = resp.content.clone();
        if !content.is_empty() {
            on_delta(&content);
        }
        Ok(resp)
    }
}

pub fn estimate_tokens(text: &str) -> u32 {
    (text.len() as f64 / 3.5).ceil() as u32
}
