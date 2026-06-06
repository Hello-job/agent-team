use serde::{Deserialize, Serialize};

use crate::llm::provider::{LLMProvider, Message, MessageRole};
use crate::models::agent::Agent;
use crate::tools::definition::{ToolDefinition, ToolTrace};
use crate::tools::executor::ToolExecutor;

#[derive(Clone)]
pub struct AgentInstance {
    pub id: String,
    pub name: String,
    pub system_prompt: String,
    pub temperature: f64,
    pub max_tokens: u32,
    pub max_tool_iterations: u32,
    /// Price per 1k input/output tokens, used by the driver to accrue real cost.
    pub input_price_per_1k: f64,
    pub output_price_per_1k: f64,
    llm: std::sync::Arc<dyn LLMProvider>,
    opinions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentResponse {
    pub content: String,
    #[serde(default = "default_true")]
    pub wants_to_continue: bool,
    #[serde(default)]
    pub responding_to: Option<String>,
    #[serde(default)]
    pub metadata: serde_json::Value,
}

impl AgentResponse {
    /// Extract the `(input_tokens, output_tokens, estimated)` triple from
    /// `metadata`, defaulting to `(0, 0, false)` when a field is absent or the
    /// wrong type. Centralizes the token-accounting boilerplate that every
    /// orchestration mode (roundtable / debate / pipeline) needs after a turn.
    pub fn token_counts(&self) -> (u32, u32, bool) {
        let input_tokens = self
            .metadata
            .get("input_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;
        let output_tokens = self
            .metadata
            .get("output_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;
        let estimated = self
            .metadata
            .get("tokens_estimated")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        (input_tokens, output_tokens, estimated)
    }
}

impl AgentInstance {
    pub fn from_agent(agent: &Agent, llm: std::sync::Arc<dyn LLMProvider>) -> Self {
        Self {
            id: agent.id.clone(),
            name: agent.name.clone(),
            system_prompt: agent.system_prompt.clone(),
            temperature: agent.temperature,
            max_tokens: agent.max_tokens,
            max_tool_iterations: agent.max_tool_iterations.unwrap_or(10).clamp(1, 50),
            input_price_per_1k: 0.0,
            output_price_per_1k: 0.0,
            llm,
            opinions: Vec::new(),
        }
    }

    /// Attach per-1k-token pricing (from the resolved runtime config) so the
    /// driver can compute real cost per turn.
    pub fn with_pricing(mut self, input_price_per_1k: f64, output_price_per_1k: f64) -> Self {
        self.input_price_per_1k = input_price_per_1k;
        self.output_price_per_1k = output_price_per_1k;
        self
    }

    /// Minimal constructor for orchestration tests: wires a (mock) provider
    /// without needing a full `Agent` record.
    #[cfg(test)]
    pub fn new_for_test(id: &str, name: &str, llm: std::sync::Arc<dyn LLMProvider>) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            system_prompt: String::new(),
            temperature: 0.0,
            max_tokens: 256,
            max_tool_iterations: 1,
            input_price_per_1k: 0.0,
            output_price_per_1k: 0.0,
            llm,
            opinions: Vec::new(),
        }
    }

    fn build_context_message(
        &self,
        discussion_summary: &str,
        recent_opinions: &[serde_json::Value],
        current_topic: &str,
    ) -> String {
        let mut parts = vec![format!("## 当前讨论主题\n{current_topic}")];
        if !discussion_summary.trim().is_empty() {
            parts.push(format!("## 讨论摘要\n{discussion_summary}"));
        }

        if !recent_opinions.is_empty() {
            let mut lines = Vec::new();
            for op in recent_opinions {
                let agent_name = op
                    .get("agent_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                let content = op.get("content").and_then(|v| v.as_str()).unwrap_or("");
                lines.push(format!("- **{agent_name}**: {content}"));
            }
            parts.push(format!("## 其他专家的观点\n{}", lines.join("\n")));
        }

        if !self.opinions.is_empty() {
            let start = self.opinions.len().saturating_sub(3);
            let mine: Vec<String> = self.opinions[start..]
                .iter()
                .map(|s| format!("- {s}"))
                .collect();
            parts.push(format!("## 你之前的观点\n{}", mine.join("\n")));
        }

        parts.join("\n\n")
    }

    /// One-off raw completion, no opinion scaffolding. Used by the freeform
    /// moderator to decide who speaks next.
    pub async fn raw_complete(
        &self,
        system: &str,
        user: &str,
    ) -> Result<String, crate::error::AppError> {
        let messages = vec![
            Message {
                role: MessageRole::System,
                content: Some(system.to_string()),
                name: None,
                tool_call_id: None,
                tool_calls: None,
            },
            Message {
                role: MessageRole::User,
                content: Some(user.to_string()),
                name: None,
                tool_call_id: None,
                tool_calls: None,
            },
        ];
        let resp = self
            .llm
            .chat(messages, self.temperature, self.max_tokens)
            .await?;
        Ok(resp.content)
    }

    fn system_message(&self) -> Message {
        Message {
            role: MessageRole::System,
            content: Some(self.system_prompt.clone()),
            name: None,
            tool_call_id: None,
            tool_calls: None,
        }
    }

    #[allow(dead_code)]
    pub async fn generate_opinion(
        &mut self,
        topic: &str,
        discussion_summary: &str,
        recent_opinions: &[serde_json::Value],
        phase: &str,
    ) -> Result<AgentResponse, crate::error::AppError> {
        let (resp, _traces) = self
            .generate_opinion_with_tools(
                topic,
                discussion_summary,
                recent_opinions,
                phase,
                &[],
                None,
            )
            .await?;
        Ok(resp)
    }

    pub async fn generate_opinion_with_tools(
        &mut self,
        topic: &str,
        discussion_summary: &str,
        recent_opinions: &[serde_json::Value],
        _phase: &str,
        tools: &[ToolDefinition],
        executor: Option<&ToolExecutor>,
    ) -> Result<(AgentResponse, Vec<ToolTrace>), crate::error::AppError> {
        let mut messages = vec![self.system_message()];

        // 添加协作机制提示（[DONE] 标记）
        messages.push(Message {
            role: MessageRole::System,
            content: Some(
                "协作提示：如果你认为当前讨论已经充分完成，请在回复末尾另起一行写上 [DONE]"
                    .to_string(),
            ),
            name: None,
            tool_call_id: None,
            tool_calls: None,
        });

        let context = self.build_context_message(discussion_summary, recent_opinions, topic);
        messages.push(Message {
            role: MessageRole::User,
            content: Some(context),
            name: None,
            tool_call_id: None,
            tool_calls: None,
        });

        let tools_enabled = executor.is_some() && !tools.is_empty();
        if tools_enabled {
            messages.insert(
                2,
                Message {
                    role: MessageRole::System,
                    content: Some(
                        "你可以在需要时调用工具来读取/搜索/修改工作目录下的文件。".to_string(),
                    ),
                    name: None,
                    tool_call_id: None,
                    tool_calls: None,
                },
            );
        }

        let mut traces: Vec<ToolTrace> = Vec::new();
        let mut total_input_tokens: u32 = 0;
        let mut total_output_tokens: u32 = 0;
        let mut tokens_estimated: bool = false;

        let max_iters: usize = self.max_tool_iterations.clamp(1, 50) as usize;
        let mut final_text = String::new();
        let mut last_text = String::new();
        for _ in 0..max_iters {
            let resp = if tools_enabled {
                self.llm
                    .chat_with_tools(messages.clone(), tools, self.temperature, self.max_tokens)
                    .await?
            } else {
                self.llm
                    .chat(messages.clone(), self.temperature, self.max_tokens)
                    .await?
            };

            total_input_tokens = total_input_tokens.saturating_add(resp.usage.input_tokens);
            total_output_tokens = total_output_tokens.saturating_add(resp.usage.output_tokens);
            tokens_estimated = tokens_estimated || resp.usage.estimated;
            last_text = resp.content.clone();

            if resp.tool_calls.is_empty() || !tools_enabled {
                final_text = resp.content;
                break;
            }

            let tool_calls = resp.tool_calls.clone();
            messages.push(Message {
                role: MessageRole::Assistant,
                content: None,
                name: None,
                tool_call_id: None,
                tool_calls: Some(tool_calls.clone()),
            });

            for call in tool_calls {
                let Some(executor) = executor else { break };
                let result = executor.execute(call.clone()).await;
                traces.push(ToolTrace {
                    call: call.clone(),
                    result: result.clone(),
                });

                let tool_payload = serde_json::json!({
                    "ok": result.ok,
                    "name": result.name,
                    "output": result.output,
                    "error": result.error
                });
                let tool_content = serde_json::to_string(&tool_payload)
                    .unwrap_or_else(|_| tool_payload.to_string());
                messages.push(Message {
                    role: MessageRole::Tool,
                    content: Some(tool_content),
                    name: None,
                    tool_call_id: Some(result.tool_call_id.clone()),
                    tool_calls: None,
                });
            }
        }

        if final_text.trim().is_empty() {
            final_text = last_text;
        }

        let content = final_text.trim().to_string();
        self.opinions.push(content.clone());
        let wants_to_continue = should_continue(&content);

        Ok((
            AgentResponse {
                content,
                wants_to_continue,
                responding_to: None,
                metadata: serde_json::json!({
                    "input_tokens": total_input_tokens,
                    "output_tokens": total_output_tokens,
                    "tokens_estimated": tokens_estimated
                }),
            },
            traces,
        ))
    }
}

fn should_continue(content: &str) -> bool {
    // 共识信号：[DONE] 必须独立成行或位于结尾，避免正文里偶然提到就误判终止。
    let done = content.lines().any(|line| line.trim() == "[DONE]")
        || content.trim_end().ends_with("[DONE]");
    !done
}

fn default_true() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn resp_with(metadata: serde_json::Value) -> AgentResponse {
        AgentResponse {
            content: String::new(),
            wants_to_continue: true,
            responding_to: None,
            metadata,
        }
    }

    #[test]
    fn token_counts_reads_all_fields() {
        let resp = resp_with(serde_json::json!({
            "input_tokens": 12,
            "output_tokens": 34,
            "tokens_estimated": true
        }));
        assert_eq!(resp.token_counts(), (12, 34, true));
    }

    #[test]
    fn token_counts_defaults_when_absent() {
        assert_eq!(
            resp_with(serde_json::json!({})).token_counts(),
            (0, 0, false)
        );
        assert_eq!(
            resp_with(serde_json::Value::Null).token_counts(),
            (0, 0, false)
        );
    }

    #[test]
    fn token_counts_handles_partial_metadata() {
        let resp = resp_with(serde_json::json!({ "input_tokens": 7 }));
        assert_eq!(resp.token_counts(), (7, 0, false));
    }

    #[test]
    fn should_continue_flips_on_done_marker() {
        assert!(should_continue("still thinking"));
        assert!(!should_continue("final answer\n[DONE]"));
        assert!(!should_continue("all settled [DONE]"));
        // A passing mention mid-sentence must NOT terminate the discussion.
        assert!(should_continue("I'm not [DONE] yet, more to discuss"));
    }
}
