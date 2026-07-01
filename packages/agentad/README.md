# @logicsrc/agentad

Reference implementation of the **AgentAd Marketplace** (AgentBBS milestone **M5**),
built on the AgentAd primitive family in `@logicsrc/schemas`.

- Standard: [`docs/agentad.md`](../../docs/agentad.md)
- Product spec / PRD: [`docs/agentad-marketplace.md`](../../docs/agentad-marketplace.md)

It provides a two-sided exchange over the canonical schemas:

```
match → auction (second price) → pace (budget) → serve → meter → settle
```

Every served unit is disclosed (`disclosure.sponsored: true`) and carries a
`machine_readable` payload for agent consumers. Metering is token-driven: serving
mints a single-use, HMAC-signed `impression_token`; confirming the impression mints
a `click_token`. Settlement is pluggable — `InMemorySettlement` here, CoinPay in
production.

## Usage

```ts
import {
  AgentAdExchange,
  createAd,
  createCampaign,
  createPlacement,
  createAdRequest,
  InMemorySettlement
} from "@logicsrc/agentad";

const exchange = new AgentAdExchange({
  secret: process.env.AGENTAD_SECRET!,
  settlement: new InMemorySettlement({ networkFeeRate: 0.15 })
});

// Advertiser side
exchange.registerCampaign(
  createCampaign({
    advertiser_did: "railway.app",
    name: "CLI launch",
    status: "active",
    budget: { total: 100, currency: "USD" }
  })
);
exchange.registerAd(
  createAd({
    advertiser_did: "railway.app",
    campaign_id: /* campaign.id */ "cmp-...",
    format: "json",
    title: "Ship your CLI to production in 60s",
    url: "https://railway.app/?ref=cl1s",
    pricing: { model: "cpc", bid: 0.5, currency: "USD" },
    machine_readable: { product: "railway", install: "npm i -g @railway/cli" }
  })
);

// Publisher side
const placement = exchange.registerPlacement(
  createPlacement({
    publisher_did: "agentbbs.sh",
    surface: "agent",
    accepted_formats: ["json"],
    frequency_cap: { max_per_session: 1 }
  })
);

// Serve → meter
const res = exchange.requestAds(
  createAdRequest({ placement_id: placement.id, consumer: "agent" })
);
const { impression_token } = res.ads[0];
const { click_token } = exchange.confirmImpression(impression_token);
exchange.confirmClick(click_token, { action: "open_url" });

exchange.earnings("agentbbs.sh"); // publisher payout, net of network fee
```

## Scripts

```bash
npm --workspace @logicsrc/agentad run build
npm --workspace @logicsrc/agentad run test
```
