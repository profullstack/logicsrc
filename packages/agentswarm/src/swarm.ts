import type { SwarmMessage, SwarmRunInput, SwarmRunResult, SwarmRunner } from "./types.js";

/** A named agent in a swarm. The description is what the router sees when picking. */
export interface SwarmAgent {
  name: string;
  description: string;
  runner: SwarmRunner;
}

export interface SwarmRouterInput {
  messages: SwarmMessage[];
  agents: { name: string; description: string }[];
}

/** Picks which agent should handle a task. Injectable: LLM, rules, or a stub. */
export interface SwarmRouter {
  route(input: SwarmRouterInput): Promise<string>;
}

export interface SwarmHandoff {
  from: string;
  to: string;
  /** 1-based hop number at which the handoff occurred. */
  iteration: number;
}

export interface SwarmOptions {
  agents: SwarmAgent[];
  /** Chooses the first agent. Use {@link createLLMRouter} or supply your own. */
  router: SwarmRouter;
  /** Max peer-to-peer handoffs before returning the current answer. Default 4. */
  maxHandoffs?: number;
  /** Called on each handoff — wire to logging/telemetry. */
  onHandoff?: (handoff: SwarmHandoff) => void;
}

/** An agent signals a handoff by emitting `HANDOFF: <peer-name>` in its output. */
const HANDOFF_RE = /HANDOFF:\s*([A-Za-z0-9_-]+)/;

/**
 * Compose several agents into one {@link SwarmRunner}. A router picks the first
 * agent for the task; any agent can hand control to a named peer by emitting
 * `HANDOFF: <name>`, up to `maxHandoffs` hops. This is the peer-coordination
 * layer on top of deepagents' single parent→subagent model.
 *
 * Because the result is itself a SwarmRunner, a swarm composes with the rubric
 * loop and the HTTP handler like any other runner.
 */
export function createSwarm(options: SwarmOptions): SwarmRunner {
  if (options.agents.length === 0) {
    throw new Error("createSwarm requires at least one agent");
  }
  const { router, onHandoff } = options;
  const agents = new Map(options.agents.map((agent) => [agent.name, agent]));
  const roster = options.agents.map(({ name, description }) => ({ name, description }));
  const maxHandoffs = Math.max(0, options.maxHandoffs ?? 4);

  return {
    async run(input: SwarmRunInput): Promise<SwarmRunResult> {
      const chosen = await router.route({ messages: input.messages, agents: roster });
      let current = agents.get(chosen) ?? options.agents[0];

      let messages = input.messages;
      let threadId = input.threadId;

      for (let hop = 0; ; hop++) {
        const result = await current.runner.run({ messages, rubric: input.rubric, threadId });
        threadId = result.threadId;

        const target = result.output.match(HANDOFF_RE)?.[1];
        if (!target || target === current.name || !agents.has(target) || hop >= maxHandoffs) {
          return result;
        }

        onHandoff?.({ from: current.name, to: target, iteration: hop + 1 });
        current = agents.get(target)!;
        messages = [
          ...result.messages,
          { role: "user" as const, content: `[swarm] Control handed to ${target}. Continue the task.` }
        ];
      }
    }
  };
}

export interface LLMRouterOptions {
  /** Provider-prefixed model id for routing. Default a small, fast model. */
  model?: string;
  /** Pre-constructed LangChain chat model; bypasses `initChatModel`. */
  chatModel?: any;
}

/** Indirection so TS does not statically resolve the optional `langchain` peer. */
async function loadOptionalModule(specifier: string): Promise<any> {
  return import(specifier);
}

/**
 * Build a {@link SwarmRouter} that asks a cheap LLM which agent should take the
 * task. Requires the host to have `langchain` installed, or pass a `chatModel`.
 */
export async function createLLMRouter(options: LLMRouterOptions = {}): Promise<SwarmRouter> {
  let llm = options.chatModel;
  if (!llm) {
    const modelId = options.model ?? "anthropic:claude-haiku-4-5";
    const universal = await loadOptionalModule("langchain/chat_models/universal");
    llm = await universal.initChatModel(modelId);
  }

  return {
    async route({ messages, agents }) {
      const task = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
      const roster = agents.map((a) => `- ${a.name}: ${a.description}`).join("\n");
      const res = await llm.invoke([
        {
          role: "system",
          content:
            "Choose the single best agent to handle the user's request. " +
            `Reply with ONLY the agent name, nothing else.\n\nAgents:\n${roster}`
        },
        { role: "user", content: task }
      ]);
      const text = typeof res?.content === "string" ? res.content : JSON.stringify(res?.content ?? "");
      const name = text.trim().split(/\s+/)[0];
      return agents.some((a) => a.name === name) ? name : (agents[0]?.name ?? "");
    }
  };
}
