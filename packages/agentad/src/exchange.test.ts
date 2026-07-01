import { beforeEach, describe, expect, it } from "vitest";
import { AgentAdExchange } from "./exchange.js";
import { InMemorySettlement } from "./settlement.js";
import { createAd, createCampaign, createPlacement, createAdRequest } from "./builders.js";
import { validate } from "./validate.js";
import type { Ad } from "./types.js";

const NOW = Date.parse("2026-07-01T00:00:00Z");
const clock = () => NOW;

function newExchange(feeRate = 0.15) {
  return new AgentAdExchange({
    secret: "test-secret",
    now: clock,
    settlement: new InMemorySettlement({ networkFeeRate: feeRate })
  });
}

function jsonPlacement(exchange: AgentAdExchange, overrides = {}) {
  return exchange.registerPlacement(
    createPlacement({
      publisher_did: "agentbbs.sh",
      surface: "agent",
      accepted_formats: ["json"],
      ...overrides
    })
  );
}

function activeCampaign(exchange: AgentAdExchange, total = 100) {
  const campaign = createCampaign({
    advertiser_did: "railway.app",
    name: "Launch",
    status: "active",
    budget: { total, currency: "USD" }
  });
  return exchange.registerCampaign(campaign);
}

describe("AgentAdExchange serving", () => {
  let exchange: AgentAdExchange;

  beforeEach(() => {
    exchange = newExchange();
  });

  it("serves a matching, disclosed ad and produces a schema-valid response", () => {
    const campaign = activeCampaign(exchange);
    exchange.registerAd(
      createAd({
        advertiser_did: "railway.app",
        campaign_id: campaign.id,
        format: "json",
        title: "Ship your CLI in 60s",
        url: "https://railway.app/?ref=cl1s",
        pricing: { model: "cpc", bid: 0.5, currency: "USD" },
        machine_readable: { product: "railway" }
      })
    );
    const placement = jsonPlacement(exchange);

    const res = exchange.requestAds(
      createAdRequest({ placement_id: placement.id, consumer: "agent" })
    );

    expect(res.no_fill_reason).toBeUndefined();
    expect(res.ads).toHaveLength(1);
    expect(validate("agentad-ad-response", res).ok).toBe(true);

    const rendered = JSON.parse(res.ads[0].rendered ?? "{}");
    expect(rendered.sponsored).toBe(true);
    expect(rendered.data.product).toBe("railway");
  });

  it("no-fills with no_inventory when nothing matches", () => {
    jsonPlacement(exchange);
    const placementId = jsonPlacement(exchange).id;
    const res = exchange.requestAds(createAdRequest({ placement_id: placementId }));
    expect(res.ads).toHaveLength(0);
    expect(res.no_fill_reason).toBe("no_inventory");
  });

  it("no-fills with invalid_request for an unknown placement", () => {
    const res = exchange.requestAds(createAdRequest({ placement_id: "does-not-exist" }));
    expect(res.no_fill_reason).toBe("invalid_request");
  });

  it("does not serve ads from draft campaigns", () => {
    const draft = exchange.registerCampaign(
      createCampaign({
        advertiser_did: "railway.app",
        name: "Draft",
        budget: { total: 100, currency: "USD" }
      })
    );
    exchange.registerAd(
      createAd({
        advertiser_did: "railway.app",
        campaign_id: draft.id,
        format: "json",
        title: "Draft ad",
        url: "https://x.dev",
        pricing: { model: "cpm", bid: 5, currency: "USD" }
      })
    );
    const placement = jsonPlacement(exchange);
    expect(exchange.requestAds(createAdRequest({ placement_id: placement.id })).no_fill_reason).toBe(
      "no_inventory"
    );
  });

  it("blocks ads whose category is on the placement block list", () => {
    const campaign = activeCampaign(exchange);
    exchange.registerAd(
      createAd({
        advertiser_did: "railway.app",
        campaign_id: campaign.id,
        format: "json",
        title: "Buy coins",
        url: "https://coins.example",
        pricing: { model: "cpm", bid: 5, currency: "USD" },
        machine_readable: { category: "crypto" }
      })
    );
    const placement = jsonPlacement(exchange, { block_categories: ["crypto"] });
    expect(exchange.requestAds(createAdRequest({ placement_id: placement.id })).no_fill_reason).toBe(
      "blocked_category"
    );
  });

  it("refuses to register an undisclosed ad", () => {
    const campaign = activeCampaign(exchange);
    const undisclosed = {
      type: "agentad.ad",
      version: "0.1",
      id: "ad-bad",
      campaign_id: campaign.id,
      advertiser_did: "railway.app",
      format: "text",
      title: "Sneaky",
      url: "https://x.dev",
      disclosure: { sponsored: false, label: "Sponsored" }
    } as unknown as Ad;
    expect(() => exchange.registerAd(undisclosed)).toThrow();
  });
});

describe("AgentAdExchange metering & settlement", () => {
  it("charges CPC on click (not impression) and pays the publisher net of fee", () => {
    const exchange = newExchange(0.15);
    const campaign = activeCampaign(exchange);
    exchange.registerAd(
      createAd({
        advertiser_did: "railway.app",
        campaign_id: campaign.id,
        format: "json",
        title: "CPC ad",
        url: "https://railway.app",
        pricing: { model: "cpc", bid: 1, currency: "USD" }
      })
    );
    const placement = jsonPlacement(exchange);

    const res = exchange.requestAds(createAdRequest({ placement_id: placement.id }));
    const imp = exchange.confirmImpression(res.ads[0].impression_token);
    expect(imp.charged).toBe(0); // cpc is billed on click
    expect(validate("agentad-impression", imp.impression).ok).toBe(true);

    const click = exchange.confirmClick(imp.click_token, { action: "open_url" });
    expect(validate("agentad-click", click).ok).toBe(true);

    // single candidate → pays own bid ($1); publisher gets 85%
    expect(exchange.earnings("agentbbs.sh")).toBeCloseTo(0.85, 6);
    expect(exchange.remaining(campaign.id)).toBeCloseTo(99, 6);
    expect(exchange.ledger().filter((e) => e.kind === "click" && e.amount > 0)).toHaveLength(1);
  });

  it("charges CPM on impression", () => {
    const exchange = newExchange(0);
    const campaign = activeCampaign(exchange, 100);
    exchange.registerAd(
      createAd({
        advertiser_did: "railway.app",
        campaign_id: campaign.id,
        format: "json",
        title: "CPM ad",
        url: "https://railway.app",
        pricing: { model: "cpm", bid: 10, currency: "USD" } // $10 CPM = $0.01 / impression
      })
    );
    const placement = jsonPlacement(exchange);
    const res = exchange.requestAds(createAdRequest({ placement_id: placement.id }));
    const imp = exchange.confirmImpression(res.ads[0].impression_token);
    expect(imp.charged).toBeCloseTo(0.01, 6);
    expect(exchange.earnings("agentbbs.sh")).toBeCloseTo(0.01, 6); // 0% fee
  });

  it("runs a second-price auction: the winner pays the runner-up's price", () => {
    const exchange = newExchange(0);
    const high = exchange.registerCampaign(
      createCampaign({
        advertiser_did: "high.dev",
        name: "High",
        status: "active",
        budget: { total: 100, currency: "USD" }
      })
    );
    const low = exchange.registerCampaign(
      createCampaign({
        advertiser_did: "low.dev",
        name: "Low",
        status: "active",
        budget: { total: 100, currency: "USD" }
      })
    );
    exchange.registerAd(
      createAd({
        advertiser_did: "high.dev",
        campaign_id: high.id,
        format: "json",
        title: "High bid",
        url: "https://high.dev",
        pricing: { model: "cpc", bid: 1, currency: "USD" }
      })
    );
    exchange.registerAd(
      createAd({
        advertiser_did: "low.dev",
        campaign_id: low.id,
        format: "json",
        title: "Low bid",
        url: "https://low.dev",
        pricing: { model: "cpc", bid: 0.5, currency: "USD" }
      })
    );
    const placement = jsonPlacement(exchange);

    const res = exchange.requestAds(createAdRequest({ placement_id: placement.id }));
    expect(res.ads).toHaveLength(1);
    // winner is high.dev; clearing factor = 0.5/1 → charged 0.5 on click
    const imp = exchange.confirmImpression(res.ads[0].impression_token);
    exchange.confirmClick(imp.click_token);
    expect(exchange.remaining(high.id)).toBeCloseTo(99.5, 6);
    expect(exchange.remaining(low.id)).toBeCloseTo(100, 6); // runner-up not charged
  });

  it("never charges beyond escrowed budget", () => {
    const exchange = newExchange(0);
    const campaign = exchange.registerCampaign(
      createCampaign({
        advertiser_did: "railway.app",
        name: "Tiny",
        status: "active",
        budget: { total: 0.005, currency: "USD" }
      })
    );
    exchange.registerAd(
      createAd({
        advertiser_did: "railway.app",
        campaign_id: campaign.id,
        format: "json",
        title: "CPM ad",
        url: "https://railway.app",
        pricing: { model: "cpm", bid: 10, currency: "USD" } // wants $0.01 / impression
      })
    );
    const placement = jsonPlacement(exchange);

    const res = exchange.requestAds(createAdRequest({ placement_id: placement.id }));
    const imp = exchange.confirmImpression(res.ads[0].impression_token);
    expect(imp.charged).toBeCloseTo(0.005, 6); // capped at escrow
    expect(exchange.remaining(campaign.id)).toBe(0);

    // budget exhausted → no more inventory
    expect(exchange.requestAds(createAdRequest({ placement_id: placement.id })).no_fill_reason).toBe(
      "no_inventory"
    );
  });

  it("rejects reused and forged tokens", () => {
    const exchange = newExchange();
    const campaign = activeCampaign(exchange);
    exchange.registerAd(
      createAd({
        advertiser_did: "railway.app",
        campaign_id: campaign.id,
        format: "json",
        title: "Ad",
        url: "https://railway.app",
        pricing: { model: "cpc", bid: 1, currency: "USD" }
      })
    );
    const placement = jsonPlacement(exchange);
    const res = exchange.requestAds(createAdRequest({ placement_id: placement.id }));
    const token = res.ads[0].impression_token;

    exchange.confirmImpression(token);
    expect(() => exchange.confirmImpression(token)).toThrow(/already consumed/);
    expect(() => exchange.confirmImpression("garbage.token")).toThrow(/invalid impression token/);
  });
});

describe("AgentAdExchange frequency capping", () => {
  it("caps impressions per session", () => {
    const exchange = newExchange();
    const campaign = activeCampaign(exchange);
    exchange.registerAd(
      createAd({
        advertiser_did: "railway.app",
        campaign_id: campaign.id,
        format: "json",
        title: "Ad",
        url: "https://railway.app",
        pricing: { model: "cpm", bid: 5, currency: "USD" }
      })
    );
    const placement = jsonPlacement(exchange, { frequency_cap: { max_per_session: 1 } });

    const first = exchange.requestAds(
      createAdRequest({ placement_id: placement.id }),
      { sessionId: "s1" }
    );
    expect(first.ads).toHaveLength(1);

    const second = exchange.requestAds(
      createAdRequest({ placement_id: placement.id }),
      { sessionId: "s1" }
    );
    expect(second.no_fill_reason).toBe("frequency_capped");

    // a different session is unaffected
    const other = exchange.requestAds(
      createAdRequest({ placement_id: placement.id }),
      { sessionId: "s2" }
    );
    expect(other.ads).toHaveLength(1);
  });
});
