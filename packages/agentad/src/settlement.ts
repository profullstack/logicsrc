// Settlement abstraction. In production this is backed by the CoinPay plugin
// (DID balances, escrow, payouts). The in-memory implementation here is the
// reference used by tests and local development; it enforces the one invariant
// that matters: an advertiser can never be charged beyond what it escrowed.

export interface SettlementProvider {
  /** Lock `amount` of an advertiser's balance to a campaign. */
  escrow(campaignId: string, advertiserDid: string, amount: number, currency: string): void;
  /** How much escrow remains unspent for a campaign. */
  remaining(campaignId: string): number;
  /**
   * Charge the advertiser and credit the publisher (minus network fee).
   * Returns the amount actually charged (0 if escrow was exhausted).
   */
  charge(input: {
    campaignId: string;
    publisherDid: string;
    amount: number;
    currency: string;
  }): number;
  /** Total credited to a publisher, net of fees. */
  earnings(publisherDid: string): number;
  /** Total network fee collected. */
  fees(): number;
}

interface EscrowRecord {
  advertiserDid: string;
  currency: string;
  locked: number;
  spent: number;
}

export interface InMemorySettlementOptions {
  /** Network take rate, 0..1. Default 0.15. */
  networkFeeRate?: number;
}

export class InMemorySettlement implements SettlementProvider {
  private readonly escrows = new Map<string, EscrowRecord>();
  private readonly publisherEarnings = new Map<string, number>();
  private feePool = 0;
  private readonly feeRate: number;

  constructor(options: InMemorySettlementOptions = {}) {
    const rate = options.networkFeeRate ?? 0.15;
    if (rate < 0 || rate >= 1) {
      throw new Error(`networkFeeRate must be in [0, 1), got ${rate}`);
    }
    this.feeRate = rate;
  }

  escrow(campaignId: string, advertiserDid: string, amount: number, currency: string): void {
    if (amount < 0) throw new Error("escrow amount must be >= 0");
    const existing = this.escrows.get(campaignId);
    if (existing) {
      if (existing.currency !== currency) {
        throw new Error(`campaign ${campaignId} escrow currency mismatch`);
      }
      existing.locked += amount;
      return;
    }
    this.escrows.set(campaignId, { advertiserDid, currency, locked: amount, spent: 0 });
  }

  remaining(campaignId: string): number {
    const rec = this.escrows.get(campaignId);
    if (!rec) return 0;
    return Math.max(0, rec.locked - rec.spent);
  }

  charge(input: { campaignId: string; publisherDid: string; amount: number; currency: string }): number {
    const rec = this.escrows.get(input.campaignId);
    if (!rec || input.amount <= 0) return 0;
    if (rec.currency !== input.currency) {
      throw new Error(`campaign ${input.campaignId} charge currency mismatch`);
    }

    const available = Math.max(0, rec.locked - rec.spent);
    const charged = Math.min(available, input.amount);
    if (charged <= 0) return 0;

    rec.spent += charged;
    const fee = charged * this.feeRate;
    this.feePool += fee;
    this.publisherEarnings.set(
      input.publisherDid,
      (this.publisherEarnings.get(input.publisherDid) ?? 0) + (charged - fee)
    );
    return charged;
  }

  earnings(publisherDid: string): number {
    return this.publisherEarnings.get(publisherDid) ?? 0;
  }

  fees(): number {
    return this.feePool;
  }
}
