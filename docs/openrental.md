# OpenRental

OpenRental describes a listing containing OpenAgent members, OpenSwarm members, or both, with listing metadata and explicit rental offers paid through CoinPay. A listing can publish an offer for the entire group or for selected members. Membership alone does not put a member up for rent.

Status: 0.1 draft. The JSON Schema, offline validator, fixtures and SDK constructor are implemented in this repository. Until 2026-09-13 this document was published as OpenFleet; that name now belongs to [OpenFleet](/openfleet), the record of which human answers for an agent session and who spawned it, which is a different specification.

Slug: `openrental` Member resolution, authorization, scheduling and payment execution belong to the application that consumes the descriptor.

## What a member is

Each member has a `kind`, stable `id` and HTTPS `url`. The pair `(kind, id)` is its identity within the listing; changing its URL or metadata does not create a second member. A listing MUST contain at least one member, and MUST NOT repeat that identity. Agent-only, swarm-only and mixed listings are equally valid. A member may belong to more than one listing.

| Kind | Identity | Document at `url` |
| --- | --- | --- |
| `openagent` | The `did` of a LogicSRC agent profile, such as `analyst.coinpay` | A document conforming to the existing [`logicsrc.agent` schema](https://github.com/profullstack/logicsrc/blob/master/packages/schemas/schemas/logicsrc-agent.schema.json); its `did` MUST equal the member `id` |
| `openswarm` | `ed25519:` followed by the 64 lowercase hex characters of the swarm's file public key | The signed `ipfile.manifest` for that file, served by its publisher or an HTTP gateway; its `file` key MUST equal the member `id` |

**OpenAgent binding:** this draft uses the existing LogicSRC agent profile as its OpenAgent representation. It does not introduce a second profile format. Agent identities, listing `owner_did` and rental `payee_did` use the existing LogicSRC DID syntax (`name.coinpay`, for example), rather than a new identity namespace.

**OpenSwarm binding:** [OpenSwarm](/docs/openswarm) retains its meaning as the paid, encrypted peer-to-peer distribution family. A member is an actual `ipfile` swarm identified by its stable file key, not a content-version hash, publisher key, hub, or AgentSwarm orchestration session. The manifest may change under that key. AgentSwarm's runtime can consume a listing as application input, but a runtime session is not implicitly an `openswarm` member. The `url` is an HTTP view of the existing manifest, not a new OpenSwarm endpoint requirement.

Listing membership is a grouping reference. It neither copies the member document nor changes the member's operator, capabilities, permissions, pricing or settlement rules. Listings cannot contain other listings in version 0.1. Readers do not recursively expand swarm participants into listing members.

## Publication and discovery

Serve a descriptor as `application/json` over HTTPS, normally at `/.well-known/openrental.json`. `id` is the canonical HTTPS URL of this listing descriptor; the well-known URL may serve the same document. An operator with several listings serves each at its own canonical URL and links them from its site or directory listing. Each descriptor still represents one listing.

Directories fetch the operator's document, retain its canonical ID and source URL, and display `updated_at` and any offer validity window. The specification is listed in LogicSRC's Agents and process family, documentation index, sitemap and LLM discovery files.

## Example

The URLs and identities below are illustrative, not a live checkout or a claim of control over a running swarm.

```json
{
  "type": "logicsrc.openrental",
  "version": "0.1",
  "id": "https://example.com/listings/research",
  "name": "Research listing",
  "owner_did": "operator.coinpay",
  "description": "An analyst and an encrypted reference-data swarm",
  "availability": "available",
  "metadata": { "region": "eu-west" },
  "members": [
    {
      "kind": "openagent",
      "id": "analyst.coinpay",
      "url": "https://example.com/agents/analyst.json",
      "role": "analysis"
    },
    {
      "kind": "openswarm",
      "id": "ed25519:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d",
      "url": "https://example.com/swarms/references/manifest.json",
      "role": "reference-data"
    }
  ],
  "rentals": [
    {
      "id": "hourly",
      "scope": { "kind": "listing" },
      "rate": { "amount": "25.000000", "currency": "USD", "unit": "hour" },
      "minimum_units": 1,
      "terms_url": "https://example.com/rental-terms",
      "payment": {
        "provider": "coinpay",
        "payee_did": "operator.coinpay",
        "checkout_url": "https://example.com/rentals/research"
      }
    }
  ]
}
```

## Listing and member metadata

| Field | Rule |
| --- | --- |
| `type`, `version` | Required constants `logicsrc.openrental` and `0.1` |
| `id`, `name`, `owner_did` | Required canonical descriptor URL, nonempty display name and responsible operator's DID |
| `members` | Required nonempty array of typed member references |
| `description` | Optional human-readable description |
| `updated_at` | Optional RFC 3339 instant when the descriptor was last revised |
| `availability` | Optional `available`, `busy`, `offline` or `unknown`; absent means unknown, and an available listing is not a reservation |
| `tags`, `capabilities` | Optional arrays of distinct nonempty strings; listing-level claims that do not override a member's permissions |
| `metadata` | Optional JSON object for additional listing data, such as region, support information or hardware inventory |
| `rentals` | Optional array of explicit rental offers; absent or empty means no rental offer is advertised |

Members may also carry `name`, `role` and a JSON-object `metadata` field. Unknown fields outside `metadata` are rejected in 0.1 to catch misspelled contract fields. Metadata MUST contain only information intended for publication, never account credentials or payment secrets. Readers preserve metadata, but it cannot override normative fields.

## Rental offers

Each rental requires a unique listing-local `id`, a `scope`, a `rate` and a `payment` block. `name`, `terms_url`, `metadata`, unit bounds and validity times are optional.

| Field | Meaning |
| --- | --- |
| `scope: { "kind": "listing" }` | One rate for the whole listing as listed in the accepted quote; never multiplied by the member count |
| `scope: { "kind": "members", "members": [...] }` | One rate for exactly those `(kind, id)` references, including either kind or both; the list must be nonempty, contain no duplicates and reference existing listing members |
| `rate.amount` | Non-negative decimal **string** with exactly six fractional digits, such as `"0.002500"`; scientific notation, negative amounts and JSON numbers are invalid |
| `rate.currency` | `USD` in version 0.1, following OpenSwarm's amount convention |
| `rate.unit` | `hour` (3,600 seconds), `day` (86,400 seconds), `month` (30 days), or `task` (one agreed deliverable) |
| `minimum_units`, `maximum_units` | Positive safe integers; minimum defaults to 1, an absent maximum is unstated, and maximum cannot be below minimum |
| `valid_from`, `valid_until` | Optional RFC 3339 bounds on when an offer may be accepted; start is inclusive, end is exclusive, and end must be later than start when both are present |
| `terms_url` | Optional HTTPS URL explaining deliverables, availability, billing, cancellation and any separate usage charges |

An individual-member offer therefore uses a scope such as:

```json
{
  "kind": "members",
  "members": [{ "kind": "openagent", "id": "analyst.coinpay" }]
}
```

The whole-listing and member offers are alternatives, not charges automatically added together. The descriptor makes no implicit per-member rate inheritance. Removing a member requires updating or removing offers that reference it. If membership or terms change, the consumer MUST obtain a new quote before acceptance; an existing accepted rental keeps its agreed member set and terms.

Amounts follow [OpenSwarm core's six-decimal USD convention](https://github.com/profullstack/logicsrc/blob/master/docs/openswarm/spec.md). Consumers calculate with integer millionths of a dollar or a decimal library, never JavaScript `Number`. For example, `"0.002500"` becomes `2500n` millionths; 3 agreed billing units cost `7500n`, or `"0.007500"`. `"0.000000"` explicitly states a zero rental rate. Missing rentals never imply free use.

Version 0.1 quotes whole billing units. For timed rentals the accepted quote MUST state a whole number of units and the covered period; partial use does not silently introduce a rounding rule. A task offer's accepted quote MUST specify its deliverable. Taxes, collateral, cancellation, additional usage and currency conversion are agreed at checkout; clients MUST NOT infer them from this rate. The offer's validity window concerns acceptance, not the period of service. Validation checks that a window is ordered, not that an offer is currently available.

## CoinPay settlement

Every rental advertises `payment.provider: "coinpay"`, a `payee_did` and an HTTPS `checkout_url` published by the merchant. The payee can differ from the listing owner when the owner authorizes that settlement recipient. The checkout URL is an entry point for agreeing to this offer and obtaining a CoinPay-backed checkout or escrow; OpenRental specifies no new CoinPay API path, rail, wallet address format or payment-proof format.

The consuming application confirms the listing ID, rental ID, current member set, exact amount, units, payee and terms with the merchant before creating any payment. A checkout response, signed agreement or application record binds those values; the application verifies payment using its configured CoinPay integration. Fetching or validating a descriptor never initiates a payment, and following its URL does not itself prove that CoinPay backs a merchant's claim.

For an OpenSwarm member, the existing `ippay` grants, passes, vouchers and proof rules still govern actual access and delivery. A listing rental does not replace them, mint a key grant or grant access to an agent's connected accounts. Terms must state whether underlying swarm usage is included or charged separately. Listing-level payment does not authorize automatic fan-out payouts to members.

## Validation and SDK

The schema is exported as `@logicsrc/schemas/openrental`. Its agent identity definition references `@logicsrc/schemas/agent`, so standalone JSON Schema consumers must register that schema as well. `@logicsrc/validators` registers both automatically and additionally checks member and rental uniqueness, dangling rental references, unit bounds and validity ordering.

```ts
import { createOpenRental } from "@logicsrc/sdk";
import { validate } from "@logicsrc/validators";

const listing = createOpenRental({
  id: "https://example.com/listings/analyst",
  name: "Analyst listing",
  owner_did: "operator.coinpay",
  members: [{
    kind: "openagent",
    id: "analyst.coinpay",
    url: "https://example.com/agents/analyst.json"
  }]
});
const result = validate("openrental", listing);
if (!result.ok) throw new Error(JSON.stringify(result.errors));
```

`createOpenRental` adds the type and version; it is a constructor, not a runtime validator. The SDK exports `OpenRental`, `OpenRentalMember`, `OpenRentalMemberReference`, `OpenRentalRental` and `OpenRentalRentalScope` types. The validator does not mutate input or fetch URLs, resolve DIDs, verify manifests, establish operator authority or execute payments. Consumers MUST resolve and verify the referenced identities and the operator's authority before scheduling work or accepting a rental. Merely listing somebody else's agent or swarm does not confer authority to rent it.

Run the supplied mixed-listing fixture through the CLI after building the validators:

```sh
npm --workspace @logicsrc/validators run build
node packages/validators/dist/cli.js openrental packages/schemas/fixtures/openrental/mixed.json
```

The complete [fixture](https://github.com/profullstack/logicsrc/blob/master/packages/schemas/fixtures/openrental/mixed.json) includes both a listing-wide hourly offer and an agent-only per-task offer. The [schema](https://github.com/profullstack/logicsrc/blob/master/packages/schemas/schemas/logicsrc-openrental.schema.json) plus the semantic checks in `@logicsrc/validators` are the executable 0.1 contract.
