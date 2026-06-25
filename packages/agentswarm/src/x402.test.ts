import { describe, expect, it, vi } from "vitest";
import { createSwarmHandler, withX402 } from "./index.js";
import type { SwarmRunner } from "./index.js";

function okRunner(): SwarmRunner {
  return {
    run: async (input) => ({
      threadId: "t",
      messages: [...input.messages, { role: "assistant", content: "ok" }],
      output: "ok"
    })
  };
}

function post(): Request {
  return new Request("http://localhost/swarm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] })
  });
}

const handler = createSwarmHandler({ runner: okRunner() });
const accepts = [{ scheme: "exact", network: "base", asset: "USDC", amount: 1000, payTo: "0xabc" }];

describe("withX402", () => {
  it("passes paid requests through to the handler", async () => {
    const paid = withX402(handler, { verify: () => true, accepts });
    const res = await paid(post());
    expect(res.status).toBe(200);
    expect((await res.json()).output).toBe("ok");
  });

  it("returns a 402 x402 challenge when unpaid, without running the agent", async () => {
    const verify = vi.fn(() => false);
    const paid = withX402(handler, { verify, accepts });
    const res = await paid(post());
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.x402Version).toBe(1);
    expect(body.accepts).toEqual(accepts);
  });

  it("lets CORS preflight through without payment", async () => {
    const verify = vi.fn(() => false);
    const paid = withX402(handler, { verify, accepts });
    const res = await paid(new Request("http://localhost/swarm", { method: "OPTIONS" }));
    expect(res.status).toBe(204);
    expect(verify).not.toHaveBeenCalled();
  });

  it("uses a custom challenge when provided", async () => {
    const paid = withX402(handler, {
      verify: () => false,
      challenge: () => new Response("pay up", { status: 402, headers: { "x-pay": "url" } })
    });
    const res = await paid(post());
    expect(res.status).toBe(402);
    expect(res.headers.get("x-pay")).toBe("url");
  });
});
