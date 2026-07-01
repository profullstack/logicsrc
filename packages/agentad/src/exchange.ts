// AgentAdExchange — the reference two-sided exchange described in
// docs/agentad-marketplace.md. It registers advertiser campaigns/ads and
// publisher placements, then for each ad request runs:
//
//   match -> auction (second price) -> pace (budget) -> serve -> meter -> settle
//
// Metering is token-driven: serving mints a single-use, HMAC-signed
// impression_token; confirming the impression mints a click_token. Settlement is
// pluggable (CoinPay in production; in-memory here).

import { AGENTAD_VERSION } from "./builders.js";
import { InMemorySettlement, type SettlementProvider } from "./settlement.js";
import { mintToken, verifyToken } from "./tokens.js";
import type {
  Ad,
  AdRequest,
  AdResponse,
  Campaign,
  CampaignStatus,
  Click,
  ClickAction,
  Consumer,
  Impression,
  NoFillReason,
  Placement,
  ServedAd
} from "./types.js";
import { assertValid } from "./validate.js";

export interface LedgerEntry {
  kind: "impression" | "click";
  campaign_id: string;
  ad_id: string;
  placement_id: string;
  action?: ClickAction;
  amount: number;
  currency: string;
  occurred_at: string;
}

export interface AgentAdExchangeOptions {
  /** HMAC secret used to sign tracking tokens. */
  secret: string;
  /** Settlement backend. Defaults to a fresh InMemorySettlement. */
  settlement?: SettlementProvider;
  /** Clock, for deterministic tests. */
  now?: () => number;
  /** Token lifetime in ms. Default 24h. */
  tokenTtlMs?: number;
  /** Expected click-through rate for normalizing cpc/cpa bids. Default 0.02. */
  expectedCtr?: number;
  /** Expected conversion rate for normalizing cpa bids. Default 0.05. */
  expectedCvr?: number;
  /** Weight applied to keyword relevance in ranking. Default 0.25. */
  relevanceWeight?: number;
}

export interface RequestOptions {
  now?: number;
  /** Session identifier for per-session frequency capping. Default "default". */
  sessionId?: string;
}

export interface ConfirmImpressionResult {
  impression: Impression;
  click_token: string;
  charged: number;
}

let requestCounter = 0;

export class AgentAdExchange {
  private readonly secret: string;
  private readonly settlement: SettlementProvider;
  private readonly clock: () => number;
  private readonly tokenTtlMs: number;
  private readonly expectedCtr: number;
  private readonly expectedCvr: number;
  private readonly relevanceWeight: number;

  private readonly ads = new Map<string, Ad>();
  private readonly campaigns = new Map<string, Campaign>();
  private readonly placements = new Map<string, Placement>();
  private readonly escrowed = new Set<string>();
  private readonly reputation = new Map<string, number>();

  private readonly usedTokens = new Set<string>();
  private readonly sessionCount = new Map<string, number>();
  private readonly dayCount = new Map<string, number>();
  private readonly dailySpend = new Map<string, number>();
  private readonly ledgerEntries: LedgerEntry[] = [];

  constructor(options: AgentAdExchangeOptions) {
    if (!options.secret) throw new Error("AgentAdExchange requires a signing secret");
    this.secret = options.secret;
    this.settlement = options.settlement ?? new InMemorySettlement();
    this.clock = options.now ?? (() => Date.now());
    this.tokenTtlMs = options.tokenTtlMs ?? 24 * 60 * 60 * 1000;
    this.expectedCtr = options.expectedCtr ?? 0.02;
    this.expectedCvr = options.expectedCvr ?? 0.05;
    this.relevanceWeight = options.relevanceWeight ?? 0.25;
  }

  // --- registration -------------------------------------------------------

  registerAd(ad: Ad): Ad {
    assertValid("agentad-ad", ad);
    if (ad.disclosure.sponsored !== true) {
      throw new Error(`ad ${ad.id} is not disclosed as sponsored`);
    }
    this.ads.set(ad.id, ad);
    return ad;
  }

  registerCampaign(campaign: Campaign): Campaign {
    assertValid("agentad-campaign", campaign);
    this.campaigns.set(campaign.id, campaign);
    if ((campaign.status ?? "draft") === "active") this.escrowCampaign(campaign);
    return campaign;
  }

  registerPlacement(placement: Placement): Placement {
    assertValid("agentad-placement", placement);
    this.placements.set(placement.id, placement);
    return placement;
  }

  setCampaignStatus(campaignId: string, status: CampaignStatus): void {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) throw new Error(`unknown campaign ${campaignId}`);
    campaign.status = status;
    if (status === "active") this.escrowCampaign(campaign);
  }

  setReputation(advertiserDid: string, score: number): void {
    if (score <= 0) throw new Error("reputation must be > 0");
    this.reputation.set(advertiserDid, score);
  }

  private escrowCampaign(campaign: Campaign): void {
    if (this.escrowed.has(campaign.id)) return;
    this.settlement.escrow(
      campaign.id,
      campaign.advertiser_did,
      campaign.budget.total,
      campaign.budget.currency
    );
    this.escrowed.add(campaign.id);
  }

  // --- serving ------------------------------------------------------------

  requestAds(request: AdRequest, opts: RequestOptions = {}): AdResponse {
    const requestId = `req-${(requestCounter += 1).toString(36)}-${this.clock().toString(36)}`;
    const validation = assertValidSafe("agentad-ad-request", request);
    if (!validation) return this.noFill(requestId, "invalid_request");

    const placement = this.placements.get(request.placement_id);
    if (!placement) return this.noFill(requestId, "invalid_request");

    const now = opts.now ?? this.clock();
    const day = dayKey(now);
    const session = opts.sessionId ?? "default";
    const consumer: Consumer = request.consumer ?? "human";

    const freqRemaining = this.frequencyRemaining(placement, session, day);
    if (freqRemaining <= 0) return this.noFill(requestId, "frequency_capped");

    const ctx = contextKeywords(placement, request);
    let blockedByCategory = false;
    const candidates: Candidate[] = [];

    for (const ad of this.ads.values()) {
      const campaign = ad.campaign_id ? this.campaigns.get(ad.campaign_id) : undefined;
      if (!campaign || (campaign.status ?? "draft") !== "active") continue;
      if (isExpired(ad, now)) continue;

      if (request.format_override && ad.format !== request.format_override) continue;
      if (!placement.accepted_formats.includes(ad.format)) continue;

      if (ad.targeting?.surfaces && !ad.targeting.surfaces.includes(placement.surface)) continue;

      const category = adCategory(ad);
      if (category && placement.block_categories?.includes(category)) {
        blockedByCategory = true;
        continue;
      }
      if (category && placement.allow_categories && !placement.allow_categories.includes(category)) {
        blockedByCategory = true;
        continue;
      }

      if (ad.targeting?.exclude_keywords?.some((k) => ctx.has(k.toLowerCase()))) continue;

      if (this.settlement.remaining(campaign.id) <= 0) continue;
      if (
        campaign.budget.daily_cap != null &&
        (this.dailySpend.get(`${campaign.id}:${day}`) ?? 0) >= campaign.budget.daily_cap
      ) {
        continue;
      }

      const relevance = overlapCount(ad.targeting?.keywords, ctx);
      const ev = this.effectiveValue(ad);
      const rep = this.reputation.get(ad.advertiser_did) ?? 1;
      const score = ev * (1 + this.relevanceWeight * relevance) * rep;
      candidates.push({ ad, campaign, ev, score });
    }

    if (candidates.length === 0) {
      return this.noFill(requestId, blockedByCategory ? "blocked_category" : "no_inventory");
    }

    candidates.sort((a, b) => b.score - a.score || b.ev - a.ev || a.ad.id.localeCompare(b.ad.id));

    const wanted = Math.min(request.count ?? 1, candidates.length, freqRemaining);
    const served: ServedAd[] = [];
    const exp = now + this.tokenTtlMs;

    for (let i = 0; i < wanted; i += 1) {
      const winner = candidates[i];
      const next = candidates[i + 1];
      const clearingFactor = next && winner.ev > 0 ? clamp(next.ev / winner.ev, 0, 1) : 1;
      const charge = this.unitCharge(winner.ad, clearingFactor);
      const currency = winner.ad.pricing?.currency ?? winner.campaign.budget.currency;

      const token = mintToken(this.secret, {
        k: "impression",
        rid: requestId,
        pid: placement.id,
        aid: winner.ad.id,
        cid: winner.campaign.id,
        model: winner.ad.pricing?.model ?? "flat",
        charge,
        cur: currency,
        exp,
        n: nonce()
      });

      served.push({
        ad: winner.ad,
        impression_token: token,
        rendered: render(winner.ad, consumer)
      });
      this.bumpFrequency(placement, session, day);
    }

    const response: AdResponse = {
      type: "agentad.ad_response",
      version: AGENTAD_VERSION,
      request_id: requestId,
      ads: served
    };
    assertValid("agentad-ad-response", response);
    return response;
  }

  // --- metering -----------------------------------------------------------

  confirmImpression(
    token: string,
    opts: { now?: number; consumer?: Consumer } = {}
  ): ConfirmImpressionResult {
    const now = opts.now ?? this.clock();
    const payload = this.acceptToken(token, "impression", now);

    const impression: Impression = {
      type: "agentad.impression",
      version: AGENTAD_VERSION,
      impression_token: token,
      ad_id: payload.aid,
      placement_id: payload.pid,
      ...(opts.consumer ? { consumer: opts.consumer } : {}),
      occurred_at: new Date(now).toISOString()
    };
    assertValid("agentad-impression", impression);

    let charged = 0;
    if (payload.model === "cpm" || payload.model === "flat") {
      charged = this.settle(payload, "impression", now);
    } else {
      this.record("impression", payload, 0, now);
    }

    const clickToken = mintToken(this.secret, {
      ...payload,
      k: "click",
      n: nonce(),
      exp: now + this.tokenTtlMs
    });

    return { impression, click_token: clickToken, charged };
  }

  confirmClick(
    token: string,
    opts: { now?: number; consumer?: Consumer; action?: ClickAction } = {}
  ): Click {
    const now = opts.now ?? this.clock();
    const payload = this.acceptToken(token, "click", now);
    const action: ClickAction = opts.action ?? "click";

    const click: Click = {
      type: "agentad.click",
      version: AGENTAD_VERSION,
      click_token: token,
      ad_id: payload.aid,
      placement_id: payload.pid,
      action,
      ...(opts.consumer ? { consumer: opts.consumer } : {}),
      occurred_at: new Date(now).toISOString()
    };
    assertValid("agentad-click", click);

    const billable =
      payload.model === "cpc" || (payload.model === "cpa" && action === "convert");
    if (billable) {
      this.settle(payload, "click", now, action);
    } else {
      this.record("click", payload, 0, now, action);
    }

    return click;
  }

  // --- reporting ----------------------------------------------------------

  ledger(): readonly LedgerEntry[] {
    return this.ledgerEntries;
  }

  remaining(campaignId: string): number {
    return this.settlement.remaining(campaignId);
  }

  earnings(publisherDid: string): number {
    return this.settlement.earnings(publisherDid);
  }

  // --- internals ----------------------------------------------------------

  private settle(
    payload: TokenLike,
    kind: "impression" | "click",
    now: number,
    action?: ClickAction
  ): number {
    const placement = this.placements.get(payload.pid);
    const publisherDid = placement?.publisher_did ?? "unknown.publisher";
    const charged = this.settlement.charge({
      campaignId: payload.cid,
      publisherDid,
      amount: payload.charge,
      currency: payload.cur
    });
    if (charged > 0) {
      const key = `${payload.cid}:${dayKey(now)}`;
      this.dailySpend.set(key, (this.dailySpend.get(key) ?? 0) + charged);
    }
    this.record(kind, payload, charged, now, action);
    return charged;
  }

  private record(
    kind: "impression" | "click",
    payload: TokenLike,
    amount: number,
    now: number,
    action?: ClickAction
  ): void {
    this.ledgerEntries.push({
      kind,
      campaign_id: payload.cid,
      ad_id: payload.aid,
      placement_id: payload.pid,
      ...(action ? { action } : {}),
      amount,
      currency: payload.cur,
      occurred_at: new Date(now).toISOString()
    });
  }

  private acceptToken(token: string, kind: "impression" | "click", now: number): TokenLike {
    const result = verifyToken(this.secret, token, now);
    if (!result.ok || !result.payload) {
      throw new Error(`invalid ${kind} token: ${result.reason ?? "unknown"}`);
    }
    if (result.payload.k !== kind) {
      throw new Error(`expected a ${kind} token, got ${result.payload.k}`);
    }
    if (this.usedTokens.has(token)) {
      throw new Error(`${kind} token already consumed`);
    }
    this.usedTokens.add(token);
    return result.payload;
  }

  private effectiveValue(ad: Ad): number {
    const p = ad.pricing;
    if (!p) return 0;
    switch (p.model) {
      case "cpm":
        return p.bid / 1000;
      case "flat":
        return p.bid;
      case "cpc":
        return p.bid * this.expectedCtr;
      case "cpa":
        return p.bid * this.expectedCtr * this.expectedCvr;
      default:
        return 0;
    }
  }

  private unitCharge(ad: Ad, clearingFactor: number): number {
    const p = ad.pricing;
    if (!p) return 0;
    const base = p.model === "cpm" ? p.bid / 1000 : p.bid;
    return round(base * clearingFactor);
  }

  private frequencyRemaining(placement: Placement, session: string, day: string): number {
    const caps = placement.frequency_cap;
    const perSession =
      caps?.max_per_session != null
        ? caps.max_per_session - (this.sessionCount.get(`${placement.id}:${session}`) ?? 0)
        : Number.POSITIVE_INFINITY;
    const perDay =
      caps?.max_per_day != null
        ? caps.max_per_day - (this.dayCount.get(`${placement.id}:${day}`) ?? 0)
        : Number.POSITIVE_INFINITY;
    return Math.min(perSession, perDay);
  }

  private bumpFrequency(placement: Placement, session: string, day: string): void {
    const sKey = `${placement.id}:${session}`;
    const dKey = `${placement.id}:${day}`;
    this.sessionCount.set(sKey, (this.sessionCount.get(sKey) ?? 0) + 1);
    this.dayCount.set(dKey, (this.dayCount.get(dKey) ?? 0) + 1);
  }

  private noFill(requestId: string, reason: NoFillReason): AdResponse {
    return {
      type: "agentad.ad_response",
      version: AGENTAD_VERSION,
      request_id: requestId,
      ads: [],
      no_fill_reason: reason
    };
  }
}

interface Candidate {
  ad: Ad;
  campaign: Campaign;
  ev: number;
  score: number;
}

interface TokenLike {
  k: "impression" | "click";
  rid: string;
  pid: string;
  aid: string;
  cid: string;
  model: "cpm" | "cpc" | "cpa" | "flat";
  charge: number;
  cur: string;
  exp: number;
  n: string;
}

// assertValid variant that returns a boolean instead of throwing.
function assertValidSafe(kind: Parameters<typeof assertValid>[0], data: unknown): boolean {
  try {
    assertValid(kind, data);
    return true;
  } catch {
    return false;
  }
}

function adCategory(ad: Ad): string | undefined {
  const value = ad.machine_readable?.category;
  return typeof value === "string" ? value : undefined;
}

function contextKeywords(placement: Placement, request: AdRequest): Set<string> {
  const set = new Set<string>();
  for (const tag of placement.context_tags ?? []) set.add(tag.toLowerCase());
  for (const kw of request.context?.keywords ?? []) set.add(kw.toLowerCase());
  return set;
}

function overlapCount(keywords: string[] | undefined, ctx: Set<string>): number {
  if (!keywords) return 0;
  let n = 0;
  for (const kw of keywords) if (ctx.has(kw.toLowerCase())) n += 1;
  return n;
}

function render(ad: Ad, consumer: Consumer): string {
  if (consumer === "agent") {
    return JSON.stringify({
      sponsored: true,
      advertiser: ad.disclosure.advertiser_name ?? ad.advertiser_did,
      title: ad.title,
      url: ad.url,
      ...(ad.cta ? { cta: ad.cta } : {}),
      data: ad.machine_readable ?? {}
    });
  }

  if (ad.format === "banner" && ad.media?.ansi_art) {
    return `[${ad.disclosure.label}]\n${ad.media.ansi_art}\n${ad.title} — ${ad.url}`;
  }

  const lines = [`[${ad.disclosure.label}] ${ad.title}`];
  if (ad.body) lines.push(ad.body);
  lines.push(ad.cta ? `${ad.cta}: ${ad.url}` : ad.url);
  return lines.join("\n");
}

function isExpired(ad: Ad, now: number): boolean {
  if (!ad.expires_at) return false;
  const t = Date.parse(ad.expires_at);
  return Number.isFinite(t) && t < now;
}

function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function nonce(): string {
  return Math.random().toString(36).slice(2, 10);
}
