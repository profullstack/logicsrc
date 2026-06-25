/**
 * @logicsrc/agentswarm — embeddable multi-agent swarm runtime, wrapping deepagents.
 *
 * Mount {@link createSwarmHandler} on a route in your own app (e.g. `/swarm`);
 * back it with {@link createDeepAgentRunner} or any custom {@link SwarmRunner}.
 */
export { createSwarmHandler } from "./handler.js";
export type { SwarmHandlerOptions } from "./handler.js";
export { createDeepAgentRunner } from "./runner.js";
export type { DeepAgentRunnerOptions } from "./runner.js";
export { createSwarm, createLLMRouter } from "./swarm.js";
export type {
  SwarmAgent,
  SwarmRouter,
  SwarmRouterInput,
  SwarmHandoff,
  SwarmOptions,
  LLMRouterOptions
} from "./swarm.js";
export { InMemoryBudgetLedger, withBudget } from "./budget.js";
export type { AgentIdentity, BudgetLedger, BudgetRunnerOptions } from "./budget.js";
export { createRubricRunner, createLLMJudge } from "./rubric.js";
export type {
  RubricEvaluation,
  RubricJudge,
  RubricJudgeInput,
  RubricRunnerOptions,
  LLMJudgeOptions
} from "./rubric.js";
export * from "./types.js";
