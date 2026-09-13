# @logicsrc/openfleet

Reference implementation of [OpenFleet](https://logicsrc.com/docs/openfleet),
the record an agent session carries about where it sits: which human answers
for it, who spawned it, for what task, at what depth, and under what ceiling.
A fleet is every agent session one human, its sysop, is answerable for. A
swarm is the set of sessions one spawner starts to do one task.

This package holds the record, the ledger, the ceiling rules, claiming and
deriving, the folded tree, the five sysop verbs, and the Claude Code hooks.
moshcode writes the same files from `moshcode swarm` and reads them with
`moshcode fleet`; one tree shows both engines.

## Install

```bash
npm install -g @logicsrc/cli
logicsrc fleet --help
```

The verbs live in this package and the umbrella CLI wraps them as
`logicsrc fleet`. To use the library directly:

```bash
npm install @logicsrc/openfleet
```

## The files

Everything lives under `$OPENFLEET_HOME`, default `~/.openfleet`:

| Path | What |
| --- | --- |
| `fleets/<fleet>/members/<member>.json` | One record per member, written before it starts, never changed after `member.start`. |
| `fleets/<fleet>/ledger.jsonl` | The append-only ledger for this host. `ledger.<host>.jsonl` copies from other hosts are merged by `at`. |
| `fleets/<fleet>/marks/<event>.<id>` | Once-markers for `member.start`, `member.end` and `swarm.end`, so two writers never double a line. |
| `current` | The fleet the account's next root member joins. Absent means the implicit `<user>@<host>`. |
| `sessions/<session_id>.json` | The Claude Code hooks' own lookup, not part of the spec. |

Files are 0600 and directories 0700.

## The five verbs

```bash
# Sysop only: mint a fleet, set its whole ceiling, write fleet.open and current.
logicsrc fleet open team --approvals bypass --budget "20 USD" --depth 2 --fan-out 4 --hosts dev,netcup --until 2h

# Sysop only: set a fleet's whole ceiling, or narrow a running swarm's. Members now above it are stopped.
logicsrc fleet cap team-20260913 --approvals native
logicsrc fleet cap create-two-0541 --fan-out 2

# Anyone: the tree, from the ledger, the records and the engine rosters. Run by the sysop it also
# stops what is past its deadline or over its budget (rule 6) and marks lost what its engine no longer lists.
logicsrc fleet tree
logicsrc fleet tree anthony@dev --json

# Anyone, within reach: end a member, a swarm (nested swarms first), or a whole fleet through each member's engine.
logicsrc fleet stop create-two-0541
logicsrc fleet stop team-20260913 --fleet

# Anyone: the ledger, in order, with who did it.
logicsrc fleet log --swarm create-two-0541
logicsrc fleet log --since 2h --json
```

Every verb takes `--json`. `open` and `cap` refuse with exit 4 when the
process carries `OPENFLEET_MEMBER`: that process is an agent. `stop` refuses
outside the caller's own subtree the same way. An engine that will not end a
member leaves it without an end line and the verb exits 3.

`stop` goes through the member's own engine: `claude stop <job id>` for
`claude-code`, `moshcode herd kill` for `moshcode/*`, `tmux kill-pane` for
`tmux`, a signal to the pid for `claude-p`.

## Claude Code hooks

```bash
logicsrc fleet hooks install    # merges five entries into ~/.claude/settings.json, never clobbers
logicsrc fleet hooks status
logicsrc fleet hooks remove     # takes out only ours
```

With the hooks installed every Claude Code session becomes a recorded member:
SessionStart claims the record `OPENFLEET_RECORD` names, derives a child under
a claimed one, or writes a root record; UserPromptSubmit checks the ceiling
with the permission mode the engine reports and writes `member.start`, or
refuses the first prompt with exit 2; PreToolUse denies an Edit or Write
outside `piece.owns`; Stop and SessionEnd write `member.end`. A hook never
fails the engine. `logicsrc fleet hook <Event>` is the entry point the
settings file calls.

## Environment

| Variable | Meaning |
| --- | --- |
| `OPENFLEET_HOME` | The root directory. Default `~/.openfleet`. |
| `OPENFLEET_RECORD` | The absolute path of this member's record. |
| `OPENFLEET_FLEET` | A copy of the record's `fleet`; in the sysop's shell, the fleet new roots join. |
| `OPENFLEET_MEMBER` | A copy of the record's `member`. Present means this process is an agent. |
| `OPENFLEET_SWARM` | A copy of the record's `swarm`, when it carries one. |

## Library

```js
import { context, claimOrDerive, startMember, endMember, fold, renderTree, readLedger } from "@logicsrc/openfleet";
import { registerOpenFleetCommands } from "@logicsrc/openfleet/commands";
```

`context(env)` answers which fleet and which member a process is. `claimOrDerive`
is the engine-side rule from the spec's "Claiming and deriving". `fold` builds
the tree `tree` renders. `registerOpenFleetCommands(command, deps)` mounts the
verbs on a commander command with every world-touching dependency injectable.

## License

MIT. The specification text is CC BY 4.0.
