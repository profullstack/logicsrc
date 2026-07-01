# AgentAd

AgentAd is a LogicSRC primitive family for advertising to command-line tools and
AI agents. It defines a contract for ads that are **disclosed**, **agent-readable**,
and **terminal-native**.

LogicSRC owns the AgentAd schemas; **cl1s.tech** is the first hosted network built
on AgentAd, in the same relationship that CommandBoard.run has to the core LogicSRC
primitives. External products may consume the AgentAd contracts directly.

## Principles

1. **Disclosure is mandatory.** Every ad carries `disclosure.sponsored: true` and a
   visible label. An AgentAd unit must never be presentable as organic output.
2. **Agent-readable.** Ads may carry a `machine_readable` payload so an autonomous
   agent can reason about the offer instead of scraping rendered text.
3. **Terminal-native formats.** `text`, `markdown`, `ansi`, `banner`, `json`.
4. **Publisher control.** Placements declare accepted formats, dimensions,
   frequency caps, and category blocks.

## Primitives

| Type | Schema | Validator kind | Purpose |
| --- | --- | --- | --- |
| `agentad.ad` | `agentad-ad.schema.json` | `agentad-ad` | A single ad unit |
| `agentad.placement` | `agentad-placement.schema.json` | `agentad-placement` | A slot in a CLI/agent |
| `agentad.ad_request` | `agentad-ad-request.schema.json` | `agentad-ad-request` | Request to fill a placement |
| `agentad.ad_response` | `agentad-ad-response.schema.json` | `agentad-ad-response` | Filled ads + tracking tokens |
| `agentad.impression` | `agentad-impression.schema.json` | `agentad-impression` | Confirmed display |
| `agentad.click` | `agentad-click.schema.json` | `agentad-click` | Click / conversion |
| `agentad.campaign` | `agentad-campaign.schema.json` | `agentad-campaign` | Advertiser campaign |

Schemas are published from `@logicsrc/schemas` and identified under
`https://schemas.logicsrc.com/`.

## Validate

```bash
npm --workspace @logicsrc/validators run build
node packages/validators/dist/cli.js agentad-ad packages/schemas/fixtures/agentad-ad.yaml
node packages/validators/dist/cli.js agentad-placement packages/schemas/fixtures/agentad-placement.yaml
```

## Human vs. agent consumers

The `consumer` field on a request changes how an ad is delivered:

- `human` → rendered string with an `[Sponsored]` header.
- `agent` → structured view with an explicit `sponsored: true` flag and the
  `machine_readable` payload, e.g.

```json
{
  "sponsored": true,
  "advertiser": "Railway",
  "title": "Ship your CLI to production in 60 seconds",
  "url": "https://railway.app/?ref=cl1s",
  "data": { "product": "railway", "install": "npm i -g @railway/cli" }
}
```

## Reference network

[cl1s.tech](https://github.com/profullstack/cl1s.tech) is the hosted AgentAd
network: SDK, CLI, and ad-serving service that consume these schemas.

## Marketplace

The two-sided exchange built on these contracts — advertiser campaigns, publisher
placements, auction, metering, and CoinPay settlement — is specified in
[AgentAd Marketplace (PRD)](./agentad-marketplace.md) (AgentBBS milestone M5).
