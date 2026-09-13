# OpenFleet

OpenFleet is the record an agent session carries about where it sits: which human answers for it, who spawned it, for what task, at what depth, and under what ceiling. A **fleet** is every agent session one human, its **sysop**, is answerable for. A **swarm** is the set of sessions one spawner starts inside a fleet to do one task. Fleets are always human controlled: only the sysop's verbs open a fleet or set its ceiling, every line that does so is marked `sysop` in a ledger anyone can check, and no agent is ever a sysop. Swarms are automated by default: an agent starts one, and the record and the ledger are what let the human see the tree, stop a swarm as one unit, and learn afterwards what an agent did. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. Written from one session that had to reconstruct its own parentage by hand, and from what the two tools involved record today.

Slug: `openfleet`

Not [OpenSwarm](/openswarm). That swarm is a BitTorrent swarm, peers serving pieces of a file. This one is agent sessions doing one task. Nor a server fleet: a host is where a member runs, never a fleet.

## The problem

On 2026-09-13 at 05:41 UTC, a Claude Code background job on the host `dev`, one developer box, asked moshcode to split a task across two agents. One worker became Claude Code job `172ffd83`. The other became a tmux pane. Each did its piece. Neither could say who had started it, why, who its sibling was, what its budget was, or which human had approved any of it. What each was allowed to touch was one sentence in its prompt that nothing stored or checked. The human could not see the tree, stop the pair as a unit, or cap what they could do. Both workers ran with the engine's own approval prompts bypassed, because the spawning agent chose that.

Nothing was hidden on purpose. Claude Code lists background sessions flat, with a pid, an id, a working directory, a name and a state. moshcode lists herd panes flat (a herd is moshcode's label for a group of tmux panes), with an engine, a binary, its arguments and a herd label. Each tool keeps a private roster, neither reads the other's, and the only durable traces of the swarm were that the job's working directory happened to sit under the parent's temp folder, and the command text in the parent's own transcript. The parent's live task list had dropped the entry within minutes.

The relationship exists at runtime, in a process tree and in a prompt the planner, moshcode's one headless model call, wrote. It is recorded nowhere. OpenFleet is that record, and the ledger a human reads it from.

## Terms

- A **fleet** is every agent session one human is answerable for, under one ceiling. It has an id, exactly one sysop, one ledger per host it runs on, and any number of root members and swarms. The name follows the FleetView in Claude Code's `claude agents`.
- A **sysop** is the one human who answers for a fleet: an [OpenProfile.md](/openprofile) URL, or `<user>@<host>` when the person serves none. A sysop opens and caps a fleet and may stop anything in it. An agent is never a sysop.
- A **swarm** is a set of members one spawner starts to do one task. Automated by default. It lives inside exactly one fleet, has an id, a task, a spawner, and a ceiling within its fleet's and within its parent swarm's.
- A **spawner** is whoever starts a swarm: a member, or the sysop by hand. A spawner may narrow the ceiling for the swarm it starts and may stop that swarm. It never widens a ceiling and never opens a fleet.
- A **member** is one running agent session: a Claude Code job, a moshcode herd pane, a `claude -p` process, a codex, deepseek or kimi session. It has an id unique within its fleet, carries one record, and appears in the ledger from `member.start` to `member.end`. In-process subagents are not members.
- A **root member** has no parent: the sysop started it by hand, or, when it carries `orphan: true`, nothing recorded who did. Its depth is 0. A member with no record at all is a root member of the implicit fleet.
- The **parent** of a member is the member that spawned its swarm. Every member of a swarm has the same parent. Absent on a root member, on the members of a swarm the sysop started by hand, and on a member whose starter dropped its record, which carries `orphan: true` instead.
- A **piece** is one member's part of a swarm's task: a title and the paths it alone may write, as data rather than prose.
- The **ceiling** is the most a fleet, a swarm or a member may do: `approvals`, `budget`, `depth`, `fan_out`, `hosts`, `until`. The sysop sets the fleet's. Each swarm inherits it and may narrow it. A member's record carries the effective ceiling it was started under.
- **approvals** says whether the engine's own approval prompts stand for a member: `native` (they stand) or `bypass` (they are skipped, as with `claude --dangerously-skip-permissions`). It is a fact about the member and a key of the ceiling.
- **depth** is how far below the sysop a member sits. A root member is 0; members of a swarm are their parent's depth plus one.
- **fan-out** is how many members one swarm may hold.
- The **record** is the one JSON document a member carries about where it sits. Written before the member starts, never changed after `member.start`.
- A record is **unclaimed** until a session starts under it and writes its `member.start`. That session has **claimed** it.
- The **ledger** is an append-only JSON Lines file per fleet per host holding every event that happened to the tree. Every line says who did it: `sysop`, or a member id.
- An **engine** is the program that runs a member's session and can start and kill it: `claude-code`, `moshcode/claude`, `moshcode/codex`, `moshcode/deepseek`, `moshcode/kimi`, `claude-p`, `tmux`. Lowercase.
- A **host** is the machine a member runs on, by hostname. `ceiling.hosts` lists where members may run. A host is never a member and never a fleet.
- The **implicit fleet** is the fleet a member belongs to when no fleet was opened: id `<user>@<host>`, sysop the same value, ceiling depth 1 and hosts that host, with no fleet-level `approvals`. Each root member the sysop started by hand runs under the approvals it was started with, and so does everything below that root; a root that carries `orphan` gets `native`. Never an error. It is how an unaware engine still renders as a tree.
- A **sysop tool** is a program the sysop uses on a fleet: FleetView (`claude agents`), `moshcode fleet`, or `logicsrc fleet`. It renders the tree and enforces the ceiling from the record and the ledger, and stops a member through the member's own engine.

## The record

One JSON object per member. The smallest valid record names the spec version, the fleet, the human, and the member:

```json
{ "openfleet": "0.1", "fleet": "anthony@dev", "sysop": "anthony@dev", "member": "460a4502" }
```

The record moshcode should have written for the first piece of the swarm in the worked example, which Claude Code job `172ffd83` then claimed:

```json
{
  "openfleet": "0.1",
  "fleet": "anthony@dev",
  "sysop": "anthony@dev",
  "member": "create-two-0541-1",
  "parent": "460a4502",
  "swarm": "create-two-0541",
  "task": "create two ...",
  "piece": { "title": "create hello.sh bash", "owns": ["hello.sh"] },
  "depth": 1,
  "engine": "claude-code",
  "host": "dev",
  "cwd": "/home/anthony/.claude/jobs/460a4502/tmp/swarm-live",
  "started": "2026-09-13T05:41:01Z",
  "approvals": "bypass",
  "ceiling": {
    "approvals": "bypass",
    "depth": 1,
    "fan_out": 4,
    "hosts": ["dev"],
    "until": "2026-09-13T06:11:01Z"
  }
}
```

| Key | Required | Meaning |
|---|---|---|
| `openfleet` | yes | The spec version this record follows. `0.1`. |
| `fleet` | yes | The fleet id: `<user>@<host>` for the implicit fleet, or the id `open` minted. The recommended form for an opened fleet is `<name>-<yyyymmdd>`. The ledger and the record files live under it. |
| `sysop` | yes | The human answerable for this member: an OpenProfile.md URL, or `<user>@<host>`. Every member of a fleet carries the same value. Never a member id. |
| `member` | yes | This member's id, unique within the fleet. An engine that writes its own root record uses its own session id: a Claude Code job id. A spawner that writes records before any engine has assigned an id uses `<swarm>-<n>`, and the engine's own id arrives in `member.start` as `session`. |
| `parent` | | The member id of the spawner of this member's swarm. Absent means a root member, a member of a swarm the sysop started by hand, or a member that carries `orphan`. |
| `orphan` | | `true` when the session was started by something that dropped its record (rule 13). Absent means false. A tree marks the row. |
| `swarm` | | The id of the swarm this member belongs to, as written in the ledger's `swarm.spawn`. Absent means the member is not in a swarm. The recommended form is a short slug of the task and the UTC minute it was minted, `create-two-0541`. |
| `task` | | The one task the swarm does, in the spawner's words. The same text in every sibling's record. |
| `piece` | | `{ "title", "owns" }`: this member's part of the task. `title` is what a tree shows for the member. `owns` is the list of paths or globs, relative to `cwd`, that only this member may write. Absent means the member has the whole task. |
| `depth` | | How far below the sysop this member sits. Absent means 0. Members of a swarm are their parent's depth plus one, and never above `ceiling.depth`. |
| `engine` | | The program that runs and can kill this session, lowercase. A sysop tool stops a member through this. |
| `session` | | The engine's own handle for this session when the starter knows one that differs from `member`: a tmux target, a pid for `claude -p`. Absent means the same as `member`, or that the engine will supply it in `member.start`. The join key to the engine's roster. |
| `host` | | The hostname this member runs on. Absent means the host the record was read on. Must be in `ceiling.hosts` when that key is set. |
| `cwd` | | The working directory the member started in, absolute. |
| `started` | | When the starter wrote this record and told the engine to start, ISO 8601 UTC. The `at` of the ledger's `member.start` is the authoritative start time. |
| `approvals` | | `native` or `bypass`. Absent means `native`. `bypass` is allowed only when `ceiling.approvals` is `bypass`. This is the field a sysop tool marks in the tree. |
| `ceiling` | | The effective ceiling this member was started under, merged as described below. Absent means the ceiling of this member's root in the implicit fleet: `approvals` as that root was started, `depth` 1, `hosts` this host. |

The ceiling's keys, as they read on an opened fleet:

| Key | Absent means | Meaning |
|---|---|---|
| `approvals` | `native` | The most a member below this ceiling may run with: `native` or `bypass`. |
| `budget` | uncapped | `<amount> <currency>` (ISO 4217, or a CAIP-19 asset id), the way [OpenAccess](/openaccess) writes a money limit, or `<n> tokens`, this spec's own unit. The most the members under this ceiling may spend in total, summed from `member.spend`. |
| `depth` | 1 | The deepest member allowed. 1 means a root member may spawn swarms, and the members of those swarms may not spawn. |
| `fan_out` | the engine's default | The most members one swarm under this ceiling may hold. |
| `hosts` | the host the ceiling was set on | Hostnames members may run on. |
| `until` | no deadline | ISO 8601 UTC time after which every member under this ceiling is stopped. |

**How a ceiling is read.** A fleet's ceiling is whole: the latest `fleet.cap` whose target is the fleet, else `fleet.open`, else the implicit fleet's. A ceiling in `swarm.spawn`, or in a `fleet.cap` whose target is a swarm, holds only the keys that were narrowed, and a key absent there is inherited. A member's effective ceiling is the fleet's, merged key by key with the ceiling of each `swarm.spawn` on the path down to it, with the latest `fleet.cap` for any swarm on that path applied last. That merged object is what the record's `ceiling` carries. In the implicit fleet, `approvals` enters the merge at the root: each root member's own approvals, from the flags it was started with, and `native` for a root that carries `orphan`.

**Narrower** means: `approvals` `native` under `bypass`; `budget`, `depth` and `fan_out` smaller, budget in the same unit; `hosts` a subset; `until` earlier.

A record and a ledger never hold a credential. Unknown keys are kept.

## Where the record lives

**The file.** `$OPENFLEET_HOME/fleets/<fleet>/members/<member>.json`, with `OPENFLEET_HOME` defaulting to `~/.openfleet`. For the worked example, `~/.openfleet/fleets/anthony@dev/members/create-two-0541-1.json`. Whoever starts the member writes it before the session begins. The member reads it, any other process of the same account reads it, and nothing rewrites it after `member.start`. It stays after the member ends, so an agent inspecting a member later reads the same file the member read. `$OPENFLEET_HOME/current` holds the id of the fleet the account's next root member joins; `open` writes it, and absent means the implicit fleet.

**The environment.** Five variables, all prefixed `OPENFLEET_`. `OPENFLEET_HOME` is the sysop's and is inherited; an engine sets the other four when it starts a session:

| Variable | Meaning |
|---|---|
| `OPENFLEET_HOME` | The root directory. Default `~/.openfleet`. |
| `OPENFLEET_RECORD` | The absolute path of this member's record. Always set. |
| `OPENFLEET_FLEET` | A copy of the record's `fleet`. In the sysop's own shell, with no `OPENFLEET_MEMBER`, it says which fleet new root members join and overrides `current`. |
| `OPENFLEET_MEMBER` | A copy of the record's `member`. Present in a process's environment means that process is an agent. This is the test the human-only verbs make. |
| `OPENFLEET_SWARM` | A copy of the record's `swarm`, set when the record carries one. |

The copies must agree with the file when set. The starter sets them beside the engine's own variables: Claude Code's `CLAUDE_JOB_DIR`, moshcode's `MOSHCODE_HERD_NAME` and `MOSHCODE_HERD_DIR`. A spawner that strips a child's environment, as moshcode strips `CLAUDE_CODE_SESSION_ID` on purpose, leaves `OPENFLEET_*` in place.

**Claiming and deriving.** A record is written by the starter, often before the engine has minted any id of its own, so a session cannot tell by comparing ids whether a record was written for it or inherited from a parent. It tells by the ledger. A record with no `member.start` line is unclaimed. The session that starts under it claims it: it writes `member.start`, keeps the record's `session` when it has one and supplies its engine's own id only when it has none, and runs as that member. A record that already has a `member.start` belongs to a running member, and a session that starts under it derives a child record first: same fleet and sysop; `parent` the claimed record's `member`; `depth` plus one. Its `swarm` is the one `OPENFLEET_SWARM` names when that differs from the claimed record's own `swarm` and the ledger holds a `swarm.spawn` for it whose `by` is the claimed record's `member`; `task` and the narrowing then come from that line. Otherwise it is a new swarm of one: the engine mints the id as `<parent>-<n>` and writes `swarm.spawn` with `by` the parent member and `task` the child's command line, and it writes that swarm's `swarm.end` right after the member's `member.end`, with the same `state`. In both cases the derived record's `member` is the engine's own session id and its `session` the process pid, the handle a sysop tool stops a `claude -p` by; in the join case `piece` is absent, and a spawner that wants pieces matched to members writes records. In both cases `ceiling` is the parent record's ceiling merged with the swarm's narrowing. The engine checks that merged ceiling before it writes anything; a refusal writes `ceiling.refuse` and nothing else. The engine writes the child's record, points the child's `OPENFLEET_RECORD` at it, and the child claims it. The leak becomes a parent pointer instead of an impostor. When the session is a program that knows nothing of this, the starter writes the `member.start` on its behalf, with `by` the starter, and only then.

**Reading it back.** A sysop tool reads the tree from `$OPENFLEET_HOME/fleets/*/ledger.jsonl` and the records under `members/`. Another agent inspecting a member reads that member's record file, or runs `log --member <id>`, and joins to the engine's own roster by `engine` plus `session` or `member`: the `id` in `claude agents --json`, the name in `~/.moshcode/herd/sessions.json`. A member learns its siblings from the ledger's `swarm.spawn` for its swarm, or from `tree`.

## The ledger

One fleet, one file per host: `$OPENFLEET_HOME/fleets/<fleet>/ledger.jsonl`, append-only JSON Lines, one object per line. Every line carries `at` (ISO 8601 UTC), `event`, `fleet`, `host` and `by`, where `by` is `sysop` for something the human did and a member id for something an agent did. A tool never writes `sysop` for an agent's action. A fleet that spans hosts has one ledger per host under the same fleet id; the sysop tool merges them by `at`.

The three lines that should have recorded the worked example's first piece, from spawn to end:

```json
{"at":"2026-09-13T05:41:01Z","event":"swarm.spawn","fleet":"anthony@dev","host":"dev","by":"460a4502","swarm":"create-two-0541","task":"create two ...","ceiling":{"fan_out":4,"until":"2026-09-13T06:11:01Z"},"pieces":[{"member":"create-two-0541-1","title":"create hello.sh bash","owns":["hello.sh"]},{"member":"create-two-0541-2","title":"create bye.sh bash","owns":["bye.sh"]}]}
{"at":"2026-09-13T05:41:12Z","event":"member.start","fleet":"anthony@dev","host":"dev","by":"create-two-0541-1","member":"create-two-0541-1","session":"172ffd83","swarm":"create-two-0541","parent":"460a4502","depth":1,"engine":"claude-code","cwd":"/home/anthony/.claude/jobs/460a4502/tmp/swarm-live","approvals":"bypass","piece":{"title":"create hello.sh bash","owns":["hello.sh"]}}
{"at":"2026-09-13T05:41:36Z","event":"member.end","fleet":"anthony@dev","host":"dev","by":"create-two-0541-1","member":"create-two-0541-1","state":"done","summary":"Created hello.sh, mode -rwxrwxr-x, prints hello."}
```

| Event | Keys | Meaning |
|---|---|---|
| `fleet.open` | `fleet`, `sysop`, `ceiling` | A human opened a fleet and set its whole ceiling. `by` is always `sysop`. The first line of every opened fleet's ledger; the implicit fleet has none. |
| `fleet.cap` | `target`, `ceiling` | The sysop set the whole ceiling of a fleet (`target` is the fleet id) or narrowed a running swarm's (`target` is the swarm id, `ceiling` only the narrowed keys). The latest line for a target wins over the ceiling copied into any record. `by` is always `sysop`. |
| `swarm.spawn` | `swarm`, `parent_swarm`, `task`, `ceiling`, `pieces` | A spawner started a swarm: its id; `parent_swarm`, the swarm of the spawner's own record, absent when the spawner is a root member or the sysop; the task in the spawner's words; the keys it narrowed; and one piece per member it minted, `{ "member", "title", "owns" }`, with the paths that member owns as data. Written before the first member starts. `by` is the spawner: a member id, or `sysop` for a swarm the human started by hand. |
| `member.start` | `member`, `session`, `swarm`, `parent`, `depth`, `engine`, `host`, `cwd`, `approvals`, `piece` | A member began, and its record is claimed. Written by the session itself with `by` its own member id, or by the starter, with `by` the starter, for an engine that cannot write it. `session` is the engine's own id when the record has none. The row a sysop tool draws in the tree; `approvals: bypass` is the mark it shows. |
| `member.spend` | `member`, `amount`, `total` | A member spent something: `amount` since the last line and `total` so far, as `<amount> <currency>` or `<n> tokens`, in the engine's own numbers. Written by an engine that can count, at intervals or at the end. Summed per swarm and per fleet against `ceiling.budget`. |
| `member.end` | `member`, `state`, `summary`, `total`, `links` | A member finished. `state` is `done`, `failed`, `stopped`, `budget`, `timeout` or `lost`. `by` says who ended it: `sysop`, the spawner, or the member itself. `summary` is the member's closing summary when it wrote one; `total` its final spend; `links` the PRs and URLs it produced. `lost` is what a sysop tool writes for a member whose engine's roster can hold it and no longer lists it, and that has no end line from any writer: a Claude Code background job, a moshcode pane. An interactive or `-p` Claude Code session is never in `claude agents`, so no roster marks it lost. `by` is `sysop` when the tool runs with no `OPENFLEET_MEMBER` and that member otherwise. A member has one end line that counts: the first written, except `lost`, which the engine's or the spawner's own `member.end` supersedes whenever it arrives. A session or tool that finds an end line for a member writes none, unless that line is `lost`, which the engine's or the spawner's own `member.end` may follow and supersede; `stop` on an ended member writes nothing. |
| `swarm.end` | `swarm`, `state`, `summary`, `verdict` | A swarm ended as one unit: every member and every nested swarm under it has an end line at or before this one. `state` is `done` when every member ended `done`, else the first of `failed`, `stopped`, `budget`, `timeout` found among its members' end lines. `summary` is the spawner's synthesis, its closing summary of every member's summary, when it has one; `verdict` the verify result when it ran. One `swarm.end` per swarm ended, never two for the same swarm: a writer checks the ledger first and writes it only when none exists, and a synthesis that arrives after one goes into the spawner's own `member.end` `summary`. |
| `ceiling.refuse` | `member`, `action`, `key`, `wanted`, `allowed` | An engine or tool refused something because it would exceed the ceiling: `action` is `start` or `spawn`; `key` names the ceiling key; `wanted` and `allowed` say the two values. `member` is the id the refused record names when one exists, else absent; `by` is the spawner: that record's `parent`, else the caller's `OPENFLEET_MEMBER`, else the refused record's own `member` when it carries `orphan`. This is how a sysop finds out what an agent tried. |

## The sysop's verbs

Five verbs, over `$OPENFLEET_HOME`. Two are the sysop's alone. The test is the environment: a process that carries `OPENFLEET_MEMBER` is an agent.

| Verb | Who | Does |
|---|---|---|
| `open` | sysop only | Creates a fleet: mints the id, records the sysop, sets the ceiling from flags (`--approvals native\|bypass --budget "20 USD" --depth 2 --fan-out 4 --hosts dev,netcup --until 2h`), writes `fleet.open`, writes the id to `current`, prints it. Refuses when `OPENFLEET_MEMBER` is set. |
| `cap` | sysop only | Sets the whole ceiling of a fleet, or narrows a running swarm's, and writes `fleet.cap`. Members already above the new ceiling, a `bypass` member under a now-`native` ceiling, a member on a now-forbidden host, are stopped by the tool, each with `member.end` state `stopped`. Refuses when `OPENFLEET_MEMBER` is set. An agent narrows only at spawn time, in the `swarm.spawn` it writes. |
| `tree` | anyone | Renders one fleet, or every fleet on this host, as a tree: fleet, its swarms, each swarm's members and nested swarms, with state, engine, host, depth, spend against budget, and a mark on every member whose approvals is `bypass`. Built from the ledger and the records. When an engine's roster is readable, sessions it lists that have no record are drawn as root members of the implicit fleet and marked as coming from the roster, and a recorded member the roster can hold and no longer lists (a background job, a pane; never an interactive session the roster does not list) gets `member.end` state `lost`. Run by the sysop, it enforces rule 6: a working member past its effective `until` is stopped through its engine and ends `timeout`, and a swarm or fleet whose summed `member.spend` has reached its budget has its members stopped, each ending `budget`, then its `swarm.end` when the swarm is complete. An agent calls it on its own fleet to learn its siblings; it stops nothing. |
| `stop` | anyone, within reach | Ends a member, a swarm, or everything in a fleet (`--fleet`) as one unit. For a swarm: nested swarms first, each with its own `swarm.end`, then the target's members through each member's own engine, then the target's `swarm.end`. An agent may stop only a swarm it spawned or a member under such a swarm; `--fleet`, an ancestor, or a sibling's swarm refuses when `OPENFLEET_MEMBER` is set. |
| `log` | anyone | Reads the ledger for a fleet, a swarm or a member: what happened, in order, who did it, what each member spent, how each ended, what was refused and why. `--since`, `--member`, `--swarm`, `--json`. |

The reference sysop tool is `logicsrc fleet`, in `@logicsrc/openfleet` 0.1.0 (logicsrc CLI 0.3.0). `moshcode fleet` offers the same five verbs over the same files from moshcode 0.99.0, and stops the members its engine runs. FleetView (`claude agents`) does not offer them yet; Claude Code takes part through the hooks `logicsrc fleet hooks install` writes, and `logicsrc fleet` stops its jobs through `claude stop`.

## Rules

1. A fleet has exactly one sysop. The sysop is a human, named by an OpenProfile.md URL or `<user>@<host>`, and every record in the fleet carries the same `sysop` value.
2. An agent never opens a fleet or changes a fleet's ceiling. `fleet.open` and `fleet.cap` carry `by: "sysop"`, and a sysop tool refuses `open`, `cap`, and `stop` outside the caller's own subtree when `OPENFLEET_MEMBER` is set in the caller's environment.
3. Every swarm names exactly one fleet. Its ceiling is within that fleet's and within its parent swarm's, key by key, narrower as defined above. A spawner may narrow a key and never widens one.
4. A member runs with approvals `bypass` only when the effective ceiling it was started under says `bypass`. An opened fleet's ceiling with no `approvals` key means `native`. In the implicit fleet a root the sysop started by hand supplies its own approvals to its subtree, and a root that carries `orphan` gets `native`.
5. An engine refuses to start a member that would exceed the ceiling's `approvals`, `depth`, `fan_out`, `hosts` or `until`, and writes `ceiling.refuse` naming the key.
6. A tool that sees spend under a swarm or fleet reach its budget, or the clock pass its `until`, stops it and writes the end lines with state `budget` or `timeout`.
7. The record is written before the member starts and never changes after `member.start`. Anything that changes later is a ledger event, and the latest `fleet.cap` for a target wins over the ceiling copied into any record.
8. A record with no `member.start` in the ledger is unclaimed, and the session that starts under it claims it by writing that line. A session that starts under a claimed record derives a child record first and never runs as another member. It joins the swarm `OPENFLEET_SWARM` names only when the ledger holds that swarm's `swarm.spawn` written by the claimed record's `member`; otherwise it is a swarm of one.
9. A spawner writes `swarm.spawn` before the first member of the swarm starts, and never strips `OPENFLEET_*` from a child's environment, whatever else it strips.
10. The ledger is append-only, one JSON object per line, one file per fleet per host. Every line carries `at`, `event`, `fleet`, `host` and `by`; `by` is `sysop` or a member id; a tool never writes `sysop` for an action an agent took.
11. `stop` on a swarm ends nested swarms first, each with its own `swarm.end`, then the target's members through their own engines, then writes the target's `swarm.end`: one `swarm.end` per swarm ended, never two for the same swarm, so a writer checks the ledger first.
12. A member with no record is a root member of the implicit fleet `<user>@<host>` of the account that started it, never an error. The implicit fleet's ceiling is depth 1 and hosts that host, with no fleet-level `approvals`; each root member's subtree runs under the approvals that root was started with, read from the engine's roster: Claude Code's `respawnFlags`, moshcode's `args`.
13. A session started with no `OPENFLEET_RECORD` but with an engine's child marker (`CLAUDE_JOB_DIR`, `CLAUDE_CODE_CHILD_SESSION`, `MOSHCODE_HERD_NAME`) in the environment the engine was invoked with, before it sets its own session variables, was started by something that dropped its record. For a `--bg` job the launching `claude` process makes the test, not the daemon it starts. In 0.1 no launcher makes that test yet: a background job dispatched with no launcher record is a clean root of the implicit fleet. The engine writes a root record with `orphan: true`, then checks approvals before claiming it: a refusal writes `ceiling.refuse` with `member` and `by` the record's own `member` and leaves the record unclaimed, unless `current` names an opened fleet whose ceiling says `bypass`; otherwise it claims the record with `by` its own member id, and the tree marks the row. Under one account the environment test is a convention and the ledger is the audit; nothing in 0.1 stops a process from unsetting a variable.
14. A sysop tool renders every recorded member from records and the ledger. Members with no record exist only in an engine's roster, and the tool reads the rosters it can (`claude agents --json`, `~/.moshcode/herd/sessions.json`) to draw them and to add liveness. No roster is required for a recorded member.
15. A record and a ledger never hold a credential. Unknown keys are kept.

## The worked example, again

With the record and the ledger in place, the morning of 2026-09-13 reads like this.

Job `460a4502` is a root member of the implicit fleet `anthony@dev`, started by hand at 04:55 UTC with `--permission-mode bypassPermissions`, so approvals `bypass`. Its effective ceiling is approvals `bypass`, depth 1, hosts `dev`. At 05:27 the sysop tells it to build swarm support into moshcode. At 05:41 it runs `moshcode swarm "create two ..."`. moshcode mints `create-two-0541` and asks the planner for pieces. That call is a bare `claude -p` in the job's own environment, with no `OPENFLEET_SWARM`, so Claude Code finds a claimed record, derives a swarm of one for it, `460a4502-1`, and that member ends `done` when the plan comes back with titles, prompts, and now a `files` list per piece. moshcode writes `swarm.spawn` with `by: "460a4502"`, two pieces, `create-two-0541-1` owning `hello.sh` and `create-two-0541-2` owning `bye.sh`, and a narrowing of `fan_out: 4` and `until` thirty minutes out. It writes one record per piece, unclaimed, and sets the four variables in each child's environment beside the herd variables.

The first piece is dispatched through `claude agents`. The Claude Code job that starts finds `OPENFLEET_RECORD` naming an unclaimed record, claims it, and writes the `member.start` above with `session: "172ffd83"`. It runs with approvals `bypass`, which the merged ceiling allows. The second piece is a tmux pane named after its member id; the `claude` inside it finds its own unclaimed record and claims it the same way, keeping the tmux target moshcode wrote as `session`.

`claude agents` and `moshcode herd ps` now both show one tree: `anthony@dev`, then `460a4502`, then the planner's swarm of one, then swarm `create-two-0541` with two members, both marked `bypass`, each with the file it owns. The sysop can `stop create-two-0541`, and both children end through their own engines, with one `swarm.end`. Each child can read its record and answer the five questions the real `172ffd83` could not. When moshcode's synthesis finishes, moshcode writes `member.end` for any pane that has not written its own, then `swarm.end` with the synthesis as `summary`, and the sysop reads that line before merging anything.

Had `460a4502` been started with approvals `native`, its subtree's ceiling would say `native`, Claude Code would have refused the dispatch with `ceiling.refuse` on key `approvals`, and the sysop would have seen the attempt. That is the intended outcome, and a different record.

## Reference implementations

Three ship: `logicsrc fleet` in `@logicsrc/openfleet` 0.1.0 (logicsrc CLI 0.3.0), Claude Code through `logicsrc fleet hooks install`, and moshcode 0.99.0, which writes records in `moshcode swarm` and offers `moshcode fleet`. What each does, on top of what it records:

**Claude Code.** Ships as hooks. `logicsrc fleet hooks install` merges five entries into `~/.claude/settings.json` and never clobbers what is there: SessionStart resolves the record and hands the member its variables, UserPromptSubmit checks the ceiling with the permission mode the engine reports and writes `member.start` or refuses the first prompt, PreToolUse denies an Edit or Write outside `piece.owns`, Stop and SessionEnd write `member.end`. What the hooks do is what this paragraph asks of the engine. Resolve the fleet from `OPENFLEET_FLEET`, else `$OPENFLEET_HOME/current`, else the implicit `<user>@<host>`. On every start, interactive, `--bg`, `-p`, or dispatched from `claude agents`: when `OPENFLEET_RECORD` names an unclaimed record, claim it; when it names a claimed one, derive a child record and claim that; when it is unset, write a root record, with `orphan: true` when the environment the `claude` command was invoked with carries a child marker; for a `--bg` job the launching process makes that test, not the daemon. A root record written with no opened fleet carries `ceiling: { approvals, depth: 1, hosts: [host] }` from its own flags, or `approvals: native` when the record carries `orphan`. Set `approvals` to `bypass` whenever the flags carry `--permission-mode bypassPermissions` or `--dangerously-skip-permissions`; refuse the start with `ceiling.refuse` when the ceiling says no, before any `member.start`; set the four variables below `OPENFLEET_HOME` in the job environment beside `CLAUDE_JOB_DIR`. Still Claude Code's own to add: the record's `fleet`, `swarm`, `parent`, `depth` and `approvals` in `~/.claude/jobs/<id>/state.json` and in the `claude agents --json` rows, so the roster stops being flat; `member.spend` from the job's token count at intervals; and a FleetView that groups rows by fleet and swarm, marks `bypass` members, sums spend against budget, and offers `stop` on a swarm and `cap`. Until then the hooks write `member.end` when a background job first goes terminal, or when an interactive or `-p` session exits, with `summary` from the closing message, or its SUMMARY section when the prompt asked for one, `total` from the job's token count, and `links` from the state file's `children` key, which holds the links a job produced and not child jobs. The in-process Agent and Workflow tools stay as they are: not members. Two limits were verified on Claude Code 2.1.270 and shape the hooks. A background job dispatched from `claude agents` runs in a spare the daemon forked before any launcher existed, so no launcher environment reaches it: it is a root member of the implicit fleet unless a launcher writes its record and the job finds that record by another channel than the environment. And `OPENFLEET_*` exported at SessionStart reach the member's tools through `CLAUDE_ENV_FILE` but not later hooks, so the hooks key on `session_id` through `$OPENFLEET_HOME/sessions/<session_id>.json`, a file of the implementation and not of this spec.

**moshcode.** From 0.99.0, `moshcode swarm` writes the record and the ledger, and `moshcode fleet` is the sysop tool for its engine. What that means, in `moshcode swarm`: mint the swarm id before the plan call, and run the planner with no `OPENFLEET_SWARM`, since its `swarm.spawn` does not exist until the plan returns; extend the planner's reply to `[{ "title", "prompt", "files" }]` and store `files` as `piece.owns`, so "do not touch bye.sh" becomes data moshcode can check instead of prose it never parses; write `swarm.spawn` with one piece per pane, member ids `<swarm>-<n>`, and the narrowing from `--agents` (`fan_out`) and `--timeout` (`until`); name each pane after its member id and write one unclaimed record per pane with `session` the pane's tmux target; add the four variables to the pane's environment line beside `MOSHCODE_HERD_NAME` and `MOSHCODE_HERD_DIR`, and keep them when deleting `ANTHROPIC_API_KEY` and `CLAUDE_CODE_SESSION_ID`. A `claude` pane claims its own record. For codex, deepseek and kimi panes moshcode writes `member.start` from the herd ledger's `submit` event, since nothing else in the pane writes a record. Record `approvals: bypass` truthfully: today `sessions.json` says `agent: false` while the pane runs `claude --dangerously-skip-permissions`. Refuse that flag with `ceiling.refuse` unless the ceiling says `bypass`. At the end, write `member.end` from the herd `end` event for every pane whose session has not written its own by then, then `swarm.end` with the synthesis as `summary` and the `--verify` result as `verdict`, then the default kill; `--keep` leaves members running and writes neither `member.end` nor `swarm.end`. When moshcode itself runs inside a member, the swarm's parent is that member. `moshcode fleet open|cap|tree|stop|log` is the sysop tool for this engine, with `herd ps` grouped by fleet and swarm.

**logicsrc.** `logicsrc fleet open|cap|tree|stop|log`, the engine-neutral sysop tool that folds any `$OPENFLEET_HOME` into one tree and stops a member through the engine its record names: `claude stop` for `claude-code`, `moshcode herd kill` for `moshcode/*`, `tmux kill-pane` for `tmux`, a signal to the pid for `claude-p`. Ships in `@logicsrc/openfleet` 0.1.0 with the logicsrc CLI 0.3.0. `tree` reads `claude agents --json --all` and `~/.moshcode/herd/sessions.json` for liveness and for members with no record, and writes `member.end` state `lost` for a recorded background job or pane its engine's roster can hold and no longer lists; an interactive or `-p` `claude` session, which `claude agents` never lists, is never marked lost. Run by the sysop, `tree` also enforces rule 6: a member past its effective `until` is stopped through its engine and ends `timeout`, a swarm or fleet whose summed `member.spend` has reached its budget has its members stopped, each ending `budget`, and each swarm touched gets its `swarm.end` once it is complete. `stop` on a claude-code member calls `claude stop` with the job id: the member id of a background job, else the first eight characters of the record's session when that is a session UUID; an interactive session with no job id cannot be stopped by the tool, which says so. Every `member.start`, `member.end` and `swarm.end` the tool or the hooks write takes a once-marker first, an exclusive create of `$OPENFLEET_HOME/fleets/<fleet>/marks/<event>.<id>` (`member.end.<id>.lost` for a `lost` line, so a real end can still follow it and take the plain one); a writer that finds the marker taken writes nothing and reports "already". moshcode uses the same paths, so the two writers never double a line. `logicsrc fleet hooks install|remove|status` and `logicsrc fleet hook <Event>` are the Claude Code side above. Every verb takes `--json`.

## What is deliberately absent

**No orchestration.** OpenFleet does not split a task, route a model, pick an engine, verify or synthesise. `moshcode swarm` and `@logicsrc/agentswarm` do that and keep their names.

**No permission system.** `approvals` and `piece.owns` are carried and honoured by engines. Enforcement is theirs; the ledger makes what they did checkable.

**No transcript and no message bus.** What a member said stays in the engine's own log. Siblings learn each other's ids from the ledger and talk through whatever they already had.

**No replacement for the engine's roster.** `~/.claude/jobs` and `~/.moshcode/herd` stay. The record and the ledger are the layer that reads across them.

**No in-process subagents.** Claude Code's Agent and Workflow tools run inside one session. They have no record and do not count against `fan_out`.

**No network surface.** 0.1 is files on one host, under one account, merged by hand across hosts. No descriptor, no API.

**No freeze.** 0.1 has no engine-neutral way to freeze a member, so there is no `hold`. `stop` ends; `cap` narrows what may start next.

**No signature.** The human-only test is an environment variable and the ledger is the audit. Signed `fleet.open` and `fleet.cap` are the 0.2 answer.

## Related standards

- [OpenAgent](/openagent): the durable agent profile, with its identity, owner, skills and requested permissions. A launcher can map one profile to many fleet members; the profile does not change a session's sysop or ceiling.
- [OpenSwarm](/openswarm): unrelated and easy to confuse. Peer-to-peer file and media distribution; its swarm is a set of peers. Each spec carries one line pointing at the other.
- [OpenAccess](/openaccess): `ceiling.budget` borrows its money limit string and adds `<n> tokens`. A delegated grant is the network-side twin of a ceiling, a child narrower than its parent and revoked with it. A fleet API, if one comes, is an OpenAccess app with `fleet:read` and `fleet:control` scopes.
- [OpenProfile.md](/openprofile): the sysop, where the human has one.
- [OpenCreds](/opencreds): where a member's credentials live. A record and a ledger never hold one.
- [ASDLC](/asdlc): a swarm is one fan-out made durable. `piece.owns` is the no-shared-files rule as data, and `swarm.end` `summary` is what the human reads before merge.
- OpenContext (`docs/opencontext.md` in the repository, not yet on the site): governs what a member may read; the ceiling governs what it may do. The same engine checks both.
- [OpenPRD](/openprd): a swarm's task may cite a PRD, as moshcode's cites PRD 0015.

## Conformance

**A member engine** claims or derives a record for every session it starts, and writes a root record when there is none, before the session runs; sets `OPENFLEET_RECORD`, `OPENFLEET_FLEET`, `OPENFLEET_MEMBER`, and `OPENFLEET_SWARM` when the record carries a swarm; never runs a session as another member; writes `member.start` and `member.end` truthfully, approvals included; refuses to start above the ceiling and writes `ceiling.refuse`; writes `member.spend` when it can count; and can end any session it started when a sysop tool asks by member or session.

**An agent spawner** is a member engine that also mints the swarm id before planning; writes `swarm.spawn` with the task, the keys it narrowed and one piece per member before any member starts; narrows and never widens; writes one unclaimed record per piece, or sets `OPENFLEET_SWARM` when it cannot hand the engine a file; leaves `OPENFLEET_*` in the child environment; stops its own swarm as one unit; and never opens a fleet or writes `by: "sysop"`. A swarm the sysop starts by hand carries `by: "sysop"` in its `swarm.spawn`, and its members have no parent.

**A sysop tool** offers `open`, `cap`, `tree`, `stop` and `log` over `$OPENFLEET_HOME`; refuses `open`, `cap` and `stop` outside the caller's subtree when `OPENFLEET_MEMBER` is set; renders every recorded member from records and the ledger, reads the engine rosters it can for recordless members and liveness, and marks every `bypass` member; sums `member.spend` against budget and stops at the cap or the deadline; stops members through their own engines; merges per-host ledgers under one fleet id; and never edits a ledger line.

## Open questions

- Cross-host ledgers merge by `at` with no event id, so a line forwarded twice is drawn twice. A remote member appending to the sysop's ledger, with an event id and a `/.well-known/openfleet.json` to find it, is the 0.2 question.
- Engines report spend in their own units. A sysop tool summing money and tokens under one budget needs a rule; 0.1 sums matching units and shows the rest.
- Should the ceiling carry `resource:action` scopes beside `approvals`, so an engine with an allowlist can map them?
- Should an engine refuse a write outside `piece.owns`, and how would a bare `claude -p` know?
- An `adopt` verb, placing an unrecorded root member under a swarm by hand, would have repaired the `bye.sh` writer. One verb and one event in 0.2?
- A one-shot `claude -p` inside a member becomes a swarm of one under the derive rule, and is refused on `depth` in the implicit fleet when the member is already at depth 1. Correct, and noisy under tools that spawn many.
- moshcode's prose says operator for the human. This spec says sysop because a fleet has exactly one and the word carries the duty.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-13 | First publication: fleet and swarm, the record, the environment, claiming and deriving, the ledger's eight events, five sysop verbs, fifteen rules, the worked example, what Claude Code and moshcode each add. Same day: `logicsrc fleet` and the Claude Code hooks ship in `@logicsrc/openfleet` 0.1.0, `moshcode swarm` and `moshcode fleet` in moshcode 0.99.0. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
