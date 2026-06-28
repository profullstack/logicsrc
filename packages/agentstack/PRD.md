# AgentStack — Product Requirements Document

- **Package:** `@logicsrc/agentstack`
- **Status:** v0.1.0 — in-memory reference implementation
- **Spec of record:** `profullstack-web/openspec/specs/agentstack` (Profullstack Shared AppKit OpenSpec)
- **Owner:** Profullstack / LogicSRC

## 1. Summary

AgentStack is the LogicSRC module for **portable agent, task, payment, and reputation
coordination** across the Profullstack microsaas family (sh1pt, uGig, qaaas.dev, crawlproof,
commandboard.run, coinpayportal, logicsrc, intr0s). It gives every app a shared vocabulary for
"who is acting, on whose behalf, on what task, and how it gets paid and scored" — without a
single shared user database or shared cookies.

Identity is anchored on CoinPay-linked DIDs (`did:coinpay:user:123`, `did:coinpay:agent:abc`),
so each app keeps its local `users.id` and links it to a portable DID. Tasks are DID-addressable
and carry their own status lifecycle plus hooks for payment, escrow, and reputation events.

## 2. Problem & motivation

Profullstack apps increasingly hand work to autonomous agents and to each other (a gig posted in
uGig becomes a build task in commandboard.run, paid through CoinPay, scored in a shared
reputation ledger). Today each app reinvents:

- how an agent or user is identified across app boundaries,
- what a "task" is and which states it can move through,
- how a task binds to a payment intent, escrow hold, and reputation event,
- how one app delegates authority to an agent owned by another.

The result is bespoke, incompatible glue per integration. AgentStack standardizes the model once,
as a runtime-neutral module any app can embed or call.

## 3. Goals / non-goals

### Goals
- A single portable task and agent model shared by all Profullstack apps.
- CoinPay-DID identity that works **without** shared auth state.
- A defined, validated task status lifecycle with payment/escrow/reputation linkage points.
- Delegation grants that let an owner authorize an agent within explicit scopes.
- A coordination event stream apps can subscribe to.
- Ship as a LogicSRC plugin (`agentStackPlugin`) validated against the plugin manifest schema.
- Runtime-neutral: identical behavior on Bun, Node.js, Cloudflare Workers, and the browser.

### Non-goals (for now)
- AgentStack is **not** an auth provider — it consumes CoinPay DIDs, it does not mint them.
- It is **not** a payments processor — it references CoinPay payment/escrow IDs, it does not move money.
- It does **not** define the wire transport between apps in v0.1 (in-memory only); the API/server
  surface is a later milestone.
- It does **not** own agent execution/runtime — it coordinates, it does not run the agent.

## 4. Users & use cases

| Persona | Use case |
| --- | --- |
| App developer | Embed `AgentStack` to register agents and track tasks with a consistent model. |
| Owner (human user) | Delegate scoped authority to an agent to act across apps on their behalf. |
| Agent | Receive assigned tasks, report status transitions, accrue reputation. |
| Platform / ops | Subscribe to coordination events for audit, dashboards, and cross-app federation. |

Representative flows:
1. uGig publishes a paid gig → AgentStack task created with a `paymentIntentId` and `escrowId`.
2. commandboard.run's build agent is assigned the task and reports `running → complete`.
3. Completion references a `reputationEventId`; CoinPay releases escrow out of band.

## 5. Current state (v0.1.0 — implemented)

Backed by `src/index.ts`, `src/types.ts`, `src/manifest.ts`:

- **DID helpers** — `makeDid`, `userDid`, `agentDid`, `parseDid`, `DID_METHOD = "did:coinpay"`,
  and the `isDidTask` type guard.
- **`DidTask` model** — id, owner/assignee DIDs, `sourceApp`, title/description, `status`, and
  linkage fields `paymentIntentId` / `escrowId` / `reputationEventId`, plus `metadata` and timestamps.
- **Status lifecycle** — `pending → queued → running → blocked → complete | failed | cancelled`.
- **`AgentStack` coordinator** (in-memory `Map` storage, injectable clock):
  `registerAgent`, `getAgent`, `createTask`, `getTask`, `assignTask`, `updateTaskStatus`,
  `delegate`, `revokeDelegation`, `listDelegations`, `hasDelegation`, `listTasks`, `snapshot`,
  and an `on(listener)` event subscription.
- **Events** — `agent.registered`, `task.created`, `task.assigned`, `task.updated`,
  `delegation.granted`, `delegation.revoked`.
- **`agentStackPlugin`** — a LogicSRC `PluginDefinition`, plus `agentStackManifest` declaring
  capabilities (`agents.register`, `agents.delegate`, `tasks.create/assign/update/publish`,
  `reputation.sync`, `payments.link`, `escrow.link`), commands (`agents`, `tasks`, `delegate`),
  and env (`AGENTSTACK_API_URL`, `AGENTSTACK_API_KEY`, `COINPAY_API_BASE_URL`).
- **Tests** — vitest suite in `src/index.test.ts`.

> Note: the payment/escrow/reputation fields and the `payments.link` / `escrow.link` /
> `reputation.sync` / `tasks.publish` capabilities are **declared and stored** today, but their
> live integrations and cross-app transport are not yet implemented (see roadmap).

## 6. Functional requirements

- **FR-1 Identity.** All actors are addressed by `did:coinpay:{user|agent}:{id}`. Invalid DIDs are
  rejected by `parseDid`. Apps map local `users.id ↔ DID`; AgentStack never stores credentials.
- **FR-2 Agents.** Register an `AgentProfile` (name, sourceApp, supported protocols, optional
  inbox/task endpoints, reputation score). Re-registration updates the profile.
- **FR-3 Tasks.** Create DID-addressable tasks bound to a `sourceApp`. Tasks may be assigned to an
  agent and carry optional payment/escrow IDs at creation.
- **FR-4 Lifecycle.** Status transitions follow the defined lifecycle; terminal states
  (`complete`, `failed`, `cancelled`) are final. `updatedAt` advances on every change.
- **FR-5 Delegation.** An owner grants an agent a scoped, optionally time-bounded
  `DelegationGrant`; grants can be revoked. Authority checks reference active grants.
- **FR-6 Events.** Every state-changing operation emits a typed `AgentStackEvent`; listeners can
  subscribe/unsubscribe.
- **FR-7 Linkage.** Tasks reference `paymentIntentId`, `escrowId`, and `reputationEventId` so
  external systems (CoinPay, reputation ledger) can correlate without coupling.
- **FR-8 Plugin.** AgentStack is exposed as a validated LogicSRC plugin with routes, events,
  permissions, and a TUI panel.

## 7. Non-functional requirements

- **Runtime-neutral:** pure TypeScript, no Bun/Node-only APIs; time injected via constructor.
  Must run on Bun, Node.js, Cloudflare Workers, and the browser (Profullstack dual-runtime standard).
- **Storage-agnostic:** the in-memory coordinator's API is the contract; persistent backends wrap
  the same surface.
- **Spec-conformant:** behavior tracks the `agentstack` OpenSpec capability; drift is a bug.
- **Deterministic & testable:** injectable clock and ID generation; covered by vitest.

## 8. Roadmap / milestones

- **M1 — In-memory core (done, v0.1.0).** DID helpers, task model + lifecycle, coordinator,
  delegation, events, plugin manifest, tests.
- **M2 — Persistence.** A storage backend interface + at least one durable adapter (SQLite/SQLite
  Cloud or Postgres) wrapping the coordinator API, with a snapshot/restore path.
- **M3 — API surface.** A client + server for `AGENTSTACK_API_URL` / `AGENTSTACK_API_KEY` so apps
  coordinate over the network, not just in-process; event stream over the wire.
- **M4 — Live integrations.** Wire `payments.link` / `escrow.link` to CoinPay (`COINPAY_API_BASE_URL`)
  and `reputation.sync` to the shared reputation ledger; enforce delegation scopes on operations.
- **M5 — Cross-app federation.** Implement `tasks.publish` so a task created in one app is
  discoverable/claimable in another; SDK contracts (Rust/Bun/Node/Python/curl) and MCP server hooks.
- **M6 — TUI & ops.** Flesh out the `agents` / `tasks` / `delegate` TUI commands and plugin status UI.

## 9. Success metrics

- ≥ 3 Profullstack apps embedding AgentStack with no per-integration task/identity glue.
- 100% of task state changes emitted as auditable events.
- Zero shared-auth dependencies — all cross-app identity flows through CoinPay DIDs.
- Reference suite green on all four target runtimes.

## 10. Open questions

- Delegation enforcement: should the coordinator hard-block out-of-scope operations, or surface a
  violation event for the host app to enforce?
- Persistence: standardize on one backend, or ship an adapter interface and let each app choose?
- Lifecycle: are `blocked → queued` re-entries allowed, or is `blocked` a one-way precursor to a
  terminal state?
- Federation trust: how are agent profiles and reputation scores verified across app boundaries?
