# OpenTLD

OpenTLD is one file a registrar serves about what a domain name costs there: for every top-level domain it sells, the price to register, to renew, to transfer in and to restore, in one currency, with any first-year promotion stated beside the price it falls back to. It also fixes the record a directory keeps about each top-level domain itself, built from the three files IANA already publishes, and the rule for saying whether a name is taken. A directory reads the registrar's own file instead of scraping a pricing page, a buyer's agent compares renewals instead of teaser prices, and the registrar stays the author of its own numbers. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. A description of a file a directory already reads, published so a registrar can serve one and any directory can read it.

Slug: `opentld`

## The problem

There are more than fourteen hundred top-level domains, the list changes several times a year, and every registrar prices each one differently. The number on the pricing page is almost always the first year. The renewal, which is what a name actually costs to keep, is one click deeper, and on some domains it is five times the headline: a name that is 52 dollars to register can be 258 to renew, at the same registrar, on the same page. Comparison sites scrape those pages, the scrape breaks when the page changes, and the comparison site's own terms then forbid anyone from reading the scrape.

The pieces exist. Registrars keep their price list in a database, because their cart reads it; several already serve it as JSON without a key. IANA publishes the list of top-level domains every day, the RDAP server for each one, and the type and manager of each in its root zone database. `/.well-known/` is where a host says things about itself. What is missing is one shape for the price list, so every reader reads every registrar the same way, and one agreed record of a top-level domain, so two directories that read the same IANA files hold the same rows.

## Terms

- A **top-level domain** (TLD) is the last label of a domain name: `com`, `watches`, `uk`, `xn--p1ai`. It is written here in lower case, without the leading dot, in its ASCII form.
- A **registry** runs a top-level domain under a contract with ICANN or a national authority. IANA calls it the TLD manager.
- A **registrar** sells names under top-level domains to the public. A **reseller** sells a registrar's names under its own brand, and is a registrar for the purposes of this document.
- A **price list** is the file a registrar serves about what it charges.
- A **directory** is anything that reads price lists and IANA's files and lists top-level domains across registrars: a comparison site, a database, a search index, an agent's own cache.
- A **reader** is anything that reads a price list: a directory, a person's terminal, a program, an agent.

## The price list

A registrar serves a JSON document at `/.well-known/opentld.json` on its own origin.

```json
{
  "registrar": {
    "name": "Northwind Names",
    "web": "https://names.northwind.example",
    "iana_id": 9999,
    "operator": "https://names.northwind.example/.well-known/openprofile.md",
    "country": "US",
    "support": "https://names.northwind.example/support",
    "legal": "https://names.northwind.example/terms",
    "search": "https://names.northwind.example/search?q={name}"
  },
  "currency": "USD",
  "updated": "2026-09-25T06:00:00Z",
  "prices": [
    {
      "tld": "watches",
      "register": 52.01,
      "renew": 257.98,
      "transfer": 257.98,
      "restore": 80,
      "years": { "min": 1, "max": 10 },
      "privacy": "included",
      "url": "https://names.northwind.example/tld/watches"
    },
    {
      "tld": "com",
      "register": 11.08,
      "renew": 11.08,
      "transfer": 11.08,
      "promo": { "register": 6.49, "ends": "2026-10-31T23:59:59Z", "first_year_only": true },
      "privacy": "included",
      "dnssec": true
    },
    {
      "tld": "xn--p1ai",
      "unicode": "рф",
      "register": 9.5,
      "renew": 9.5,
      "restrictions": "Registrant must be a resident of the Russian Federation.",
      "premium": "some"
    }
  ]
}
```

The smallest valid price list is a registrar with a name and one price:

```json
{ "registrar": { "name": "Northwind Names" }, "currency": "USD", "prices": [{ "tld": "com", "register": 11.08 }] }
```

The rules, and every one degrades:

1. **`registrar.name`, `currency` and `prices[].tld` are the only required keys.** A price with no amounts is valid: it says the registrar sells the top-level domain without saying for what. A reader lists what it was given and reports the rest as unstated rather than assumed.
2. **`registrar`** is who sells. `web` is the site. `iana_id` is the registrar's IANA ID, which joins it to ICANN's accreditation list and to the `registrar` a registry's RDAP names; a reseller states its wholesale registrar's ID in `wholesale_iana_id` and leaves `iana_id` out. `country` is ISO 3166-1 alpha-2, `support` is where a customer gets help, `legal` the terms a purchase is under, `operator` the person or organisation answerable as an [OpenProfile.md](/openprofile) URL. `search` is a URL template in which `{name}` is replaced by a full domain name, so a reader can send a buyer straight to the registrar's cart.
3. **`currency`** is one ISO 4217 code for the whole file. A registrar that sells in several currencies serves one file per currency at `/.well-known/opentld.<code>.json`, lower case, and names the default in `/.well-known/opentld.json`. A reader never converts silently: it shows the registrar's number in the registrar's currency, and a converted figure is labelled as converted with the rate and its date.
4. **`tld`** is the ASCII form, lower case, no dot, exactly as it appears in IANA's list: `xn--p1ai`, never `рф` and never `.РФ`. `unicode` is the display form, when the label is an internationalised one. `tld` is the dedupe key: a price list with the same top-level domain twice is read as its last entry.
5. **`register`, `renew`, `transfer` and `restore`** are the price of one year in `currency`, as numbers, before tax. `register` is a new registration, `renew` is each later year, `transfer` is a transfer in (usually including a year), `restore` is buying back a name in its redemption grace period. **`renew` is the number that matters, and a registrar that states `register` states `renew`.** A reader that has only `register` shows the renewal as unknown, never as equal.
6. **`promo`** is a temporary price, stated beside the price it falls back to, never instead of it. It carries any of `register`, `renew`, `transfer`, an `ends` timestamp, and `first_year_only`. A reader drops a promotion whose `ends` has passed. A price list whose `register` is itself the promotion is wrong, and the renewal a buyer pays in year two is what `renew` exists to say.
7. **`years`** is the shortest and longest registration the registrar sells, in years. Absent means the reader does not know.
8. **`privacy`** is `included`, `paid`, `unavailable` or `not_needed` (a registry that redacts on its own). `dnssec` is a boolean. `idn` is a boolean for whether the registrar takes internationalised second-level labels under this top-level domain.
9. **`premium`** is `none`, `some` or `all`: whether a name under this top-level domain may cost more than the stated price because the registry marked it premium. The price list states the standard price; a premium name's price is answered at `search`, not listed here.
10. **`restrictions`** is the registrar's own sentence about who may register, when the registry restricts it: a residency requirement, a trademark check, a licence.
11. **`url`** is the registrar's page for the top-level domain. **`updated`** on the file is when anything in it last changed, and on a price when that price last changed; a price's `updated` wins for that price. Both are ISO 8601.
12. **Unknown keys are kept.** A registrar says more than this document names, and a reader passes it through under the registrar's own key.

Serve it as `application/json`. The price list is a claim; that it came from the registrar's own origin is the verification.

## The top-level domain record

A directory keeps one record per top-level domain, and builds it from IANA, not from any registrar, because a registrar only lists what it sells:

| key | from | meaning |
|---|---|---|
| `tld` | [tlds-alpha-by-domain.txt](https://data.iana.org/TLD/tlds-alpha-by-domain.txt) | the ASCII label, lower case |
| `unicode` | decoded from `tld` | the display form of an `xn--` label |
| `type` | [root zone database](https://www.iana.org/domains/root/db) | `generic`, `country-code`, `sponsored`, `generic-restricted`, `infrastructure` or `test`, as IANA writes it |
| `manager` | root zone database | the registry, in IANA's words |
| `rdap` | [dns.json](https://data.iana.org/rdap/dns.json) | the RDAP base URL, or none |
| `status` | the diff | `delegated` while the label is in the list, `removed` once it has left |
| `first_seen` | the diff | the list version in which the directory first saw the label |
| `removed` | the diff | the list version from which it was missing |
| `list_version` | the list's first line | the version the record was last confirmed against, such as `2026092500` |

The list's first line is a comment carrying its version and when IANA updated it. A directory:

1. **Reads the list daily**, and skips the rest when the version has not changed.
2. **Diffs, never replaces.** A label that appears is added with `first_seen`. A label that disappears is marked `removed`, never deleted, because a retired top-level domain was real and names under it were bought. A label that returns after removal is `delegated` again, and keeps its first `first_seen`.
3. **Keeps a change log**: one row per label added or removed, with the list version. That log is the answer to "what is new", which no registrar publishes.
4. **Refuses a short list.** A fetch that returns far fewer labels than the directory holds is a broken download, not a mass retirement; the directory keeps what it has and tries again.

The `type` and `manager` come from the root zone database, which is HTML; a directory reads it on the same schedule and treats a label IANA marks "Not assigned" as retired whatever the list says. `rdap` comes from the bootstrap file, which is JSON, maps each server to the labels it answers for, and does not cover every label.

## Availability

Whether a name is registered is a question for the registry, and RDAP is the registry's answer. A reader asks the `rdap` base for `domain/<name>`:

- **200** means the name is registered. The response names the registrar, the dates and the status.
- **404** means the registry holds no registration. It does **not** mean the name can be bought: it may be reserved, blocked, premium or not yet released. A reader says "not registered", and sends a buyer to a registrar's `search` to find out whether it is for sale and at what price.
- **Anything else, a timeout, or no `rdap` for the label** means unknown. A reader never turns a failed lookup into "available".

A reader that looks up names in bulk throttles itself per RDAP server and honours `429` and `Retry-After`; registries rate-limit, and a directory that is blocked answers nothing for anyone.

## Registries

A registry may serve the same file at its own origin with `registry` in place of `registrar`, listing the top-level domains it runs. It states `wholesale` prices when it publishes them and no retail price at all, since it sells to registrars and not to the public. Its entries may carry `launch`, a list of phases (`sunrise`, `landrush`, `early_access`, `general`) each with `starts` and `ends`, which is how a new top-level domain from a new round tells readers when it opens. A directory that meets a registry's file keeps it apart from the registrars', because a wholesale price and a retail one are two facts.

## Discovery

A reader finds a price list three ways, in this order:

1. `/.well-known/opentld.json` on the registrar's origin.
2. `<link rel="opentld" href="...">` in the HTML of the registrar's home page, or a `Link: <...>; rel="opentld"` header on it, when the file lives somewhere else.
3. A URL handed to the reader directly.

A price list is **verified** when it was fetched from the same origin as `registrar.web`, or from `/.well-known/` on the origin the reader was pointed at. One found by the third route on some other host is a claim about the registrar by whoever hosts it, and a directory marks it so.

## Directories

A directory reading price lists:

1. **Fetches on a schedule, daily at least.** Promotions end and prices move; a price list read once is a snapshot.
2. **Dedupes on the registrar's origin and `tld`.** A re-read updates the row. A top-level domain that leaves a price list is marked no longer sold there, not deleted.
3. **Sorts by renewal by default.** The first year is a promotion by another name; the renewal is the price. A directory that sorts by `register` alone ranks the most misleading offer first.
4. **Shows the currency it was given**, and labels any conversion with its rate and date.
5. **Attributes the registrar.** Every price links to its `url` or the registrar's `web`, and the directory says where the price came from and when it was read.
6. **Reports absence as absence.** An unstated renewal is unknown, not equal to the registration.

A directory that reads prices from a registrar's own API or public page, rather than an OpenTLD file, shows them in this shape and says so: the source is the registrar, but the file is the directory's reading of it.

The first directory reading OpenTLD is [nichedb.dev/tlds](https://nichedb.dev/tlds): every top-level domain in IANA's list, diffed daily, with each registrar's register, renewal and transfer price beside it, faceted by type, manager and price, sortable on any column, with an RDAP lookup and the same rows as JSON, CLI and MCP.

## What is deliberately absent

**No ordering.** The price list says what a name costs, not how to buy it. `search` and `url` lead to the registrar's cart.

**No premium price list.** A registry marks thousands of names premium and changes them without notice. The price list states the standard price and whether premium names exist; the price of one name is answered by the registrar at the moment of purchase.

**No reviews, no trust score.** `verified` means the file came from the registrar's own origin. Whether a registrar is good is the reader's judgement.

**No central registry of price lists.** Anyone may read any registrar's file. A directory is one reader among many.

## Serving one

By hand, from the same table the cart reads. A registrar with a pricing API already has every number the file needs; the file is that API's answer, exported, at a fixed URL, in one shape.

## Related standards

- [OpenServer](/openserver): the same pattern for hosting, a file a provider serves about what it sells. A registrar that also hosts serves both.
- [OpenCoupon](/opencoupon): a registrar's promotion codes, expired ones kept. `promo` here is the price a buyer pays without a code.
- [OpenProfile.md](/openprofile): the `operator` behind a registrar.
- [OpenMCP](/openmcp): a directory that also serves its rows over MCP describes that door with an OpenMCP descriptor.
- [RFC 9082](https://www.rfc-editor.org/rfc/rfc9082) and [RFC 9224](https://www.rfc-editor.org/rfc/rfc9224): RDAP queries and the bootstrap file that finds the server for a label.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-25 | First publication: the registrar price list, the top-level domain record built from IANA's list, root zone database and RDAP bootstrap, the daily diff, the availability rule, registry files with launch phases, discovery, what a directory owes a registrar. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
