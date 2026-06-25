import { describe, expect, it, vi } from "vitest";
import { SwarmError, createSwarmHandler } from "./index.js";
import type { SwarmRunInput, SwarmRunResult, SwarmRunner } from "./index.js";

function mockRunner(impl?: (input: SwarmRunInput) => SwarmRunResult): SwarmRunner {
  return {
    run: vi.fn(async (input: SwarmRunInput): Promise<SwarmRunResult> =>
      impl
        ? impl(input)
        : {
            threadId: input.threadId ?? "thread_test",
            messages: [...input.messages, { role: "assistant", content: "ok" }],
            output: "ok"
          }
    )
  };
}

function post(body: unknown): Request {
  return new Request("http://localhost/swarm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("createSwarmHandler", () => {
  it("runs a turn and returns the result", async () => {
    const handle = createSwarmHandler({ runner: mockRunner() });
    const res = await handle(post({ messages: [{ role: "user", content: "hi" }] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.output).toBe("ok");
    expect(body.threadId).toBe("thread_test");
  });

  it("passes rubric and threadId through to the runner", async () => {
    const runner = mockRunner((input) => ({
      threadId: input.threadId!,
      messages: input.messages,
      output: input.rubric ?? ""
    }));
    const handle = createSwarmHandler({ runner });
    const res = await handle(
      post({ messages: [{ role: "user", content: "hi" }], rubric: "be terse", threadId: "t1" })
    );
    const body = await res.json();
    expect(body.threadId).toBe("t1");
    expect(body.output).toBe("be terse");
  });

  it("rejects non-POST with 405", async () => {
    const handle = createSwarmHandler({ runner: mockRunner() });
    const res = await handle(new Request("http://localhost/swarm", { method: "GET" }));
    expect(res.status).toBe(405);
  });

  it("answers a CORS preflight with 204", async () => {
    const handle = createSwarmHandler({ runner: mockRunner() });
    const res = await handle(new Request("http://localhost/swarm", { method: "OPTIONS" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("400s on empty messages", async () => {
    const handle = createSwarmHandler({ runner: mockRunner() });
    const res = await handle(post({ messages: [] }));
    expect(res.status).toBe(400);
  });

  it("400s on invalid JSON", async () => {
    const handle = createSwarmHandler({ runner: mockRunner() });
    const res = await handle(
      new Request("http://localhost/swarm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json"
      })
    );
    expect(res.status).toBe(400);
  });

  it("maps an onRequest SwarmError to its status (e.g. 402 payment required)", async () => {
    const handle = createSwarmHandler({
      runner: mockRunner(),
      onRequest: () => {
        throw new SwarmError("payment required", 402);
      }
    });
    const res = await handle(post({ messages: [{ role: "user", content: "hi" }] }));
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("payment required");
  });

  it("does not call the runner when onRequest rejects", async () => {
    const runner = mockRunner();
    const handle = createSwarmHandler({
      runner,
      onRequest: () => {
        throw new SwarmError("nope", 403);
      }
    });
    await handle(post({ messages: [{ role: "user", content: "hi" }] }));
    expect(runner.run).not.toHaveBeenCalled();
  });

  it("maps a runner failure to 500", async () => {
    const runner: SwarmRunner = {
      run: vi.fn(async () => {
        throw new Error("boom");
      })
    };
    const handle = createSwarmHandler({ runner });
    const res = await handle(post({ messages: [{ role: "user", content: "hi" }] }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("boom");
  });
});
