use chrono::Utc;
use serde::Serialize;
use serde_json::Value;
use tauri::{Emitter, State, Window};
use uuid::Uuid;

use crate::agents::instance::AgentInstance;
use crate::error::AppError;
use crate::llm::factory::{provider_from_runtime_config, resolve_runtime_config_for_agent};
use crate::models::common::{PaginatedResponse, SuccessResponse};
use crate::models::execution::{
    ExecutionCreate, ExecutionListItem, ExecutionMessage, ExecutionRecord, ExecutionResponse,
};
use crate::models::team::Team;
use crate::orchestration::control::{self, ControlSnapshot, ControlState};
use crate::orchestration::debate::run_debate;
use crate::orchestration::driver::ConversationDriver;
use crate::orchestration::freeform::run_freeform;
use crate::orchestration::pipeline::run_pipeline;
use crate::orchestration::roundtable::run_roundtable;
use crate::orchestration::state::OrchestrationState;
use crate::state::AppState;
use crate::tools::executor::ToolExecutor;

const LOCAL_USER_ID: &str = "local";
const EVENT_NAME: &str = "execution-event";

#[derive(Debug, Clone, Serialize)]
struct ExecutionEventPayload {
    execution_id: String,
    event_type: String,
    data: Value,
    agent_id: Option<String>,
    sequence: u64,
}

/// Live token-streaming sink: emits `opinion_start` / `opinion_delta` events
/// straight to the frontend window. Uses an independent sequence counter —
/// these ephemeral deltas are routed by `message_id` on the client and never
/// enter the persisted, sequence-ordered message list.
struct WindowDeltaSink {
    window: Window,
    execution_id: String,
    seq: std::sync::Arc<std::sync::atomic::AtomicU64>,
}

impl WindowDeltaSink {
    fn send(&self, event_type: &str, data: Value, agent_id: Option<String>) {
        let sequence = self.seq.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
        let payload = ExecutionEventPayload {
            execution_id: self.execution_id.clone(),
            event_type: event_type.to_string(),
            data,
            agent_id,
            sequence,
        };
        let _ = self.window.emit(EVENT_NAME, payload);
    }
}

impl crate::orchestration::driver::DeltaSink for WindowDeltaSink {
    fn opinion_start(
        &self,
        message_id: &str,
        agent_id: &str,
        agent_name: &str,
        round: i32,
        phase: &str,
    ) {
        self.send(
            "opinion_start",
            serde_json::json!({
                "message_id": message_id,
                "agent_name": agent_name,
                "round": round,
                "phase": phase
            }),
            Some(agent_id.to_string()),
        );
    }

    fn opinion_delta(&self, message_id: &str, agent_id: &str, delta: &str) {
        self.send(
            "opinion_delta",
            serde_json::json!({ "message_id": message_id, "delta": delta }),
            Some(agent_id.to_string()),
        );
    }
}

#[tauri::command]
pub fn list_executions(
    state: State<AppState>,
    page: Option<usize>,
    page_size: Option<usize>,
    team_id: Option<String>,
    status_filter: Option<String>,
) -> Result<PaginatedResponse<ExecutionListItem>, AppError> {
    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(20).clamp(1, 100);

    let mut executions = state.store.executions_list()?;
    executions.retain(|e| e.user_id == LOCAL_USER_ID);

    if let Some(team_id) = team_id {
        executions.retain(|e| e.team_id == team_id);
    }
    if let Some(status_filter) = status_filter {
        executions.retain(|e| e.status == status_filter);
    }

    executions.sort_by_key(|e| std::cmp::Reverse(e.created_at));

    let total = executions.len();
    let total_pages = if total == 0 {
        0
    } else {
        total.div_ceil(page_size)
    };
    let start = (page - 1) * page_size;
    let end = (start + page_size).min(total);
    let slice = if start >= total {
        &[]
    } else {
        &executions[start..end]
    };

    let items = slice
        .iter()
        .map(|e| ExecutionListItem {
            id: e.id.clone(),
            team_id: e.team_id.clone(),
            title: e.title.clone(),
            status: e.status.clone(),
            current_round: e.current_round,
            tokens_used: e.tokens_used,
            cost: e.cost,
            started_at: e.started_at,
            completed_at: e.completed_at,
            created_at: e.created_at,
        })
        .collect();

    Ok(PaginatedResponse {
        items,
        total,
        page,
        page_size,
        total_pages,
    })
}

#[tauri::command]
pub fn get_execution(state: State<AppState>, id: String) -> Result<ExecutionResponse, AppError> {
    let record = state
        .store
        .executions_get(&id)?
        .ok_or_else(|| AppError::Message(format!("Execution {id} not found")))?;
    let mut messages = state.store.execution_messages_list(&id)?;
    messages.sort_by_key(|m| m.sequence);
    let total = messages.len();
    let start = total.saturating_sub(50);
    let recent = messages[start..].to_vec();
    Ok(ExecutionResponse::from_record(record, recent))
}

#[tauri::command]
pub fn create_execution(
    state: State<AppState>,
    execution: ExecutionCreate,
) -> Result<ExecutionResponse, AppError> {
    let now = Utc::now();
    let record = ExecutionRecord {
        id: Uuid::new_v4().to_string(),
        user_id: LOCAL_USER_ID.to_string(),
        team_id: execution.team_id,
        title: execution.title,
        initial_input: execution.input,
        llm: execution.llm,
        status: "pending".to_string(),
        current_stage: None,
        current_round: 0,
        shared_state: serde_json::json!({}),
        agent_states: serde_json::json!({}),
        final_output: None,
        structured_output: None,
        tokens_used: 0,
        tokens_budget: execution.budget.max_tokens,
        cost: 0.0,
        cost_budget: execution.budget.max_cost,
        started_at: None,
        completed_at: None,
        error_message: None,
        retry_count: 0,
        workspace_path: execution.workspace_path,
        created_at: now,
        updated_at: now,
    };
    state.store.executions_upsert(&record)?;
    Ok(ExecutionResponse::from_record(record, Vec::new()))
}

#[tauri::command]
pub fn delete_execution(state: State<AppState>, id: String) -> Result<SuccessResponse, AppError> {
    state.store.executions_delete(&id)?;
    Ok(SuccessResponse {
        success: true,
        message: "Execution deleted successfully".to_string(),
    })
}

#[tauri::command]
pub fn control_execution(
    state: State<AppState>,
    id: String,
    action: String,
    params: Option<Value>,
) -> Result<SuccessResponse, AppError> {
    let mut execution = state
        .store
        .executions_get(&id)?
        .ok_or_else(|| AppError::Message(format!("Execution {id} not found")))?;

    let params = params.unwrap_or_else(|| serde_json::json!({}));
    let status = execution.status.clone();

    // Signal the live run (if any) so the change takes effect mid-discussion,
    // not just in the DB record.
    let handle = control::lookup(&state.controls, &id);

    if action == "pause" && status == "running" {
        execution.status = "paused".to_string();
        if let Some(h) = &handle {
            h.pause();
        }
    } else if action == "resume" && status == "paused" {
        execution.status = "running".to_string();
        if let Some(h) = &handle {
            h.resume();
        }
    } else if action == "stop" && (status == "running" || status == "paused") {
        execution.status = "stopped".to_string();
        execution.completed_at = Some(Utc::now());
        if let Some(h) = &handle {
            h.stop();
        }
    } else if action == "extend_budget" {
        let add_tokens = params
            .get("tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(50_000) as u32;
        let add_cost = params.get("cost").and_then(|v| v.as_f64()).unwrap_or(5.0);
        execution.tokens_budget = execution.tokens_budget.saturating_add(add_tokens);
        execution.cost_budget += add_cost;
        if let Some(h) = &handle {
            h.extend_budget(add_tokens, add_cost);
        }
    } else {
        return Err(AppError::Message(
            "Invalid action or execution state".to_string(),
        ));
    }

    execution.updated_at = Utc::now();
    state.store.executions_upsert(&execution)?;

    Ok(SuccessResponse {
        success: true,
        message: format!("Action '{action}' executed successfully"),
    })
}

#[tauri::command]
pub fn set_execution_workspace(
    state: State<AppState>,
    id: String,
    workspace_path: Option<String>,
) -> Result<ExecutionResponse, AppError> {
    let mut execution = state
        .store
        .executions_get(&id)?
        .ok_or_else(|| AppError::Message(format!("Execution {id} not found")))?;
    execution.workspace_path = workspace_path;
    execution.updated_at = Utc::now();
    state.store.executions_upsert(&execution)?;
    Ok(ExecutionResponse::from_record(execution, Vec::new()))
}

#[tauri::command]
pub fn start_execution(
    window: Window,
    state: State<AppState>,
    execution_id: String,
) -> Result<(), AppError> {
    let store = state.store.clone();
    let controls = state.controls.clone();
    let window = window.clone();

    tauri::async_runtime::spawn(async move {
        if let Err(err) = run_execution(
            window.clone(),
            store.clone(),
            controls.clone(),
            execution_id.clone(),
            None,
            None,
        )
        .await
        {
            let message = err.to_string();
            if let Ok(Some(mut execution)) = store.executions_get(&execution_id) {
                execution.status = "failed".to_string();
                execution.error_message = Some(message.clone());
                execution.updated_at = Utc::now();
                let _ = store.executions_upsert(&execution);
            }
            let mut seq = 0;
            emit_event(
                &window,
                &execution_id,
                "error",
                serde_json::json!({ "message": message }),
                None,
                &mut seq,
            );
        }
    });

    Ok(())
}

#[tauri::command]
pub fn followup_execution(
    window: Window,
    state: State<AppState>,
    execution_id: String,
    input: String,
    target_agent_id: Option<String>,
) -> Result<(), AppError> {
    let store = state.store.clone();
    let controls = state.controls.clone();
    let window = window.clone();

    tauri::async_runtime::spawn(async move {
        if let Err(err) = run_execution(
            window.clone(),
            store.clone(),
            controls.clone(),
            execution_id.clone(),
            Some(input),
            target_agent_id,
        )
        .await
        {
            let message = err.to_string();
            if let Ok(Some(mut execution)) = store.executions_get(&execution_id) {
                execution.status = "failed".to_string();
                execution.error_message = Some(message.clone());
                execution.updated_at = Utc::now();
                let _ = store.executions_upsert(&execution);
            }
            let mut seq = 0;
            emit_event(
                &window,
                &execution_id,
                "error",
                serde_json::json!({ "message": message }),
                None,
                &mut seq,
            );
        }
    });

    Ok(())
}

async fn run_execution(
    window: Window,
    store: std::sync::Arc<crate::store::sqlite::SqliteStore>,
    controls: control::ControlRegistry,
    execution_id: String,
    followup_input: Option<String>,
    target_agent_id: Option<String>,
) -> Result<(), AppError> {
    let mut event_seq: u64 = 0;

    let Some(mut execution) = store.executions_get(&execution_id)? else {
        emit_event(
            &window,
            &execution_id,
            "error",
            serde_json::json!({"message": "Execution not found"}),
            None,
            &mut event_seq,
        );
        return Ok(());
    };

    if followup_input.is_none() && execution.status != "pending" {
        // Allow users to reconnect / view history without re-starting the execution.
        return Ok(());
    }

    if let Some(input) = &followup_input {
        if execution.status != "paused" && execution.status != "completed" {
            emit_event(
                &window,
                &execution_id,
                "error",
                serde_json::json!({"message": "Invalid execution state for follow-up"}),
                None,
                &mut event_seq,
            );
            return Ok(());
        }
        // Continue with follow-up.
        execution.status = "running".to_string();
        execution.updated_at = Utc::now();
        store.executions_upsert(&execution)?;
        emit_event(
            &window,
            &execution_id,
            "status",
            serde_json::json!({"status": "running"}),
            None,
            &mut event_seq,
        );

        run_round(
            window,
            store,
            controls,
            execution,
            input.clone(),
            target_agent_id,
            &mut event_seq,
        )
        .await?;
        return Ok(());
    }

    // Start execution
    let initial = execution.initial_input.trim().to_string();
    if initial.is_empty() {
        execution.status = "paused".to_string();
        execution.updated_at = Utc::now();
        store.executions_upsert(&execution)?;
        emit_event(
            &window,
            &execution_id,
            "status",
            serde_json::json!({
                "message": "等待输入讨论主题（请输入内容后发送追问以继续）",
                "phase": "awaiting_user_input"
            }),
            None,
            &mut event_seq,
        );
        return Ok(());
    }

    execution.status = "running".to_string();
    execution.started_at = Some(Utc::now());
    execution.updated_at = Utc::now();
    store.executions_upsert(&execution)?;

    emit_event(
        &window,
        &execution_id,
        "status",
        serde_json::json!({"status": "running"}),
        None,
        &mut event_seq,
    );

    run_round(
        window,
        store,
        controls,
        execution,
        initial,
        None,
        &mut event_seq,
    )
    .await?;
    Ok(())
}

async fn run_round(
    window: Window,
    store: std::sync::Arc<crate::store::sqlite::SqliteStore>,
    controls: control::ControlRegistry,
    mut execution: ExecutionRecord,
    topic: String,
    target_agent_id: Option<String>,
    event_seq: &mut u64,
) -> Result<(), AppError> {
    let execution_id = execution.id.clone();
    let team = store
        .teams_get(&execution.team_id)?
        .ok_or_else(|| AppError::Message("Team not found".to_string()))?;

    let Some(llm) = execution.llm.clone() else {
        emit_event(
            &window,
            &execution_id,
            "error",
            serde_json::json!({"message": "No LLM configured. Please set it in the UI (API配置) and start a new execution."}),
            None,
            event_seq,
        );
        execution.status = "failed".to_string();
        execution.error_message = Some("No LLM configured".to_string());
        execution.updated_at = Utc::now();
        store.executions_upsert(&execution)?;
        return Ok(());
    };

    let mut state: OrchestrationState =
        serde_json::from_value(execution.shared_state.clone()).unwrap_or_default();
    if state.topic.trim().is_empty() {
        state.topic = topic.clone();
    }
    state.start_new_round();
    state.topic = topic.clone();
    let round_num = state.round;

    let agents = build_agent_instances(&store, &team, &llm, target_agent_id.as_deref()).await?;

    let mut msg_seq = store.execution_messages_next_sequence(&execution_id)?;

    // persist + emit user message first
    let now = Utc::now();
    let user_message = ExecutionMessage {
        id: Uuid::new_v4().to_string(),
        sequence: msg_seq,
        round: state.round,
        phase: "user".to_string(),
        sender_type: "user".to_string(),
        sender_id: None,
        sender_name: Some("you".to_string()),
        content: topic.clone(),
        content_type: "text".to_string(),
        responding_to: None,
        target_agent_id: None,
        wants_to_continue: true,
        input_tokens: 0,
        output_tokens: 0,
        tokens_estimated: false,
        metadata: serde_json::json!({}),
        created_at: now,
        updated_at: now,
    };
    store.execution_messages_upsert(&execution_id, &user_message)?;
    emit_event(
        &window,
        &execution_id,
        "user",
        serde_json::json!({
            "content": topic,
            "phase": "user",
            "round": state.round,
            "message_id": user_message.id,
            "message_sequence": user_message.sequence
        }),
        None,
        event_seq,
    );
    msg_seq += 1;

    let mut emit =
        |event_type: &str, mut data: Value, agent_id: Option<String>| -> Result<(), AppError> {
            if event_type == "opinion" {
                let agent_name = data
                    .get("agent_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("agent");
                let content = data.get("content").and_then(|v| v.as_str()).unwrap_or("");
                let round = data
                    .get("round")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(round_num as i64) as i32;
                let phase = data
                    .get("phase")
                    .and_then(|v| v.as_str())
                    .unwrap_or("opinion")
                    .to_string();
                let now = Utc::now();
                let input_tokens = data
                    .get("input_tokens")
                    .and_then(|v| v.as_u64())
                    .or_else(|| {
                        data.get("metadata")
                            .and_then(|m| m.get("input_tokens"))
                            .and_then(|v| v.as_u64())
                    })
                    .unwrap_or(0)
                    .min(u64::from(u32::MAX)) as u32;
                let output_tokens = data
                    .get("output_tokens")
                    .and_then(|v| v.as_u64())
                    .or_else(|| {
                        data.get("metadata")
                            .and_then(|m| m.get("output_tokens"))
                            .and_then(|v| v.as_u64())
                    })
                    .unwrap_or(0)
                    .min(u64::from(u32::MAX)) as u32;
                let tokens_estimated = data
                    .get("tokens_estimated")
                    .and_then(|v| v.as_bool())
                    .or_else(|| {
                        data.get("metadata")
                            .and_then(|m| m.get("tokens_estimated"))
                            .and_then(|v| v.as_bool())
                    })
                    .unwrap_or(false);
                // Honor a message_id supplied by the driver (so a streamed
                // bubble and its final persisted message share one id).
                let message_id = data
                    .get("message_id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| Uuid::new_v4().to_string());
                let message = ExecutionMessage {
                    id: message_id,
                    sequence: msg_seq,
                    round,
                    phase: phase.clone(),
                    sender_type: if agent_id.is_some() {
                        "agent".to_string()
                    } else {
                        "system".to_string()
                    },
                    sender_id: agent_id.clone(),
                    sender_name: Some(agent_name.to_string()),
                    content: content.to_string(),
                    content_type: "text".to_string(),
                    responding_to: data
                        .get("responding_to")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    target_agent_id: data
                        .get("target_agent_id")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    wants_to_continue: data
                        .get("wants_to_continue")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true),
                    input_tokens,
                    output_tokens,
                    tokens_estimated,
                    metadata: data
                        .get("metadata")
                        .cloned()
                        .unwrap_or_else(|| serde_json::json!({})),
                    created_at: now,
                    updated_at: now,
                };
                store.execution_messages_upsert(&execution_id, &message)?;
                if let Some(obj) = data.as_object_mut() {
                    obj.insert("message_id".to_string(), Value::String(message.id.clone()));
                    obj.insert(
                        "message_sequence".to_string(),
                        serde_json::json!(message.sequence),
                    );
                }
                msg_seq += 1;
            } else if event_type == "tool_call" || event_type == "tool_result" {
                let tool_name = data
                    .get("tool_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("tool");
                let content = data.get("content").and_then(|v| v.as_str()).unwrap_or("");
                let round = data
                    .get("round")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(round_num as i64) as i32;
                let phase = data
                    .get("phase")
                    .and_then(|v| v.as_str())
                    .unwrap_or(event_type)
                    .to_string();
                let now = Utc::now();
                let message = ExecutionMessage {
                    id: Uuid::new_v4().to_string(),
                    sequence: msg_seq,
                    round,
                    phase: phase.clone(),
                    sender_type: "system".to_string(),
                    sender_id: agent_id.clone(),
                    sender_name: Some(format!("tool:{tool_name}")),
                    content: content.to_string(),
                    content_type: "text".to_string(),
                    responding_to: None,
                    target_agent_id: None,
                    wants_to_continue: true,
                    input_tokens: 0,
                    output_tokens: 0,
                    tokens_estimated: false,
                    metadata: data.clone(),
                    created_at: now,
                    updated_at: now,
                };
                store.execution_messages_upsert(&execution_id, &message)?;
                if let Some(obj) = data.as_object_mut() {
                    obj.insert("message_id".to_string(), Value::String(message.id.clone()));
                    obj.insert(
                        "message_sequence".to_string(),
                        serde_json::json!(message.sequence),
                    );
                }
                msg_seq += 1;
            }

            emit_event(
                &window,
                &execution_id,
                event_type,
                data,
                agent_id,
                event_seq,
            );
            Ok(())
        };

    let mut tool_defs = Vec::new();
    let mut tool_executor: Option<ToolExecutor> = None;
    if let Some(path) = execution
        .workspace_path
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        match ToolExecutor::new(std::path::PathBuf::from(path)) {
            Ok(exec) => {
                tool_defs = exec.definitions();
                tool_executor = Some(exec);
            }
            Err(e) => {
                emit(
                    "status",
                    serde_json::json!({
                        "message": format!("Tool calling disabled: {e}"),
                        "phase": "tooling_error",
                        "round": state.round
                    }),
                    None,
                )?;
            }
        }
    }

    // Resolve the round bound: coordination rule if set, else a per-mode default.
    let mode = team.collaboration_mode.clone();
    let configured_rounds = team.coordination_rules.max_rounds;
    let default_rounds = match mode.as_str() {
        "debate" | "freeform" => 3,
        _ => 2,
    };
    let max_rounds = if configured_rounds > 0 {
        configured_rounds
    } else {
        default_rounds
    };

    // Register a live control handle so pause / stop / extend_budget reach this run.
    let snapshot = ControlSnapshot::new(execution.tokens_budget, execution.cost_budget);
    let control_rx = control::register(&controls, &execution_id, snapshot);
    let status_rx = control_rx.clone();

    // Live streaming sink → frontend gets opinion_start + token deltas.
    let sink = std::sync::Arc::new(WindowDeltaSink {
        window: window.clone(),
        execution_id: execution_id.clone(),
        seq: std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0)),
    });

    let mut driver =
        ConversationDriver::new(Some(control_rx), tool_defs, tool_executor, max_rounds)
            .with_sink(sink);

    // Dispatch by mode. Unknown modes fail loudly rather than silently falling
    // back to roundtable.
    let run_result: Result<(), AppError> = match mode.as_str() {
        "pipeline" => run_pipeline(&mut driver, agents, &mut state, &mut emit).await,
        "debate" => run_debate(&mut driver, agents, &mut state, &mut emit).await,
        "roundtable" => {
            let summary_agent = team.output_rules.summary_agent_id.clone();
            run_roundtable(&mut driver, agents, &mut state, &mut emit, summary_agent).await
        }
        "freeform" => run_freeform(&mut driver, agents, &mut state, &mut emit).await,
        other => {
            let _ = emit(
                "status",
                serde_json::json!({
                    "message": format!("未知协作模式: {other}"),
                    "phase": "config_error"
                }),
                None,
            );
            Err(AppError::Message(format!(
                "Unknown collaboration mode: {other}"
            )))
        }
    };

    control::deregister(&controls, &execution_id);
    run_result?;

    // Finalize: a user stop leaves the run "stopped"; otherwise "completed".
    let stopped = status_rx.borrow().state == ControlState::Stopped;
    execution.status = if stopped { "stopped" } else { "completed" }.to_string();
    execution.completed_at = Some(Utc::now());
    execution.current_round = state.round;
    execution.tokens_used = state.tokens_used;
    execution.cost = state.cost;
    execution.shared_state = serde_json::to_value(&state).unwrap_or_else(|_| serde_json::json!({}));
    execution.updated_at = Utc::now();
    store.executions_upsert(&execution)?;

    emit_event(
        &window,
        &execution_id,
        "status",
        serde_json::json!({"status": execution.status}),
        None,
        event_seq,
    );

    Ok(())
}

async fn build_agent_instances(
    store: &crate::store::sqlite::SqliteStore,
    team: &Team,
    llm: &crate::models::llm::ExecutionLLMConfig,
    target_agent_id: Option<&str>,
) -> Result<Vec<AgentInstance>, AppError> {
    let mut members = team.members.clone();
    members.sort_by_key(|m| m.position);
    let agent_ids = members
        .iter()
        .filter(|m| m.is_active)
        .map(|m| m.agent_id.clone())
        .collect::<Vec<_>>();

    let mut instances = Vec::new();
    for agent_id in agent_ids {
        if let Some(target) = target_agent_id {
            if agent_id != target {
                continue;
            }
        }
        let Some(agent) = store.agents_get(&agent_id)? else {
            continue;
        };

        let cfg = resolve_runtime_config_for_agent(agent.model_id.as_deref(), llm)?;
        let provider = provider_from_runtime_config(&cfg)?;
        instances.push(
            AgentInstance::from_agent(&agent, provider)
                .with_pricing(cfg.input_price_per_1k, cfg.output_price_per_1k),
        );
    }

    if instances.is_empty() {
        return Err(AppError::Message("No agents in team".to_string()));
    }

    Ok(instances)
}

fn emit_event(
    window: &Window,
    execution_id: &str,
    event_type: &str,
    data: Value,
    agent_id: Option<String>,
    seq: &mut u64,
) {
    *seq += 1;
    let payload = ExecutionEventPayload {
        execution_id: execution_id.to_string(),
        event_type: event_type.to_string(),
        data,
        agent_id,
        sequence: *seq,
    };
    let _ = window.emit(EVENT_NAME, payload);
}
