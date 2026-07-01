# AgentAd Marketplace (PRD)

**Status:** Draft
**Owner:** Profullstack / LogicSRC
**Milestone:** AgentBBS **M5 — AgentAd marketplace**
**Standard:** built on the [AgentAd](./agentad.md) primitive family in `@logicsrc/schemas`

> AgentAd (see [`docs/agentad.md`](./agentad.md)) already defines the *contracts*:
> `agentad.ad`, `agentad.placement`, `agentad.ad_request`, `agentad.ad_response`,
> `agentad.impression`, `agentad.click`, and `agentad.campaign`. This PRD defines the
> **marketplace** — the two-sided product layer that lets advertisers buy inventory and
> publishers sell it, with matching, serving, metering, and settlement in between.
> [cl1s.tech](https://github.com/profullstack/cl1s.tech) is the reference hosted network;
> AgentBBS is the reference **publisher surface** (SSH/TUI over the CLI/TUI/agent surfaces).

## 1. Summary

The AgentAd Marketplace is a disclosed, agent-native advertising exchange for command-line
tools and AI agents. Advertisers fund **campaigns** of **ads**; publishers register
**placements** in their CLI/TUI/agent surfaces; the exchange matches, serves, meters, and
settles. Every unit is disclosed as sponsored and carries a `machine_readable` payload so an
agent can reason about the offer rather than scrape rendered text.

The marketplace is the product wrapper around the AgentAd contracts: it adds identity-scoped
accounts, listings/discovery, an auction, budget pacing, verified metering, and CoinPay-backed
billing and payouts. LogicSRC owns the schemas and the exchange contracts; hosted networks
(cl1s.tech first) run the exchange; surfaces like AgentBBS consume it.

## 2. Goals & non-goals

### Goals
- A working two-sided exchange: advertiser buy-side + publisher sell-side over the existing
  AgentAd schemas, with **no schema forks** — extend via the reference network, not the standard.
- **Disclosure is non-negotiable.** Every served unit sets `disclosure.sponsored: true` and a
  visible label; agent responses expose `sponsored: true` explicitly. Undisclosed serving is a
  protocol violation and a fillable-inventory ban.
- **DID-scoped accounts.** Advertisers and publishers are identified by DID (via CoinPay/ANS);
  campaigns and placements bind to `advertiser_did` / `publisher_did`.
- **Verified metering.** Impressions and clicks are only billable when confirmed with the
  signed `impression_token` from the `ad_response`.
- **CoinPay settlement.** Budgets are escrowed; publisher payouts and network fees settle through
  CoinPay; reputation events flow from spend and delivery quality.
- **AgentBBS integration.** AgentBBS registers placements (menu banners, TUI panels, agent chat)
  and earns payouts; advertisers can target the BBS surface.

### Non-goals (v1)
- Real-time bidding across external third-party exchanges (single-exchange auction only).
- Rich media / image ads beyond `banner`/`ansi_art` and `media.icon`.
- Human web-display advertising — this is CLI/TUI/agent/CI surfaces only.
- Cross-network ad syndication (out of scope until the contracts stabilize on one network).

## 3. Personas

| Persona | Wants |
| --- | --- |
| **Advertiser** (e.g. Railway, a tool vendor) | Reach agents/CLIs with a disclosed, budgeted campaign; pay per CPM/CPC/CPA/flat; see delivery + spend. |
| **Publisher** (AgentBBS, a CLI, an agent) | Register placements, control formats/frequency/category blocks, earn payouts, keep UX clean. |
| **Agent consumer** | Receive a structured `sponsored: true` offer it can act on, or ignore, without being deceived. |
| **Human consumer** | See a clearly `[Sponsored]` unit in the terminal, never mistaken for organic output. |
| **Network operator** (cl1s.tech) | Run the auction, meter honestly, take a transparent fee, keep advertisers and publishers trusting the exchange. |

## 4. Marketplace model

Two sides bridged by the exchange:

```
Advertiser ──creates──▶ Campaign ──contains──▶ Ads
     │                     │ budget/schedule/targeting        (agentad.campaign / agentad.ad)
     │ escrow (CoinPay)    │
     ▼                     ▼
              ┌────────────── Exchange ──────────────┐
              │  match → auction → pace → serve      │
              │  meter (impression/click) → settle   │
              └──────────────────────────────────────┘
     ▲                     ▲
     │ payout (CoinPay)    │
Publisher ──registers──▶ Placement ──requests fill──▶ ad_request → ad_response
                           surface/formats/caps       (agentad.placement / ad_request / ad_response)
```

### 4.1 Buy side
- **Advertiser account** keyed by `advertiser_did`; onboarding funds a balance via CoinPay.
- **Campaign** (`agentad.campaign`): `budget.total`, `budget.daily_cap`, `currency`, `schedule`,
  `status` (`draft|active|paused|completed`), `ad_ids`.
- **Ad** (`agentad.ad`): `format`, `title`, `body`, `url`, `cta`, mandatory `disclosure`,
  optional `machine_readable`, `targeting` (surfaces/keywords/tools/languages), `pricing`
  (`cpm|cpc|cpa|flat` + `bid`), `media`, `expires_at`.
- Activating a campaign **escrows** `budget.total` (or a top-up tranche) in CoinPay so serving
  can never outrun funds.

### 4.2 Sell side
- **Publisher account** keyed by `publisher_did`.
- **Placement** (`agentad.placement`): `surface` (`cli|tui|agent|ci`), `accepted_formats`,
  `dimensions`, `context_tags`, `frequency_cap`, `allow_categories` / `block_categories`.
- Publisher configures a **revenue share** and payout wallet; blocks disallowed categories.

### 4.3 The exchange (new surface, on top of the standard)
1. **Match** — candidate ads whose `targeting` fits the placement `surface`, `context_tags`,
   `accepted_formats`, and pass its category blocks + `frequency_cap`.
2. **Auction** — rank eligible candidates by effective value (`pricing.bid` normalized across
   `cpm/cpc/cpa`, weighted by advertiser reputation and predicted engagement). Second-price
   clearing in v1.
3. **Pace** — enforce `budget.daily_cap` and remaining escrow before selecting a winner.
4. **Serve** — return `agentad.ad_response` with the winning `ad`, a `rendered` string in the
   requested format, and a signed `impression_token`. On no candidate: `no_fill_reason`
   (`no_inventory | frequency_capped | blocked_category | invalid_request`).
5. **Meter** — bill on the confirmed `agentad.impression` (CPM) or `agentad.click` (CPC), each
   validated against the signed token. CPA conversions post back via a click token.
6. **Settle** — debit advertiser escrow, credit publisher (minus network fee) through CoinPay,
   emit reputation + audit events.

## 5. Functional requirements

### Advertiser
- Create/update/pause/complete campaigns and ads; all writes validate against the AgentAd schemas.
- Fund balance and escrow campaign budget via CoinPay; view remaining budget and daily pacing.
- Targeting by `surface`, `keywords`, `tools` (e.g. `claude-code`, `gh`), `languages`, plus
  `exclude_keywords`.
- Reporting: impressions, clicks, CTR, spend, CPA, by campaign/ad/surface/day.

### Publisher
- Register/update/retire placements; set accepted formats, dimensions, frequency caps, category
  allow/block lists.
- Request fills (`ad_request` → `ad_response`); render per surface (`[Sponsored]` header for
  humans, structured `sponsored: true` view for agents).
- Confirm impressions/clicks with the returned tokens; view earnings and request payouts.

### Exchange / operator
- Matching + second-price auction + budget pacing + frequency capping.
- Token minting/verification for impressions and clicks (anti-fraud: unforgeable, single-use,
  bound to `request_id` + placement).
- CoinPay integration for escrow, payout, and network fee; full audit log; reputation events.
- No-fill accounting and reason codes; category policy enforcement.

### Consumer-facing rendering (delivery contract)
- `consumer: human` → rendered string with a visible `[Sponsored]` / label header.
- `consumer: agent` → structured object with explicit `sponsored: true`, `advertiser`, `title`,
  `url`, and the `machine_readable` `data` payload.

## 6. AgentBBS integration (reference publisher)

AgentBBS is the first-class publisher surface for M5:

- **Placements:** a menu/lounge banner (`surface: tui`, `banner`/`ansi`), a TUI side panel, and
  agent-chat inserts (`surface: agent`, `json`). Each registered as an `agentad.placement` under
  the BBS `publisher_did`.
- **Frequency + taste:** conservative `frequency_cap` (e.g. one banner per session) and category
  blocks so the retro BBS UX stays clean; disclosure label rendered in `lipgloss` styling.
- **Payouts:** BBS ad revenue settles to the operator wallet via CoinPay; can subsidize free pods
  / lifetime tiers.
- **Advertiser side:** BBS members with a `advertiser_did` can run campaigns targeting the CLI/agent
  ecosystem from inside the BBS.
- **Delivery split (mirrors the ascii-live pattern):** the Go side (AgentBBS) renders and confirms
  tokens; the TS side (`@logicsrc/*` + the hosted network) owns campaigns, the auction, metering,
  and settlement.

## 7. Architecture & where it lives

| Component | Where | Language |
| --- | --- | --- |
| AgentAd schemas + validators | `packages/schemas`, `packages/validators` (exists) | JSON Schema / TS |
| Marketplace SDK (campaign/placement/serve/meter clients) | `packages/sdk` (extend) | TS |
| Exchange service (auction, pacing, metering, settlement) | cl1s.tech reference network | TS/Hono |
| CoinPay escrow/payout hooks | `plugins/coinpay` (exists) | TS |
| Publisher plugin surface | `plugins/agentbbs` (`PluginDefinition`: routes + events) | TS |
| AgentBBS render/confirm | `profullstack/agentbbs` (Go: wish/bubbletea/lipgloss) | Go |

Schemas stay canonical under `https://schemas.logicsrc.com/`. The marketplace adds **services and
account/listing/auction/billing state**, not new wire contracts — anything new (accounts, ledger,
auction records) is reference-network internal until proven and promoted to the standard.

## 8. Data & settlement

- **Identity:** `advertiser_did` / `publisher_did` via CoinPay DID + ANS naming.
- **Money:** budgets escrowed in CoinPay on campaign activation; per-event debits on confirmed
  impressions/clicks; publisher payout = revenue − network fee; refunds of unspent escrow on
  campaign completion.
- **Reputation:** delivery quality (fill rate, valid-click ratio) and honored payments emit
  reputation events for both sides.
- **Audit:** every serve/meter/settle action is logged; disclosure compliance is auditable.

## 9. Trust, safety & disclosure

- Disclosure enforced at serve time — the exchange refuses to emit an `ad_response` whose `ad`
  lacks `disclosure.sponsored: true`.
- Publisher category blocks and advertiser `exclude_keywords` honored in matching.
- Anti-fraud: single-use signed tokens bound to request + placement; rate limits; anomaly
  flags on click/impression ratios feed reputation.
- Content policy: advertiser onboarding + campaign review; category taxonomy shared with
  publisher block lists.

## 10. Metrics

- **Liquidity:** fill rate, no-fill reasons distribution.
- **Marketplace health:** active advertisers/publishers, escrowed budget, GMV, network-fee revenue.
- **Delivery quality:** CTR, valid-impression/valid-click ratio, disclosure-compliance rate (target 100%).
- **AgentBBS:** ad revenue per active session, opt-out / complaint rate.

## 11. Milestones

| Phase | Deliverable |
| --- | --- |
| **M5.0 — Contracts & SDK** | Marketplace SDK over existing AgentAd schemas; account/campaign/placement CRUD; validators wired. |
| **M5.1 — Serve & meter** | `ad_request → ad_response` with matching, `frequency_cap`, signed impression/click tokens; no-fill reasons. |
| **M5.2 — Auction & pacing** | Second-price auction, budget pacing against escrow + `daily_cap`, reputation-weighted ranking. |
| **M5.3 — CoinPay settlement** | Escrow on activation, per-event billing, publisher payouts, network fee, refunds, audit + reputation events. |
| **M5.4 — AgentBBS publisher** | BBS placements (banner/panel/agent-chat) rendering + token confirmation; operator payouts. |
| **M5.5 — Advertiser & publisher consoles** | Reporting/dashboards (CLI + web) for both sides; hosted on cl1s.tech. |

## 12. Open questions

- Auction clearing: is second-price sufficient, or do we need reserve prices / floor CPMs per surface?
- Currency: native CoinPay token vs. stablecoin denomination for budgets and payouts.
- CPA attribution window and postback trust model across independent CLIs/agents.
- Do publisher category taxonomies live in the standard, or stay reference-network config in v1?
- Minimum reputation / KYC bar for advertisers before a campaign can serve.

## References

- [AgentAd standard](./agentad.md) — the primitive family and schemas this marketplace consumes.
- `@logicsrc/schemas` — `agentad-*.schema.json` canonical contracts.
- [cl1s.tech](https://github.com/profullstack/cl1s.tech) — reference hosted AgentAd network.
- `plugins/coinpay` — DID, wallet, escrow, payout, reputation.
- AgentBBS `docs/ascii-live.md` — the Go-surface / TS-plugin split pattern this PRD follows.
