/**
 * The shapes OpenFleet 0.1 defines: the record a member carries, the ceiling,
 * and the eight ledger events. Names and keys follow docs/openfleet.md to the
 * letter, because moshcode and Claude Code write the same files and the two
 * writers must agree byte for byte.
 */

export const OPENFLEET_VERSION = "0.1";

export type Approvals = "native" | "bypass";

/** The programs that run a member and can end it. Lowercase, as the spec lists them. */
export type Engine =
  | "claude-code"
  | "moshcode/claude"
  | "moshcode/codex"
  | "moshcode/deepseek"
  | "moshcode/kimi"
  | "claude-p"
  | "tmux";

export const ENGINES: readonly Engine[] = [
  "claude-code",
  "moshcode/claude",
  "moshcode/codex",
  "moshcode/deepseek",
  "moshcode/kimi",
  "claude-p",
  "tmux",
];

/** The most a fleet, a swarm or a member may do. Every key optional; absent means the spec's default. */
export interface Ceiling {
  approvals?: Approvals;
  /** `<amount> <currency>` or `<n> tokens`. */
  budget?: string;
  depth?: number;
  fan_out?: number;
  hosts?: string[];
  /** ISO 8601 UTC. */
  until?: string;
  [key: string]: unknown;
}

export const CEILING_KEYS = ["approvals", "budget", "depth", "fan_out", "hosts", "until"] as const;
export type CeilingKey = (typeof CEILING_KEYS)[number];

export interface Piece {
  title?: string;
  owns?: string[];
  [key: string]: unknown;
}

/** One JSON object per member. Unknown keys are kept. */
export interface FleetRecord {
  openfleet: string;
  fleet: string;
  sysop: string;
  member: string;
  parent?: string;
  orphan?: boolean;
  swarm?: string;
  task?: string;
  piece?: Piece;
  depth?: number;
  engine?: Engine | string;
  session?: string;
  host?: string;
  cwd?: string;
  started?: string;
  approvals?: Approvals;
  ceiling?: Ceiling;
  [key: string]: unknown;
}

export type EndState = "done" | "failed" | "stopped" | "budget" | "timeout" | "lost";

export const END_STATES: readonly EndState[] = ["done", "failed", "stopped", "budget", "timeout", "lost"];

export type EventName =
  | "fleet.open"
  | "fleet.cap"
  | "swarm.spawn"
  | "member.start"
  | "member.spend"
  | "member.end"
  | "swarm.end"
  | "ceiling.refuse";

/** One piece of a swarm, as written in `swarm.spawn`. */
export interface SpawnPiece {
  member: string;
  title?: string;
  owns?: string[];
  [key: string]: unknown;
}

/** The keys every ledger line carries, then the event's own. */
export interface LedgerLine {
  at: string;
  event: EventName | string;
  fleet: string;
  host: string;
  /** `sysop`, or a member id. */
  by: string;
  sysop?: string;
  ceiling?: Ceiling;
  target?: string;
  swarm?: string;
  parent_swarm?: string;
  task?: string;
  pieces?: SpawnPiece[];
  member?: string;
  session?: string;
  parent?: string;
  depth?: number;
  engine?: string;
  cwd?: string;
  approvals?: Approvals;
  piece?: Piece;
  amount?: string;
  total?: string;
  state?: EndState | string;
  summary?: string;
  links?: unknown[];
  verdict?: unknown;
  action?: "start" | "spawn" | string;
  key?: string;
  wanted?: unknown;
  allowed?: unknown;
  [key: string]: unknown;
}

/** What the caller passes to `append`: everything but `at`, `fleet` and `host`. */
export type LedgerInput = { event: EventName | string; by: string; at?: string; host?: string; [key: string]: unknown };

/** A refusal from `checkCeiling`: which key, what was wanted, what was allowed. */
export interface Refusal {
  key: CeilingKey;
  wanted: unknown;
  allowed: unknown;
}

// ---------------------------------------------------------------------------
// The tree `fold` builds and `tree` renders
// ---------------------------------------------------------------------------

export type MemberState = "unclaimed" | "working" | EndState;

export interface MemberNode {
  member: string;
  session?: string;
  title?: string;
  task?: string;
  engine?: string;
  host?: string;
  depth: number;
  state: MemberState;
  approvals: Approvals;
  owns?: string[];
  orphan?: boolean;
  /** True when the row exists only in an engine's roster, with no record and no ledger line. */
  roster?: boolean;
  /** Liveness from the engine's roster: true listed, false not listed, undefined when no roster was readable. */
  alive?: boolean;
  /** Latest `member.spend` total, as written. */
  spend?: string;
  started?: string;
  ended?: string;
  summary?: string;
  parent?: string;
  swarm?: string;
  swarms: SwarmNode[];
}

export interface SwarmNode {
  swarm: string;
  task?: string;
  by: string;
  parent_swarm?: string;
  ceiling: Ceiling;
  members: MemberNode[];
  swarms: SwarmNode[];
  state?: EndState;
  summary?: string;
  /** Sums of `member.spend` totals under this swarm, one entry per unit. */
  spend: Record<string, number>;
}

export interface FleetNode {
  fleet: string;
  sysop: string;
  implicit: boolean;
  ceiling: Ceiling;
  roots: MemberNode[];
  /** Swarms the sysop started by hand: `by: "sysop"` with no parent swarm. */
  swarms: SwarmNode[];
  spend: Record<string, number>;
}

export interface Tree {
  fleets: FleetNode[];
}

// ---------------------------------------------------------------------------
// Engine rosters
// ---------------------------------------------------------------------------

/** One row of an engine's own roster, normalised across engines. */
export interface RosterRow {
  engine: Engine | string;
  /** The engine's own id for the session: a job id, a pane name. */
  id: string;
  /** A second id the engine knows, when it has one: Claude Code's full session id. */
  sessionId?: string;
  name?: string;
  cwd?: string;
  state?: string;
  approvals?: Approvals;
  startedAt?: string;
  /** What the engine's roster says about fleet placement, when it says anything. */
  fleet?: string;
  swarm?: string;
  member?: string;
  pid?: number;
}

export interface Rosters {
  /** `claude agents --json --all`, when the CLI is present. */
  claude?: () => Promise<RosterRow[] | null>;
  /** `~/.moshcode/herd/sessions.json`, when it exists. */
  moshcode?: () => Promise<RosterRow[] | null>;
}
