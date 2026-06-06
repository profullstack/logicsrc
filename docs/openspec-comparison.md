# LogicSRC and OpenSpec.dev

Status: working comparison

OpenSpec.dev appears focused on lightweight, repo-local feature planning for coding agents: specs, proposals, design notes, tasks, and requirement deltas that live alongside code. LogicSRC is broader: an open coordination standard for humans, AI agents, plugins, payments, hosted products, SDKs, MCP servers, CLIs, TUIs, PWAs, and API/curl surfaces.

The projects can be complementary. LogicSRC should support an `--openspec` compatibility mode for teams that already use OpenSpec.dev-style planning artifacts.

| Area | LogicSRC | OpenSpec.dev |
|---|---|---|
| Primary scope | Open coordination standards for humans, AI agents, plugins, payments, hosted products, and reference implementations. | Lightweight spec-driven planning framework for code changes and agent work. |
| Main artifact shape | Versioned schemas, plugin manifests, event contracts, task/agent/run documents, SDK contracts, MCP resources, CLI/TUI/PWA/API surfaces. | Repo-local specs, proposals, design docs, tasks, and spec deltas. |
| Agent relationship | Agent profiles, runs, audit logs, model routing, AgentSwarm orchestration, and provider-neutral execution records. | Planning layer that gives coding agents persistent requirements and change context. |
| CLI direction | `logicsrc`, plus compatible product aliases and `sh1pt logicsrc ...`. | `@fission-ai/openspec` CLI and slash-command integrations with coding tools. |
| MCP | LogicSRC has a standards MCP server and should expose resources, tools, and prompts. | Site states "No MCP" as a product trait. |
| SDK/API | Planned Rust, Bun, Node, Python, curl, and PWA surfaces with matching contracts. | Focus appears to be repo workflow and agent planning artifacts rather than a cross-language SDK/API standard. |
| Plugins | Plugin manifest standard plus CoinPay, uGig, sh1pt, AgentByte, and future integration specs. | Integrates with many coding agents and editors; plugin-contract scope is not the main positioning. |
| Compatibility idea | `logicsrc --openspec` reads/writes OpenSpec.dev-style specs/proposals/tasks where useful. | Can remain the lightweight planning layer inside repos. |

## CLI Flags

```bash
logicsrc --openspec agentswarm --yolo --repo profullstack/logicsrc
logicsrc --openspec-only task validate ./task.yaml
sh1pt logicsrc --openspec agentswarm --yolo --repo profullstack/logicsrc
```

- `--openspec` enables OpenSpec.dev-compatible repo-local planning conventions where supported.
- `--openspec-only` restricts work to LogicSRC-published OpenSpec contracts.
