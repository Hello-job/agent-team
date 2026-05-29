use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::models::llm::ExecutionLLMConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetConfig {
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default = "default_max_cost")]
    pub max_cost: f64,
    #[serde(default = "default_warning_thresholds")]
    pub warning_thresholds: Vec<f64>,
}

impl Default for BudgetConfig {
    fn default() -> Self {
        Self {
            max_tokens: default_max_tokens(),
            max_cost: default_max_cost(),
            warning_thresholds: default_warning_thresholds(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionCreate {
    pub team_id: String,
    #[serde(default)]
    pub input: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub budget: BudgetConfig,
    #[serde(default)]
    pub llm: Option<ExecutionLLMConfig>,
    #[serde(default)]
    pub workspace_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionMessage {
    pub id: String,
    pub sequence: i32,
    pub round: i32,
    pub phase: String,
    pub sender_type: String,
    pub sender_id: Option<String>,
    pub sender_name: Option<String>,
    pub content: String,
    pub content_type: String,
    pub responding_to: Option<String>,
    pub target_agent_id: Option<String>,
    pub wants_to_continue: bool,
    #[serde(default)]
    pub input_tokens: u32,
    #[serde(default)]
    pub output_tokens: u32,
    #[serde(default)]
    pub tokens_estimated: bool,
    #[serde(default)]
    pub metadata: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionRecord {
    pub id: String,
    pub user_id: String,
    pub team_id: String,
    pub title: Option<String>,
    pub initial_input: String,
    #[serde(default)]
    pub llm: Option<ExecutionLLMConfig>,
    pub status: String,
    pub current_stage: Option<String>,
    pub current_round: i32,
    #[serde(default)]
    pub shared_state: Value,
    #[serde(default)]
    pub agent_states: Value,
    pub final_output: Option<String>,
    pub structured_output: Option<Value>,
    pub tokens_used: u32,
    pub tokens_budget: u32,
    pub cost: f64,
    pub cost_budget: f64,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
    pub retry_count: u32,
    pub workspace_path: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionResponse {
    pub id: String,
    pub user_id: String,
    pub team_id: String,
    pub title: Option<String>,
    pub initial_input: String,
    pub status: String,
    pub current_stage: Option<String>,
    pub current_round: i32,
    #[serde(default)]
    pub shared_state: Value,
    #[serde(default)]
    pub agent_states: Value,
    pub final_output: Option<String>,
    pub structured_output: Option<Value>,
    pub tokens_used: u32,
    pub tokens_budget: u32,
    pub cost: f64,
    pub cost_budget: f64,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
    #[serde(default)]
    pub recent_messages: Vec<ExecutionMessage>,
    pub workspace_path: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl ExecutionResponse {
    pub fn from_record(record: ExecutionRecord, recent_messages: Vec<ExecutionMessage>) -> Self {
        Self {
            id: record.id,
            user_id: record.user_id,
            team_id: record.team_id,
            title: record.title,
            initial_input: record.initial_input,
            status: record.status,
            current_stage: record.current_stage,
            current_round: record.current_round,
            shared_state: record.shared_state,
            agent_states: record.agent_states,
            final_output: record.final_output,
            structured_output: record.structured_output,
            tokens_used: record.tokens_used,
            tokens_budget: record.tokens_budget,
            cost: record.cost,
            cost_budget: record.cost_budget,
            started_at: record.started_at,
            completed_at: record.completed_at,
            error_message: record.error_message,
            recent_messages,
            workspace_path: record.workspace_path,
            created_at: record.created_at,
            updated_at: record.updated_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionListItem {
    pub id: String,
    pub team_id: String,
    pub title: Option<String>,
    pub status: String,
    pub current_round: i32,
    pub tokens_used: u32,
    pub cost: f64,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

fn default_max_tokens() -> u32 {
    200_000
}

fn default_max_cost() -> f64 {
    10.0
}

fn default_warning_thresholds() -> Vec<f64> {
    vec![0.5, 0.8, 0.95]
}
