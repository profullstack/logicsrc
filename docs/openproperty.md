# OpenProperty

The property profile of [OpenListing](/docs/openlisting). It adds one key, `subject.property`, describing a house, an apartment, a room, a plot of land or a commercial unit. Everything else — the offer, the price, the location, the media, the provenance — is the parent specification and is not restated here.

Status: **0.1 draft**, alongside the parent.

Slug: `openproperty`

## When this profile applies

When `subject.type` is `"property"`. A reader that does not know this profile still reads the whole listing correctly; it simply does not know how many bedrooms the thing has.

## `subject.property`

```json
"subject": {
  "type": "property",
  "title": "Two-bedroom flat on Elm Street",
  "property": {
    "kind": "apartment",
    "bedrooms": 2,
    "bathrooms": 1.5,
    "floor_area": { "value": 780, "unit": "sqft" },
    "lot_area": { "value": 0.12, "unit": "acre" },
    "year_built": 1974,
    "floors": 1,
    "floor": 3,
    "parking": { "spaces": 1, "kind": "street" },
    "furnished": "unfurnished",
    "heating": "gas",
    "pets": "cats-only",
    "features": ["balcony", "dishwasher"],
    "energy": { "rating": "C", "scheme": "EPC" }
  }
}
```

### `kind`

`house`, `apartment`, `condo`, `townhouse`, `room`, `land`, `commercial`, `parking`, `storage`, `other`.

`room` is a room within a dwelling let separately, which is a different thing from a one-bedroom apartment and is routinely mislabelled as one. `land` carries `lot_area` and usually no `floor_area`.

### Fields

| Field | Notes |
| --- | --- |
| `bedrooms` | An integer. A studio is `0`, not absent — this is the one place absent and zero genuinely differ and the difference matters. |
| `bathrooms` | A number, because half-baths are real and `1.5` is the ordinary way to write one. |
| `floor_area` | `value` + `unit` (`sqft`, `sqm`). Internal area. |
| `lot_area` | `value` + `unit` (`sqft`, `sqm`, `acre`, `hectare`). |
| `year_built` | Four-digit year. |
| `floors` | How many storeys the dwelling has. |
| `floor` | Which storey it is on. Distinct from `floors`, and confusing them is the commonest error in property data. Ground floor is `0` in the UK sense and `1` in the US sense, so a publisher SHOULD also set `floor_scheme` to `uk` or `us` when it sets `floor`. |
| `parking` | `spaces` and `kind` (`garage`, `driveway`, `street`, `permit`, `none`). |
| `furnished` | `furnished`, `part-furnished`, `unfurnished`. |
| `heating` | Free text; no controlled vocabulary, because national ones disagree. |
| `pets` | `allowed`, `none`, `cats-only`, `dogs-only`, `ask`. |
| `accessibility` | `step_free`, `lift`, `wet_room` and similar, as a list. |
| `features` | Free-text list. Deliberately unconstrained: this is where everything a controlled vocabulary would lose goes. |
| `energy` | `rating` and `scheme` (`EPC`, `HES`, `NABERS`). The scheme is required alongside the rating, because a bare "C" means nothing without it. |

All are optional. Absent means unstated, exactly as in the parent, with `bedrooms: 0` noted above as the meaningful exception.

## Tenure

For a sale, `subject.property.tenure` MAY be `freehold`, `leasehold`, `commonhold`, `share-of-freehold` or `other`, with `lease_years_remaining` where it applies. A leasehold with eighty years left is a materially different asset from the same flat freehold, and a listing that omits this is omitting the thing a buyer most needs.

## What this profile does not do

- **No valuation.** A listing says the asking price. What the thing is worth is somebody else's claim, and [OpenOntology](/docs/openontology) is where a claim with a source belongs.
- **No condition or survey.** "Needs work" is `description` text, not a field, because every attempt to enumerate condition ends up either useless or misleading.
- **No floorplan geometry.** A floorplan is media with `kind: "floorplan"`. Describing rooms as geometry is a different specification and a much larger one.
- **No address normalisation.** The parent's `location` carries what the seller stated, at the precision the seller chose. Normalising it is a consumer's job.

## Market context is not a listing

Aggregate market data — median sale price for a ZIP, days on market, inventory — is **not** an OpenListing document and MUST NOT be published as one. It describes a market, not a thing on offer, and it has no `offer` and no seller. Directories that carry both keep them apart.
