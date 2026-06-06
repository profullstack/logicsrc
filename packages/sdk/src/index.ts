export type LogicSrcId = string;

export interface LogicSrcTask {
  type: "logicsrc.task";
  version: string;
  title: string;
  description: string;
  board: string;
  creator_did: string;
  status: "draft" | "open" | "funded" | "claimed" | "submitted" | "approved" | "rejected" | "disputed" | "closed";
  budget?: {
    amount: number;
    currency: string;
  };
  assignee_did?: string;
}

export interface LogicSrcAgent {
  type: "logicsrc.agent";
  id: LogicSrcId;
  name: string;
  capabilities: string[];
  logicsrc_compatibility_version?: string;
}

export interface LogicSrcRun {
  type: "logicsrc.agent_run";
  id: LogicSrcId;
  agent_id: LogicSrcId;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  task_id?: LogicSrcId;
}

export interface LogicSrcEvent {
  type: "logicsrc.event";
  event: string;
  resource_id: LogicSrcId;
  created_at?: string;
}

export interface AgentSwarmSession {
  type: "logicsrc.agentswarm.session";
  status: "opening" | "active" | "paused" | "completed" | "failed";
  mode: "yolo" | "review";
  master_agent: string;
  slave_agents: string[];
  repo: string | null;
  openspec_compatible: boolean;
  openspec_only: boolean;
}

export interface LogicSrcClient {
  createTask(input: Omit<LogicSrcTask, "type" | "version" | "status"> & Partial<Pick<LogicSrcTask, "version" | "status">>): Promise<LogicSrcTask>;
  validateTask(input: unknown): Promise<{ ok: boolean; errors: string[] }>;
  startAgentSwarm(input: {
    repo?: string;
    agents?: string[];
    yolo?: boolean;
    openspec?: boolean;
    openspecOnly?: boolean;
  }): Promise<AgentSwarmSession>;
}

export function createTask(input: Omit<LogicSrcTask, "type" | "version" | "status"> & Partial<Pick<LogicSrcTask, "version" | "status">>): LogicSrcTask {
  return {
    type: "logicsrc.task",
    version: input.version ?? "0.1",
    status: input.status ?? "draft",
    ...input
  };
}

export function createAgentSwarmSession(input: {
  repo?: string;
  agents?: string[];
  yolo?: boolean;
  openspec?: boolean;
  openspecOnly?: boolean;
}): AgentSwarmSession {
  return {
    type: "logicsrc.agentswarm.session",
    status: "opening",
    mode: input.yolo ? "yolo" : "review",
    master_agent: "agentswarm-master",
    slave_agents: input.agents ?? ["reproduce", "patch", "review"],
    repo: input.repo ?? null,
    openspec_compatible: input.openspec ?? false,
    openspec_only: input.openspecOnly ?? false
  };
}
