import { describe, expect, it } from "vitest";
import { createAgentSwarmSession, createTask } from "./index.js";

describe("LogicSRC SDK contract helpers", () => {
  it("creates task documents with LogicSRC defaults", () => {
    expect(createTask({
      title: "Document SDK",
      description: "Add SDK contract helpers.",
      board: "/docs",
      creator_did: "did:example:alice"
    })).toMatchObject({
      type: "logicsrc.task",
      version: "0.1",
      status: "draft"
    });
  });

  it("creates AgentSwarm session documents", () => {
    expect(createAgentSwarmSession({
      repo: "profullstack/logicsrc",
      agents: ["reproduce", "patch"],
      yolo: true,
      openspec: true
    })).toMatchObject({
      type: "logicsrc.agentswarm.session",
      mode: "yolo",
      openspec_compatible: true,
      slave_agents: ["reproduce", "patch"]
    });
  });
});
