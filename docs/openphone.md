# OpenPhone

OpenPhone is the `phone` profile of [OpenDevice](/docs/opendevice): one record in an operator's inventory for a phone. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. Slug: `openphone`. Parent: [OpenDevice](/docs/opendevice).

## The record

Every OpenDevice key applies: `id`, `name`, `os`, `cost`, `status`, `tags`, `observed`. The record sets `"profile": "phone"` and adds:

| key | what |
|---|---|
| `vendor`, `model` | the maker and the model name as the maker sells it (`Google`, `Pixel 9`) |
| `user` | the person it is assigned to, as an [OpenProfile.md](/openprofile) URL |
| `line` | `true` when the device carries a paid mobile line whose bill is this record's `cost` |
| `os.patch` | the security patch level the phone reports, `YYYY-MM-DD` |

The phone number is never a key. It is personal data, and no reader of an inventory needs it to list, secure or cost a device.

```json
{
  "id": "ops-phone",
  "name": "On-call phone",
  "profile": "phone",
  "vendor": "Google",
  "model": "Pixel 9",
  "line": true,
  "os": { "name": "Android", "version": "17", "patch": "2026-10-05" },
  "cost": { "amount": 25, "currency": "USD", "interval": "month", "payee": "CARRIER EXAMPLE", "scope": "business" },
  "observed": {
    "at": "2026-10-28T05:00:00Z",
    "support": { "os_updates_until": "2031-08-01", "source": "https://support.google.com/pixelphone/answer/4457705" },
    "latest_patch": "2026-10-05",
    "release": "2024-08-22"
  }
}
```

## Public metadata

`support`, `latest_patch` and `release`, all from the vendor's own bulletins and support pages. A reader comparing `os.patch` with `observed.latest_patch` reports a phone that is behind without touching it. An observer never collects a phone's location, apps, contacts or traffic.

## License

The specification text is CC BY 4.0.
