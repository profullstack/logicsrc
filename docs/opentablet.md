# OpenTablet

OpenTablet is the `tablet` profile of [OpenDevice](/docs/opendevice): one record in an operator's inventory for a tablet. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. Slug: `opentablet`. Parent: [OpenDevice](/docs/opendevice).

## The record

Every OpenDevice key applies: `id`, `name`, `os`, `cost`, `status`, `tags`, `observed`. The record sets `"profile": "tablet"` and adds:

| key | what |
|---|---|
| `vendor`, `model` | the maker and the model name as the maker sells it |
| `user` | the person it is assigned to, as an [OpenProfile.md](/openprofile) URL |
| `cellular` | `true` when the tablet has a mobile radio; its plan, if any, is this record's `cost` |
| `os.patch` | the security patch level the tablet reports, `YYYY-MM-DD` |

```json
{
  "id": "kiosk-1",
  "name": "Front desk kiosk",
  "profile": "tablet",
  "vendor": "Apple",
  "model": "iPad (A16)",
  "cellular": false,
  "os": { "name": "iPadOS", "version": "26.1" },
  "cost": { "amount": 349, "currency": "USD", "interval": "once", "amortize_months": 36, "since": "2026-03-01", "scope": "business" },
  "observed": { "at": "2026-10-28T05:00:00Z", "release": "2025-03-12" }
}
```

## Public metadata

The same as [OpenPhone](/docs/openphone): `support`, `latest_patch`, `release`, from the vendor. Nothing from the tablet itself.

## License

The specification text is CC BY 4.0.
