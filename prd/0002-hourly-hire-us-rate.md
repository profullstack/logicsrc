---
openprd: "0.2"
id: "0002"
title: Move Hire Us pricing from a weekly retainer to an hourly rate
status: Accepted
authors:
  - anthony@profullstack.com
created: 2026-07-28
updated: 2026-07-28
repo: https://github.com/profullstack/logicsrc
implementation: apps/logicsrc-web
tags: [pricing, site, billing]
---

## Problem

The Hire Us surface on logicsrc.com prices standards work at $250/week, paid through a
recurring CoinPay invoice after project acceptance. That number reads as a token retainer
rather than a rate for senior open-spec implementation work — schemas, CLIs, SDKs, MCP
resources, and provider-neutral plugin surfaces. It anchors every inbound conversation at a
price that cannot cover the work, and it selects for clients who are shopping on price rather
than on the standard.

The replacement is $400/hour. This is not a bump to an existing hourly number; it is a change
of pricing *model*, which touches page copy, the payment configuration, and the invoicing
mechanics that currently assume a fixed weekly amount.

## Goals

- Every public price on logicsrc.com states one rate, in one unit, with no stale $250/week
  copy left behind on any surface.
- Inbound Hire Us inquiries arrive already anchored to a senior rate, so the pricing
  conversation is about scope rather than about the number.
- Billing can actually execute the new model: an accepted project produces a correct invoice
  without manual repair.
- The change is reversible and auditable — the reasoning survives in the repo, not in a Slack
  thread.

## Non-Goals

- Repricing the standard itself. LogicSRC schemas, specs, and reference implementations stay
  open and free; this covers implementation services only.
- Building time tracking. Hourly billing needs hours captured, but that is an operational
  process for now, not a product to build.
- Replacing CoinPay or adding a second payment provider.
- Publishing a rate card with tiers, discounts, or role-based pricing. One rate, one line.
- Migrating anyone currently engaged at $250/week. Handled case by case, not by this PRD.

## Users

- **Prospective clients** evaluating whether to hire Profullstack for LogicSRC work — mostly
  founders and engineering leads arriving from the spec pages, who read the price before they
  read anything else.
- **Profullstack**, as the party quoting, invoicing, and collecting.
- **Existing clients** on the weekly plan, who must not be silently repriced.

## Decisions

Two questions blocked this PRD at drafting time. Both were resolved before implementation:

- **The rate is $400/hour, confirmed deliberately.** Against $250/week this is roughly a 64x
  change at a 40-hour week. The magnitude is the point: the weekly figure was a token retainer,
  not a rate, and the new number is intended to filter out engagements too small to scope.
- **Billing is metered against actual hours, not a committed weekly block.** This matches how
  the code already works — `/api/payments/create` creates a single one-shot payment, never a
  recurring subscription, so the previous "recurring invoice" copy documented a mechanic that
  did not exist. Metered billing also avoids the committed-block failure mode, which is a
  weekly rate wearing an hourly label. A **10-hour minimum engagement** replaces the week as
  the unit of commitment.

## Requirements

- R1 [P0] The Hire Us section heading states the new rate and unit, replacing "$250/week for
  accepted LogicSRC work".
- R2 [P0] The price display block shows $400 with the unit "per hour".
- R3 [P0] The `/hire-us` entry in the Top-Level Pages list is updated; it repeated the weekly
  figure independently of the section above it.
- R4 [P0] The `/hire-us` page body and its meta description are updated.
- R5 [P0] The CoinPay configuration block reflects the new model. `COINPAY_AMOUNT_USD=250` and
  `COINPAY_INTERVAL=week` are both wrong under hourly pricing and are replaced by a rate, a
  billing mode, and a minimum rather than renumbered.
- R6 [P0] A repo-wide search for `250`, `per week`, and `/week` returns no remaining pricing
  references before the change is considered done.
- R7 [P1] The site states what an hour is billed against — metered actual hours, invoiced after
  the client approves them — so the invoice mechanic is legible before a client asks.
- R8 [P1] Minimum engagement and cancellation terms are stated, since removing the weekly
  cadence also removes the implicit unit of commitment.
- R9 [P2] Terms of engagement are documented at `/terms` rather than only in marketing copy.

Surfaces the original draft did not list, but which carried the weekly price and were therefore
in scope for R6: `/pricing` (metadata, two FAQ answers, and the rate bullet), `/about`,
`llms.txt`, `skill.md`, the Hire Us form's success message, and both the contract and e2e tests.

## UX Notes

The price appears in several places across the front page, `/pricing`, `/about`, and the
machine-readable surfaces; they are separate strings and will drift if edited one at a time.
Treat the set as one change.

The CoinPay block is rendered as example configuration, so it reads as documentation of how
billing actually works. A weekly interval next to an hourly rate is worse than a stale price —
it looks like the system does not do what the copy says.

The stated rate sits next to what it buys. The existing four capability cards (workflow specs,
reference implementations, integration hardening, open infrastructure) already do that work and
are unchanged.

## Implementation Notes

- `src/lib/page-markup.ts` — section heading, price row, a new `.price-terms` line carrying the
  minimum and cancellation summary, the CoinPay config block, and the Top-Level Pages entries
  for both Hire Us and Terms.
- `src/app/api/hire-us/coinpay-checkout/route.ts` — the amount is now derived as
  `hours × $400` rather than hardcoded. Hours are validated as quarter-hour increments at or
  above the 10-hour minimum, defaulting to the minimum when omitted; invalid hours return 422
  before any call to CoinPay. Payment metadata carries `billing`, `hours`, and
  `rate_usd_per_hour` in place of `interval`.
- `src/app/api/hire-us/project-request/route.ts` — returns a rate, billing mode, and minimum
  instead of a fixed `amount_usd`/`interval` pair, since no amount exists until hours are
  approved.
- `src/app/terms/page.tsx` — new real route, replacing the `/terms` stub that rendered the
  homepage SPA. The stub's entry was removed from the catch-all's `ROUTE_META`.

## Success Metrics

- Zero occurrences of the weekly price across the site and repo after the change, verified by
  grep rather than by reading.
- First accepted project under the new model invoices correctly on the first attempt, with no
  manual adjustment to the CoinPay invoice.
- Inbound inquiries that reach a scoping conversation do not open by disputing the rate.
- No existing engagement is repriced without explicit agreement.

## Risks & Open Questions

- **Hours are not currently tracked.** Metered billing won, and there is no capture mechanism.
  `/terms` now defines what is billable (project work, meetings, and written communication in
  quarter-hour increments; not scoping calls, invoicing, or warranty fixes), so the definition
  is settled even though the tooling is not. Capturing hours is an operational process until it
  is worth building.
- **Client mix will change.** An hourly rate at this level filters out the small experimental
  engagements the weekly price attracted. This is the intent, recorded here as a decision
  rather than left to be discovered.
- **Existing weekly clients** keep their terms until both sides agree in writing to move, per
  `/terms`. Whether any active weekly engagements exist is still unknown.
- **Author attribution** is assumed from the CoinPay org configuration and should be corrected
  if wrong.
