# OpenABTest

OpenABTest is a portable experiment manifest and private event contract for comparing product offers across services without confusing assignment, exposure, purchases, or profit.

Status: **0.1 draft proposal**, September 13, 2026. This release supplies JSON Schemas, semantic validators, SDK document constructors and examples. It does not ship an assignment service, analytics warehouse, statistical decision engine, payment executor, or registered AT Protocol extension. No external standards body has accepted this draft.

Slug: `openabtest`

## The contract

A manifest names one experiment, its versioned variants, eligibility rule, randomization unit, observation window, metrics and guardrails. A private append-only event stream records what happened. Consumers can export the same contract from different products while keeping identity, authorization and settlement in the service that owns them.

- Manifest schema: `@logicsrc/schemas/openabtest-manifest`.
- Event schema: `@logicsrc/schemas/openabtest-event`.
- Validation: `validate("openabtest-manifest", document)` and `validate("openabtest-event", document)` from `@logicsrc/validators` 0.3.0 or newer.
- SDK: `OpenABTestManifest`, `OpenABTestEvent`, `createOpenABTestManifest` and `createOpenABTestEvent` from `@logicsrc/sdk` 0.3.0 or newer. Constructors add the draft discriminator; they do not validate, assign people, authenticate events or initiate payment.
- Complete examples: [manifest](https://github.com/profullstack/logicsrc/blob/master/packages/schemas/fixtures/openabtest/chovy-manifest.json) and [event fixtures](https://github.com/profullstack/logicsrc/tree/master/packages/schemas/fixtures/openabtest).

Schema `$id` values name the contracts; they do not imply that a schema-hosting endpoint or universal discovery API has been deployed. A service may link a public, redacted manifest from its documentation. Participant events and settlement evidence MUST remain private.

## Manifest and versioned assignment

Required fields are `openabtest: "0.1-draft"`, `id`, positive integer `revision`, `name`, `state`, `cohort`, `assignment`, `variants`, `window`, `metrics`, and `guardrails`. `economics` is optional for experiments that do not change prices. IDs are issuer-scoped opaque strings, at most 128 characters. Variant IDs must be unique within the manifest; weights are positive safe integers with a safe-integer sum. The share of newly assigned eligible participants is `weight / sum(weights)`, not a promise of an exact observed sample split.

`cohort` contains a stable `id`, an explicit `eligibilityRule`, and `purchaseScope`. Rules must state the product, tenant, referral validity, exclusions, geography or other restrictions when applicable. They are prose for the implementing service, not executable expressions. The Chovy scope is **all-referred-purchases**. Other products may select `all-eligible-purchases`, `first-eligible-purchase`, or `custom` with a complete rule. Overlapping experiments must declare their interaction policy in the eligibility rule; do not silently stack price discounts.

`assignment` names the randomization `unit` (user, account, session, device or a documented custom unit), `authority: "server"`, versioned algorithm and key names, and `persistence: "sticky"`. Pricing assignment MUST happen on the authorized server after eligibility is verified. Persist the first assignment atomically with a uniqueness constraint over the experiment/cohort and stable participant identity. Concurrent requests, devices, checkout retries and later purchases read that assignment. A client-supplied variant, referral claim or price is never authoritative.

The algorithm is a versioned implementation profile, not a required cross-service hashing algorithm. A service using the example `hmac-sha256-persisted-v1` profile must document canonical hash inputs, integer bucket mapping, key-version handling and test vectors privately where needed; raw secret keys never enter the manifest. A cryptographic server random draw followed by durable storage is also valid under its own profile name. Weight changes apply only to new assignments; do not rehash existing customers into a new price.

Variant IDs, weights, parameters, eligibility, assignment profile, economics and metric definitions are immutable within a revision. Changing one requires a new revision; archived revisions remain addressable. Existing assignments continue to reference their original manifest revision. A migration to a new offer requires an explicit separately recorded policy and cannot rewrite an accepted price or accrued commission. State transitions are administrative updates recorded in the issuer's audit log, not variant changes.

`window.startsAt` is inclusive and `endsAt` exclusive. It defines enrollment/reporting boundaries, not permission to discard delayed refunds. A service must record event time and ingestion time separately in its ledger and describe the cutoff and late-event policy in reports. All timestamps are RFC 3339. Currency codes use three uppercase letters; support and exponent must be verified by the integrating product, not inferred from a regex.

## Chovy: 5%, 10% and 20% on every referred purchase

The complete fixture is an illustrative draft, not evidence that a live experiment started on its example dates. Its operational sample and duration floors are examples, not a power calculation or guarantee of statistical significance.

```json
{
  "id": "chovy-signup-discount-v1",
  "revision": 1,
  "cohort": {
    "id": "eligible-referred-customers",
    "eligibilityRule": "Server-verified eligible referral; exclude self-referrals and invalid attribution. Every referred purchase qualifies.",
    "purchaseScope": "all-referred-purchases"
  },
  "assignment": {
    "unit": "user", "authority": "server", "keyVersion": "1",
    "algorithm": "hmac-sha256-persisted-v1", "persistence": "sticky"
  },
  "variants": [
    { "id": "signup-5", "weight": 1, "parameters": { "discountBps": 500 } },
    { "id": "signup-10", "weight": 1, "parameters": { "discountBps": 1000 } },
    { "id": "signup-20", "weight": 1, "parameters": { "discountBps": 2000 } }
  ]
}
```

This is a manifest excerpt; use the linked full fixture for validation. The `signup-*` IDs are stable identifiers despite the discount applying to **every referred purchase**, including later apps and projects. There is no first-purchase or single-project lock. Recheck purchase eligibility without rerandomizing the customer. An invalid referral does not earn a discount or a payout merely because an assignment exists.

The example uses USD cents, a $400 list price per agent-hour, a **modeled, unverified** $100 cost per hour and a $50 minimum retained profit per hour. These inputs are assumptions supplied for this example; actual costs and fees must be reconciled. The previous fixed 80% or 10% affiliate proposals are not part of this contract.

| Variant | Discount | Customer price/hour | Modeled cost/hour | Minimum retained/hour | Affiliate remainder before fees/hour |
| --- | ---: | ---: | ---: | ---: | ---: |
| signup-5 | 5% | $380 | $100 | $50 | $230 |
| signup-10 | 10% | $360 | $100 | $50 | $210 |
| signup-20 | 20% | $320 | $100 | $50 | $170 |

Use integer minor units: list `40000`, modeled cost `10000`, minimum retained profit `5000`. `discountBps` uses basis points: 500, 1000 and 2000. Costs, fees, refunds and taxes borne by the operator reduce the available remainder. They must not be omitted to manufacture a positive result. Unknown costs are `null`, never assumed to be zero.

For settled usage, the available affiliate amount is `max(0, net recognized revenue - actual costs - actual fees - minimum retained profit)`. The minimum is scaled to actual billed usage, rounding the required floor upward to the next minor unit. If net revenue cannot cover costs, fees and the floor, record the shortfall, withhold new payout and pause new assignments. A price must not be represented as guaranteeing profit while expenses are unknown. The manifest's modeled cost is for comparison and never authorizes a payout.

## Events, offers and attribution

Every event has `openabtest`, unique `id`, `producerId`, `manifestId`, `manifestRevision`, opaque `participantId`, `at`, `kind` and a typed `payload`.

| Kind | Payload and meaning |
| --- | --- |
| eligibility | `cohortId`, `eligible: true`; the server verified entry into the cohort. Repeated visits do not add people to the denominator |
| assignment | `cohortId`, `assignmentId`, `variantId`; a durable choice exists. This does not assert that the customer saw it |
| exposure | `assignmentId`, `variantId`, `offerId`, `surface`; the offer was actually shown on the named surface. Rendering failure is not an exposure |
| conversion | `assignmentId`, `variantId`, unique `conversionId`, immutable `price`; an authenticated purchase confirmation, not a checkout click or a client success redirect |
| adjustment | Assignment and conversion IDs, unique `adjustmentId`, currency, signed `amountMinor`, reason and evidence references; a refund, chargeback or accounting correction |
| reconciliation | Assignment and conversion IDs, increasing `accountingRevision`, currency, recognized revenue/refunds, actual costs/fees, affiliate allocation, retained profit, floor, state, payout status and evidence references |

A conversion `price` freezes `offerId`, `acceptedAt`, currency, list and charged unit price, discount basis points, `quantityMilliUnits`, `rounding: "half-up"` and total. One agent-hour is 1000 milli-units. Round the discounted unit price half up, then multiply by quantity and round the total half up. The validator checks those arithmetic relations using integer arithmetic. Products needing other tax or rounding profiles must define a later compatible profile; do not silently change these equations. Honor the accepted snapshot through checkout even if new assignments pause or a manifest revision changes. The server checks the quote belongs to the participant and assignment, is eligible, has not expired, and matches the order and currency before confirmation.

Authorize all event ingestion. Authenticate producers with deployment-managed scoped credentials; verify their authority for the experiment and event type. Client exposure observations may be accepted only through the server after binding them to a server-issued offer. Only verified purchase, refund and accounting sources may produce corresponding authoritative events. JSON `producerId` alone proves nothing.

Deduplicate events by `(producerId, id)` and immutable payload binding. An identical retry is a no-op; the same key with changed content is a conflict. Deduplicate assignment by its ledger key, purchases by the merchant's immutable conversion ID, and adjustments by the adjustment ID even when a different callback event ID is used. A conversion belongs to one participant, assignment, offer and original referral attribution; retries or a subsequent referral link cannot steal it. Keep external order/provider IDs in the private mapping if they are not safe opaque identifiers.

Consumers verify manifest revision and variant existence, participant/assignment ownership, currency, original conversion attribution, event order and accounting revision against the private ledger. Out-of-order events can be buffered and reconciled; never invent missing eligibility or exposure. An authenticated conversion can exist without an observed exposure due to instrumentation loss; report that discrepancy. Standalone schema validation cannot establish these cross-record facts or event authority.

## Reconciliation, refunds and payment references

A pending reconciliation has unknown affiliate/retained amounts (`null`) and `payoutStatus: "withheld"`; actual costs and fees may also be `null`. A reconciled record requires all those numbers and private proof references. Its equality is:

```text
retainedProfitMinor = revenueMinor - refundsMinor
                    - actualCostMinor - feesMinor - affiliateMinor
```

`revenueMinor` is the recognized original purchase revenue, `refundsMinor` its cumulative revenue reversal, and actual costs/fees include all reconciled operator expenses for that purchase. `retainedProfitMinor` may be negative. Refunds and chargebacks are negative adjustment amounts. Corrections may have either sign. A reconciliation is a new complete accounting snapshot at a larger revision, not an additional purchase or an amount to sum with every earlier snapshot.

`payoutStatus: "eligible"` only says the stated reconciliation satisfies the local profit floor. It is **not** evidence that a payout occurred, permission to initiate one, or a guarantee that the evidence is genuine. A payout service must independently recheck evidence, eligibility, settlement finality, liabilities and the retained floor. `proofRefs` are opaque references resolved inside an authorized evidence store; no bearer URLs, tokens, addresses or payment instructions are allowed. CoinPay or another settlement adapter may keep authenticated receipt references there; this draft does not prescribe or call a payment API.

Later refunds append adjustment events and another reconciliation against the same original assignment and currency. Reports recompute the conversion's latest verified net accounting rather than counting a second conversion. Preserve historical accepted prices and accrued or paid commission entries. Post explicit offset/liability entries for corrections under the accepted affiliate agreement instead of overwriting history or automatically debiting an affiliate. A zero new allocation after a shortfall does not erase an earlier accrual. Cross-currency settlement needs explicit conversion evidence outside this draft; do not add USD and another currency together.

## Metrics and decision rules

Every report states the manifest revision(s), assignment unit, cohort and exclusions, event-time window, observation/ingestion cutoff, attribution window, maturity delay, currency and sample counts. Show eligible, assigned, exposed, converted and reconciled participant counts separately for every variant, plus assignment failures, unknown variants and pending/unreconciled conversions. Report unique counts and purchase counts so repeat purchases are visible.

The denominator per variant is unique eligible participants with a valid persisted assignment in the enrollment window, including those who never saw an offer or purchased. Also report eligible-but-unassigned participants and why they are unassigned; do not silently drop failures. Assignment and exposure are not conversions. The randomization unit in the Chovy example is a customer, so repeated purchases are correlated observations within that customer, not independent experimental subjects.

- **Conversion rate:** unique assigned eligible participants with at least one confirmed purchase in the stated attribution window / unique assigned eligible participants. Report refunded-only customers separately and give the chosen net-conversion interpretation; do not silently change it between variants.
- **Retained profit per eligible visitor:** sum the latest reconciled net retained profit of all attributed purchases, including refund effects, / the same eligible-participant denominator. The historical metric name says visitor; the denominator is the manifest's randomization unit, users in this example. Never substitute per-purchaser profit or gross revenue.

When the denominator is zero, display **no data**, not 0% success or a winning variant. Missing accounting is reported as **pending/incomplete**, with the number and value of unreconciled purchases. A partial reconciled numerator may be shown only with that label and its coverage; it is not a complete profit comparison. State assignment/exposure imbalance, instrumentation failures and exclusions before comparing results.

`minimumEligiblePerVariant` and `minimumObservationSeconds` are predeclared operational floors. Meeting them does not establish statistical significance. `winnerPolicy: "manual-review"` forbids automatic winner declarations from this contract alone, especially with tiny samples or no data. A decision requires a separately documented analysis plan, uncertainty estimates, accounting completeness and reviewed guardrails. Repeated peeking or changing metrics does not justify a winner claim. This release intentionally provides no statistics runtime.

## Lifecycle and guardrails

| State | Allowed behavior |
| --- | --- |
| draft | Validate and review; no live enrollment |
| running | Enroll eligible participants within the window, record durable assignments and serve bound offers |
| paused | Stop new assignments and new experimental offers; honor already accepted offers and keep ingesting outcomes, refunds and reconciliation |
| closed | Terminal for enrollment; retain assignments, accepted offers, evidence and audit history, and process later outcomes and adjustments |

A paused experiment may resume under the same immutable definition with a recorded operator action. A closed experiment cannot resume; a new experiment/revision and explicit migration policy is required for future offers. Closing or pausing never changes a historical accepted price or earned commission. Existing customers' future recurring-discount rights follow the terms accepted by the customer, even while new enrollment is paused or closed; such entitlements are not revoked by this lifecycle state.

Guardrails include the retained-profit floor, complete actual-cost evidence before payout, quote consistency, authentication failures, attribution duplication, missing events, unreasonable sample imbalance and product-specific abuse or budget limits. On breach, pause new assignments, record the reason and owner, withhold affected new payouts, and investigate. Resume is an authorized operator decision with a recorded reason. The manifest is not a command that bypasses the host's authorization policy.

## Privacy and conformance boundary

Use purpose-scoped opaque participant, producer, order and evidence IDs. Keep the identity mapping in the source service with access control and a documented retention/deletion policy. Do not export names, emails, IP addresses, credentials, raw referral codes, payment tokens, prompts or transcripts. Avoid tiny public cohorts that could reveal individual behavior. Public reports should be aggregated with the deployment's privacy rules; individual events remain private.

JSON Schema validates shape, ranges, required fields and unknown properties. `@logicsrc/validators` additionally rejects duplicate variant IDs, unsafe weight sums, reversed windows, invalid discounts, inconsistent accepted prices, invalid refund signs, incomplete reconciled accounting and payout allocations that breach the floor. It does not verify real-world costs, ledger ownership, signatures, assignment stability, idempotency storage, referral entitlement or historical preservation. An implementation must enforce those requirements before claiming operational conformance.
