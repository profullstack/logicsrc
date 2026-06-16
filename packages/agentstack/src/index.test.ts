import { describe, expect, it, vi } from "vitest";
import { validateManifest } from "@logicsrc/plugin-core";
import {
  AgentStack,
  agentDid,
  agentStackManifest,
  agentStackPlugin,
  makeDid,
  parseDid,
  userDid
} from "./index.js";
import type { AgentProfile } from "./types.js";

const owner = userDid("123");
const agent: AgentProfile = {
  did: agentDid("abc"),
  name: "Build Agent",
  sourceApp: "commandboard.run",
  supportedProtocols: ["logicsrc/1"]
};

describe("DID helpers", () => {
  it("builds and parses CoinPay DIDs", () => {
    expect(makeDid("user", "123")).toBe("did:coinpay:user:123");
    expect(parseDid(owner)).toEqual({ kind: "user", id: "123" });
    expect(parseDid(agentDid("abc"))).toEqual({ kind: "agent", id: "abc" });
  });

  it("rejects non-CoinPay DIDs", () => {
    expect(parseDid("did:web:example.com")).toBeNull();
    expect(parseDid("did:coinpay:bot:abc")).toBeNull();
  });
});

describe("AgentStack manifest", () => {
  it("is a valid LogicSRC plugin manifest", () => {
    expect(() => validateManifest(agentStackManifest)).not.toThrow();
    expect(agentStackPlugin.manifest.id).toBe("agentstack");
  });
});

describe("AgentStack coordinator", () => {
  it("creates pending tasks and queues assigned ones", () => {
    const stack = new AgentStack();
    const pending = stack.createTask({ ownerDid: owner, sourceApp: "ugig.net", title: "Crawl site" });
    expect(pending.status).toBe("pending");

    stack.registerAgent(agent);
    const assigned = stack.createTask({
      ownerDid: owner,
      sourceApp: "ugig.net",
      title: "Crawl site 2",
      assigneeDid: agent.did
    });
    expect(assigned.status).toBe("queued");
  });

  it("moves a task through its lifecycle and binds reputation", () => {
    const stack = new AgentStack();
    stack.registerAgent(agent);
    const task = stack.createTask({ ownerDid: owner, sourceApp: "sh1pt.com", title: "Ship build" });

    stack.assignTask(task.id, agent.did);
    stack.updateTaskStatus(task.id, "running");
    const done = stack.updateTaskStatus(task.id, "complete", { reputationEventId: "rep_1" });

    expect(done.status).toBe("complete");
    expect(done.assigneeDid).toBe(agent.did);
    expect(done.reputationEventId).toBe("rep_1");
  });

  it("refuses to transition out of a terminal status", () => {
    const stack = new AgentStack();
    const task = stack.createTask({ ownerDid: owner, sourceApp: "qaaas.dev", title: "Test run" });
    stack.updateTaskStatus(task.id, "cancelled");
    expect(() => stack.updateTaskStatus(task.id, "running")).toThrow(/cancelled/);
  });

  it("rejects status jumps outside the AgentStack lifecycle", () => {
    const stack = new AgentStack();
    stack.registerAgent(agent);

    const pending = stack.createTask({ ownerDid: owner, sourceApp: "ugig.net", title: "Pending task" });
    expect(() => stack.updateTaskStatus(pending.id, "running")).toThrow(/pending -> running/);

    const queued = stack.createTask({
      ownerDid: owner,
      sourceApp: "ugig.net",
      title: "Queued task",
      assigneeDid: agent.did
    });
    expect(() => stack.updateTaskStatus(queued.id, "complete")).toThrow(/queued -> complete/);

    const blocked = stack.updateTaskStatus(queued.id, "running");
    expect(stack.updateTaskStatus(blocked.id, "blocked").status).toBe("blocked");
  });

  it("refuses to assign a task that is already in a terminal status", () => {
    const stack = new AgentStack();
    stack.registerAgent(agent);
    const other: AgentProfile = { ...agent, did: agentDid("xyz") };
    stack.registerAgent(other);
    const task = stack.createTask({
      ownerDid: owner,
      sourceApp: "ugig.net",
      title: "Paid task",
      paymentIntentId: "pi_1",
      escrowId: "esc_1"
    });
    stack.assignTask(task.id, agent.did);
    stack.updateTaskStatus(task.id, "running");
    stack.updateTaskStatus(task.id, "complete", { reputationEventId: "rep_1" });

    expect(() => stack.assignTask(task.id, other.did)).toThrow(/already complete and cannot be assigned/);
    expect(stack.getTask(task.id)?.assigneeDid).toBe(agent.did);
    expect(stack.getTask(task.id)?.status).toBe("complete");
  });

  it("records delegation grants and emits events", () => {
    const stack = new AgentStack();
    const listener = vi.fn();
    stack.on(listener);
    stack.registerAgent(agent);
    const grant = stack.delegate(owner, agent.did, ["tasks:create"]);

    expect(grant.ownerDid).toBe(owner);
    expect(grant.agentDid).toBe(agent.did);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "agent.registered" }));
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "delegation.granted" }));
  });

  it("rejects unknown agents and invalid DIDs", () => {
    const stack = new AgentStack();
    expect(() => stack.createTask({ ownerDid: "nope", sourceApp: "x", title: "t" })).toThrow();
    const task = stack.createTask({ ownerDid: owner, sourceApp: "x", title: "t" });
    expect(() => stack.assignTask(task.id, agentDid("ghost"))).toThrow(/Unknown agent/);
  });

  it("filters tasks in snapshots", () => {
    const stack = new AgentStack();
    stack.createTask({ ownerDid: owner, sourceApp: "x", title: "a" });
    stack.createTask({ ownerDid: userDid("999"), sourceApp: "x", title: "b" });
    expect(stack.listTasks({ ownerDid: owner })).toHaveLength(1);
    expect(stack.snapshot().tasks).toHaveLength(2);
  });
});
