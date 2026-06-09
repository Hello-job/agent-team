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
%%{init: {'theme':'base','themeVariables':{'fontFamily':'-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, sans-serif','fontSize':'14px','primaryColor':'#ffffff','primaryTextColor':'#1f2328','primaryBorderColor':'#d0d7de','lineColor':'#8c959f','clusterBkg':'#f6f8fa','clusterBorder':'#d0d7de'}}}%%
flowchart TD
    subgraph FE["Frontend · React + TS"]
        direction TB
        UI["Pages · components"]
        Q["TanStack Query hooks"]
        UI --> Q
    end

    subgraph CORE["Rust core · Tauri"]
        direction TB
        CMD["commands/ · typed IPC handlers"]
        ORCH["orchestration/<br/>roundtable · debate · pipeline · freeform"]
        CTRL["control plane<br/>pause · stop · budget"]
        AG["AgentInstance<br/>ReAct tool loop"]
        LLM["llm/ provider<br/>OpenAI · Anthropic · streaming SSE"]
        TOOL["tools/ executor + builtins<br/>path-sandboxed"]
        DB[("SQLite store")]
    end

    API(["LLM API"])
    WS(["Workspace files"])

    Q -->|invoke| CMD
    CMD --> ORCH
    CMD --> DB
    ORCH <--> CTRL
    ORCH --> AG
    AG --> LLM -->|HTTPS · SSE| API
    AG --> TOOL --> WS

    style FE fill:#f6f8fa,stroke:#d0d7de
    style CORE fill:#f6f8fa,stroke:#d0d7de
    classDef core fill:#e6f7fb,stroke:#0d93a8,color:#0b3b44;
    classDef ext fill:#ffffff,stroke:#8c959f,color:#57606a,stroke-dasharray:4 3;
    classDef store fill:#fff4e6,stroke:#bc6c25,color:#5c3a13;
    class ORCH,CTRL,LLM,TOOL core;
    class API,WS ext;
    class DB store;
```

The **Debate** engine is the most structured mode — it auto-assigns a judge,
splits the rest into pro/con, runs opening statements and rebuttal rounds, then
asks the judge for a verdict:

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, sans-serif','actorBkg':'#e6f7fb','actorBorder':'#0d93a8','actorTextColor':'#0b3b44','actorLineColor':'#8c959f','signalColor':'#57606a','signalTextColor':'#1f2328','labelBoxBkg':'#f6f8fa','labelBoxBorderColor':'#d0d7de','labelTextColor':'#1f2328','loopTextColor':'#57606a','noteBkgColor':'#fff4e6','noteBorderColor':'#bc6c25','noteTextColor':'#5c3a13'}}}%%
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
