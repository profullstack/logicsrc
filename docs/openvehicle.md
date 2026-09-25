# OpenVehicle

The vehicle profile of [OpenListing](/docs/openlisting). It adds one key, `subject.vehicle`, describing a car, motorcycle, truck, trailer or boat. Everything else — the offer, the price, the location, the media, the provenance — is the parent specification and is not restated here.

Status: **0.1 draft**, alongside the parent.

Slug: `openvehicle`

## When this profile applies

When `subject.type` is `"vehicle"`.

## `subject.vehicle`

```json
"subject": {
  "type": "vehicle",
  "title": "2021 Jeep Grand Cherokee Overland",
  "vehicle": {
    "kind": "car",
    "year": 2021,
    "make": "Jeep",
    "model": "Grand Cherokee",
    "trim": "Overland",
    "body": "suv",
    "vin": "1C4RJFCG1MC622398",
    "odometer": { "value": 48210, "unit": "mi" },
    "fuel": "gasoline",
    "transmission": "automatic",
    "drive": "4wd",
    "engine": { "displacement_l": 3.6, "cylinders": 6 },
    "exterior_color": "Diamond Black",
    "doors": 4,
    "seats": 5,
    "title_status": "clean",
    "owners": 2
  }
}
```

### `kind`

`car`, `motorcycle`, `truck`, `van`, `bus`, `trailer`, `rv`, `boat`, `atv`, `equipment`, `other`.

### Fields

| Field | Notes |
| --- | --- |
| `year`, `make`, `model`, `trim` | As the manufacturer names them, not as a marketplace's dropdown does. |
| `body` | `sedan`, `suv`, `coupe`, `hatchback`, `wagon`, `pickup`, `convertible`, `minivan`. |
| `vin` | See below. |
| `odometer` | `value` + `unit` (`mi`, `km`). A unit is required: fifty thousand of one is not fifty thousand of the other, and a bare number is the commonest way vehicle data goes wrong. |
| `fuel` | `gasoline`, `diesel`, `hybrid`, `phev`, `electric`, `lpg`, `hydrogen`. |
| `transmission` | `manual`, `automatic`, `cvt`, `dct`. |
| `drive` | `fwd`, `rwd`, `awd`, `4wd`. |
| `engine` | `displacement_l`, `cylinders`, `power_kw`. |
| `battery` | For electric and plug-in hybrid: `capacity_kwh`, `range`, `range_unit`. |
| `title_status` | `clean`, `salvage`, `rebuilt`, `lemon`, `flood`, `export`, `unknown`. |
| `owners` | Previous keepers, as an integer. |
| `service_history` | `full`, `partial`, `none`. |
| `mot_expires` / `inspection_expires` | ISO date, where the jurisdiction has one. |
| `features` | Free-text list. |

All optional. Absent means unstated.

## The VIN, and what a publisher should think about first

A VIN identifies one specific vehicle for its whole life. Publishing it is normal and useful — it is how a buyer checks the history, and how a reader can resolve the year, make, model and trim independently rather than trusting the listing's own prose.

It is also a durable identifier that ties this listing to every other record about that vehicle, including ones the seller did not intend to connect. A private seller MAY omit it; a dealer usually publishes it. A publisher that omits it SHOULD still give `year`, `make` and `model`.

A reader MUST NOT treat a VIN as proof of anything. It is a claim by the seller like every other field, and a mistyped VIN describes a different car entirely. Readers that verify SHOULD check the ninth-position check digit before relying on one.

## Decoding, and what is free

A reader can resolve a VIN to year, make, model, body, engine and plant using **NHTSA's vPIC API**, which is free, keyless and public domain. That is the intended way to enrich a listing that carries a VIN, and it is why the profile does not require the seller to repeat what the VIN already encodes.

Recalls against a vehicle are likewise free and keyless from NHTSA, per year/make/model. A listing MUST NOT claim recall status — the seller does not know whether a given VIN's recalls were performed, and only the manufacturer's own lookup does.

**Fitment and parts are out of scope, and deliberately so.** Which parts fit a vehicle is ACES/VCdb from the Auto Care Association or TecDoc in Europe, both subscription; a public specification cannot restate licensed data. A listing describes a vehicle, not what fits it.

## What this profile does not do

- **No valuation or book price.** The listing says the asking price.
- **No history report.** Whether a car was in a crash is a claim from a provider, with a source; [OpenOntology](/docs/openontology) is where that belongs.
- **No condition grading.** Marketplace grading scales are proprietary and mutually unintelligible. Condition is `description` text.
- **No parts compatibility.** See above.
