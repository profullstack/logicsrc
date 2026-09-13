# OpenCoupon

OpenCoupon is one file a merchant serves about what is on offer right now: every coupon code, sale and free-shipping threshold it honours, with the terms, the scope, when it starts and when it ends. A coupon site reads the merchant's own file instead of a forum thread, a shopper's agent reads it instead of trying ten dead codes at checkout, and the merchant stays the author of its own promotions. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. A description of a file a directory already reads, published so a merchant can serve one and any directory can read it.

Slug: `opencoupon`

## The problem

Every coupon site is a graveyard. A code is posted once, copied everywhere, and lives on for years after the merchant retired it, because no coupon site knows when a code died and the merchant has no way to tell them. Shoppers try five codes, four fail, and the one that works was for new customers only, which the listing did not say. The deal communities that do keep codes fresh do it by hand and by vote, and their terms forbid anyone else from reading the result.

The merchant already knows exactly which codes work. Its checkout is the source of truth, and the promotion lives in a table with a start date, an end date and a rule. What is missing is the one file that puts that table where a reader can fetch it.

## Terms

- A **merchant** is anyone who honours a promotion at its own checkout: a store, a service, a marketplace seller. Its **descriptor** is the file it serves.
- A **coupon** is one promotion: a code, a sale with no code, a shipping threshold, a gift with purchase.
- A **directory** is anything that reads descriptors and lists coupons across merchants: a coupon site, a browser extension, a shopping agent's cache.
- A **reader** is anything that reads a descriptor.

## The descriptor

A merchant serves a JSON document at `/.well-known/opencoupon.json` on its own origin.

```json
{
  "merchant": {
    "name": "Northwind Outfitters",
    "web": "https://northwind.example",
    "operator": "https://northwind.example/.well-known/openprofile.md",
    "country": "US",
    "currency": "USD",
    "terms": "https://northwind.example/promotions/terms"
  },
  "updated": "2026-09-13T06:00:00Z",
  "coupons": [
    {
      "id": "fall15",
      "code": "FALL15",
      "title": "15% off everything for fall",
      "url": "https://northwind.example/?coupon=FALL15",
      "kind": "percent",
      "value": 15,
      "min_order": 50,
      "max_discount": 100,
      "scope": { "excludes": ["gift-cards", "sale"] },
      "starts": "2026-09-01T00:00:00Z",
      "ends": "2026-09-30T23:59:59Z",
      "per_customer": 1,
      "new_customers": false,
      "stackable": false,
      "channels": ["online"],
      "regions": ["US", "CA"],
      "status": "active",
      "updated": "2026-09-01T00:00:00Z"
    },
    {
      "id": "ship-75",
      "title": "Free shipping over 75",
      "kind": "shipping",
      "min_order": 75,
      "regions": ["US"],
      "status": "active"
    },
    {
      "id": "boots-sale",
      "title": "Trail boots, 40 off",
      "url": "https://northwind.example/boots/trail",
      "kind": "amount",
      "value": 40,
      "scope": { "products": ["trail-boot-2"] },
      "price": { "was": 160, "now": 120 },
      "ends": "2026-09-20T23:59:59Z",
      "status": "active"
    },
    {
      "id": "summer10",
      "code": "SUMMER10",
      "title": "10% off summer",
      "kind": "percent",
      "value": 10,
      "ends": "2026-08-31T23:59:59Z",
      "status": "expired"
    }
  ]
}
```

The smallest valid descriptor is a merchant with a name and a coupon with a title:

```json
{ "merchant": { "name": "Northwind Outfitters" }, "coupons": [{ "title": "Free shipping over 75" }] }
```

The rules, and every one degrades:

1. **`merchant.name` and `coupons[].title` are the only required keys.** A reader lists what it was given and reports the rest as unstated rather than assumed.
2. **`merchant`** is who honours the promotion. `web` is the store, `country` an ISO 3166-1 alpha-2 code, `currency` the ISO 4217 code every amount in the file is in unless a coupon says otherwise, `terms` the page the promotions are under. `operator` is the person or organisation answerable, as an [OpenProfile.md](/openprofile) URL.
3. **`updated`** on the descriptor is when anything in it last changed; on a coupon, when that coupon last changed, and it wins for that coupon. Both are ISO 8601. A reader with the descriptor's `updated` unchanged since its last fetch may skip the rest.
4. **`id`** is stable for as long as the coupon is the same promotion. It is the dedupe key. Absent, the reader derives one from `code`, then from `title`, and a renamed coupon becomes a new one.
5. **`code`** is what the shopper types. Absent means there is nothing to type: the promotion applies on its own, and `url` is where it applies. A code is a string kept exactly as written, case included.
6. **`kind`** is `percent`, `amount`, `shipping`, `bogo`, `gift` or `other`. **`value`** is the number that goes with it: a percentage for `percent`, an amount in `currency` for `amount`, unused for `shipping`, the quantity bought for `bogo` (`value: 2` with `gets: 1`), and unused for `gift` where `gift` names what is given. **`price`** on a sale is `{ "was", "now" }` in `currency`, so a reader can show the cut without computing it.
7. **`min_order`** and **`max_discount`** are amounts in `currency`. **`scope`** narrows what the promotion applies to: `categories` and `products` are the merchant's own identifiers or URLs, `excludes` the same, and a scope with only `excludes` means everything but those. Absent scope means everything.
8. **`starts`** and **`ends`** are ISO 8601. Absent `starts` means already; absent `ends` means until the merchant says otherwise, and a directory shows that as no stated expiry, never as never. **`status`** is `active`, `scheduled`, `paused` or `expired`; absent is derived from the dates, and a stated status wins over the dates.
9. **`per_customer`** is how many times one customer may use it; **`uses`** how many times in total; **`new_customers`** a boolean; **`stackable`** whether it combines with another coupon; **`channels`** any of `online`, `store`, `app`; **`regions`** ISO country codes it is honoured in. Absent means unstated, and a directory that filters on one shows unstated rows as unstated.
10. **Unknown keys are kept.** A merchant says more than this document names, and a reader passes it through under the merchant's own key.

Serve it as `application/json`. The descriptor is a claim; that it came from the merchant's own origin is the verification, and it is the whole reason the file exists: a code fetched from the merchant's `/.well-known/` is a code the merchant says works.

## Expired coupons

A merchant keeps an expired coupon in the file, with `status: expired`, for at least as long as copies of it are likely to circulate. That is how the graveyard gets cleaned: a directory reading the file learns the code is dead from the one party that knows, and marks its own copy. A merchant may drop expired coupons after a while, and a directory that no longer sees an `id` marks it gone.

## Discovery

A reader finds a descriptor three ways, in this order:

1. `/.well-known/opencoupon.json` on the merchant's origin.
2. `<link rel="opencoupon" href="...">` in the HTML of the merchant's home page or checkout, or a `Link: <...>; rel="opencoupon"` header, when the file lives somewhere else.
3. A URL handed to the reader directly.

A descriptor is **verified** when it was fetched from the same origin as `merchant.web`, or from `/.well-known/` on the origin the reader was pointed at. One found by the third route on some other host is a claim about the merchant by whoever hosts it, and a directory marks it so.

A marketplace hosting many sellers serves one descriptor with the marketplace as `merchant` and a `seller` key on each coupon, or points each seller's page at the seller's own file with the link relation.

## Directories

A directory reading descriptors:

1. **Fetches on a schedule, hourly at least**, and whenever it is told the file changed. Coupons start and end on the hour.
2. **Dedupes on the merchant's origin and the coupon's `id`.** A re-read updates the row; it never adds a second.
3. **Shows expiry with the time it was read.** A code shown as active is active as of a stated moment.
4. **Keeps the merchant's words** and links to the merchant's `url`, unchanged. A directory that rewrites `url` to route through its own tracking has replaced the merchant's link with its own, and says so beside the link if it does.
5. **Reports absence as absence.** No `ends` is no stated expiry. No `regions` is unstated, not worldwide.
6. **Ranks the verified above the claimed.** A code from the merchant's origin outranks the same code from a forum, and a directory shows which is which.

The first directory reading OpenCoupon is the deals collection at [nichedb.dev](https://nichedb.dev/c/deals), which today reads the deal communities' feeds and lifts codes out of posts by hand. A merchant serving a descriptor is read in its own words instead.

## What is deliberately absent

**No affiliate links.** `url` is the merchant's. A directory that earns a commission does so in its own link, marked as its own, beside the merchant's.

**No redemption.** The file says a code exists and what it does. Whether the checkout accepts it for this shopper on this cart is the checkout's business.

**No ranking, no votes, no "verified today" badges.** The origin is the verification. A directory that adds a score labels it as its own.

**No prices except `price` on a sale.** The catalog is another document. A coupon names what it applies to; the store says what that costs.

## Serving one

By hand, from the same table the checkout reads. A store with a promotions table has everything the file needs; the file is that table, exported, at a fixed URL, with expired rows kept a while. A static site commits it next to `robots.txt`.

## Related standards

- [OpenServer](/docs/openserver): the same shape for a hosting provider's catalog. Both are a table the seller already keeps, served at a fixed URL.
- [OpenProfile.md](/openprofile): the `operator` behind a merchant.
- [OpenAccess](/openaccess): a `new_customers` or member-only promotion can name the entitlement it needs.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-13 | First publication: the descriptor, six kinds, scope, dates and status, expired coupons kept, discovery, what a directory owes a merchant. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
