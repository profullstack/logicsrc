# OpenModel

OpenModel is one file a model provider serves about the models it serves and what they cost: the price per million tokens in, out and cached, the context and output limits, what the model takes in and gives back, and what it can do. A directory reads the provider's own file instead of scraping a pricing page, a buyer's agent reads it instead of guessing, and the provider stays the author of its own prices. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. A description of a file a directory already reads, published so a provider can serve one and any reader can price against it.

Slug: `openmodel`

## The problem

There is no shortage of places to look up an AI model. There is nowhere to look up what it costs you, from the provider that will bill you, in a form a program can read.

Every provider publishes its prices as a marketing page, and every comparison site scrapes those pages. The best of them, [models.dev](https://models.dev), is a community database: 8,179 provider offerings across 223 providers, maintained by volunteers reading pricing pages and filing pull requests. It is good work, and it is still a third party writing down what a company charges. When the page changes, the scrape breaks quietly, and the row keeps saying a price nobody charges any more.

The same model reaches a buyer from many providers at many prices, so the unit that matters is not the model but the offering: this provider, this model, this price. A buyer's agent asked for "the cheapest model that calls tools, takes an image and has 200k of context" has to read hundreds of pricing pages in hundreds of shapes, and the one party who knows the answer exactly, the provider, has no way to say it.

The pieces already exist. A provider keeps this table, because its billing system reads it. `/.well-known/` is where a host states things about itself. What is missing is the one file that puts the table where a reader can fetch it.

## Terms

- A **provider** is anything that serves a model for money or for free: a lab serving its own models, a cloud reselling many, an aggregator, a router. Its **descriptor** is the file it serves.
- A **model** is one thing a buyer can call, as that provider serves it.
- An **offering** is a provider and a model together, which is what carries a price. The same model from two providers is two offerings.
- A **reader** is anything that reads a descriptor: a directory, a buyer's agent, a router choosing where to send a request.
- A **directory** is a reader that lists providers across the web and compares them.

## The descriptor

A provider serves a JSON document at `/.well-known/openmodel.json` on its own origin.

```json
{
  "openmodel": "0.1",
  "updated": "2026-09-24T06:00:00Z",
  "provider": {
    "id": "acme",
    "name": "Acme AI",
    "web": "https://acme.ai",
    "doc": "https://acme.ai/docs/models",
    "operator": "https://acme.ai/.well-known/openprofile.md",
    "api": { "base": "https://api.acme.ai/v1", "protocol": "openai-chat" },
    "env": ["ACME_API_KEY"],
    "npm": "@ai-sdk/acme",
    "currency": "USD"
  },
  "models": [
    {
      "id": "acme-large",
      "name": "Acme Large",
      "description": "Flagship model for long agent runs",
      "family": "acme",
      "url": "https://acme.ai/models/large",
      "open_weights": false,
      "reasoning": true,
      "tool_call": true,
      "structured_output": true,
      "attachment": true,
      "temperature": true,
      "knowledge": "2026-01-31",
      "release_date": "2026-03-01",
      "last_updated": "2026-06-01",
      "status": "ga",
      "modalities": { "input": ["text", "image"], "output": ["text"] },
      "limit": { "context": 200000, "output": 64000 },
      "cost": {
        "input": 1,
        "output": 5,
        "cache_read": 0.1,
        "cache_write": 1.25,
        "unit": "usd per 1M tokens"
      }
    }
  ]
}
```

`models` may also be an object keyed by model id, which is how most providers already hold the table.

### provider

| Field | Meaning |
|---|---|
| `id` | The provider's own short name. Defaults to the origin's host. |
| `name` | Required. What to call the provider in a list. |
| `web` | The provider's site. What verification is checked against. |
| `doc` | Where a human reads the model documentation. |
| `operator` | An [OpenProfile.md](/openprofile) for the company or person behind it. |
| `api` | `base` and `protocol`, so a reader knows how to call it without a per-provider adapter. |
| `env` | The environment variables the provider's own SDK expects. |
| `npm` | The package a reader installs to call it. |
| `currency` | ISO 4217, the currency every price in the file is in. Defaults to `USD`. |

### model

| Field | Meaning |
|---|---|
| `id` | Required. The string a caller passes as the model name. |
| `name` | What to call it in a list. Defaults to `id`. |
| `description` | One sentence in the provider's words. |
| `family` | The model line, so a reader can group versions of one thing. |
| `url` | The model's own page, when it has one. |
| `cost` | Price per million tokens: `input`, `output`, and where they apply `cache_read` and `cache_write`. `unit` names the basis and defaults to `usd per 1M tokens`. |
| `limit` | `context` and `output`, in tokens. |
| `modalities` | `input` and `output` as lists: `text`, `image`, `audio`, `video`, `pdf`. |
| `reasoning`, `tool_call`, `structured_output`, `attachment`, `temperature` | What the model does, as booleans. |
| `open_weights` | Whether the weights are published. |
| `knowledge` | The training cut-off, as a date. |
| `release_date`, `last_updated` | Days, not moments. |
| `status` | The provider's own word: `ga`, `preview`, `deprecated`, `retired`. |

## Two rules that decide what a row means

**A published zero is a fact, not a missing value.** Free tiers exist and are a reason people read a catalogue at all. In the 8,179 offerings models.dev carried on the day this was written, 638 cost nothing and 424 published no price whatsoever. Those are different states, and a reader that collapses them lies in both directions: it invents a free model, or it hides one. `cost` absent means the provider has not said; `cost` with `input` and `output` of `0` means free.

**Absent is unstated, never false.** A model with no `tool_call` has not said it cannot call tools, it has said nothing. A missing `limit` is not unlimited. A reader shows "not stated" and a directory does not fill the gap with a default, because a false travels further than a blank and comes back quoted as a fact.

## Discovery

A reader finds a descriptor three ways, in this order:

1. `/.well-known/openmodel.json` on the provider's origin.
2. `<link rel="openmodel" href="...">` in the HTML of the provider's home or pricing page, or a `Link: <...>; rel="openmodel"` header, when the file lives somewhere else.
3. A URL handed to the reader directly.

A descriptor is **verified** when it was fetched from the same origin as `provider.web`, or from `/.well-known/` on the origin the reader was pointed at. A file that names a provider's `web` and was served by somebody else is a stranger's claim about that company's prices, and a reader drops it. A file that names no `web` is only ever about whoever served it, so it is kept and marked unverified.

Origin is the proof, because a price is the one field where the author is the whole point.

## Directories

A directory reading descriptors:

1. **Fetches daily at least**, and whenever it is told the file changed. Prices move, and a stale price is worse than no price.
2. **Dedupes on the provider's origin and the model's `id`.** That pair is the offering. A re-read updates the row; it never adds a second. A model that leaves the file is marked gone, not deleted.
3. **Keeps the offering as the unit.** The same model from two providers is two rows at two prices, because that is the question a reader came to ask.
4. **Reports absence as absence.** No `cost` is no stated price. No `tool_call` is not stated. Neither is a zero and neither is a false.
5. **Ranks the verified above the claimed**, and shows which is which.
6. **Keeps the provider's words.** The description is the provider's sentence, and a directory that scores models labels the score as its own.

The first directory reading OpenModel is the models collection at [nichedb.dev](https://nichedb.dev/c/models), which reads descriptors beside the models.dev catalogue in the same vocabulary, so one feed catches both.

## What is deliberately absent

**No benchmarks, no leaderboard.** What a model scores is contested, moves with the harness and is not the provider's to certify in its own file. This file says what a model costs and what it does, not how good it is.

**No checkout and no keys.** `api.base` is where a caller sends a request with a credential it already has. Getting that credential is [OpenAccess](/openaccess), and paying is the provider's own processor or [CoinPay](https://coinpayportal.com).

**No rate limits or quotas.** They vary per account and per minute, and a file fetched daily would state them wrong. A provider that wants to publish them does it in `doc`.

**No weights and no licence text for them.** `open_weights` says whether they are published. Where to get them and under what terms belongs to the lab, not to the provider's price list.

**No JSON Schema.** The rules above are the schema, and every one of them degrades.

## Serving one

By hand, from the model table the provider already keeps, because its router and its billing both read it. Export that table at a fixed URL with the prices it already bills at. A provider that knows its prices and its context windows and nothing else serves those today and adds the capability flags when it has them, and the file gets better without the URL changing.

## Related standards

- [OpenSaaS](/opensaas): the same shape for a subscription's plans, the way in and the way out.
- [OpenServer](/openserver) and [OpenGPU](/opengpu): the machines a model runs on, priced by the hour instead of by the token.
- [OpenAccess](/openaccess): the grant an agent carries to call `api.base` on a person's behalf.
- [OpenProfile.md](/openprofile): the `operator` behind a provider.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-24 | First publication: the descriptor, provider and model fields, the offering as the unit that carries a price, a published zero against an absent price, absent as unstated, discovery and verification by origin, what a directory owes a provider. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
