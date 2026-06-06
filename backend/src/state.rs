use std::sync::Arc;

use tauri::AppHandle;

use crate::error::AppError;
use crate::orchestration::control::{new_registry, ControlRegistry};
use crate::seed;
use crate::store::sqlite::SqliteStore;

#[derive(Clone)]
pub struct AppState {
    pub store: Arc<SqliteStore>,
    /// Live control handles for currently-running executions, keyed by id.
    pub controls: ControlRegistry,
}

impl AppState {
    pub fn init(_app: &AppHandle) -> Result<Self, AppError> {
        let store = SqliteStore::new("agent-team")?;
        let _ = seed::seed_if_empty(&store)?;
        Ok(Self {
            store: Arc::new(store),
            controls: new_registry(),
        })
    }
}
