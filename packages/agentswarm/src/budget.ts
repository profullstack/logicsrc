import type { SwarmRunResult, SwarmRunner } from "./types.js";
import { SwarmError } from "./types.js";

/**
 * A swarm agent's identity. The DID mirrors @logicsrc/agentstack
 * (`did:coinpay:agent:<id>`), so an agent can carry an agentgit/CoinPay identity.
 */
export interface AgentIdentity {
  did: string;
  name?: string;
}

/**
 * Spend ledger for agents. Amounts are integer minor units (e.g. cents). A run
 * reserves up to its budget, then settles to the actual cost — releasing the
 * remainder. Mirrors the b1dz budget+ledger concept; back it with a real store
 * for production.
 */
export interface BudgetLedger {
  balance(agentDid: string): Promise<number>;
  credit(agentDid: string, amount: number): Promise<number>;
  /** Hold funds for an in-flight run; throws {@link SwarmError} 402 if short. */
  reserve(agentDid: string, amount: number): Promise<string>;
  /** Settle a hold to a final cost (clamped to the reserved amount). */
  settle(holdId: string, finalCost: number): Promise<void>;
  /** Release a hold without charging (e.g. the run failed). */
  release(holdId: string): Promise<void>;
}

/** In-memory reference {@link BudgetLedger} — good for tests and single-process hosts. */
export class InMemoryBudgetLedger implements BudgetLedger {
  private readonly balances = new Map<string, number>();
  private readonly holds = new Map<string, { agentDid: string; amount: number }>();
  private seq = 0;

  async balance(agentDid: string): Promise<number> {
    return this.balances.get(agentDid) ?? 0;
  }

  async credit(agentDid: string, amount: number): Promise<number> {
    if (amount < 0) throw new Error("credit amount must be >= 0");
    const next = (this.balances.get(agentDid) ?? 0) + amount;
    this.balances.set(agentDid, next);
    return next;
  }

  async reserve(agentDid: string, amount: number): Promise<string> {
    if (amount < 0) throw new Error("reserve amount must be >= 0");
    const available = this.balances.get(agentDid) ?? 0;
    if (available < amount) {
      throw new SwarmError(
        `insufficient budget for ${agentDid}: need ${amount}, have ${available}`,
        402
      );
    }
    this.balances.set(agentDid, available - amount);
    const holdId = `hold_${(this.seq += 1)}`;
    this.holds.set(holdId, { agentDid, amount });
    return holdId;
  }

  async settle(holdId: string, finalCost: number): Promise<void> {
    const hold = this.holds.get(holdId);
    if (!hold) throw new Error(`unknown hold: ${holdId}`);
    this.holds.delete(holdId);
    const cost = Math.max(0, Math.min(finalCost, hold.amount));
    const refund = hold.amount - cost;
    if (refund > 0) await this.credit(hold.agentDid, refund);
  }

  async release(holdId: string): Promise<void> {
    const hold = this.holds.get(holdId);
    if (!hold) return;
    this.holds.delete(holdId);
    await this.credit(hold.agentDid, hold.amount);
  }
}

export interface BudgetRunnerOptions {
  runner: SwarmRunner;
  ledger: BudgetLedger;
  /** DID charged for runs. */
  agentDid: string;
  /** Funds reserved per run, in minor units. */
  maxCost: number;
  /** Final cost from the result (e.g. derived from token usage). Default `maxCost`. */
  costOf?: (result: SwarmRunResult) => number;
}

/**
 * Wrap a {@link SwarmRunner} so each run reserves budget up front (throwing 402
 * when the agent is out of funds), then settles the actual cost afterward and
 * releases the hold if the run throws. This is the per-agent spend guard for
 * multi-step / swarm runs.
 */
export function withBudget(options: BudgetRunnerOptions): SwarmRunner {
  const { runner, ledger, agentDid, maxCost, costOf } = options;
  return {
    async run(input) {
      const holdId = await ledger.reserve(agentDid, maxCost);
      try {
        const result = await runner.run(input);
        await ledger.settle(holdId, costOf ? costOf(result) : maxCost);
        return result;
      } catch (error) {
        await ledger.release(holdId);
        throw error;
      }
    }
  };
}
