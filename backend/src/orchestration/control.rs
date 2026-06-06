//! Runtime control plane for a running execution.
//!
//! A discussion runs in a spawned task. The Tauri `control_execution` command
//! needs a way to reach that task and tell it to pause / resume / stop, or to
//! raise its budget. We do that with a `watch` channel carrying a
//! [`ControlSnapshot`]: the command side holds a [`ControlHandle`] (the sender),
//! the orchestration side holds a `watch::Receiver` it polls between turns.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tokio::sync::watch;

/// Coarse run state the orchestration loop checks between turns.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ControlState {
    Running,
    Paused,
    Stopped,
}

/// The latest control intent + live budget ceilings for one execution.
///
/// Budget lives here (not only in the DB record) so that `extend_budget` can
/// raise the ceiling of an already-running discussion and have the driver see
/// it on the next turn.
#[derive(Debug, Clone, Copy)]
pub struct ControlSnapshot {
    pub state: ControlState,
    pub tokens_budget: u32,
    pub cost_budget: f64,
}

impl ControlSnapshot {
    pub fn new(tokens_budget: u32, cost_budget: f64) -> Self {
        Self {
            state: ControlState::Running,
            tokens_budget,
            cost_budget,
        }
    }
}

/// Sender side, stored in the [`ControlRegistry`]. Commands mutate the snapshot
/// through it; every change notifies the orchestration receiver.
#[derive(Clone)]
pub struct ControlHandle {
    tx: watch::Sender<ControlSnapshot>,
}

impl ControlHandle {
    /// Create a handle and the receiver the driver should poll.
    pub fn new(snapshot: ControlSnapshot) -> (Self, watch::Receiver<ControlSnapshot>) {
        let (tx, rx) = watch::channel(snapshot);
        (Self { tx }, rx)
    }

    pub fn pause(&self) {
        self.tx.send_modify(|s| {
            if s.state == ControlState::Running {
                s.state = ControlState::Paused;
            }
        });
    }

    pub fn resume(&self) {
        self.tx.send_modify(|s| {
            if s.state == ControlState::Paused {
                s.state = ControlState::Running;
            }
        });
    }

    pub fn stop(&self) {
        self.tx.send_modify(|s| s.state = ControlState::Stopped);
    }

    pub fn extend_budget(&self, add_tokens: u32, add_cost: f64) {
        self.tx.send_modify(|s| {
            s.tokens_budget = s.tokens_budget.saturating_add(add_tokens);
            s.cost_budget += add_cost;
        });
    }
}

/// Maps `execution_id -> ControlHandle` for every currently-running discussion.
/// Held in `AppState`; entries are inserted when a run starts and removed when
/// it ends.
pub type ControlRegistry = Arc<Mutex<HashMap<String, ControlHandle>>>;

pub fn new_registry() -> ControlRegistry {
    Arc::new(Mutex::new(HashMap::new()))
}

/// Register a fresh handle for `execution_id`, returning the receiver for the
/// driver. Replaces any stale handle from a previous run of the same execution.
pub fn register(
    registry: &ControlRegistry,
    execution_id: &str,
    snapshot: ControlSnapshot,
) -> watch::Receiver<ControlSnapshot> {
    let (handle, rx) = ControlHandle::new(snapshot);
    if let Ok(mut map) = registry.lock() {
        map.insert(execution_id.to_string(), handle);
    }
    rx
}

/// Remove the handle once a run finishes (or fails).
pub fn deregister(registry: &ControlRegistry, execution_id: &str) {
    if let Ok(mut map) = registry.lock() {
        map.remove(execution_id);
    }
}

/// Look up the live handle for an execution, if it is currently running.
pub fn lookup(registry: &ControlRegistry, execution_id: &str) -> Option<ControlHandle> {
    registry
        .lock()
        .ok()
        .and_then(|map| map.get(execution_id).cloned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pause_resume_stop_transitions() {
        let (handle, rx) = ControlHandle::new(ControlSnapshot::new(1000, 1.0));
        assert_eq!(rx.borrow().state, ControlState::Running);

        handle.pause();
        assert_eq!(rx.borrow().state, ControlState::Paused);

        // resume only lifts a pause
        handle.resume();
        assert_eq!(rx.borrow().state, ControlState::Running);

        handle.stop();
        assert_eq!(rx.borrow().state, ControlState::Stopped);

        // stop is terminal: resume must not revive a stopped run
        handle.resume();
        assert_eq!(rx.borrow().state, ControlState::Stopped);
    }

    #[test]
    fn extend_budget_raises_ceilings() {
        let (handle, rx) = ControlHandle::new(ControlSnapshot::new(100, 1.0));
        handle.extend_budget(50, 2.5);
        let snap = *rx.borrow();
        assert_eq!(snap.tokens_budget, 150);
        assert!((snap.cost_budget - 3.5).abs() < 1e-9);
    }

    #[test]
    fn registry_register_lookup_deregister() {
        let reg = new_registry();
        let _rx = register(&reg, "exec-1", ControlSnapshot::new(10, 1.0));
        assert!(lookup(&reg, "exec-1").is_some());
        lookup(&reg, "exec-1").unwrap().stop();
        deregister(&reg, "exec-1");
        assert!(lookup(&reg, "exec-1").is_none());
    }
}
