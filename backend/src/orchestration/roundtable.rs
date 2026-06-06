//! Roundtable: agents share opinions concurrently each round, iterate until
//! consensus or `max_rounds`, then one agent synthesizes a summary.
//!
//! Runs on [`ConversationDriver`], so concurrency, cancellation, and budget are
//! handled uniformly. The opening round is genuinely parallel (independent
//! opinions); later rounds let agents react to what was said.

use serde_json::{json, Value};

use crate::agents::instance::AgentInstance;
use crate::error::AppError;
use crate::orchestration::driver::{ConversationDriver, TurnCtx};
use crate::orchestration::state::{OrchestrationPhase, OrchestrationState};

pub async fn run_roundtable<F>(
    driver: &mut ConversationDriver,
    mut agents: Vec<AgentInstance>,
    state: &mut OrchestrationState,
    emit: &mut F,
    summary_agent_id: Option<String>,
) -> Result<(), AppError>
where
    F: FnMut(&str, Value, Option<String>) -> Result<(), AppError>,
{
    if agents.is_empty() {
        return Ok(());
    }

    let topic = state.topic.clone();
    let summary = state.summary.clone();
    let max_rounds = driver.max_rounds();

    // Round 1 — independent opinions, run concurrently.
    state.phase = OrchestrationPhase::Parallel;
    {
        let recent = state.recent_opinions_json(6);
        let ctx = TurnCtx {
            topic: &topic,
            summary: &summary,
            recent: &recent,
            phase: "initial",
        };
        driver
            .run_turns_concurrent(&mut agents, &ctx, state, emit)
            .await?;
    }

    // Response rounds — iterate until consensus, max_rounds, or stop.
    state.phase = OrchestrationPhase::Responding;
    let mut round_idx = 1;
    while round_idx < max_rounds {
        if driver.should_stop(state).await.is_some() {
            break;
        }
        if consensus_reached(state) {
            emit(
                "status",
                json!({
                    "message": "所有专家认为讨论已充分完成",
                    "phase": "auto_complete",
                    "round": state.round
                }),
                None,
            )?;
            break;
        }

        state.start_new_round();
        let recent = state.recent_opinions_json(agents.len() * 2);
        let ctx = TurnCtx {
            topic: &topic,
            summary: &summary,
            recent: &recent,
            phase: "response",
        };
        driver
            .run_turns_concurrent(&mut agents, &ctx, state, emit)
            .await?;
        round_idx += 1;
    }

    // Summary — one designated agent synthesizes the discussion.
    run_summary(
        driver,
        &mut agents,
        state,
        emit,
        summary_agent_id.as_deref(),
        &topic,
    )
    .await?;

    state.phase = OrchestrationPhase::Completed;
    Ok(())
}

/// All agents have signaled they want to stop (and at least one has spoken).
fn consensus_reached(state: &OrchestrationState) -> bool {
    !state.agent_wants_continue.is_empty()
        && state.agent_wants_continue.values().all(|wants| !wants)
}

async fn run_summary<F>(
    driver: &mut ConversationDriver,
    agents: &mut [AgentInstance],
    state: &mut OrchestrationState,
    emit: &mut F,
    summary_agent_id: Option<&str>,
    topic: &str,
) -> Result<(), AppError>
where
    F: FnMut(&str, Value, Option<String>) -> Result<(), AppError>,
{
    if agents.is_empty() {
        return Ok(());
    }
    let idx = summary_agent_id
        .and_then(|sid| agents.iter().position(|a| a.id == sid))
        .unwrap_or(0);

    state.phase = OrchestrationPhase::Summarizing;
    let all_opinions = state.recent_opinions_json(state.opinions.len().min(50));
    let summary_prompt = format!(
        "请综合本次讨论中各位专家的观点，给出一个结构化、可执行的总结结论。\n\n讨论主题：{topic}"
    );
    let ctx = TurnCtx {
        topic: &summary_prompt,
        summary: "",
        recent: &all_opinions,
        phase: "summary",
    };
    if let Some(opinion) = driver.run_turn(&mut agents[idx], &ctx, state, emit).await? {
        state.summary = opinion.content;
    }
    Ok(())
}
