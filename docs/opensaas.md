# OpenSaaS

OpenSaaS is one file a subscription service serves about how to deal with it: what it sells, and the way in and the way out of every plan. How to subscribe, cancel, pause, change plan, stop the mail, take your data and close the account, each as the page a person opens and the endpoint an agent calls, with the [OpenAccess](/openaccess) scope the agent needs to do it on the person's behalf. A directory reads the service's own file instead of a help centre, a person's agent cancels a plan without hunting for the button, and the service stays the author of its own terms. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. A description of a file a directory already reads, published so a service can serve one and any reader can act on it, human or agent.

Slug: `opensaas`

## The problem

Subscribing takes one click. Cancelling takes a support ticket, a phone call in office hours, a retention screen, and an email three days later saying the request was received. The way in is on the pricing page; the way out is nowhere a search finds. Regulators have started to say the two must be as easy as each other, and no reader can check, because the way out is not written down anywhere a reader can fetch.

An agent acting for a person has it worse. It can read the pricing page and it can find the checkout, but the cancel flow is a form behind a login behind a chat widget, and every service hides it somewhere else. The person said "cancel the ones I do not use", and the agent cannot.

The service already knows all of this. Its billing system has a plan table, a cancel endpoint, a proration rule and a refund policy. What is missing is the one file that puts them where a person and an agent can both read them.

## Terms

- A **service** is anything that sells a plan: a SaaS product, a newsletter with a paid tier, a membership, an app. Its **descriptor** is the file it serves.
- A **plan** is one thing a person can be subscribed to, at a price and a period.
- An **action** is one thing a subscriber can do about a plan: subscribe, cancel, pause, resume, change plan, unsubscribe from mail, export their data, delete their account.
- A **reader** is anything that reads a descriptor: a person's browser, a person's agent, a directory.
- A **directory** is a reader that lists services across the web and compares them.

## The descriptor

A service serves a JSON document at `/.well-known/opensaas.json` on its own origin.

```json
{
  "service": {
    "name": "NicheDB",
    "web": "https://nichedb.dev",
    "operator": "https://logicsrc.com/.well-known/openprofile.md",
    "openaccess": "https://nichedb.dev/.well-known/openaccess.json",
    "support": "https://nichedb.dev/about",
    "terms": "https://nichedb.dev/terms",
    "privacy": "https://nichedb.dev/privacy",
    "currency": "USD"
  },
  "updated": "2026-09-13T06:00:00Z",
  "plans": [
    {
      "id": "premium",
      "name": "Premium",
      "price": 1,
      "period": "day",
      "renews": true,
      "url": "https://nichedb.dev/premium",
      "includes": ["no ads", "no tracker"],
      "status": "active"
    },
    {
      "id": "pro",
      "name": "Pro",
      "price": 30,
      "period": "month",
      "trial": "14 days",
      "renews": true,
      "url": "https://nichedb.dev/pro",
      "includes": ["everything in Premium", "add sources", "API key"],
      "status": "active"
    }
  ],
  "actions": {
    "subscribe": {
      "page": "https://nichedb.dev/premium",
      "api": { "method": "POST", "url": "https://nichedb.dev/api/v1/billing/subscribe" },
      "scope": "billing:subscribe",
      "steps": 2,
      "requires": ["account", "payment"]
    },
    "cancel": {
      "page": "https://nichedb.dev/account/billing",
      "api": { "method": "POST", "url": "https://nichedb.dev/api/v1/billing/cancel" },
      "scope": "billing:cancel",
      "steps": 1,
      "confirm": "click",
      "effective": "period-end",
      "refund": "none"
    },
    "change_plan": {
      "page": "https://nichedb.dev/account/billing",
      "api": { "method": "POST", "url": "https://nichedb.dev/api/v1/billing/plan" },
      "scope": "billing:change",
      "steps": 1,
      "proration": "immediate"
    },
    "unsubscribe": {
      "page": "https://nichedb.dev/account/mail",
      "api": { "method": "POST", "url": "https://nichedb.dev/api/v1/mail/unsubscribe" },
      "scope": "mail:unsubscribe",
      "steps": 1,
      "list_unsubscribe": true
    },
    "export": {
      "page": "https://nichedb.dev/account/export",
      "api": { "method": "POST", "url": "https://nichedb.dev/api/v1/account/export" },
      "scope": "account:export",
      "steps": 1,
      "formats": ["json"],
      "within": "P1D"
    },
    "delete": {
      "page": "https://nichedb.dev/account/delete",
      "api": { "method": "POST", "url": "https://nichedb.dev/api/v1/account/delete" },
      "scope": "account:delete",
      "steps": 2,
      "confirm": "email",
      "effective": "immediate",
      "retention": "P30D"
    }
  },
  "policies": {
    "auto_renew": true,
    "renewal_notice": "P7D",
    "price_change_notice": "P30D",
    "refund": "https://nichedb.dev/terms#refunds"
  }
}
```

The smallest valid descriptor is a service with a name and one action with a page:

```json
{ "service": { "name": "NicheDB" }, "actions": { "cancel": { "page": "https://nichedb.dev/account/billing" } } }
```

The rules, and every one degrades:

1. **`service.name` and one action are the only required keys.** A reader lists what it was given and reports the rest as unstated rather than assumed. A descriptor with plans and no `cancel` action is a descriptor that says nothing about cancelling, and a directory shows exactly that.
2. **`service`** is who sells the plan. `web` is the product, `operator` the person or organisation answerable as an [OpenProfile.md](/openprofile) URL, `openaccess` the service's OpenAccess descriptor, which is where every `scope` in this file is defined. `support`, `terms` and `privacy` are pages. `currency` is the ISO 4217 code every `price` is in unless a plan says otherwise.
3. **`updated`** is when anything in the file last changed, ISO 8601. A reader with it unchanged since its last fetch may skip the rest.
4. **A plan** has `id` (stable, the dedupe key), `name`, `price` (a number in `currency`, `0` for free), `period` (`day`, `week`, `month`, `year`, `once`, or as written), `trial` (a duration in the service's words or ISO 8601), `renews` (`true` when the plan renews itself until cancelled, `false` when it ends on its own), `url` (where a person reads about it), `includes` (the service's own words, one per entry), `seats` and `limits` (kept as written), `status` (`active`, `legacy` for a plan nobody new can buy, `retired`). Absent `renews` is unstated, and a directory shows unstated, never assumes auto-renew.
5. **An action is one thing a subscriber can do, and the same file describes it for a person and for an agent.** `page` is the URL a person opens to do it. `api` is `{ "method", "url" }` an agent calls with an OpenAccess bearer that carries `scope`. An action with `page` and no `api` can only be done by a person; an action with `api` and no `page` can only be done by an agent; a directory shows which. The named actions are `subscribe`, `cancel`, `pause`, `resume`, `change_plan`, `unsubscribe`, `export` and `delete`. `unsubscribe` is about mail, `cancel` is about the plan, and they are two actions because services conflate them on purpose. Unknown actions are kept under their own name.
6. **`scope`** is a scope string as [OpenAccess](/openaccess) defines it, listed in the service's `openaccess` descriptor with the one line a person reads on the consent screen. An action with an `api` and no `scope` is an endpoint the service has not said how to authorise, and an agent does not call it. The scopes in the example are conventional, not reserved: `billing:subscribe`, `billing:cancel`, `billing:pause`, `billing:change`, `mail:unsubscribe`, `account:export`, `account:delete`.
7. **`steps`** is how many things a person does from `page` to done, counted the way a person counts: a click, a form, a confirmation. `subscribe.steps` against `cancel.steps` is the number a directory shows first, because it is the number the law is starting to ask for. **`confirm`** is what the service demands before the action takes: `none`, `click`, `email`, `password`, `chat`, `call`, `mail`. `chat`, `call` and `mail` are the ones a directory flags, since none of them is a step an agent can take and each is a step most people give up on.
8. **`effective`** is when the action takes: `immediate`, `period-end`, or an ISO 8601 duration. **`refund`** on `cancel` is `none`, `prorated`, `full`, a duration inside which it is full (`P14D`), or a URL to the policy. **`proration`** on `change_plan` is `immediate`, `period-end` or `none`. **`retention`** on `delete` is how long the data lives after, as a duration. **`within`** on `export` is how long the export takes to arrive, as a duration, and **`formats`** what it comes as. **`max`** on `pause` is the longest pause, as a duration. **`requires`** on `subscribe` is any of `account`, `payment`, `card`, `invoice`, `approval`. **`list_unsubscribe`** on `unsubscribe` is `true` when the service's mail carries [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058) one-click headers, which is the same promise made in the mail itself.
9. **`policies`** is what applies across plans: `auto_renew`, `renewal_notice` (how long before a renewal the service writes to say so), `price_change_notice`, `refund` (a URL or the words), `minimum_term`. Each is unstated when absent.
10. **Unknown keys are kept.** A service says more than this document names, and a reader passes it through under the service's own key.

Serve it as `application/json`. The descriptor is a claim; that it came from the service's own origin is the verification, and it is the whole reason the file exists: a cancel endpoint fetched from the service's `/.well-known/` is a cancel endpoint the service says works.

## Acting on one

A person opens `page`. That is the whole human half, and it is why `page` exists on every action: the file is the one place the way out is written down beside the way in.

An agent holding an OpenAccess grant for the service with the action's `scope` calls `api.url` with `api.method`, the bearer in `Authorization`, and a JSON body naming the plan when the action needs one (`{ "plan": "pro" }` for `subscribe` and `change_plan`; nothing for `cancel`, `pause`, `resume`, `unsubscribe`, `export`, `delete`). The service answers with the status of the action:

```json
{ "status": "done", "effective": "2026-10-01T00:00:00Z", "confirmation": "https://nichedb.dev/account/billing/receipts/9f2c" }
```

`status` is `done`, `scheduled` (it will take at `effective`), `pending` (the service needs something else, and `next` says what: a `page` the person must visit, or a `confirm` the person must answer) or `refused` with `reason`. A `pending` answer on `cancel` whose `next` is a chat or a call is the service telling the agent, in writing, that the descriptor's `confirm` was true. A refused cancel is a refused cancel, and the agent shows the reason; nothing here obliges a service to accept one, only to say.

The agent never guesses a body the file did not describe, never retries a `refused`, and reports every `pending` to the person with the `next` it was given.

## Discovery

A reader finds a descriptor three ways, in this order:

1. `/.well-known/opensaas.json` on the service's origin.
2. `<link rel="opensaas" href="...">` in the HTML of the service's home or pricing page, or a `Link: <...>; rel="opensaas"` header, when the file lives somewhere else.
3. A URL handed to the reader directly.

A descriptor is **verified** when it was fetched from the same origin as `service.web`, or from `/.well-known/` on the origin the reader was pointed at. One found by the third route on some other host is a claim about the service by whoever hosts it, and a directory marks it so.

A platform that bills for many services (an app store, a marketplace of paid tools) serves one descriptor with itself as `service` and a `provider` key on each plan, or points each service's page at the service's own file with the link relation.

## Directories

A directory reading descriptors:

1. **Fetches daily at least**, and whenever it is told the file changed. Prices change on the first of the month; cancel flows change when nobody is looking.
2. **Dedupes on the service's origin and the plan's `id`.** A re-read updates the row; it never adds a second. A plan that leaves the file is marked `retired`, not deleted.
3. **Shows the way out beside the way in.** `cancel.steps` next to `subscribe.steps`, `cancel.confirm` next to `subscribe.requires`, and whether `cancel` has an `api` at all. A service with no `cancel` action is listed as having said nothing about cancelling.
4. **Keeps the service's words** and links to the service's `page`, unchanged.
5. **Reports absence as absence.** No `refund` is no stated refund policy. No `renews` is unstated, not auto-renew.
6. **Ranks the verified above the claimed.** A file from the service's origin outranks a help-centre scrape of the same service, and a directory shows which is which.

The first directory reading OpenSaaS is the saas collection at [nichedb.dev](https://nichedb.dev/c/saas), which today lists products from the house directories with their pricing model. A service serving a descriptor is listed in its own words, with its exit shown beside its entrance.

## What is deliberately absent

**No checkout.** `subscribe.api` starts a subscription for a person who already has a way to pay on file with the service, or answers `pending` with the `page` where they add one. Payment itself is [CoinPay](https://coinpayportal.com) or the service's own processor, and this file does not carry card details or wallet addresses.

**No retention offers.** A service that wants to offer a discount on the way out does it on `page`, to a person. `cancel.api` cancels.

**No account data.** The file describes actions, not the account. An agent learns the person's current plan from the service's own API under `entitlements`, the OpenAccess scope reserved for exactly that.

**No ranking, no badges.** `steps` and `confirm` are the service's own statements. A directory that scores exit ease labels the score as its own and shows the numbers it came from.

**No JSON Schema.** The rules above are the schema, and every one degrades.

## Serving one

By hand, from the billing table the service already keeps. A plan table and a cancel endpoint are everything the file needs; the file is that table, exported, at a fixed URL, with the actions pointing at the pages and endpoints that already exist. A service that has a cancel page and no cancel endpoint serves `page` today and adds `api` and `scope` when it has them, and the file gets better without the URL changing.

## Related standards

- [OpenAccess](/openaccess): the grant an agent carries to call an action's `api`, and the descriptor where every `scope` is defined.
- [OpenCoupon](/opencoupon): the same shape for a merchant's promotions; a plan's `trial` and a coupon's `new_customers` describe the same door from two sides.
- [OpenServer](/docs/openserver): a hosting provider's catalog, another table a seller keeps served at a fixed URL.
- [OpenProfile.md](/openprofile): the `operator` behind a service.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-13 | First publication: the descriptor, plans, eight actions each as a page for a person and an endpoint plus scope for an agent, steps and confirm as the exit measure, acting on one, discovery, what a directory owes a service. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
