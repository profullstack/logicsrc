# OpenAffiliate

OpenAffiliate is one file a merchant serves about the commission it pays, and the four calls that let anyone earn it: join, link, read the ledger, get paid. The merchant publishes its terms in its own words at a fixed URL, an affiliate joins with a profile instead of an application form, every link is a plain URL with one parameter, every conversion is a row the affiliate can read, and the money goes from the merchant to the affiliate with nobody in between. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. A description of a program a merchant already runs, published so any merchant can run one and any person or agent can join it without a network.

Slug: `openaffiliate`

## The problem

Affiliate marketing runs through networks, and the networks are the problem. A merchant pays the network a fee on every commission, often a third of it, for a tracking pixel and a payout file. An affiliate applies to each program by hand, waits weeks for a decision, and ends up with ten dashboards that disagree with each other. The terms live in a PDF the affiliate agreed to once and cannot fetch again. A conversion is reversed with no reason. A payout arrives sixty days later, minus a fee, in a currency the affiliate did not ask for. And none of it is readable by a machine, so an agent that could earn a commission by recommending the right product has no way to find out what the commission is.

The merchant already knows what it pays, who it pays, and what each sale was worth. Its checkout is the source of truth. What is missing is the file that says the terms, and the four calls that let an affiliate act on them.

## Terms

- A **merchant** is anyone who pays a commission on something it sells: a store, a service, a subscription, a marketplace seller. Its **descriptor** is the file it serves.
- A **program** is one set of terms: what pays, how much, for how long, and how the money arrives. A merchant may run several.
- An **affiliate** is a person or an agent who joins a program and sends customers. Its identity is an [OpenProfile.md](/openprofile) URL.
- A **membership** is one affiliate in one program: a code, a link, a token and a ledger.
- A **conversion** is one event the program pays for, attributed to one affiliate.
- A **directory** is anything that reads descriptors and lists programs across merchants. It never touches the money.
- A **reader** is anything that reads a descriptor.

## The descriptor

A merchant serves a JSON document at `/.well-known/openaffiliate.json` on its own origin.

```json
{
  "merchant": {
    "name": "CrawlProof",
    "web": "https://crawlproof.com",
    "operator": "https://crawlproof.com/.well-known/openprofile.md",
    "currency": "USD",
    "terms": "https://crawlproof.com/affiliate/terms",
    "jwks": "https://crawlproof.com/.well-known/openaffiliate-jwks.json"
  },
  "updated": "2026-09-13T06:00:00Z",
  "programs": [
    {
      "id": "partners",
      "title": "CrawlProof partner program",
      "url": "https://crawlproof.com/affiliate",
      "join": "https://crawlproof.com/api/affiliate/v1/join",
      "ledger": "https://crawlproof.com/api/affiliate/v1/ledger",
      "approval": "open",
      "pays": [
        { "event": "sale", "kind": "percent", "value": 30 },
        { "event": "subscription", "kind": "percent", "value": 30, "months": 12 },
        { "event": "signup", "kind": "amount", "value": 0.5 }
      ],
      "link": { "param": "oa", "template": "https://crawlproof.com/?oa={code}", "deep": true },
      "window": 30,
      "attribution": "last",
      "hold_days": 30,
      "payout": {
        "methods": ["usdc/eip155:137", "usdc/eip155:8453"],
        "min": 10,
        "schedule": "weekly"
      },
      "disclosure": "Paid partner link",
      "self": "refused",
      "regions": ["US", "CA", "GB", "EU"],
      "creatives": "https://crawlproof.com/affiliate/creatives.json",
      "status": "active"
    }
  ]
}
```

The smallest valid descriptor is a merchant with a name and a program with a title and something it pays:

```json
{
  "merchant": { "name": "CrawlProof" },
  "programs": [{ "title": "Partners", "pays": [{ "event": "sale", "kind": "percent", "value": 30 }] }]
}
```

The rules, and every one degrades:

1. **`merchant.name`, `programs[].title` and `programs[].pays` are the only required keys.** A reader lists what it was given and reports the rest as unstated rather than assumed. A program with no `join` is one the reader can describe but not join; a person joins it at `url`.
2. **`merchant`** is who pays. `web` is the store, `currency` the ISO 4217 code every amount in the file is in, `terms` the page the program is under, `operator` the person or organisation answerable as an OpenProfile.md URL, and `jwks` the merchant's public keys for signing webhooks, in JWK Set form. A merchant without `jwks` sends unsigned webhooks, and an affiliate confirms them against the ledger.
3. **`updated`** is when anything in the file last changed, ISO 8601. On a program it wins for that program. A reader with `updated` unchanged since its last fetch may skip the rest.
4. **`id`** is stable for as long as the program is the same program. It is the dedupe key. Absent, the reader derives one from `title`.
5. **`pays`** is a list, one entry per event the program pays on. `event` is `sale`, `subscription`, `signup`, `lead`, `install` or `other`. `kind` is `percent` or `amount`; `value` a percentage of the conversion's `amount` for `percent`, an amount in `currency` for `amount`. On a `subscription` entry, `months` is how many renewals pay, absent meaning every renewal for as long as the customer stays. An event not listed pays nothing. `sale` is a one-time charge; `subscription` is each charge of a recurring one, the first included.
6. **`link`** is how a customer arrives. `param` is the query parameter that carries the affiliate's code, default `oa`. `template` is the link the merchant hands out with `{code}` replaced; absent, it is `web` with `param` appended. `deep: true` means the same parameter works on any page of the site, so an affiliate links to the product it is recommending, not the home page. A merchant that accepts a second parameter name for an older program may list it in `aliases`.
7. **`window`** is the number of days after a click during which a conversion is attributed to it. **`attribution`** is `last` or `first`: whether a later click by a different affiliate replaces the earlier one. Absent `window` is unstated; a directory shows it as unstated, never as forever.
8. **`hold_days`** is how long a recorded conversion stays `pending` before the merchant approves it, which is the merchant's refund window. Absent is unstated. **`payout`** is how money leaves: `methods` is a list of `asset/chain` pairs in CAIP-2 form for on-chain settlement, or a named rail such as `paypal` or `wire`; `min` the balance below which nothing is sent, in `currency`; `schedule` `weekly`, `monthly` or `on_request`.
9. **`approval`** is `open` (a join answers with an active membership at once) or `review` (a join answers `pending` and the merchant decides). Absent is `review`. **`self`** is `refused` when a conversion by the affiliate's own account pays nothing, `allowed` when it pays; absent is `refused`.
10. **`disclosure`** is the wording the merchant asks the affiliate to show beside a link. **`regions`** are the ISO country codes of customers the program pays for. **`creatives`** is a URL of a JSON list of `{ "url", "kind", "width", "height", "alt" }` the affiliate may use as given. **`status`** is `active`, `paused` or `closed`; a paused program keeps paying on earlier clicks and accepts no joins.
11. **Unknown keys are kept.** A merchant says more than this document names, and a reader passes it through under the merchant's own key.

Serve it as `application/json`. The descriptor is a claim; that it came from the merchant's own origin is the verification, and it is the reason the file exists: a commission fetched from the merchant's `/.well-known/` is the commission the merchant says it pays, today, in words it cannot say it never agreed to.

## Joining

An affiliate joins by POSTing to the program's `join` URL:

```json
{
  "program": "partners",
  "profile": "https://anthony.example/.well-known/openprofile.md",
  "pay": "eip155:137:0xCC3b072391AE7A8d10cF00DdC5F61DB2cA5541E5",
  "webhook": "https://anthony.example/openaffiliate/events",
  "code": "anthony"
}
```

`profile` is the affiliate's identity and the only required key. The merchant fetches it; `Kind` says whether it is a person or an agent, `Pay` supplies the payout address when `pay` is absent, and `Operator` says who answers for an agent. `code` is the affiliate's preferred code, granted if free. `webhook` is where the merchant posts events.

The merchant answers:

```json
{
  "membership": "am_8f3c",
  "program": "partners",
  "status": "active",
  "code": "anthony",
  "link": "https://crawlproof.com/?oa=anthony",
  "token": "oa_5Kq…",
  "ledger": "https://crawlproof.com/api/affiliate/v1/ledger",
  "pays": [{ "event": "sale", "kind": "percent", "value": 30 }]
}
```

`token` is the bearer credential for the ledger, shown once. `status` is `active`, `pending` or `refused`; a `review` program answers `pending` and posts `membership.approved` or `membership.refused` to the webhook later. `pays` is the terms as they stood at the join, so the affiliate keeps a copy of what it agreed to. A second join by the same `profile` to the same program answers the existing membership without a new token.

An affiliate proves it controls `profile` by listing the membership's `link` in the profile's Accounts section, rel=me style. A merchant on `review` may wait for that; one on `open` need not.

## Links and attribution

A link is the merchant's URL with `param` set to the affiliate's code. Nothing else: no redirect through a tracking host, no shortener, no pixel. The customer lands on the merchant, the merchant reads the parameter, and the merchant owns the attribution.

Rules:

1. **Only a navigation sets attribution.** A parameter that arrives on an image, a frame, a script or a prefetch sets nothing. This is the whole defence against cookie stuffing, and it is the merchant's to enforce.
2. **The parameter is stripped after reading** so the customer's copied URL carries no code.
3. **Attribution lasts `window` days** from the click that set it, and `attribution` says whether a later click replaces it.
4. **A conversion by the affiliate's own account** follows `self`.
5. **The merchant may honour `?oa=` on a page it does not control**, such as a coupon code typed at checkout that matches an affiliate's code, and says so in `link.aliases` or `terms`.

## The ledger

A membership reads its own ledger with its token:

```
GET {ledger}?since=2026-09-01T00:00:00Z
Authorization: Bearer oa_5Kq…
```

```json
{
  "membership": "am_8f3c",
  "program": "partners",
  "currency": "USD",
  "clicks": { "total": 412, "window": 38 },
  "balance": { "pending": 44.7, "approved": 132.0, "paid": 890.1 },
  "conversions": [
    {
      "id": "cv_01J9",
      "at": "2026-09-12T14:02:11Z",
      "event": "subscription",
      "order": "sub_3f9a",
      "amount": 49.0,
      "commission": 14.7,
      "status": "pending",
      "held_until": "2026-10-12T14:02:11Z",
      "recurring": { "n": 1, "of": 12 }
    },
    {
      "id": "cv_01J2",
      "at": "2026-08-30T09:15:00Z",
      "event": "sale",
      "amount": 29.0,
      "commission": 8.7,
      "status": "reversed",
      "reason": "refunded 2026-09-04"
    }
  ],
  "payouts": [
    { "id": "po_77", "at": "2026-09-07T00:00:00Z", "amount": 120.0, "method": "usdc/eip155:137", "tx": "0x9a…" }
  ]
}
```

A conversion is `pending` from the moment it is recorded, `approved` when `hold_days` pass without a refund, `reversed` with a `reason` when the merchant takes it back, and `paid` when a payout covers it. `amount` is what the customer paid, net of tax, shipping and any refund; `commission` is what the affiliate earns, in `currency`. `order` is an opaque handle the merchant can look up; it is never the customer. **A reversal without a `reason` is not a reversal**: an affiliate reading one reports the merchant as not conforming, and a directory that hears of it says so beside the program.

`since` filters on `at` and on the time a row last changed, so an affiliate polling the ledger sees reversals of old rows. `balance.pending` is the sum of pending commissions, `approved` the sum approved and unpaid, `paid` the lifetime total sent.

## Webhooks

When a membership gave a `webhook`, the merchant POSTs one JSON object per event to it:

```json
{
  "event": "conversion.approved",
  "at": "2026-10-12T14:02:11Z",
  "merchant": "https://crawlproof.com",
  "program": "partners",
  "membership": "am_8f3c",
  "conversion": { "id": "cv_01J9", "event": "subscription", "amount": 49.0, "commission": 14.7, "status": "approved" }
}
```

Events are `membership.approved`, `membership.refused`, `membership.ended`, `conversion.recorded`, `conversion.approved`, `conversion.reversed`, `payout.sent` and `program.changed`. A merchant with `jwks` signs the raw body and sends the signature as `X-OpenAffiliate-Signature: ed25519=<base64url>`; the affiliate verifies against the key set at `merchant.jwks`. Without a signature the webhook is a hint, and the ledger is the truth. A merchant retries a failed delivery for a day and then stops; the ledger still has the row.

`program.changed` fires when a program's `pays`, `window`, `hold_days` or `payout` change, and carries the new program. Terms change forward only: a conversion keeps the `pays` that stood when its click happened.

## Payouts

A payout is the merchant sending the approved balance to the affiliate's `pay` address, on the program's `schedule`, once the balance reaches `min`. On-chain methods settle to the address as given; the ledger's `tx` is the transaction. A named rail settles by that rail's own reference. The merchant sends the whole approved balance or nothing; it does not net a fee, because there is no network to pay one to. A merchant that must withhold tax says so in `terms` and shows the withheld amount as its own row on the payout.

## Discovery

A reader finds a descriptor three ways, in this order:

1. `/.well-known/openaffiliate.json` on the merchant's origin.
2. `<link rel="openaffiliate" href="...">` in the HTML of the merchant's home page, or a `Link: <...>; rel="openaffiliate"` header, when the file lives somewhere else.
3. A URL handed to the reader directly.

A descriptor is **verified** when it was fetched from the same origin as `merchant.web`, or from `/.well-known/` on the origin the reader was pointed at. One found by the third route on some other host is a claim about the merchant by whoever hosts it, and a directory marks it so.

## Directories

A directory reading descriptors:

1. **Fetches daily at least**, and on `program.changed` when it holds a membership.
2. **Dedupes on the merchant's origin and the program's `id`.** A re-read updates the row; a program that leaves the file is marked closed, not deleted.
3. **Shows the terms with the time they were read**, and the merchant's own `terms` link beside them.
4. **Keeps the merchant's `join` and `url` unchanged.** A directory that joins on an affiliate's behalf does so with the affiliate's profile, not its own, and holds the token for the affiliate, not against them.
5. **Reports absence as absence.** No `window` is unstated, not lifetime. No `hold_days` is unstated, not instant.
6. **Ranks the verified above the claimed**, and a program whose merchant reverses without reasons below both.
7. **Takes nothing from the commission.** A directory that charges does so as a fee to whoever asked it, stated up front, and never as a share of a conversion.

The first directory reading OpenAffiliate is the programs list at [crawlproof.com/affiliate/programs](https://crawlproof.com/affiliate/programs), which also joins programs for the people and agents who use it and shows every ledger on one page.

## What is deliberately absent

**No network.** The merchant serves the terms, records the conversions and sends the money. A directory lists and may hold a token on an affiliate's behalf. Nobody sits in the middle of a payment.

**No tracking host.** A link is the merchant's URL with a parameter. There is no redirect to log, no third-party cookie to lose and no pixel to block.

**No application form.** An affiliate is a profile. A merchant that wants to look first says `review`; one that does not says `open`.

**No exclusivity.** A membership binds nobody to one program, and a program may not require it.

**No impression payments.** A view is not an event in `pays`. The events are things a customer did.

## Serving one

By hand, from the table that already exists. A merchant with a referral column on its orders has the ledger; the descriptor is the terms written down, the join call is an insert, and the payout is what it already does on a schedule. The reference implementation is [crawlproof.com](https://crawlproof.com/affiliate), which runs its own program at `/.well-known/openaffiliate.json`, joins other merchants' programs from the same dashboard, and pays in USDC on Polygon through CoinPay.

## Related standards

- [OpenProfile.md](/openprofile): the affiliate's identity and payout address, and the `operator` behind a merchant.
- [OpenCoupon](/opencoupon): a merchant's promotions, the same shape. A coupon that is also an affiliate code lists in both files.
- [OpenAccess](/openaccess): a program that pays only for customers holding an entitlement names the product.
- [OpenServer](/docs/openserver): the pattern of a table the seller already keeps, served at a fixed URL.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-13 | First publication: the descriptor, six events, join, links and attribution, the ledger, webhooks, payouts, discovery, what a directory owes a merchant. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
