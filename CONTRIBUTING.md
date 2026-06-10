# Contributing to Agent Team

Thanks for your interest in improving Agent Team! This guide covers local setup,
the project layout, and the quality bar every change is expected to clear.

## Prerequisites

- **Rust** (stable) — install via [rustup](https://rustup.rs)
- **Node.js** >= 18
- Platform toolchain for Tauri 2 — see the
  [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS

## Local setup

```bash
# Install JS dependencies for both workspaces
npm run install:all

# Run the desktop app in dev mode (hot-reloads the React frontend)
npm run dev
```

The frontend dev server runs on `http://localhost:3000`; Tauri loads it
automatically. Data is persisted to a local SQLite database.

## Project layout

```
backend/src/
  commands/        Tauri invoke handlers (the IPC surface)
  orchestration/   Collaboration engines: roundtable / debate / pipeline
  tools/           Built-in file & code tools, executor, path security
  store/           SQLite persistence
  llm/             LLM provider abstraction (OpenAI-compatible + Anthropic)
  models/          Domain types (agent / team / execution)

frontend/src/
  pages/           Home, Agents, Teams, Execution
  components/      UI components grouped by feature
  hooks/           React Query hooks
  services/        API layer + Tauri bridge
  stores/          Zustand state
```

## Quality bar

Before opening a pull request, make sure the same checks CI runs pass locally.

**Backend (run inside `backend/`):**

```bash
cargo fmt --all -- --check     # formatting
cargo clippy --all-targets -- -D warnings   # lints (warnings are errors)
cargo test --all-targets       # unit tests
```

**Frontend (run inside `frontend/`):**

```bash
npm run lint      # ESLint
npm run build     # tsc type-check + production build
```

## Commit messages

This project follows [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, etc. Keep the subject
line in the imperative mood and under ~72 characters.

## Pull requests

1. Branch off `main`.
2. Keep changes focused; one logical change per PR.
3. Add or update tests for any behavior change — especially in
   `orchestration/` and `tools/security.rs`, where correctness matters most.
4. Ensure CI is green before requesting review.
