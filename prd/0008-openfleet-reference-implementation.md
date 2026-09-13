---
openprd: "0.3"
id: "0008"
title: "Ship the OpenFleet reference implementation"
status: Draft
authors:
  - anthony@profullstack.com
created: 2026-09-13
updated: 2026-09-13
repo: profullstack/logicsrc
discussion:
implementation: packages/openfleet
tags:
  - openfleet
  - agents
  - fleet
  - swarm
  - claude-code
  - moshcode
  - cli
supersedes:
superseded-by:
---

## Problem

The OpenFleet specification (docs/openfleet.md) was published on 2026-09-13 from
one incident: a Claude Code background job asked moshcode to split a task across
two agents, and afterwards nobody, human or agent, could say who had started
either worker, why, under what ceiling, or with whose approval. The spec names
the record, the ledger and five sysop verbs, and named `logicsrc fleet` as the
reference sysop tool. It shipped with the line "None of the three ships yet".
A standard nothing implements is prose; the incident repeats every morning until
the files exist and something writes them.

## Goals

- A human can open a fleet, set its ceiling, see every agent session under them
  as one tree, stop a swarm as one unit, and read afterwards what happened and
  who did it, from one command: `logicsrc fleet`.
- Every Claude Code session on a box with the hooks installed becomes a
  recorded member: it claims the record its starter wrote, or derives its own,
  or is a root member of the implicit fleet, and it refuses to run above the
  ceiling it was started under.
- moshcode and Claude Code write the same files the same way, so one tree
  shows both engines' members without either reading the other's roster.

## Non-Goals

- No orchestration: splitting a task, choosing an engine, verifying, and
  synthesising stay in `moshcode swarm` and `@logicsrc/agentswarm`.
- No change to Claude Code itself. The engine side ships as hooks over its own
  settings file; FleetView grouping and `member.spend` at intervals wait on the
  engine.
- No network surface, no signed ledger lines, no freeze, no `adopt`: the 0.2
  questions stay open.

## Users

- The sysop: one developer answerable for every agent session on their box,
  who wants to see the tree and stop the wrong part of it.
- An agent that spawns a swarm and wants its children to know who they are and
  what they own.
- A later session inspecting a member's record to answer the five questions the
  incident could not.

## Requirements

- R1 [P0] `@logicsrc/openfleet` 0.1.0: the record (write once, never
  overwrite), the ledger (append-only, 0600, merged across `ledger*.jsonl` by
  `at`), the ceiling rules (whole fleet ceiling, narrowed swarm keys, merge
  that never widens, refusal by key), claim and derive exactly as the spec's
  "Claiming and deriving", and `fold` into the tree the landing page shows.
- R2 [P0] `logicsrc fleet open|cap|tree|stop|log` with the spec's flags;
  `open` and `cap` exit 4 when `OPENFLEET_MEMBER` is set; `stop` exits 4
  outside the caller's subtree; `stop` ends nested swarms first and writes one
  `swarm.end` per swarm, only once every member and every nested swarm has an
  end line that counts, and exits non-zero when an engine would not end a
  member; `cap` on a swarm refuses a key that would widen; every verb takes
  `--json`.
- R2a [P0] Rule 6 lives in `tree`, run by the sysop: a working member past
  its effective `until` is stopped through its engine and ends `timeout`; a
  swarm or fleet whose summed `member.spend` in the budget's unit has reached
  its budget has its members stopped, each ending `budget`; each swarm touched
  gets its `swarm.end` when complete. An agent's `tree` stops nothing.
- R2b [P0] The effective ceiling is rebuilt from the ledger on every read:
  the latest fleet-target `fleet.cap` (else `fleet.open`, else the implicit
  fleet's) replaces the copy in a record, widening included; then each
  `swarm.spawn` narrowing down the path, then swarm caps last. In the
  implicit fleet a parentless record's own `approvals` enters at the root, and
  the engine fills a ceiling a writer left without the key.
- R3 [P0] `stop` goes through the member's own engine: `claude stop` for
  `claude-code`, `moshcode herd kill` for `moshcode/*`, `tmux kill-pane` for
  `tmux`, a signal for `claude-p`. Never a shell string.
- R4 [P0] Claude Code hooks: `logicsrc fleet hook <Event>` for SessionStart,
  UserPromptSubmit, PreToolUse, Stop and SessionEnd, and `logicsrc fleet hooks
  install|remove|status` that merges into `~/.claude/settings.json` and never
  clobbers it. A hook never fails the engine; a refused start exits 2 before
  any `member.start`.
- R5 [P1] `tree` reads `claude agents --json --all` and
  `~/.moshcode/herd/sessions.json` when it can, draws recordless sessions as
  roots of the implicit fleet, and writes `member.end` state `lost` for a
  recorded background job or pane its engine's roster can hold and no longer
  lists. `claude agents` lists background jobs only, so an interactive or `-p`
  session (a UUID member with no job id) is never marked lost by it.
- R6 [P1] The spec and the landing page say what ships, keep `Status: 0.1`,
  and record the two verified Claude Code limits (no launcher environment
  reaches a dispatched background job; exported variables reach tools but not
  later hooks).
- R7 [P1] Tests cover record and ledger IO, every narrower case, the worked
  example's claim and derive, the folded tree, hook install idempotence, and
  each hook handler, including the exit-2 refusal and the PreToolUse deny.

## UX Notes

`logicsrc fleet tree` prints the tree the landing page shows: fleet header,
root members, swarms nested under their spawner, members with engine, state,
`[bypass]`, `owns`. `log` prints one line per event, oldest first, with who did
it. Refusals name the key, what was wanted and what was allowed.

## Tech Stack

TypeScript, NodeNext, commander 14, vitest 4. No workspace dependencies beyond
the CLI's `file:../openfleet` link. Node 18+ (the installer's floor), so the
tree is plain text rather than a TUI.

## Monetization

None. It is the reference implementation of an open standard.

## Success Metrics

- The worked example's morning can be replayed against a temp home and
  `logicsrc fleet tree` prints the tree the spec shows.
- A Claude Code session started with the hooks installed appears in
  `logicsrc fleet tree` with the right approvals mark without anyone editing a
  file by hand.

## Risks & Open Questions

- A background job dispatched from `claude agents` gets no launcher
  environment, so a launcher that wants it in a swarm must write its record and
  pass the path another way (a `--settings` hook command, or a lookup by the
  job's cwd and intent). Until then it is a root of the implicit fleet.
- User-level hooks fire for every `claude -p` a tool makes, so each becomes a
  swarm of one and, at depth 1 in the implicit fleet, is refused on depth. The
  spec lists this as an open question; the hooks enforce the letter of it.
- A ledger check before a write is not exclusion, so `member.start`,
  `member.end` and `swarm.end` each take a once-marker first: an exclusive
  create of `fleets/<fleet>/marks/<event>.<id>` (`.lost` suffixed for a lost
  end, so a real end can still supersede it). moshcode uses the same paths.
  A marker taken by a writer that then crashed before appending leaves the
  line unwritten until someone clears the marker by hand; 0.1 accepts that
  over a doubled audit line.
