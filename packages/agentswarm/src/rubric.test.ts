import { describe, expect, it, vi } from "vitest";
import { createRubricRunner } from "./index.js";
import type { RubricEvaluation, RubricJudge, SwarmRunInput, SwarmRunner } from "./index.js";

/** A runner that labels each answer with its attempt number, recording its calls. */
function scriptedRunner(): { runner: SwarmRunner; calls: SwarmRunInput[] } {
  const calls: SwarmRunInput[] = [];
  let attempt = 0;
  const runner: SwarmRunner = {
    run: vi.fn(async (input: SwarmRunInput) => {
      calls.push(input);
      attempt += 1;
      const output = `attempt ${attempt}`;
      return {
        threadId: input.threadId ?? "t",
        messages: [...input.messages, { role: "assistant" as const, content: output }],
        output
      };
    })
  };
  return { runner, calls };
}

/** A judge that fails until the Nth evaluation, then passes. */
function judgePassingOn(n: number): RubricJudge {
  let count = 0;
  return {
    evaluate: async () => {
      count += 1;
      return count >= n
        ? { passed: true, explanation: "ok" }
        : { passed: false, explanation: "missing criterion X" };
    }
  };
}

describe("createRubricRunner", () => {
  it("passes through untouched when there is no rubric", async () => {
    const { runner, calls } = scriptedRunner();
    const judge = { evaluate: vi.fn() };
    const rr = createRubricRunner({ runner, judge });

    const res = await rr.run({ messages: [{ role: "user", content: "hi" }] });

    expect(judge.evaluate).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(res.output).toBe("attempt 1");
  });

  it("returns the first answer when it passes immediately", async () => {
    const { runner, calls } = scriptedRunner();
    const evals: RubricEvaluation[] = [];
    const rr = createRubricRunner({
      runner,
      judge: judgePassingOn(1),
      onEvaluation: (e) => evals.push(e)
    });

    const res = await rr.run({ messages: [{ role: "user", content: "hi" }], rubric: "r" });

    expect(calls).toHaveLength(1);
    expect(evals).toEqual([{ iteration: 1, passed: true, explanation: "ok" }]);
    expect(res.output).toBe("attempt 1");
  });

  it("revises until the answer passes", async () => {
    const { runner, calls } = scriptedRunner();
    const evals: RubricEvaluation[] = [];
    const rr = createRubricRunner({
      runner,
      judge: judgePassingOn(2),
      onEvaluation: (e) => evals.push(e)
    });

    const res = await rr.run({ messages: [{ role: "user", content: "hi" }], rubric: "meets X" });

    expect(calls).toHaveLength(2);
    expect(evals.map((e) => e.passed)).toEqual([false, true]);
    expect(res.output).toBe("attempt 2");

    // The retry replays history plus a revision message citing the rubric.
    const lastUserMsg = calls[1].messages.filter((m) => m.role === "user").at(-1);
    expect(lastUserMsg?.content).toContain("rubric");
    expect(lastUserMsg?.content).toContain("missing criterion X");
    expect(calls[1].rubric).toBe("meets X");
    expect(calls[1].threadId).toBe("t");
  });

  it("returns best effort after maxIterations without passing", async () => {
    const { runner, calls } = scriptedRunner();
    const evals: RubricEvaluation[] = [];
    const rr = createRubricRunner({
      runner,
      judge: judgePassingOn(99),
      maxIterations: 2,
      onEvaluation: (e) => evals.push(e)
    });

    const res = await rr.run({ messages: [{ role: "user", content: "hi" }], rubric: "r" });

    expect(calls).toHaveLength(2);
    expect(evals).toHaveLength(2);
    expect(evals.every((e) => !e.passed)).toBe(true);
    expect(evals.map((e) => e.iteration)).toEqual([1, 2]);
    expect(res.output).toBe("attempt 2");
  });
});
