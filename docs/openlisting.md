# OpenListing

OpenListing is one file a seller serves about one thing it is offering: what the thing is, what it costs, on what terms, and where it is. A house for sale, an apartment to rent, a car, a piece of equipment. The seller stays the author of its own listing, and a directory reads the seller's file instead of licensing somebody else's database or scraping a marketplace that forbids it. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1 draft**. The parent specification; subject profiles for [OpenProperty](/docs/openproperty) and [OpenCar](/docs/opencar) bind it to the two kinds of thing it was first written for.

Slug: `openlisting`

## The problem

Listing data is the most thoroughly enclosed data there is, and it is enclosed twice over.

In US real estate there is no such thing as "the MLS". RESO tracks **484 separate multiple listing services** as of August 2026, down from nearly twice that in 2015. Each one does publish a real-time feed — RESO Web API 2.0, OData over OAuth2, and NAR requires Realtor-owned MLSs to offer it — so the data is not technically hard to get. It is contractually hard: you need a real estate licence or a licensed broker behind you, then you sign each MLS's data agreement individually, then its vendor issues credentials. Four hundred and eighty-four negotiations to assemble one national view, and the result may not be redistributed.

Vehicle parts are the same shape with different letters: ACES and VCdb from the Auto Care Association, TecDoc in Europe, both subscription, and every retailer catalogue you might scrape is displaying that licensed data rather than owning it.

The effect is that the seller — who knows exactly what they are selling, at what price, and on what terms — has no way to say so in a form anything else can read. Their listing exists only inside whichever marketplace they posted it to, under that marketplace's terms. Take the marketplace away and the listing does not exist anywhere.

What is missing is small: one file, on the seller's own origin, saying what is on offer.

## Terms

- A **seller** is whoever is offering the thing: an owner, a landlord, a dealer, an agent acting for one. Its **descriptor** is the file it serves.
- A **listing** is one thing on offer. One descriptor describes one listing.
- The **subject** is the thing itself — a property, a car.
- The **offer** is the deal on it — for sale, to rent, at auction.
- A **directory** is anything that reads descriptors and lists across sellers.
- A **reader** is anything that reads a descriptor.

## Two axes, not a spec per combination

A house for sale and a house to rent are the same house described the same way; only the offer differs. A house for sale and a car for sale are the same offer; only the subject differs. Writing `OpenHouseForSale`, `OpenHouseForRent`, `OpenCarForSale` and the rest produces a spec per cell of a grid, each repeating most of the others.

So OpenListing separates them:

- **`offer.type`** says what the deal is: `sale`, `rent`, `lease`, `auction`, `free`, `wanted`.
- **`subject.type`** says what the thing is: `property`, `car`, and whatever later profiles add.

A subject profile adds the fields that only make sense for its subject — bedrooms for a property, mileage for a vehicle — and changes nothing else. A reader that understands OpenListing but not a given profile still reads the price, the location, the offer and the dates correctly, and can say so rather than failing.

`openhouse` is also, in real estate, the name of a viewing event rather than a kind of listing. It is not used here for that reason, and an actual open house is an entry in `showings`.

## The descriptor

A seller serves a JSON document over HTTPS. One listing, one document, at its own canonical URL.

```json
{
  "type": "logicsrc.openlisting",
  "version": "0.1",
  "id": "https://northwind.example/listings/14-elm",
  "updated_at": "2026-09-25T10:00:00Z",

  "seller": {
    "name": "Northwind Property",
    "web": "https://northwind.example",
    "kind": "agent",
    "contact": "https://northwind.example/contact"
  },

  "offer": {
    "type": "rent",
    "status": "available",
    "price": { "amount": "2450.00", "currency": "USD", "per": "month" },
    "deposit": { "amount": "2450.00", "currency": "USD" },
    "available_from": "2026-11-01",
    "terms_url": "https://northwind.example/terms"
  },

  "subject": {
    "type": "property",
    "title": "Two-bedroom flat on Elm Street",
    "description": "Top floor, south facing, no lift.",
    "property": {
      "kind": "apartment",
      "bedrooms": 2,
      "bathrooms": 1,
      "floor_area": { "value": 780, "unit": "sqft" },
      "year_built": 1974
    }
  },

  "location": {
    "locality": "Kearney",
    "region": "NE",
    "country": "US",
    "postal_code": "68847",
    "precision": "postal_code"
  },

  "media": [
    { "url": "https://northwind.example/media/14-elm-1.jpg", "kind": "photo" }
  ],

  "showings": [
    { "start": "2026-10-04T14:00:00Z", "end": "2026-10-04T16:00:00Z", "kind": "open" }
  ],

  "license": "CC-BY-4.0"
}
```

`id` is the canonical HTTPS URL of this listing. A seller with many listings serves each at its own URL and links them from an index; `/.well-known/openlisting.json` MAY serve a single listing for a seller that only ever has one, and otherwise SHOULD serve the index described below.

### Required

`type`, `version`, `id`, `updated_at`, `seller.name`, `offer.type`, `offer.status`, `subject.type`, `subject.title`.

Everything else is optional, and **absent means unstated** — never zero, never false, never "no". A listing with no `deposit` key is a listing that has not said what the deposit is, not one with no deposit.

### `offer`

| Field | Meaning |
| --- | --- |
| `type` | `sale`, `rent`, `lease`, `auction`, `free`, `wanted` |
| `status` | `available`, `pending`, `closed`, `withdrawn` |
| `price` | `amount` as a decimal **string**, `currency` as ISO 4217, `per` for recurring offers (`month`, `week`, `night`, `day`) |
| `deposit` | For rentals |
| `available_from` | ISO date |
| `closed_at` | When `status` became `closed`; what a directory needs to learn a listing died |
| `terms_url` | |

Prices are strings because `2450.10` is not representable in binary floating point and a listing is a price. Readers MUST NOT parse them into a float before comparison.

An auction MAY carry `offer.auction` with `ends_at` and `reserve_met`.

### `status`, and why `closed` matters

The single most useful thing a listing file can do that a marketplace cannot is say when the thing sold. Coupon directories are graveyards for exactly this reason: nobody tells them a code died. A seller SHOULD keep a closed listing served, with `status: "closed"` and `closed_at`, for at least 90 days rather than deleting it, so a directory learns the outcome instead of inferring it from a 404 that might equally be an outage.

### `location` and `precision`

`precision` states how exact the location is: `exact`, `street`, `postal_code`, `locality`, `region`. A seller withholding the street of an occupied home SHOULD say `postal_code` and omit `street`, rather than omitting `location` entirely. A reader MUST NOT present a `postal_code`-precision listing as a pin on a building.

This is the same decision a provider directory faces: publishing where something is, at a granularity that does not expose where somebody lives.

### `media`

Each entry has a `url` and a `kind` (`photo`, `video`, `floorplan`, `tour`, `document`). Media is referenced, never inlined. A directory MUST NOT assume it may re-host; `media_license` on the listing says what it may do, and absent means ask.

### `seller.kind`

`owner`, `agent`, `dealer`, `landlord`, `builder`. A reader displaying a listing SHOULD show this: "for sale by owner" and "listed by an agent" are different things to a buyer, and the distinction is routinely lost when a listing is re-posted.

## The index

A seller with more than one listing serves an index at `/.well-known/openlisting.json`:

```json
{
  "type": "logicsrc.openlisting.index",
  "version": "0.1",
  "seller": { "name": "Northwind Property", "web": "https://northwind.example" },
  "updated_at": "2026-09-25T10:00:00Z",
  "listings": [
    { "id": "https://northwind.example/listings/14-elm", "updated_at": "2026-09-25T10:00:00Z", "offer": "rent", "subject": "property", "status": "available" }
  ],
  "next": "https://northwind.example/.well-known/openlisting.json?page=2"
}
```

The index carries enough for a directory to decide what to re-fetch and nothing more. `next` pages it. A directory SHOULD use `updated_at` to skip listings it already has, and SHOULD send `If-None-Match`.

## Provenance, and what a directory owes the seller

A listing that has been re-published carries `source` naming where it came from, so a chain of aggregators does not present itself as the origin:

```json
"source": { "id": "https://northwind.example/listings/14-elm", "retrieved_at": "2026-09-25T10:04:00Z" }
```

A directory MUST retain the seller's `id` as canonical and MUST NOT present a re-published listing as its own. This is what makes an OpenListing directory different from a marketplace: the listing belongs to the seller, and the directory says so.

## Deliberately absent

- **No offers, bids or payment.** A listing says what a thing costs. Concluding the deal is the application's problem, and pretending otherwise would make this a marketplace protocol rather than a description.
- **No identity or verification.** There is no claim that the seller owns the thing. A directory that needs that builds it on top; a specification cannot assert it.
- **No search API.** Descriptors and an index. How a directory indexes them is its business.
- **No MLS compatibility layer.** RESO Web API is a licensed feed with its own field dictionary; mapping into it is a consumer's job and cannot be done by a public specification without the licence it requires.
- **No units system.** Areas and distances carry `value` and `unit` and readers convert. A spec that fixed one unit would be wrong in half the world.

## Reference use

[nichedb.dev](https://nichedb.dev) is the reference directory: it reads descriptors, keeps the seller's canonical `id`, and publishes the result as feeds. See [nichedb's listings collection](https://nichedb.dev/c/listings).

## Subject profiles

- [OpenProperty](/docs/openproperty) — houses, apartments, rooms, land
- [OpenCar](/docs/opencar) — cars, motorcycles, trucks, vans, RVs

A profile adds a key under `subject` named for the subject type and nothing else. New profiles do not change this document.
