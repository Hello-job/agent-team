use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::error::AppError;
use crate::models::agent::Agent;
use crate::models::execution::{ExecutionMessage, ExecutionRecord};
use crate::models::team::Team;

pub struct SqliteStore {
    db_path: PathBuf,
}

impl SqliteStore {
    pub fn new(app_name: &str) -> Result<Self, AppError> {
        let db_path = default_sqlite_path(app_name)?;
        init_db(&db_path)?;
        Ok(Self { db_path })
    }

    pub fn is_empty(&self) -> Result<bool, AppError> {
        let conn = self.open()?;

        let agents: Option<i32> = conn
            .query_row("SELECT 1 FROM agents LIMIT 1;", [], |row| row.get(0))
            .optional()?;
        let teams: Option<i32> = conn
            .query_row("SELECT 1 FROM teams LIMIT 1;", [], |row| row.get(0))
            .optional()?;
        let models: Option<i32> = conn
            .query_row("SELECT 1 FROM model_configs LIMIT 1;", [], |row| row.get(0))
            .optional()?;
        let executions: Option<i32> = conn
            .query_row("SELECT 1 FROM executions LIMIT 1;", [], |row| row.get(0))
            .optional()?;
        let messages: Option<i32> = conn
            .query_row("SELECT 1 FROM execution_messages LIMIT 1;", [], |row| {
                row.get(0)
            })
            .optional()?;

        Ok(agents.is_none()
            && teams.is_none()
            && models.is_none()
            && executions.is_none()
            && messages.is_none())
    }

    pub fn agents_list(&self) -> Result<Vec<Agent>, AppError> {
        self.list_table("agents")
    }

    pub fn agents_get(&self, agent_id: &str) -> Result<Option<Agent>, AppError> {
        self.get_table("agents", agent_id)
    }

    pub fn agents_upsert(&self, record: &Agent) -> Result<(), AppError> {
        self.upsert_table(
            "agents",
            &record.id,
            record,
            &record.created_at,
            &record.updated_at,
        )
    }

    pub fn agents_delete(&self, agent_id: &str) -> Result<(), AppError> {
        self.delete("agents", agent_id)
    }

    pub fn teams_list(&self) -> Result<Vec<Team>, AppError> {
        self.list_table("teams")
    }

    pub fn teams_get(&self, team_id: &str) -> Result<Option<Team>, AppError> {
        self.get_table("teams", team_id)
    }

    pub fn teams_upsert(&self, record: &Team) -> Result<(), AppError> {
        self.upsert_table(
            "teams",
            &record.id,
            record,
            &record.created_at,
            &record.updated_at,
        )
    }

    pub fn teams_delete(&self, team_id: &str) -> Result<(), AppError> {
        self.delete("teams", team_id)
    }

    pub fn executions_list(&self) -> Result<Vec<ExecutionRecord>, AppError> {
        self.list_table("executions")
    }

    pub fn executions_get(&self, execution_id: &str) -> Result<Option<ExecutionRecord>, AppError> {
        self.get_table("executions", execution_id)
    }

    pub fn executions_upsert(&self, record: &ExecutionRecord) -> Result<(), AppError> {
        self.upsert_table(
            "executions",
            &record.id,
            record,
            &record.created_at,
            &record.updated_at,
        )
    }

    pub fn executions_delete(&self, execution_id: &str) -> Result<(), AppError> {
        let conn = self.open()?;
        conn.execute("DELETE FROM executions WHERE id=?1;", params![execution_id])?;
        conn.execute(
            "DELETE FROM execution_messages WHERE execution_id=?1;",
            params![execution_id],
        )?;
        Ok(())
    }

    pub fn execution_messages_list(
        &self,
        execution_id: &str,
    ) -> Result<Vec<ExecutionMessage>, AppError> {
        let conn = self.open()?;
        let mut stmt = conn.prepare(
            "SELECT data_json FROM execution_messages WHERE execution_id=?1 ORDER BY sequence;",
        )?;
        let rows = stmt.query_map(params![execution_id], |row| row.get::<_, String>(0))?;
        let mut messages = Vec::new();
        for row in rows {
            let json = row?;
            let msg: ExecutionMessage = serde_json::from_str(&json)?;
            messages.push(msg);
        }
        Ok(messages)
    }

    pub fn execution_messages_upsert(
        &self,
        execution_id: &str,
        message: &ExecutionMessage,
    ) -> Result<(), AppError> {
        let payload = serde_json::to_string(message)?;
        let conn = self.open()?;
        conn.execute(
            r#"
            INSERT INTO execution_messages(id, execution_id, sequence, data_json, created_at, updated_at)
            VALUES(?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(id) DO UPDATE SET
                data_json=excluded.data_json,
                updated_at=excluded.updated_at,
                sequence=excluded.sequence;
            "#,
            params![
                message.id,
                execution_id,
                message.sequence,
                payload,
                message.created_at.to_rfc3339(),
                message.updated_at.to_rfc3339()
            ],
        )?;
        Ok(())
    }

    pub fn execution_messages_next_sequence(&self, execution_id: &str) -> Result<i32, AppError> {
        let conn = self.open()?;
        let next: i32 = conn.query_row(
            "SELECT IFNULL(MAX(sequence), 0) + 1 FROM execution_messages WHERE execution_id=?1;",
            params![execution_id],
            |row| row.get(0),
        )?;
        Ok(next)
    }

    fn open(&self) -> Result<Connection, AppError> {
        Ok(Connection::open(&self.db_path)?)
    }

    fn list_table<T: DeserializeOwned>(&self, table: &str) -> Result<Vec<T>, AppError> {
        let conn = self.open()?;
        let sql = format!("SELECT data_json FROM {table};");
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut items = Vec::new();
        for row in rows {
            let json = row?;
            let item: T = serde_json::from_str(&json)?;
            items.push(item);
        }
        Ok(items)
    }

    fn get_table<T: DeserializeOwned>(&self, table: &str, id: &str) -> Result<Option<T>, AppError> {
        let conn = self.open()?;
        let sql = format!("SELECT data_json FROM {table} WHERE id=?1;");
        let json: Option<String> = conn
            .query_row(&sql, params![id], |row| row.get(0))
            .optional()?;
        match json {
            Some(j) => Ok(Some(serde_json::from_str(&j)?)),
            None => Ok(None),
        }
    }

    fn upsert_table<T: Serialize>(
        &self,
        table: &str,
        id: &str,
        record: &T,
        created_at: &DateTime<Utc>,
        updated_at: &DateTime<Utc>,
    ) -> Result<(), AppError> {
        let payload = serde_json::to_string(record)?;
        let conn = self.open()?;
        let sql = format!(
            r#"
            INSERT INTO {table}(id, data_json, created_at, updated_at)
            VALUES(?1, ?2, ?3, ?4)
            ON CONFLICT(id) DO UPDATE SET
                data_json=excluded.data_json,
                updated_at=excluded.updated_at;
            "#
        );
        conn.execute(
            &sql,
            params![
                id,
                payload,
                created_at.to_rfc3339(),
                updated_at.to_rfc3339()
            ],
        )?;
        Ok(())
    }

    fn delete(&self, table: &str, id: &str) -> Result<(), AppError> {
        let conn = self.open()?;
        let sql = format!("DELETE FROM {table} WHERE id=?1;");
        conn.execute(&sql, params![id])?;
        Ok(())
    }
}

fn init_db(db_path: &Path) -> Result<(), AppError> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| AppError::Message(e.to_string()))?;
    }

    let conn = Connection::open(db_path)?;
    conn.execute_batch(
        r#"
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=NORMAL;
        PRAGMA foreign_keys=ON;

        CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
        INSERT INTO schema_version(version)
        SELECT 1
        WHERE NOT EXISTS (SELECT 1 FROM schema_version);

        CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY,
            data_json TEXT NOT NULL,
            created_at TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS teams (
            id TEXT PRIMARY KEY,
            data_json TEXT NOT NULL,
            created_at TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS model_configs (
            id TEXT PRIMARY KEY,
            data_json TEXT NOT NULL,
            created_at TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS executions (
            id TEXT PRIMARY KEY,
            data_json TEXT NOT NULL,
            created_at TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS execution_messages (
            id TEXT PRIMARY KEY,
            execution_id TEXT NOT NULL,
            sequence INTEGER,
            data_json TEXT NOT NULL,
            created_at TEXT,
            updated_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_execution_messages_exec_seq
        ON execution_messages (execution_id, sequence);
        "#,
    )?;

    Ok(())
}

fn default_sqlite_path(app_name: &str) -> Result<PathBuf, AppError> {
    if let Ok(override_path) = std::env::var("STORE_SQLITE_PATH") {
        let mut path = expand_tilde(PathBuf::from(override_path));
        if path.is_relative() {
            path = std::env::current_dir()
                .map_err(|e| AppError::Message(e.to_string()))?
                .join(path);
        }
        return Ok(path);
    }

    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let home = PathBuf::from(home);

    #[cfg(target_os = "macos")]
    {
        return Ok(home
            .join("Library")
            .join("Application Support")
            .join(app_name)
            .join("app.db"));
    }

    #[cfg(target_os = "windows")]
    {
        let base = std::env::var("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| home.join("AppData").join("Local"));
        return Ok(base.join(app_name).join("app.db"));
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let base = std::env::var("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| home.join(".local").join("share"));
        return Ok(base.join(app_name).join("app.db"));
    }
}

fn expand_tilde(path: PathBuf) -> PathBuf {
    let s = path.to_string_lossy().to_string();
    if s == "~" {
        return PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| ".".to_string()));
    }
    if let Some(rest) = s.strip_prefix("~/") {
        return PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| ".".to_string())).join(rest);
    }
    path
}
