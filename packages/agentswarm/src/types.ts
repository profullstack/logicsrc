/**
 * AgentSwarm types — an embeddable, framework-agnostic runtime for running
 * deepagents-backed agents that a host app mounts on its own route.
 *
 * The core is intentionally model- and transport-agnostic: a {@link SwarmRunner}
 * executes a turn, and {@link createSwarmHandler} adapts it to a Web `Request`.
 */

export type SwarmRole = "user" | "assistant" | "system";

/** A single chat message in a swarm conversation. */
export interface SwarmMessage {
  role: SwarmRole;
  content: string;
}

/** Input for one swarm turn. */
export interface SwarmRunInput {
  /** Conversation so far; the last message is usually the new user turn. */
  messages: SwarmMessage[];
  /** Optional rubric (LLM-as-judge "done" criteria) for this run. */
  rubric?: string;
  /** Thread id for persistence; a new one is minted when omitted. */
  threadId?: string;
}

/** Result of one swarm turn. */
export interface SwarmRunResult {
  /** The thread the turn ran on (echoed or freshly minted). */
  threadId: string;
  /** Full message list after the turn. */
  messages: SwarmMessage[];
  /** Convenience: text of the final assistant message. */
  output: string;
}

/**
 * Engine that actually runs a swarm turn. Keeping this injectable lets the
 * handler stay model-agnostic; the deepagents-backed runner is one implementation,
 * and tests can supply a mock.
 */
export interface SwarmRunner {
  run(input: SwarmRunInput): Promise<SwarmRunResult>;
}

/**
 * Error a host can throw from a request gate to control the HTTP status — e.g.
 * `throw new SwarmError("payment required", 402)` from an x402 paywall hook.
 */
export class SwarmError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = "SwarmError";
  }
}
