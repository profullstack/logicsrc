/**
 * AgentStack types — portable agent, task, payment, and reputation coordination.
 *
 * Mirrors the `agentstack` capability spec in the Profullstack Shared AppKit OpenSpec
 * (profullstack-web/openspec/specs/agentstack).
 */

export type TaskStatus =
  | "pending"
  | "queued"
  | "running"
  | "blocked"
  | "complete"
  | "failed"
  | "cancelled";

/** DID method shared across CoinPay-linked Profullstack apps. */
export const DID_METHOD = "did:coinpay";

export type DidKind = "user" | "agent";

/** A portable, DID-addressable task that can move across apps. */
export interface DidTask {
  id: string;
  ownerDid: string;
  assigneeDid?: string;
  sourceApp: string;
  title: string;
  description?: string;
  status: TaskStatus;
  paymentIntentId?: string;
  escrowId?: string;
  reputationEventId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** A registered agent identity that can be delegated tasks. */
export interface AgentProfile {
  did: string;
  name: string;
  sourceApp: string;
  inboxUrl?: string;
  taskEndpoint?: string;
  supportedProtocols: string[];
  reputationScore?: number;
  metadata?: Record<string, unknown>;
}

/** A grant authorizing an agent to act on an owner's behalf. */
export interface DelegationGrant {
  id: string;
  ownerDid: string;
  agentDid: string;
  scopes: string[];
  expiresAt?: string;
  createdAt: string;
}

export type AgentStackEvent =
  | { type: "agent.registered"; agent: AgentProfile }
  | { type: "task.created"; task: DidTask }
  | { type: "task.assigned"; task: DidTask }
  | { type: "task.updated"; task: DidTask }
  | { type: "delegation.granted"; grant: DelegationGrant }
  | { type: "delegation.revoked"; grant: DelegationGrant };

export type AgentStackListener = (event: AgentStackEvent) => void;

export interface CreateTaskInput {
  ownerDid: string;
  sourceApp: string;
  title: string;
  description?: string;
  assigneeDid?: string;
  paymentIntentId?: string;
  escrowId?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentStackSnapshot {
  agents: AgentProfile[];
  tasks: DidTask[];
  delegations: DelegationGrant[];
}
