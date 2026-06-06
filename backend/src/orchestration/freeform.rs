//! Freeform: open discussion with no fixed turn order. A lightweight moderator
//! (an LLM call) picks who speaks next based on the conversation so far, until
//! it calls the discussion done, the agents reach consensus, or `max_rounds`
//! worth of turns elapse. If the moderator's reply can't be parsed, we fall
//! back to round-robin so the discussion never stalls.

use serde_json::{json, Value};

use crate::agents::instance::AgentInstance;
use crate::error::AppError;
use crate::orchestration::driver::{ConversationDriver, TurnCtx};
use crate::orchestration::state::{OrchestrationPhase, OrchestrationState};

pub async fn run_freeform<F>(
    driver: &mut ConversationDriver,
    mut agents: Vec<AgentInstance>,
    state: &mut OrchestrationState,
    emit: &mut F,
) -> Result<(), AppError>
where
    F: FnMut(&str, Value, Option<String>) -> Result<(), AppError>,
{
    if agents.is_empty() {
        return Ok(());
    }

    state.phase = OrchestrationPhase::Responding;
    let topic = state.topic.clone();
    let roster = agents
        .iter()
        .map(|a| format!("- id={} name={}", a.id, a.name))
        .collect::<Vec<_>>()
        .join("\n");

    emit(
        "status",
        json!({ "message": "Freeform discussion started", "phase": "freeform" }),
        None,
    )?;

    // Total speaking turns allowed across the whole discussion.
    let agent_count = agents.len();
    let max_turns = (driver.max_rounds() as usize)
        .saturating_mul(agent_count)
        .max(agent_count);

    let mut rr = 0usize; // round-robin fallback cursor
    let mut turn = 0usize;
    while turn < max_turns {
        if driver.should_stop(state).await.is_some() {
            break;
        }
        if consensus_reached(state) {
            emit(
                "status",
                json!({ "message": "讨论达成共识，自动结束", "phase": "auto_complete", "round": state.round }),
                None,
            )?;
            break;
        }

        let transcript = state.recent_opinions_json(8);
        let (next_idx, done) = choose_next_speaker(&agents, &topic, &roster, &transcript, rr).await;
        if done {
            emit(
                "status",
                json!({ "message": "主持人判定讨论可以结束", "phase": "moderator_end", "round": state.round }),
                None,
            )?;
            break;
        }
        rr = (next_idx + 1) % agent_count;

        state.start_new_round();
        let recent = state.recent_opinions_json(8);
        let ctx = TurnCtx {
            topic: &topic,
            summary: "",
            recent: &recent,
            phase: "freeform",
        };
        driver
            .run_turn(&mut agents[next_idx], &ctx, state, emit)
            .await?;
        turn += 1;
    }

    state.phase = OrchestrationPhase::Completed;
    Ok(())
}

fn consensus_reached(state: &OrchestrationState) -> bool {
    !state.agent_wants_continue.is_empty()
        && state.agent_wants_continue.values().all(|wants| !wants)
}

/// Ask the moderator (the first agent's model) who should speak next. Returns
/// `(index, done)`. Falls back to round-robin on any error or unparseable reply.
async fn choose_next_speaker(
    agents: &[AgentInstance],
    topic: &str,
    roster: &str,
    transcript: &[Value],
    rr: usize,
) -> (usize, bool) {
    let fallback = rr % agents.len();

    let convo = transcript
        .iter()
        .map(|o| {
            format!(
                "{}: {}",
                o.get("agent_name").and_then(|v| v.as_str()).unwrap_or(""),
                o.get("content").and_then(|v| v.as_str()).unwrap_or("")
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let system = "你是一个讨论主持人。根据对话进展，决定下一个最适合发言的专家，或判断讨论是否可以结束。\
        只输出一个 JSON 对象，不要其他文字：{\"next_speaker_id\": \"<专家 id>\", \"done\": <true 或 false>}";
    let user = format!(
        "讨论主题：{topic}\n\n专家名册：\n{roster}\n\n最近对话：\n{convo}\n\n请选择下一位发言者。"
    );

    match agents[0].raw_complete(system, &user).await {
        Ok(text) => parse_router_reply(&text, agents, fallback),
        Err(_) => (fallback, false),
    }
}

/// Parse the moderator's JSON. Tolerates surrounding prose by extracting the
/// first `{...}` span. Unknown ids / missing fields degrade to round-robin.
fn parse_router_reply(text: &str, agents: &[AgentInstance], fallback: usize) -> (usize, bool) {
    let Some(value) = extract_json_object(text) else {
        return (fallback, false);
    };
    let done = value.get("done").and_then(|d| d.as_bool()).unwrap_or(false);
    if let Some(sid) = value.get("next_speaker_id").and_then(|s| s.as_str()) {
        let sid = sid.trim();
        if let Some(idx) = agents.iter().position(|a| a.id == sid || a.name == sid) {
            return (idx, done);
        }
    }
    (fallback, done)
}

fn extract_json_object(text: &str) -> Option<Value> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    if end < start {
        return None;
    }
    serde_json::from_str(&text[start..=end]).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_json_object_tolerates_surrounding_prose() {
        let v =
            extract_json_object("好的，结果是 {\"next_speaker_id\": \"a2\", \"done\": false} 完毕")
                .unwrap();
        assert_eq!(v["next_speaker_id"], "a2");
        assert_eq!(v["done"], false);
    }

    #[test]
    fn extract_json_object_returns_none_without_braces() {
        assert!(extract_json_object("no json here").is_none());
    }
}
