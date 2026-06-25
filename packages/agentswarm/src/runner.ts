import type { SwarmMessage, SwarmRunInput, SwarmRunResult, SwarmRunner } from "./types.js";

export interface DeepAgentRunnerOptions {
  /**
   * The model to run on: a provider-prefixed id (e.g. "anthropic:claude-sonnet-4-6")
   * or a pre-built LangChain chat model instance — e.g. from {@link createC0mputeModel}
   * to run inference on community-shared GPUs.
   */
  model: string | object;
  /** System instructions for the lead agent. */
  instructions?: string;
  /**
   * LangGraph checkpointer for thread persistence. Defaults to an in-memory
   * `MemorySaver`. Swap for a Turso/SQLite-backed saver to persist threads
   * across restarts (the tronbrowser BYO-SQLite path).
   */
  checkpointer?: unknown;
  /** Extra params forwarded to deepagents `createDeepAgent` (subagents, middleware, …). */
  agentParams?: Record<string, unknown>;
}

/**
 * Indirection so TypeScript does not statically resolve the optional peers
 * (`deepagents`, `@langchain/langgraph`). They are only required by hosts that
 * use the real runner; the core package and its tests build without them.
 */
async function loadModule(specifier: string): Promise<any> {
  return import(specifier);
}

function newThreadId(): string {
  return `thread_${crypto.randomUUID()}`;
}

/** Map a LangChain message object to a plain {@link SwarmMessage}. */
function toSwarmMessage(message: any): SwarmMessage {
  const type =
    typeof message?.getType === "function" ? message.getType() : (message?.role ?? message?.type);
  const role: SwarmMessage["role"] =
    type === "human" || type === "user" ? "user" : type === "system" ? "system" : "assistant";
  const content =
    typeof message?.content === "string" ? message.content : JSON.stringify(message?.content ?? "");
  return { role, content };
}

/**
 * Create a {@link SwarmRunner} backed by deepagents (`createDeepAgent`).
 *
 * Requires the optional peers `deepagents` and `@langchain/langgraph`, plus a
 * model provider (e.g. `@langchain/anthropic`), to be installed by the host app:
 * `npm i deepagents @langchain/langgraph @langchain/anthropic`.
 */
export async function createDeepAgentRunner(options: DeepAgentRunnerOptions): Promise<SwarmRunner> {
  let deepagents: any;
  try {
    deepagents = await loadModule("deepagents");
  } catch {
    throw new Error(
      "createDeepAgentRunner requires the 'deepagents' package. Install it in the host app: " +
        "npm i deepagents @langchain/langgraph @langchain/anthropic"
    );
  }

  let checkpointer = options.checkpointer;
  if (!checkpointer) {
    const langgraph = await loadModule("@langchain/langgraph");
    checkpointer = new langgraph.MemorySaver();
  }

  const agent = deepagents.createDeepAgent({
    model: options.model,
    ...(options.instructions ? { instructions: options.instructions } : {}),
    checkpointer,
    ...options.agentParams
  });

  return {
    async run(input: SwarmRunInput): Promise<SwarmRunResult> {
      const threadId = input.threadId ?? newThreadId();
      const state: Record<string, unknown> = { messages: input.messages };
      if (input.rubric) state.rubric = input.rubric;

      const result = await agent.invoke(state, { configurable: { thread_id: threadId } });
      const messages: SwarmMessage[] = Array.isArray(result?.messages)
        ? result.messages.map(toSwarmMessage)
        : [];
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
      return { threadId, messages, output: lastAssistant?.content ?? "" };
    }
  };
}
