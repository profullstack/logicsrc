import type { SwarmRunInput, SwarmRunResult, SwarmRunner } from "./types.js";

/**
 * One judge verdict on an agent's answer.
 * Mirrors the semantics of deepagents' Python `RubricEvaluation` (which is not
 * yet available in the JS package), implemented here at the runner layer so it
 * works with any {@link SwarmRunner}.
 */
export interface RubricEvaluation {
  /** 1-based attempt number this verdict applies to. */
  iteration: number;
  /** Whether the answer satisfied every rubric criterion. */
  passed: boolean;
  /** Reviewer feedback; names unmet criteria when failed. */
  explanation: string;
}

export interface RubricJudgeInput {
  rubric: string;
  output: string;
  messages: SwarmRunResult["messages"];
}

/** Evaluates an answer against a rubric. Injectable so it can be a real LLM or a stub. */
export interface RubricJudge {
  evaluate(input: RubricJudgeInput): Promise<{ passed: boolean; explanation: string }>;
}

export interface RubricRunnerOptions {
  /** The agent runner whose output gets graded and revised. */
  runner: SwarmRunner;
  /** The grader. Use {@link createLLMJudge} or supply your own. */
  judge: RubricJudge;
  /** Max agent attempts before returning best effort. Default 3. */
  maxIterations?: number;
  /** Called after each judge verdict — wire it to logging/telemetry. */
  onEvaluation?: (evaluation: RubricEvaluation) => void;
}

/**
 * Wrap a {@link SwarmRunner} so that, when a run carries a `rubric`, the answer
 * is graded by `judge` and the agent is asked to revise until it passes (or
 * `maxIterations` is hit, after which the best effort is returned). Runs without
 * a rubric pass straight through untouched.
 *
 * This is the LLM-as-judge / self-checking loop — deepagents' RubricMiddleware,
 * reimplemented at the runner layer so it is model-agnostic and testable.
 */
export function createRubricRunner(options: RubricRunnerOptions): SwarmRunner {
  const { runner, judge, onEvaluation } = options;
  const maxIterations = Math.max(1, options.maxIterations ?? 3);

  return {
    async run(input: SwarmRunInput): Promise<SwarmRunResult> {
      // No rubric → behave exactly like the wrapped runner.
      if (!input.rubric) return runner.run(input);

      const rubric = input.rubric;
      let result = await runner.run(input);

      for (let iteration = 1; ; iteration++) {
        const verdict = await judge.evaluate({
          rubric,
          output: result.output,
          messages: result.messages
        });
        onEvaluation?.({ iteration, passed: verdict.passed, explanation: verdict.explanation });

        if (verdict.passed || iteration >= maxIterations) {
          return result;
        }

        // Ask the agent to revise against the reviewer's feedback. The full
        // transcript is replayed so stateless runners stay correct; stateful
        // (checkpointer-backed) runners may dedupe by threadId.
        const messages = [
          ...result.messages,
          {
            role: "user" as const,
            content:
              `Your previous answer did not satisfy the rubric.\n\nRubric:\n${rubric}\n\n` +
              `Reviewer feedback:\n${verdict.explanation}\n\n` +
              `Revise your answer so it fully satisfies every rubric criterion.`
          }
        ];
        result = await runner.run({ messages, rubric, threadId: result.threadId });
      }
    }
  };
}

export interface LLMJudgeOptions {
  /** Provider-prefixed model id for the grader. Default a small, fast judge. */
  model?: string;
  /** Pre-constructed LangChain chat model; bypasses `initChatModel`. */
  chatModel?: any;
}

/** Indirection so TS does not statically resolve the optional `langchain` peer. */
async function loadOptionalModule(specifier: string): Promise<any> {
  return import(specifier);
}

function parseJudgeOutput(text: string): { passed: boolean; explanation: string } {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]);
      return { passed: Boolean(obj.passed), explanation: String(obj.explanation ?? "") };
    } catch {
      // fall through to keyword heuristic
    }
  }
  const passed = /\bpass(ed)?\b/i.test(text) && !/\bfail/i.test(text);
  return { passed, explanation: text.slice(0, 500) };
}

/**
 * Build a {@link RubricJudge} backed by an LLM (a small, cheap model by default —
 * the Haiku-judge / Sonnet-worker split). Requires the host to have `langchain`
 * (and the model provider) installed, or pass a pre-built `chatModel`.
 */
export async function createLLMJudge(options: LLMJudgeOptions = {}): Promise<RubricJudge> {
  let llm = options.chatModel;
  if (!llm) {
    const modelId = options.model ?? "anthropic:claude-haiku-4-5";
    const universal = await loadOptionalModule("langchain/chat_models/universal");
    llm = await universal.initChatModel(modelId);
  }

  return {
    async evaluate({ rubric, output }) {
      const system =
        "You are a strict evaluator. Given a rubric and an answer, decide whether the answer " +
        "satisfies EVERY rubric criterion. Respond ONLY with JSON of the form " +
        '{"passed": boolean, "explanation": string}. In the explanation, name any unmet criteria.';
      const user = `Rubric:\n${rubric}\n\nAnswer:\n${output}`;
      const res = await llm.invoke([
        { role: "system", content: system },
        { role: "user", content: user }
      ]);
      const text = typeof res?.content === "string" ? res.content : JSON.stringify(res?.content ?? "");
      return parseJudgeOutput(text);
    }
  };
}
