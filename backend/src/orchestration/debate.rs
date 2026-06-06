//! Debate: the last agent judges; the rest split into balanced pro/con teams
//! that exchange opening statements and `max_rounds` of rebuttals, then the
//! judge delivers a verdict.
//!
//! Within a team, members speak concurrently (same side, same round). Requires
//! at least 3 agents so both sides and the judge are non-empty.

use serde_json::{json, Value};

use crate::agents::instance::AgentInstance;
use crate::error::AppError;
use crate::orchestration::driver::{ConversationDriver, TurnCtx};
use crate::orchestration::state::{OrchestrationPhase, OrchestrationState};

pub async fn run_debate<F>(
    driver: &mut ConversationDriver,
    mut agents: Vec<AgentInstance>,
    state: &mut OrchestrationState,
    emit: &mut F,
) -> Result<(), AppError>
where
    F: FnMut(&str, Value, Option<String>) -> Result<(), AppError>,
{
    state.phase = OrchestrationPhase::Initializing;

    if agents.len() < 3 {
        let _ = emit(
            "status",
            json!({
                "message": "辩论模式至少需要 3 个 agent（正方、反方、裁判）",
                "phase": "validation_error"
            }),
            None,
        );
        return Err(AppError::Message(
            "Debate needs at least 3 agents (pro, con, judge)".to_string(),
        ));
    }

    // Last agent judges; remaining split evenly. len>=3 guarantees both sides >=1.
    let mut judge = agents.pop().unwrap();
    let mid = agents.len() / 2;
    let mut con = agents.split_off(mid);
    let mut pro = agents;

    emit(
        "status",
        json!({
            "message": "Debate started",
            "pro_team": pro.iter().map(|a| a.name.clone()).collect::<Vec<_>>(),
            "con_team": con.iter().map(|a| a.name.clone()).collect::<Vec<_>>(),
            "judge": judge.name.clone()
        }),
        None,
    )?;

    let topic = state.topic.clone();
    state.round = 1;
    state.phase = OrchestrationPhase::Sequential;

    // Opening statements: pro (concurrent), then con responding to pro (concurrent).
    let pro_prompt = format!("论题：{topic}\n\n你是正方，请给出开场陈述。");
    {
        let ctx = TurnCtx {
            topic: &pro_prompt,
            summary: "",
            recent: &[],
            phase: "pro_opening",
        };
        driver
            .run_turns_concurrent(&mut pro, &ctx, state, emit)
            .await?;
    }

    let con_prompt = format!("论题：{topic}\n\n你是反方，请回应正方并给出开场陈述。");
    {
        let pro_args = opinions_with_phase(state, "pro_opening");
        let ctx = TurnCtx {
            topic: &con_prompt,
            summary: "",
            recent: &pro_args,
            phase: "con_opening",
        };
        driver
            .run_turns_concurrent(&mut con, &ctx, state, emit)
            .await?;
    }

    // Rebuttal rounds.
    let max_rounds = driver.max_rounds();
    for _ in 0..max_rounds {
        if driver.should_stop(state).await.is_some() {
            break;
        }
        state.start_new_round();
        emit(
            "status",
            json!({ "message": format!("Rebuttal round {}", state.round), "round": state.round, "phase": "rebuttal" }),
            None,
        )?;

        let team_size = pro.len() + con.len();
        {
            let last = recent_team_opinions(state, team_size);
            let ctx = TurnCtx {
                topic: &topic,
                summary: "",
                recent: &last,
                phase: "pro_rebuttal",
            };
            driver
                .run_turns_concurrent(&mut pro, &ctx, state, emit)
                .await?;
        }
        {
            let last = recent_team_opinions(state, team_size);
            let ctx = TurnCtx {
                topic: &topic,
                summary: "",
                recent: &last,
                phase: "con_rebuttal",
            };
            driver
                .run_turns_concurrent(&mut con, &ctx, state, emit)
                .await?;
        }
    }

    // Judge verdict.
    state.phase = OrchestrationPhase::Summarizing;
    let pro_text = side_text(state, "pro_");
    let con_text = side_text(state, "con_");
    let verdict_prompt = format!(
        "作为裁判，请评判以下辩论：\n\n论题：{topic}\n\n正方观点：\n{pro_text}\n\n反方观点：\n{con_text}\n\n请给出裁决：\n1. 双方论点总结\n2. 优势与不足\n3. 最终判断",
    );
    {
        let ctx = TurnCtx {
            topic: &verdict_prompt,
            summary: "",
            recent: &[],
            phase: "judge_verdict",
        };
        if let Some(opinion) = driver.run_turn(&mut judge, &ctx, state, emit).await? {
            state.summary = opinion.content;
        }
    }

    state.phase = OrchestrationPhase::Completed;
    Ok(())
}

fn opinions_with_phase(state: &OrchestrationState, phase: &str) -> Vec<Value> {
    state
        .opinions
        .iter()
        .filter(|o| o.phase == phase)
        .map(|o| json!({"agent_name": o.agent_name.clone(), "content": o.content.clone()}))
        .collect()
}

fn recent_team_opinions(state: &OrchestrationState, take: usize) -> Vec<Value> {
    state
        .opinions
        .iter()
        .rev()
        .take(take)
        .map(|o| json!({"agent_name": o.agent_name.clone(), "content": o.content.clone(), "phase": o.phase.clone()}))
        .collect()
}

fn side_text(state: &OrchestrationState, prefix: &str) -> String {
    state
        .opinions
        .iter()
        .filter(|o| o.phase.starts_with(prefix))
        .map(|o| format!("- {}: {}", o.agent_name, o.content))
        .collect::<Vec<_>>()
        .join("\n")
}
