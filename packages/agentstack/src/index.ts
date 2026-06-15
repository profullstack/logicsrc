import type { PluginDefinition } from "@logicsrc/plugin-core";
import { agentStackManifest } from "./manifest.js";
import type {
  AgentProfile,
  AgentStackEvent,
  AgentStackListener,
  AgentStackSnapshot,
  CreateTaskInput,
  DelegationGrant,
  DidKind,
  DidTask,
  TaskStatus
} from "./types.js";
import { DID_METHOD } from "./types.js";

/** Build a CoinPay-method DID for a user or agent: `did:coinpay:user:123`. */
export function makeDid(kind: DidKind, id: string): string {
  return `${DID_METHOD}:${kind}:${id}`;
}

export const userDid = (id: string) => makeDid("user", id);
export const agentDid = (id: string) => makeDid("agent", id);

/** Parse a CoinPay DID into its kind and id, or return null if it is not one. */
export function parseDid(did: string): { kind: DidKind; id: string } | null {
  const prefix = `${DID_METHOD}:`;
import type { PluginDefinition } from "@logicsrc/plugin-core";
import { agentStackManifest } from "./manifest.js";
import type {
  AgentProfile,
  AgentStackEvent,
  AgentStackListener,
  AgentStackSnapshot,
  CreateTaskInput,
  DelegationGrant,
  DidKind,
  DidTask,
  TaskStatus
} from "./types.js";
import { DID_METHOD } from "./types.js";

/** Build a CoinPay-method DID for a user or agent: `did:coinpay:user:123`. */
export function makeDid(kind: DidKind, id: string): string {
  return `${DID_METHOD}:${kind}:${id}`;
}

export const userDid = (id: string) => makeDid("user", id);
export const agentDid = (id: string) => makeDid("agent", id);

/** Parse a CoinPay DID into its kind and id, or return null if it is not one. */
export function parseDid(did: string): { kind: DidKind; id: string } | null {
  const prefix = `${DID_METHOD}:`;
  if (!did.startsWith(prefix)) return null;
  const [kind, id] = did.slice(prefix.length).split(":");
  if ((kind !== "user" && kind !== "agent") || !id) return null;
  return { kind, id };
}

export function isDidTask(value: unknown): value is DidTask {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as DidTask).id === "string" &&
    typeof (value as DidTask).ownerDid === "string" &&
    typeof (value as DidTask).status === "string"
  );
}

/** Return false if the grant has an expiresAt that is in the past compared to `now`. */
export function isGrantActive(grant: DelegationGrant, now: string): boolean {
  if (!grant.expiresAt) return true;
  return grant.expiresAt > now;
}

const TERMINAL: ReadonlySet<TaskStatus> = new Set(["complete", "failed", "cancelled"]);

/**
 * In-memory AgentStack coordinator: registers agents, tracks portable tasks through their
 * lifecycle, records delegation grants, and emits coordination events. Reference
 * implementation of the `agentstack` capability; storage backends can wrap the same API.
 */
export class AgentStack {
  private readonly agents = new Map<string, AgentProfile>();
  private readonly tasks = new Map<string, DidTask>();
  private readonly delegations = new Map<string, DelegationGrant>();
  private readonly listeners = new Set<AgentStackListener>();
  private seq = 0;

  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  on(listener: AgentStackListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: AgentStackEvent) {
    for (const listener of this.listeners) listener(event);
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  registerAgent(agent: AgentProfile): AgentProfile {
    if (!parseDid(agent.did)) {
      throw new Error(`Invalid agent DID: ${agent.did}`);
    }
    this.agents.set(agent.did, agent);
    this.emit({ type: "agent.registered", agent });
    return agent;
  }

  getAgent(did: string): AgentProfile | undefined {
    return this.agents.get(did);
  }

  createTask(input: CreateTaskInput): DidTask {
    if (!parseDid(input.ownerDid)) {
      throw new Error(`Invalid owner DID: ${input.ownerDid}`);
    }
    const ts = this.now();
    const task: DidTask = {
      id: this.nextId("task"),
      ownerDid: input.ownerDid,
      assigneeDid: input.assigneeDid,
      sourceApp: input.sourceApp,
      title: input.title,
      description: input.description,
      status: input.assigneeDid ? "queued" : "pending",
      paymentIntentId: input.paymentIntentId,
      escrowId: input.escrowId,
      metadata: input.metadata,
      createdAt: ts,
      updatedAt: ts
    };
    this.tasks.set(task.id, task);
    this.emit({ type: "task.created", task });
    return task;
  }

  getTask(id: string): DidTask | undefined {
    return this.tasks.get(id);
  }

  assignTask(taskId: string, agentDidValue: string): DidTask {
    const task = this.requireTask(taskId);
    if (TERMINAL.has(task.status)) {
      throw new Error(`Task ${taskId} is already ${task.status} and cannot be assigned`);
    }
    if (!this.agents.has(agentDidValue)) {
      throw new Error(`Unknown agent: ${agentDidValue}`);
    }
      delegations: [...this.delegations.values()]
    };
  }

  private requireTask(id: string): DidTask {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Unknown task: ${id}`);
    return task;
  }
}

/** LogicSRC plugin definition exposing AgentStack as a coordination plugin. */
export const agentStackPlugin: PluginDefinition = {
  manifest: agentStackManifest,
  configDefaults: {
    enabled: false,
    api_url: "${AGENTSTACK_API_URL}",
    api_key: "${AGENTSTACK_API_KEY}",
    coinpay_api_base_url: "${COINPAY_API_BASE_URL}"
  },
  routes: [
    { method: "POST", path: "/api/plugins/agentstack/agents", capability: "agents.register" },
    { method: "POST", path: "/api/plugins/agentstack/tasks", capability: "tasks.create" },
    { method: "PATCH", path: "/api/plugins/agentstack/tasks/:id", capability: "tasks.update" },
    { method: "POST", path: "/api/plugins/agentstack/delegations", capability: "agents.delegate" }
  ],
  events: [
    { event: "task.created", capability: "tasks.publish" },
    { event: "task.approved", capability: "reputation.sync" }
  ],
  permissions: ["agents:register", "agents:delegate", "tasks:create", "tasks:update", "reputation:sync"],
  tuiPanels: [{ id: "agentstack-tasks", title: "AgentStack Tasks" }]
};

export { agentStackManifest };
export * from "./types.js";
