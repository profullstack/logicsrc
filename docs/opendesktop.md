# OpenDesktop

OpenDesktop is the `desktop` profile of [OpenDevice](/docs/opendevice): one record in an operator's inventory for a desktop, a laptop, a mini PC or a workstation. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. Slug: `opendesktop`. Parent: [OpenDevice](/docs/opendevice).

## The record

Every OpenDevice key applies: `id`, `name`, `os`, `cost`, `status`, `tags`, `observed`. The record sets `"profile": "desktop"` and adds:

| key | what |
|---|---|
| `form` | `desktop`, `laptop`, `mini` or `workstation` |
| `vendor`, `model` | the maker and the model name as the maker sells it |
| `serial` | optional, and never in a published inventory |
| `user` | the person it is assigned to, as an [OpenProfile.md](/openprofile) URL |
| `hardware` | OpenServer units: `cores`, `ram_mb`, `arch`, `storage` |
| `os.patch` | the security patch or build level the machine reports |

```json
{
  "id": "design-laptop",
  "name": "Design laptop",
  "profile": "desktop",
  "form": "laptop",
  "vendor": "Framework",
  "model": "Laptop 13",
  "os": { "name": "Ubuntu", "version": "26.04" },
  "cost": { "amount": 1400, "currency": "USD", "interval": "once", "amortize_months": 36, "since": "2026-01-10", "scope": "business" },
  "observed": { "at": "2026-10-28T05:00:00Z", "support": { "os_updates_until": "2031-04-30", "source": "https://ubuntu.com/about/release-cycle" } }
}
```

## Public metadata

An observer looks up what the vendor publishes about the model and the operating system: `support` (the end of OS or security updates, with `source`), `latest_patch` and `release`. A desktop is usually behind NAT, so it has no `dns`, `tls` or `ports`; a workstation with a public address takes the server keys. An observer never infers where a laptop is.

## License

The specification text is CC BY 4.0.
