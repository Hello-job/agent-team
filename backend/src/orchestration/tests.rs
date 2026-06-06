//! Integration tests for the orchestration layer, driven by a scripted mock
//! LLM provider. These cover the parts that were previously untestable: real
//! concurrency, cancellation, budget enforcement, cost accounting, and each
//! mode's core behavior.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use serde_json::Value;

use crate::agents::instance::AgentInstance;
use crate::error::AppError;
use crate::llm::provider::{LLMProvider, LLMResponse, Message, TokenUsage};
use crate::orchestration::control::{ControlHandle, ControlSnapshot};
use crate::orchestration::debate::run_debate;
use crate::orchestration::driver::{ConversationDriver, DeltaSink, TurnCtx};
use crate::orchestration::freeform::run_freeform;
use crate::orchestration::pipeline::run_pipeline;
use crate::orchestration::roundtable::run_roundtable;
use crate::orchestration::state::OrchestrationState;
use crate::tools::definition::ToolDefinition;

// ---- Mock provider -------------------------------------------------------

#[derive(Clone)]
struct MockReply {
    content: String,
    input_tokens: u32,
    output_tokens: u32,
    fail: bool,
    delay_ms: u64,
}

impl MockReply {
    fn ok(content: &str, input: u32, output: u32) -> Self {
        Self {
            content: content.to_string(),
            input_tokens: input,
            output_tokens: output,
            fail: false,
            delay_ms: 0,
        }
    }
}

#[derive(Default)]
struct Tracker {
    inflight: AtomicUsize,
    max_inflight: AtomicUsize,
    calls: AtomicUsize,
}

struct MockProvider {
    queue: Mutex<VecDeque<MockReply>>,
    fallback: MockReply,
    tracker: Option<Arc<Tracker>>,
}

impl MockProvider {
    /// Always returns the same reply.
    fn always(content: &str, input: u32, output: u32) -> Arc<dyn LLMProvider> {
        Arc::new(Self {
            queue: Mutex::new(VecDeque::new()),
            fallback: MockReply::ok(content, input, output),
            tracker: None,
        })
    }

    /// Always fails.
    fn failing() -> Arc<dyn LLMProvider> {
        Arc::new(Self {
            queue: Mutex::new(VecDeque::new()),
            fallback: MockReply {
                content: String::new(),
                input_tokens: 0,
                output_tokens: 0,
                fail: true,
                delay_ms: 0,
            },
            tracker: None,
        })
    }

    /// Consumes scripted replies in order, then repeats the last reply.
    fn scripted(replies: Vec<MockReply>) -> Arc<dyn LLMProvider> {
        let fallback = replies
            .last()
            .cloned()
            .unwrap_or_else(|| MockReply::ok("", 1, 1));
        Arc::new(Self {
            queue: Mutex::new(replies.into()),
            fallback,
            tracker: None,
        })
    }

    /// Reply with a fixed delay and shared concurrency tracker (for parallelism tests).
    fn tracked(tracker: Arc<Tracker>, content: &str, delay_ms: u64) -> Arc<dyn LLMProvider> {
        Arc::new(Self {
            queue: Mutex::new(VecDeque::new()),
            fallback: MockReply {
                content: content.to_string(),
                input_tokens: 5,
                output_tokens: 7,
                fail: false,
                delay_ms,
            },
            tracker: Some(tracker),
        })
    }
}

#[async_trait]
impl LLMProvider for MockProvider {
    fn provider_name(&self) -> &'static str {
        "mock"
    }
    fn model_id(&self) -> &str {
        "mock"
    }

    async fn chat(
        &self,
        _messages: Vec<Message>,
        _temperature: f64,
        _max_tokens: u32,
    ) -> Result<LLMResponse, AppError> {
        let reply = {
            let mut q = self.queue.lock().unwrap();
            q.pop_front().unwrap_or_else(|| self.fallback.clone())
        };

        if let Some(tracker) = &self.tracker {
            tracker.calls.fetch_add(1, Ordering::SeqCst);
            let cur = tracker.inflight.fetch_add(1, Ordering::SeqCst) + 1;
            tracker.max_inflight.fetch_max(cur, Ordering::SeqCst);
        }
        if reply.delay_ms > 0 {
            tokio::time::sleep(Duration::from_millis(reply.delay_ms)).await;
        }
        if let Some(tracker) = &self.tracker {
            tracker.inflight.fetch_sub(1, Ordering::SeqCst);
        }

        if reply.fail {
            return Err(AppError::Message("mock failure".to_string()));
        }
        Ok(LLMResponse {
            content: reply.content,
            usage: TokenUsage {
                input_tokens: reply.input_tokens,
                output_tokens: reply.output_tokens,
                estimated: false,
            },
            model: "mock".to_string(),
            finish_reason: None,
            tool_calls: Vec::new(),
        })
    }
}

// ---- Test delta sink -----------------------------------------------------

#[derive(Default)]
struct CapturedDeltas {
    starts: Vec<(String, String)>, // (message_id, agent_id)
    deltas: Vec<(String, String)>, // (message_id, text)
}

struct TestSink {
    inner: Arc<Mutex<CapturedDeltas>>,
}

impl DeltaSink for TestSink {
    fn opinion_start(
        &self,
        message_id: &str,
        agent_id: &str,
        _agent_name: &str,
        _round: i32,
        _phase: &str,
    ) {
        self.inner
            .lock()
            .unwrap()
            .starts
            .push((message_id.to_string(), agent_id.to_string()));
    }

    fn opinion_delta(&self, message_id: &str, _agent_id: &str, delta: &str) {
        self.inner
            .lock()
            .unwrap()
            .deltas
            .push((message_id.to_string(), delta.to_string()));
    }
}

// ---- Helpers -------------------------------------------------------------

fn agent(id: &str, llm: Arc<dyn LLMProvider>) -> AgentInstance {
    AgentInstance::new_for_test(id, id, llm)
}

fn no_tools() -> (
    Vec<ToolDefinition>,
    Option<crate::tools::executor::ToolExecutor>,
) {
    (Vec::new(), None)
}

/// A collecting emit closure plus the buffer it writes to.
fn collector() -> Arc<Mutex<Vec<(String, String)>>> {
    Arc::new(Mutex::new(Vec::new()))
}

fn emit_into(
    buf: Arc<Mutex<Vec<(String, String)>>>,
) -> impl FnMut(&str, Value, Option<String>) -> Result<(), AppError> {
    move |event_type: &str, data: Value, _agent: Option<String>| {
        let phase = data
            .get("phase")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        buf.lock().unwrap().push((event_type.to_string(), phase));
        Ok(())
    }
}

/// A state with a topic and a generous budget. `OrchestrationState::default()`
/// leaves the budget at 0 (the 200k/cost defaults only apply via serde during
/// deserialization), which would trip the driver's budget gate immediately.
fn fresh_state(topic: &str) -> OrchestrationState {
    OrchestrationState {
        topic: topic.to_string(),
        tokens_budget: 1_000_000,
        cost_budget: 10_000.0,
        ..Default::default()
    }
}

// ---- Driver: concurrency, cost ------------------------------------------

#[tokio::test]
async fn run_turns_concurrent_runs_agents_in_parallel() {
    let tracker = Arc::new(Tracker::default());
    let mut agents = vec![
        agent("a0", MockProvider::tracked(tracker.clone(), "hi", 30)),
        agent("a1", MockProvider::tracked(tracker.clone(), "hi", 30)),
        agent("a2", MockProvider::tracked(tracker.clone(), "hi", 30)),
    ];
    let (defs, exec) = no_tools();
    let driver = ConversationDriver::new(None, defs, exec, 1);
    let mut state = OrchestrationState::default();
    let buf = collector();
    let mut emit = emit_into(buf);

    let ctx = TurnCtx {
        topic: "t",
        summary: "",
        recent: &[],
        phase: "initial",
    };
    driver
        .run_turns_concurrent(&mut agents, &ctx, &mut state, &mut emit)
        .await
        .unwrap();

    // All three LLM calls were in flight at the same moment → genuine concurrency.
    assert_eq!(tracker.max_inflight.load(Ordering::SeqCst), 3);
    assert_eq!(state.opinions.len(), 3);
    assert_eq!(state.tokens_used, 3 * (5 + 7));
}

#[tokio::test]
async fn run_turn_accrues_real_cost_from_pricing() {
    // 1000 in @ $0.5/1k + 2000 out @ $1.5/1k = 0.5 + 3.0 = 3.5
    let mut a = AgentInstance::new_for_test("a", "a", MockProvider::always("answer", 1000, 2000))
        .with_pricing(0.5, 1.5);
    let (defs, exec) = no_tools();
    let driver = ConversationDriver::new(None, defs, exec, 1);
    let mut state = OrchestrationState::default();
    let buf = collector();
    let mut emit = emit_into(buf);
    let ctx = TurnCtx {
        topic: "t",
        summary: "",
        recent: &[],
        phase: "initial",
    };
    driver
        .run_turn(&mut a, &ctx, &mut state, &mut emit)
        .await
        .unwrap();
    assert!((state.cost - 3.5).abs() < 1e-9, "cost was {}", state.cost);
}

// ---- Cancellation & budget ----------------------------------------------

#[tokio::test]
async fn pipeline_stops_immediately_when_already_stopped() {
    let (handle, rx) = ControlHandle::new(ControlSnapshot::new(10_000, 100.0));
    handle.stop();
    let agents = vec![
        agent("a0", MockProvider::always("x", 1, 1)),
        agent("a1", MockProvider::always("y", 1, 1)),
    ];
    let (defs, exec) = no_tools();
    let mut driver = ConversationDriver::new(Some(rx), defs, exec, 1);
    let mut state = fresh_state("task");
    let buf = collector();
    let mut emit = emit_into(buf);

    run_pipeline(&mut driver, agents, &mut state, &mut emit)
        .await
        .unwrap();
    // Stopped before any stage ran.
    assert_eq!(state.opinions.len(), 0);
}

#[tokio::test]
async fn roundtable_stops_extra_rounds_when_budget_exhausted() {
    // Budget of 10 tokens; each turn costs 12 → after round 1 the budget is blown.
    let (_handle, rx) = ControlHandle::new(ControlSnapshot::new(10, 100.0));
    let agents = vec![
        agent("a0", MockProvider::always("opinion", 5, 7)),
        agent("a1", MockProvider::always("opinion", 5, 7)),
        agent("a2", MockProvider::always("opinion", 5, 7)),
    ];
    let (defs, exec) = no_tools();
    let mut driver = ConversationDriver::new(Some(rx), defs, exec, 3);
    let mut state = fresh_state("topic");
    let buf = collector();
    let mut emit = emit_into(buf);

    run_roundtable(&mut driver, agents, &mut state, &mut emit, None)
        .await
        .unwrap();
    // Round 1 (3) + summary (1) = 4; no round 2 because budget was exceeded.
    assert_eq!(state.opinions.len(), 4);
}

// ---- Roundtable: summary -------------------------------------------------

#[tokio::test]
async fn roundtable_produces_a_summary() {
    let agents = vec![
        agent("writer", MockProvider::always("SUMMARY TEXT", 1, 1)),
        agent("a1", MockProvider::always("point", 1, 1)),
    ];
    let (defs, exec) = no_tools();
    // max_rounds 1 → only the opening round, then summary.
    let mut driver = ConversationDriver::new(None, defs, exec, 1);
    let mut state = fresh_state("topic");
    let buf = collector();
    let mut emit = emit_into(buf);

    run_roundtable(
        &mut driver,
        agents,
        &mut state,
        &mut emit,
        Some("writer".to_string()),
    )
    .await
    .unwrap();

    assert_eq!(state.summary, "SUMMARY TEXT");
    assert!(state.opinions.iter().any(|o| o.phase == "summary"));
}

// ---- Debate: validation, split, verdict ---------------------------------

#[tokio::test]
async fn debate_rejects_fewer_than_three_agents() {
    let agents = vec![
        agent("a0", MockProvider::always("x", 1, 1)),
        agent("a1", MockProvider::always("y", 1, 1)),
    ];
    let (defs, exec) = no_tools();
    let mut driver = ConversationDriver::new(None, defs, exec, 1);
    let mut state = fresh_state("topic");
    let buf = collector();
    let mut emit = emit_into(buf);

    let result = run_debate(&mut driver, agents, &mut state, &mut emit).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn debate_with_three_agents_runs_and_renders_verdict() {
    let agents = vec![
        agent("pro", MockProvider::always("pro point", 1, 1)),
        agent("con", MockProvider::always("con point", 1, 1)),
        agent("judge", MockProvider::always("VERDICT", 1, 1)),
    ];
    let (defs, exec) = no_tools();
    let mut driver = ConversationDriver::new(None, defs, exec, 1);
    let mut state = fresh_state("topic");
    let buf = collector();
    let mut emit = emit_into(buf);

    run_debate(&mut driver, agents, &mut state, &mut emit)
        .await
        .unwrap();

    // Both sides spoke and the judge rendered a verdict.
    assert!(state.opinions.iter().any(|o| o.phase == "pro_opening"));
    assert!(state.opinions.iter().any(|o| o.phase == "con_opening"));
    assert_eq!(state.summary, "VERDICT");
}

// ---- Pipeline: preserve prior outputs on failure ------------------------

#[tokio::test]
async fn pipeline_preserves_prior_output_when_a_stage_fails() {
    let agents = vec![
        agent("s1", MockProvider::always("stage one output", 1, 1)),
        agent("s2", MockProvider::failing()),
        agent("s3", MockProvider::always("should never run", 1, 1)),
    ];
    let (defs, exec) = no_tools();
    let mut driver = ConversationDriver::new(None, defs, exec, 1);
    let mut state = fresh_state("task");
    let buf = collector();
    let mut emit = emit_into(buf);

    run_pipeline(&mut driver, agents, &mut state, &mut emit)
        .await
        .unwrap();

    // Stage 1 succeeded and is kept; stage 2 failed; stage 3 never ran.
    assert_eq!(state.opinions.len(), 1);
    assert_eq!(state.opinions[0].phase, "stage_1");
}

// ---- Freeform: dynamic routing ------------------------------------------

#[tokio::test]
async fn freeform_router_picks_speaker_then_ends() {
    // Agent 0 is also the moderator: first routing call picks a1, second ends.
    let moderator = MockProvider::scripted(vec![
        MockReply::ok("{\"next_speaker_id\": \"a1\", \"done\": false}", 1, 1),
        MockReply::ok("{\"done\": true}", 1, 1),
    ]);
    let agents = vec![
        agent("a0", moderator),
        agent("a1", MockProvider::always("a1 speaks", 2, 3)),
    ];
    let (defs, exec) = no_tools();
    let mut driver = ConversationDriver::new(None, defs, exec, 5);
    let mut state = fresh_state("topic");
    let buf = collector();
    let mut emit = emit_into(buf);

    run_freeform(&mut driver, agents, &mut state, &mut emit)
        .await
        .unwrap();

    // Exactly one speaking turn happened (a1), then the moderator ended it.
    assert_eq!(state.opinions.len(), 1);
    assert_eq!(state.opinions[0].agent_id, "a1");
}

// ---- Streaming -----------------------------------------------------------

#[tokio::test]
async fn run_turn_streams_opinion_start_and_deltas_to_the_sink() {
    let captured = Arc::new(Mutex::new(CapturedDeltas::default()));
    let sink = Arc::new(TestSink {
        inner: captured.clone(),
    });
    let mut a = agent("a", MockProvider::always("hello world", 1, 2));
    let (defs, exec) = no_tools();
    let driver = ConversationDriver::new(None, defs, exec, 1).with_sink(sink);
    let mut state = fresh_state("t");
    let buf = collector();
    let mut emit = emit_into(buf);
    let ctx = TurnCtx {
        topic: "t",
        summary: "",
        recent: &[],
        phase: "initial",
    };

    driver
        .run_turn(&mut a, &ctx, &mut state, &mut emit)
        .await
        .unwrap();

    let cap = captured.lock().unwrap();
    // One opinion_start, and the streamed deltas reassemble to the full content.
    assert_eq!(cap.starts.len(), 1);
    let streamed: String = cap.deltas.iter().map(|(_, t)| t.clone()).collect();
    assert_eq!(streamed, "hello world");
    // start + every delta share the one message id.
    let message_id = &cap.starts[0].0;
    assert!(cap.deltas.iter().all(|(m, _)| m == message_id));
    drop(cap);

    // And the turn is still recorded as a finished opinion.
    assert_eq!(state.opinions.len(), 1);
    assert_eq!(state.opinions[0].content, "hello world");
}
