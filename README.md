# Agent Team

A desktop app for orchestrating multi-agent AI discussions. Create agents, build teams, run real-time collaborative conversations.

## What is this?

Agent Team lets you define AI agents with custom prompts and personalities, assemble them into teams, and start multi-round discussions where they collaborate in real time. Agents can also read/write files in a workspace directory during discussions via 19 built-in tools.

Everything runs locally. Data lives in SQLite. Bring your own OpenAI-compatible API key.

## Collaboration Modes

| Mode | How it works |
|------|-------------|
| **Roundtable** | Agents take turns sharing opinions, then summarize together |
| **Pipeline** | Sequential — each agent's output feeds the next |
| **Debate** | Auto-splits into pro/con teams with a judge |
| **Freeform** | Open discussion, no fixed turn order |

## Tech Stack

Tauri 2 (Rust) · React 18 · TypeScript · Tailwind CSS · SQLite · Zustand · TanStack Query

## Quick Start

```bash
# Install dependencies
npm --prefix frontend install
npm --prefix backend install

# Run in dev mode
npm --prefix backend run tauri:dev
```

Requires Rust toolchain and Node.js >= 18.

## Build

```bash
npm --prefix backend run tauri:build
```

Output in `backend/target/release/bundle/`.

## Project Structure

```
backend/src/
  commands/        Tauri invoke handlers
  orchestration/   Collaboration engines (roundtable/debate/pipeline)
  tools/           Built-in file & code tools + executor
  store/           SQLite persistence
  llm/             LLM provider abstraction

frontend/src/
  pages/           Home, Agents, Teams, Execution, Models
  components/      UI components
  hooks/           React hooks
  services/        API layer + Tauri bridge
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `STORE_SQLITE_PATH` | Custom SQLite database path |
| `VITE_BACKEND_TARGET` | Backend proxy for frontend-only dev (default `http://localhost:8080`) |

## License

MIT
