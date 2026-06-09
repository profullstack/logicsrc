# CLI Conventions

Primary command style:

```bash
logicsrc <resource> <action> [options]
```

Aliases:

```bash
logicsrc
```

`logicsrc` is the canonical standards CLI.

`--openspec` enables OpenSpec.dev-compatible repo-local planning conventions where supported, such as specs, proposals, implementation tasks, and requirement deltas.

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
accounts
social
email
credentials
openspec
plugins
tui
update / upgrade
remove / uninstall
```

AgentSwarm master-agent command:

```bash
logicsrc agentswarm --yolo --repo profullstack/logicsrc --agents reproduce,patch,review
logicsrc --openspec agentswarm --yolo --repo profullstack/logicsrc
```

`agentswarm --yolo` opens the master agent flow. The master agent coordinates slave agents for scoped work such as reproduction, patching, review, documentation, and release evidence.

OpenSpec-compatible artifact commands:

```bash
logicsrc openspec import
logicsrc openspec export --out logicsrc-openspec-summary.md
logicsrc openspec change --id add-agent-policy --capability agents
```

Credential sharing commands:

```bash
logicsrc credentials providers
logicsrc credentials plan --from env --to railway
logicsrc credentials plan --from doppler --to github-secrets
```

Credential sharing is provider-neutral. External tools can consume LogicSRC credential contracts, but LogicSRC commands do not call proprietary product CLIs.

Communication account commands:

```bash
logicsrc accounts providers
logicsrc accounts list
logicsrc social providers
logicsrc email providers
logicsrc social post <account-id> --text "Launching today" --dry-run
logicsrc email send <draft-id> --dry-run
```

Communication account commands must redact credentials, support dry-run for write-capable actions, and require approval policies for outbound email and social publishing.

When `--openspec` is enabled, AgentSwarm writes OpenSpec.dev-style files under `openspec/changes/<change-id>/`.

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
