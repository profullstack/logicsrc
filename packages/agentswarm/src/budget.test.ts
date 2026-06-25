import { describe, expect, it, vi } from "vitest";
import { InMemoryBudgetLedger, SwarmError, withBudget } from "./index.js";
import type { SwarmRunner } from "./index.js";

const DID = "did:coinpay:agent:abc";
const ask = { messages: [{ role: "user" as const, content: "hi" }] };

function okRunner(): SwarmRunner {
  return {
    run: vi.fn(async (input) => ({
      threadId: "t",
      messages: [...input.messages, { role: "assistant" as const, content: "done" }],
      output: "done"
    }))
  };
}

describe("InMemoryBudgetLedger", () => {
  it("credits and reports balance", async () => {
    const ledger = new InMemoryBudgetLedger();
    expect(await ledger.balance(DID)).toBe(0);
    await ledger.credit(DID, 100);
    expect(await ledger.balance(DID)).toBe(100);
  });

  it("reserve holds funds and settle refunds the unused remainder", async () => {
    const ledger = new InMemoryBudgetLedger();
    await ledger.credit(DID, 100);
    const hold = await ledger.reserve(DID, 40);
    expect(await ledger.balance(DID)).toBe(60);
    await ledger.settle(hold, 10);
    expect(await ledger.balance(DID)).toBe(90); // 60 + 30 refunded
  });

  it("reserve throws SwarmError 402 when short", async () => {
    const ledger = new InMemoryBudgetLedger();
    await ledger.credit(DID, 5);
    await expect(ledger.reserve(DID, 10)).rejects.toMatchObject({ status: 402 });
  });

  it("release returns the full hold", async () => {
    const ledger = new InMemoryBudgetLedger();
    await ledger.credit(DID, 50);
    const hold = await ledger.reserve(DID, 50);
    expect(await ledger.balance(DID)).toBe(0);
    await ledger.release(hold);
    expect(await ledger.balance(DID)).toBe(50);
  });
});

describe("withBudget", () => {
  it("charges the actual cost on success", async () => {
    const ledger = new InMemoryBudgetLedger();
    await ledger.credit(DID, 100);
    const runner = withBudget({ runner: okRunner(), ledger, agentDid: DID, maxCost: 30, costOf: () => 12 });

    const res = await runner.run(ask);
    expect(res.output).toBe("done");
    expect(await ledger.balance(DID)).toBe(88); // 100 - 12
  });

  it("rejects with 402 and never runs when out of budget", async () => {
    const ledger = new InMemoryBudgetLedger();
    await ledger.credit(DID, 5);
    const inner = okRunner();
    const runner = withBudget({ runner: inner, ledger, agentDid: DID, maxCost: 30 });

    await expect(runner.run(ask)).rejects.toMatchObject({ status: 402 });
    expect(inner.run).not.toHaveBeenCalled();
  });

  it("releases the hold (no charge) when the run throws", async () => {
    const ledger = new InMemoryBudgetLedger();
    await ledger.credit(DID, 100);
    const failing: SwarmRunner = {
      run: vi.fn(async () => {
        throw new Error("boom");
      })
    };
    const runner = withBudget({ runner: failing, ledger, agentDid: DID, maxCost: 30 });

    await expect(runner.run(ask)).rejects.toThrow("boom");
    expect(await ledger.balance(DID)).toBe(100); // fully restored
  });

  it("re-exports SwarmError for status mapping", () => {
    expect(new SwarmError("x", 402).status).toBe(402);
  });
});
