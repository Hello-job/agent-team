//! Pipeline: each agent's output feeds the next, in order. If a stage fails,
//! the pipeline stops there but keeps every earlier stage's output (no
//! crash-and-lose-everything). Honors cancellation and budget between stages.

use serde_json::{json, Value};

use crate::agents::instance::AgentInstance;
use crate::error::AppError;
use crate::orchestration::driver::{ConversationDriver, TurnCtx};
use crate::orchestration::state::{OrchestrationPhase, OrchestrationState};

pub async fn run_pipeline<F>(
    driver: &mut ConversationDriver,
    mut agents: Vec<AgentInstance>,
    state: &mut OrchestrationState,
    emit: &mut F,
) -> Result<(), AppError>
where
    F: FnMut(&str, Value, Option<String>) -> Result<(), AppError>,
{
    state.phase = OrchestrationPhase::Sequential;
    emit(
        "status",
        json!({ "message": "Pipeline started", "stages": agents.len(), "phase": "pipeline" }),
        None,
    )?;

    let original_topic = state.topic.clone();
    let mut current_input = original_topic.clone();

    for (idx, agent) in agents.iter_mut().enumerate() {
        if driver.should_stop(state).await.is_some() {
            break;
        }

        let stage = (idx + 1) as i32;
        let agent_name = agent.name.clone();
        let agent_id = agent.id.clone();
        emit(
            "status",
            json!({ "message": format!("Processing Stage {stage}: {agent_name}"), "stage": stage, "phase": "pipeline" }),
            Some(agent_id.clone()),
        )?;

        // Scope the context so `current_input`'s borrow ends before we reassign it.
        let produced = {
            let phase = format!("stage_{stage}");
            let ctx = TurnCtx {
                topic: &current_input,
                summary: "",
                recent: &[],
                phase: &phase,
            };
            driver.run_turn(agent, &ctx, state, emit).await?
        };

        match produced {
            Some(opinion) => {
                current_input = format!(
                    "原始任务：{original_topic}\n\n上一阶段（第{stage}阶段）的输出：\n{}\n\n请基于上述内容，从你的专业角度进行处理和完善。",
                    opinion.content
                );
            }
            None => {
                // Stage failed (error already emitted by the driver). Stop here,
                // but everything produced so far stays in state.
                emit(
                    "status",
                    json!({
                        "message": format!("第 {stage} 阶段（{agent_name}）失败，流水线在此中止，已保留前序产出。"),
                        "phase": "stage_failed",
                        "stage": stage
                    }),
                    Some(agent_id),
                )?;
                break;
            }
        }
    }

    state.phase = OrchestrationPhase::Completed;
    Ok(())
}
