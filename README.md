# Agent Team

[![CI](https://github.com/MScanter/agent-team/actions/workflows/ci.yml/badge.svg)](https://github.com/MScanter/agent-team/actions/workflows/ci.yml)
[![Release](https://github.com/MScanter/agent-team/actions/workflows/release.yml/badge.svg)](https://github.com/MScanter/agent-team/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows-blue)
![Built with Tauri 2](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB?logo=tauri&logoColor=white)

A desktop app for orchestrating multi-agent AI discussions. Create agents, build teams, run real-time collaborative conversations.

## What is this?

Agent Team lets you define AI agents with custom prompts and personalities, assemble them into teams, and start multi-round discussions where they collaborate in real time. Agents can also read/write files in a workspace directory during discussions via built-in tools.

Everything runs locally. Data lives in SQLite. Bring your own OpenAI-compatible API key.

## Screenshots

| Home | Agents | Debate in progress |
|------|--------|--------------------|
| ![Home](docs/screenshots/home.png) | ![Agents](docs/screenshots/agents.png) | ![Debate](docs/screenshots/debate.png) |

## Collaboration Modes

| Mode | How it works |
|------|-------------|
| **Roundtable** | Agents take turns sharing opinions, then summarize together |
| **Pipeline** | Sequential — each agent's output feeds the next |
| **Debate** | Auto-splits into pro/con teams with a judge |
| **Freeform** | Open discussion, no fixed turn order |

## Architecture

The frontend talks to the Rust core exclusively through Tauri's typed IPC
("invoke") commands. The core owns orchestration, the LLM abstraction, the
sandboxed tool layer, and SQLite persistence.

```mermaid
flowchart TD
    subgraph FE["Frontend · React + TS"]
        UI["Pages & components"]
        Q["TanStack Query hooks"]
    end
    subgraph CORE["Rust core · Tauri"]
        CMD["commands/ (IPC handlers)"]
        ORCH["orchestration/<br/>roundtable · debate · pipeline"]
        AG["AgentInstance"]
        LLM["llm/ provider<br/>OpenAI-compatible · Anthropic"]
        TOOL["tools/ executor + builtins<br/>(path-sandboxed)"]
        DB[("SQLite store")]
    end
    WS["Workspace files"]
    API["LLM API"]

    UI --> Q -->|invoke| CMD
    CMD --> ORCH --> AG
    AG --> LLM -->|HTTPS| API
    AG --> TOOL --> WS
    CMD --> DB
```

The **Debate** engine is the most structured mode — it auto-assigns a judge,
splits the rest into pro/con, runs opening statements and rebuttal rounds, then
asks the judge for a verdict:

```mermaid
sequenceDiagram
    participant O as Orchestrator
    participant P as Pro team
    participant C as Con team
    participant J as Judge

    O->>P: Opening statement
    O->>C: Opening (responds to Pro)
    loop Each rebuttal round
        O->>P: Rebut latest opinions
        O->>C: Rebut latest opinions
    end
    O->>J: Summarize both sides → verdict
    J-->>O: Final judgment
```

## Tech Stack

Tauri 2 (Rust) · React 18 · TypeScript · Tailwind CSS · SQLite · Zustand · TanStack Query

## Quick Start

```bash
# Install dependencies
npm run install:all

# Run in dev mode
npm run dev
```

Requires Rust toolchain and Node.js >= 18. See the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for platform
setup, and [CONTRIBUTING.md](CONTRIBUTING.md) for the full developer workflow.

## Build

```bash
npm run build
```

Output in `backend/target/release/bundle/`. Tagged pushes (`v*`) build installers
for macOS, Linux, and Windows automatically via the release workflow.

## Project Structure

```
backend/src/
  commands/        Tauri invoke handlers
  orchestration/   Collaboration engines (roundtable/debate/pipeline)
  tools/           Built-in file & code tools + executor + path security
  store/           SQLite persistence
  llm/             LLM provider abstraction (OpenAI-compatible + Anthropic)
  models/          Domain types (agent / team / execution)

frontend/src/
  pages/           Home, Agents, Teams, Execution
  components/      UI components (Agent, Team, Execution, ModelConfig, Common)
  hooks/           React Query hooks
  services/        API layer + Tauri bridge
  stores/          Zustand state
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `STORE_SQLITE_PATH` | Custom SQLite database path |
| `VITE_BACKEND_TARGET` | Backend proxy for frontend-only dev (default `http://localhost:8080`) |

LLM API keys are entered in the app's Model settings and stored locally — they
are never read from the environment or committed to the repo.

## Testing

```bash
cargo test --all-targets          # backend unit tests (run inside backend/)
npm run lint && npm run build      # frontend lint + type-check (inside frontend/)
```

## License

[MIT](LICENSE) © Miles
