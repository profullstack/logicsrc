import { describe, expect, it } from "vitest";
import { createAd, createCampaign, createPlacement, createAdRequest } from "./builders.js";
import { validate } from "./validate.js";

describe("AgentAd builders", () => {
  it("builds a schema-valid, disclosed ad and always forces sponsored:true", () => {
    const ad = createAd({
      advertiser_did: "railway.app",
      campaign_id: "cmp-1",
      format: "json",
      title: "Ship your CLI in 60s",
      url: "https://railway.app/?ref=cl1s",
      pricing: { model: "cpc", bid: 0.5, currency: "USD" },
      machine_readable: { product: "railway" }
    });

    expect(ad.type).toBe("agentad.ad");
    expect(ad.disclosure).toEqual({ sponsored: true, label: "Sponsored" });
    expect(validate("agentad-ad", ad).ok).toBe(true);
  });

  it("honors a custom disclosure label and advertiser name", () => {
    const ad = createAd({
      advertiser_did: "acme.dev",
      format: "text",
      title: "Acme",
      url: "https://acme.dev",
      disclosure: { label: "Ad", advertiser_name: "Acme, Inc." }
    });
    expect(ad.disclosure.label).toBe("Ad");
    expect(ad.disclosure.advertiser_name).toBe("Acme, Inc.");
    expect(ad.disclosure.sponsored).toBe(true);
  });

  it("defaults a campaign to draft and validates", () => {
    const campaign = createCampaign({
      advertiser_did: "railway.app",
      name: "Launch",
      budget: { total: 100, currency: "USD" }
    });
    expect(campaign.status).toBe("draft");
    expect(validate("agentad-campaign", campaign).ok).toBe(true);
  });

  it("builds valid placements and requests", () => {
    const placement = createPlacement({
      publisher_did: "agentbbs.sh",
      surface: "agent",
      accepted_formats: ["json"]
    });
    const request = createAdRequest({ placement_id: placement.id, consumer: "agent" });

    expect(validate("agentad-placement", placement).ok).toBe(true);
    expect(validate("agentad-ad-request", request).ok).toBe(true);
  });

  it("generates unique ids across calls", () => {
    const a = createPlacement({ publisher_did: "p.p", surface: "cli", accepted_formats: ["text"] });
    const b = createPlacement({ publisher_did: "p.p", surface: "cli", accepted_formats: ["text"] });
    expect(a.id).not.toBe(b.id);
  });
});
