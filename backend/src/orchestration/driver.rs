//! `ConversationDriver` — the shared control plane every collaboration mode runs on.
//!
//! Modes (roundtable / debate / pipeline / freeform) used to each re-implement
//! the same per-turn dance: call the agent, accumulate tokens, emit the opinion,
//! handle errors — with subtly different (and inconsistent) error policies. The
//! driver centralizes that into three primitives:
//!
//! * [`ConversationDriver::run_turn`] — one agent turn, fully accounted + emitted.
//! * [`ConversationDriver::run_turns_concurrent`] — same-round agents in real
//!   parallel via [`futures::future::join_all`], then recorded in stable order.
//! * [`ConversationDriver::should_stop`] — one place that honors stop / pause /
//!   budget between turns.
//!
//! Error policy is uniform: a single failed turn is emitted as an `agent_error`
//! status and skipped; the discussion continues. Modes decide what to do if a
//! whole round produced nothing.

use futures::future::join_all;
use serde_json::{json, Value};
use tokio::sync::watch;

use crate::agents::instance::AgentInstance;
use crate::error::AppError;
use crate::orchestration::control::{ControlSnapshot, ControlState};
use crate::orchestration::state::{Opinion, OrchestrationState};
use crate::orchestration::tool_events::emit_tool_traces;
use crate::tools::definition::ToolDefinition;
use crate::tools::executor::ToolExecutor;

/// Why a mode loop should terminate early.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StopReason {
    /// User pressed stop.
    Stopped,
    /// Token or cost ceiling reached.
    BudgetExceeded,
}

/// Per-turn context handed to an agent. `phase` labels the resulting opinion
/// (e.g. `initial`, `pro_rebuttal`, `stage_2`).
pub struct TurnCtx<'a> {
    pub topic: &'a str,
    pub summary: &'a str,
    pub recent: &'a [Value],
    pub phase: &'a str,
}

pub struct ConversationDriver {
    control: Option<watch::Receiver<ControlSnapshot>>,
    tool_defs: Vec<ToolDefinition>,
    tool_executor: Option<ToolExecutor>,
    max_rounds: i32,
}

impl ConversationDriver {
    pub fn new(
        control: Option<watch::Receiver<ControlSnapshot>>,
        tool_defs: Vec<ToolDefinition>,
        tool_executor: Option<ToolExecutor>,
        max_rounds: i32,
    ) -> Self {
        Self {
            control,
            tool_defs,
            tool_executor,
            max_rounds,
        }
    }

    /// Resolved round bound, with a floor of 1 (a mode always runs at least one
    /// round). `coordination_rules.max_rounds` defaults to 0 → caller passes its
    /// own mode default in that case.
    pub fn max_rounds(&self) -> i32 {
        self.max_rounds.max(1)
    }

    /// Control-plane gate, called between turns/rounds. Returns `Some(reason)`
    /// when the loop must stop. Blocks (cooperatively) while paused, returning
    /// as soon as the run is resumed or stopped.
    pub async fn should_stop(&mut self, state: &OrchestrationState) -> Option<StopReason> {
        loop {
            let (run_state, tokens_budget, cost_budget) = match &self.control {
                Some(rx) => {
                    let snap = *rx.borrow();
                    (snap.state, snap.tokens_budget, snap.cost_budget)
                }
                None => (
                    ControlState::Running,
                    state.tokens_budget,
                    state.cost_budget,
                ),
            };

            match run_state {
                ControlState::Stopped => return Some(StopReason::Stopped),
                ControlState::Paused => match self.control.as_mut() {
                    // Wait for the next control change, then re-evaluate.
                    Some(rx) => {
                        if rx.changed().await.is_err() {
                            return Some(StopReason::Stopped);
                        }
                    }
                    None => return None,
                },
                ControlState::Running => {
                    if state.tokens_used >= tokens_budget || state.cost >= cost_budget {
                        return Some(StopReason::BudgetExceeded);
                    }
                    return None;
                }
            }
        }
    }

    /// Run one agent turn: call the LLM (with tools), account tokens + cost into
    /// `state`, emit any tool traces and the opinion. Returns the recorded
    /// opinion, or `None` if the turn failed (an `agent_error` status is emitted).
    pub async fn run_turn<F>(
        &self,
        agent: &mut AgentInstance,
        ctx: &TurnCtx<'_>,
        state: &mut OrchestrationState,
        emit: &mut F,
    ) -> Result<Option<Opinion>, AppError>
    where
        F: FnMut(&str, Value, Option<String>) -> Result<(), AppError>,
    {
        let id = agent.id.clone();
        let name = agent.name.clone();
        let in_price = agent.input_price_per_1k;
        let out_price = agent.output_price_per_1k;
        let result = agent
            .generate_opinion_with_tools(
                ctx.topic,
                ctx.summary,
                ctx.recent,
                ctx.phase,
                &self.tool_defs,
                self.tool_executor.as_ref(),
            )
            .await;
        self.record_turn(
            id, name, in_price, out_price, result, ctx.phase, state, emit,
        )
    }

    /// Run every agent's turn for this round **concurrently** (genuine parallel
    /// LLM calls), then record the results in the agents' original order so the
    /// event stream stays deterministic.
    pub async fn run_turns_concurrent<F>(
        &self,
        agents: &mut [AgentInstance],
        ctx: &TurnCtx<'_>,
        state: &mut OrchestrationState,
        emit: &mut F,
    ) -> Result<Vec<Opinion>, AppError>
    where
        F: FnMut(&str, Value, Option<String>) -> Result<(), AppError>,
    {
        let tool_defs: &[ToolDefinition] = &self.tool_defs;
        let tool_executor = self.tool_executor.as_ref();
        let (topic, summary, recent, phase) = (ctx.topic, ctx.summary, ctx.recent, ctx.phase);

        let futures = agents.iter_mut().map(move |agent| {
            let id = agent.id.clone();
            let name = agent.name.clone();
            let in_price = agent.input_price_per_1k;
            let out_price = agent.output_price_per_1k;
            async move {
                let result = agent
                    .generate_opinion_with_tools(
                        topic,
                        summary,
                        recent,
                        phase,
                        tool_defs,
                        tool_executor,
                    )
                    .await;
                (id, name, in_price, out_price, result)
            }
        });

        let results = join_all(futures).await;

        let mut opinions = Vec::new();
        for (id, name, in_price, out_price, result) in results {
            if let Some(op) =
                self.record_turn(id, name, in_price, out_price, result, phase, state, emit)?
            {
                opinions.push(op);
            }
        }
        Ok(opinions)
    }

    /// Shared accounting + emission for a completed (or failed) turn. Not async:
    /// pure bookkeeping over an already-awaited result, so it can run in the
    /// stable-order loop after a concurrent batch.
    #[allow(clippy::too_many_arguments)]
    fn record_turn<F>(
        &self,
        agent_id: String,
        agent_name: String,
        in_price: f64,
        out_price: f64,
        result: Result<
            (
                crate::agents::instance::AgentResponse,
                Vec<crate::tools::definition::ToolTrace>,
            ),
            AppError,
        >,
        phase: &str,
        state: &mut OrchestrationState,
        emit: &mut F,
    ) -> Result<Option<Opinion>, AppError>
    where
        F: FnMut(&str, Value, Option<String>) -> Result<(), AppError>,
    {
        match result {
            Ok((resp, traces)) => {
                emit_tool_traces(emit, &traces, &agent_id, &agent_name, state.round)?;
                let (input_tokens, output_tokens, tokens_estimated) = resp.token_counts();
                let cost = turn_cost(input_tokens, output_tokens, in_price, out_price);

                let opinion = Opinion {
                    agent_id: agent_id.clone(),
                    agent_name: agent_name.clone(),
                    content: resp.content.clone(),
                    round: state.round,
                    phase: phase.to_string(),
                    wants_to_continue: resp.wants_to_continue,
                    responding_to: resp.responding_to.clone(),
                    input_tokens,
                    output_tokens,
                };
                state.add_opinion(opinion.clone());
                state.cost += cost;

                emit(
                    "opinion",
                    json!({
                        "agent_name": agent_name,
                        "content": resp.content,
                        "wants_to_continue": resp.wants_to_continue,
                        "round": state.round,
                        "phase": phase,
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                        "tokens_estimated": tokens_estimated,
                        "metadata": resp.metadata
                    }),
                    Some(agent_id),
                )?;
                Ok(Some(opinion))
            }
            Err(e) => {
                emit(
                    "status",
                    json!({
                        "message": format!("{agent_name} 回复失败: {e}"),
                        "phase": "agent_error",
                        "round": state.round
                    }),
                    Some(agent_id),
                )?;
                Ok(None)
            }
        }
    }
}

/// Cost of one turn given per-1k-token prices.
fn turn_cost(input: u32, output: u32, in_price_per_1k: f64, out_price_per_1k: f64) -> f64 {
    (input as f64 / 1000.0) * in_price_per_1k + (output as f64 / 1000.0) * out_price_per_1k
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::orchestration::control::ControlHandle;

    #[test]
    fn turn_cost_combines_input_and_output_prices() {
        // 1000 in @ $0.5/1k + 2000 out @ $1.5/1k = 0.5 + 3.0 = 3.5
        let c = turn_cost(1000, 2000, 0.5, 1.5);
        assert!((c - 3.5).abs() < 1e-9);
    }

    #[tokio::test]
    async fn should_stop_reports_stopped() {
        let (handle, rx) = ControlHandle::new(ControlSnapshot::new(1_000, 10.0));
        let mut driver = ConversationDriver::new(Some(rx), Vec::new(), None, 1);
        let state = OrchestrationState::default();
        handle.stop();
        assert_eq!(driver.should_stop(&state).await, Some(StopReason::Stopped));
    }

    #[tokio::test]
    async fn should_stop_reports_budget_exceeded() {
        let (_handle, rx) = ControlHandle::new(ControlSnapshot::new(50, 10.0));
        let mut driver = ConversationDriver::new(Some(rx), Vec::new(), None, 1);
        let state = OrchestrationState {
            tokens_used: 60, // over the 50 ceiling
            ..Default::default()
        };
        assert_eq!(
            driver.should_stop(&state).await,
            Some(StopReason::BudgetExceeded)
        );
    }

    #[tokio::test]
    async fn should_stop_allows_running_within_budget() {
        let (_handle, rx) = ControlHandle::new(ControlSnapshot::new(1_000, 10.0));
        let mut driver = ConversationDriver::new(Some(rx), Vec::new(), None, 1);
        let state = OrchestrationState {
            tokens_used: 10,
            ..Default::default()
        };
        assert_eq!(driver.should_stop(&state).await, None);
    }

    #[tokio::test]
    async fn should_stop_unblocks_when_paused_then_resumed() {
        let (handle, rx) = ControlHandle::new(ControlSnapshot::new(1_000, 10.0));
        let mut driver = ConversationDriver::new(Some(rx), Vec::new(), None, 1);
        let state = OrchestrationState::default();
        handle.pause();
        // Resume shortly; should_stop must return None (not stopped) once running.
        let resumer = tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            handle.resume();
        });
        assert_eq!(driver.should_stop(&state).await, None);
        resumer.await.unwrap();
    }
}
