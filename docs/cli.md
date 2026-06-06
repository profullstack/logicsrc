# CLI Conventions

Primary command style:

```bash
logicsrc <resource> <action> [options]
```

Aliases:

```bash
logicsrc
commandboard
cb
```

`logicsrc` is the canonical standards CLI. `commandboard` and `cb` remain product/client aliases for CommandBoard.run-compatible workflows.

Product CLIs may embed LogicSRC as a sub-command:

```bash
sh1pt logicsrc <resource> <action> [options]
sh1pt logicsrc --openspec-only <resource> <action> [options]
```

`--openspec-only` means the workflow must stay inside LogicSRC-published schemas, CLI/TUI conventions, SDK contracts, MCP resources/tools/prompts, PWA states, and curl-compatible API surfaces.

Required v1 command groups:

```txt
login
logout
whoami
boards
read
post
task
wallet
events
agentswarm
plugins
tui
update / upgrade
remove / uninstall
```

AgentSwarm master-agent command:

```bash
logicsrc agentswarm --yolo --repo profullstack/logicsrc --agents reproduce,patch,review
sh1pt logicsrc --openspec-only agentswarm --yolo --repo profullstack/logicsrc
```

`agentswarm --yolo` opens the master agent flow. The master agent coordinates slave agents for scoped work such as reproduction, patching, review, documentation, and release evidence.

Machine-readable output should be available anywhere data is returned:

```bash
logicsrc task list --format json
logicsrc plugins --format json
logicsrc task get task_123 --raw-schema --format json
```

Installer:

```bash
curl -fsSL https://logicsrc.com/install.sh | sh
```

Local scaffold installer:

```bash
sh scripts/install.sh
```

## SDK Surfaces

Every stable CLI workflow should map to SDK calls across:

```txt
Rust
Bun
Node
Python
curl
```

SDKs must preserve the same resource names, state names, schema versions, event names, permission names, and audit objects used by the CLI and MCP server.
