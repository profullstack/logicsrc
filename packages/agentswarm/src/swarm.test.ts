import { describe, expect, it, vi } from "vitest";
import { createSwarm } from "./index.js";
import type { SwarmAgent, SwarmRouter, SwarmRunner } from "./index.js";

/** A runner that always emits the same output (optionally containing a HANDOFF). */
function fixedRunner(output: string): SwarmRunner {
  return {
    run: vi.fn(async (input) => ({
      threadId: input.threadId ?? "t",
      messages: [...input.messages, { role: "assistant" as const, content: output }],
      output
    }))
  };
}

function agent(name: string, output: string): SwarmAgent {
  return { name, description: `${name} agent`, runner: fixedRunner(output) };
}

function fixedRouter(name: string): SwarmRouter {
  return { route: vi.fn(async () => name) };
}

const ask = { messages: [{ role: "user" as const, content: "do it" }] };

describe("createSwarm", () => {
  it("routes to the chosen agent and returns its answer", async () => {
    const swarm = createSwarm({
      agents: [agent("alpha", "alpha done"), agent("beta", "beta done")],
      router: fixedRouter("beta")
    });
    const res = await swarm.run(ask);
    expect(res.output).toBe("beta done");
  });

  it("hands off to a named peer and returns the peer's answer", async () => {
    const handoffs: string[] = [];
    const swarm = createSwarm({
      agents: [agent("router", "HANDOFF: worker"), agent("worker", "worker finished")],
      router: fixedRouter("router"),
      onHandoff: (h) => handoffs.push(`${h.from}->${h.to}`)
    });
    const res = await swarm.run(ask);
    expect(handoffs).toEqual(["router->worker"]);
    expect(res.output).toBe("worker finished");
  });

  it("stops at maxHandoffs when agents keep handing off", async () => {
    const onHandoff = vi.fn();
    const swarm = createSwarm({
      agents: [agent("ping", "HANDOFF: pong"), agent("pong", "HANDOFF: ping")],
      router: fixedRouter("ping"),
      maxHandoffs: 2,
      onHandoff
    });
    const res = await swarm.run(ask);
    // hop 0 ping->pong, hop 1 pong->ping, hop 2 ping reached maxHandoffs -> return
    expect(onHandoff).toHaveBeenCalledTimes(2);
    expect(res.output).toContain("HANDOFF");
  });

  it("ignores a handoff to an unknown agent", async () => {
    const onHandoff = vi.fn();
    const swarm = createSwarm({
      agents: [agent("solo", "HANDOFF: ghost")],
      router: fixedRouter("solo"),
      onHandoff
    });
    const res = await swarm.run(ask);
    expect(onHandoff).not.toHaveBeenCalled();
    expect(res.output).toBe("HANDOFF: ghost");
  });

  it("falls back to the first agent when the router names an unknown one", async () => {
    const swarm = createSwarm({
      agents: [agent("first", "first done"), agent("second", "second done")],
      router: fixedRouter("does-not-exist")
    });
    const res = await swarm.run(ask);
    expect(res.output).toBe("first done");
  });

  it("throws when constructed with no agents", () => {
    expect(() => createSwarm({ agents: [], router: fixedRouter("x") })).toThrow();
  });
});
