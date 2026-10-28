# OpenDevice

OpenDevice is one file an operator keeps about the machines they run: every server, desktop, laptop, phone and tablet, what each one is, where it runs, what it costs, and what anyone on the internet can already see about it. A security dashboard reads it to list the boxes that have no agent yet, a finance tool reads it to put hosting bills that never touch a linked bank account on the books, and a fleet manager reads it instead of a spreadsheet. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. A description of a file our own tools already read, published so any tool can read the same one.

Slug: `opendevice`

## The problem

An operator's list of machines lives in four places that disagree. The security agent knows the boxes it was installed on. The finance tool knows the charges that hit a linked card, and nothing about the box paid by PayPal or in crypto. The fleet manager knows the machines that enrolled. The spreadsheet knows everything as of the day someone last opened it. Ask "how many machines do we run and what do they cost a month" and each tool answers a different question.

The pieces exist. [OpenServer](/docs/openserver) already describes what a hosting provider sells, offer by offer. What is missing is the other side of the sale: the file that says "we bought that offer, it is this box, it is called dev2, it costs 149 a month, and here is what the internet sees when it looks at it", in one shape every tool reads.

## Terms

- An **operator** is whoever runs the machines: a person, a team, a company. Their **inventory** is the file.
- A **device** is one machine: a physical server, a virtual one, a desktop, a laptop, a phone, a tablet, a router.
- A **profile** says what kind of device it is and which extra keys apply: `server`, `desktop`, `phone`, `tablet` or `other`. [OpenDesktop](/docs/opendesktop), [OpenPhone](/docs/openphone) and [OpenTablet](/docs/opentablet) are the client profiles; the `server` profile is the bought side of an [OpenServer](/docs/openserver) offer.
- An **observer** collects public metadata about a device: a script, a scanner, a security daemon, a fleet agent.
- A **reader** is anything that reads an inventory: a dashboard, a finance tool, an agent.

## Topology

```
OpenDevice  (one record per machine, the inventory)
 ├─ profile: server   ──offer──▶  OpenServer  (what the provider sells)
 │                                  └─ OpenCPU, OpenMemory, OpenDisk, OpenGPU, OpenBandwidth
 ├─ profile: desktop  =  OpenDesktop   (desktops, laptops, workstations)
 ├─ profile: phone    =  OpenPhone
 ├─ profile: tablet   =  OpenTablet
 └─ profile: other    (routers, single-board computers, appliances)
```

A server device points at the offer it was bought from. The offer stays the provider's words; the device is the operator's.

## The inventory

An operator serves or hands over a JSON document. Published, it lives at `/.well-known/opendevice.json` on the operator's origin; most inventories are private and are handed to a reader as a file or a URL behind the reader's own credential.

```json
{
  "operator": {
    "name": "Northwind Labs",
    "web": "https://northwind.example",
    "profile": "https://northwind.example/.well-known/openprofile.md"
  },
  "updated": "2026-10-28T06:00:00Z",
  "currency": "USD",
  "devices": [
    {
      "id": "app1",
      "name": "app1",
      "profile": "server",
      "role": "shared app box",
      "hostnames": ["app1.northwind.example"],
      "addresses": { "ipv4": ["203.0.113.10"], "ipv6": ["2001:db8::10"] },
      "provider": {
        "name": "Example Racks",
        "web": "https://racks.example",
        "offer": { "descriptor": "https://racks.example/.well-known/openserver.json", "id": "dedi-epyc-16" },
        "account": "order 56499"
      },
      "location": { "country": "US", "region": "Buffalo, NY" },
      "hardware": { "cores": 16, "ram_mb": 131072, "arch": "x86_64", "storage": [{ "type": "nvme", "size_gb": 1920 }] },
      "os": { "name": "Ubuntu", "version": "26.04" },
      "cost": {
        "amount": 149,
        "currency": "USD",
        "interval": "month",
        "payee": "RACKS EXAMPLE",
        "paid_with": "paypal",
        "scope": "business",
        "next_due": "2026-11-17",
        "since": "2026-09-17"
      },
      "status": "active",
      "tags": ["prod"],
      "observed": {
        "at": "2026-10-28T05:00:00Z",
        "dns": { "a": ["203.0.113.10"], "aaaa": ["2001:db8::10"] },
        "ptr": ["app1.northwind.example"],
        "asn": { "number": 64500, "org": "EXAMPLE-RACKS" },
        "tls": { "port": 443, "subject": "app1.northwind.example", "issuer": "Let's Encrypt", "not_after": "2027-01-12T00:00:00Z" },
        "ssh": { "port": 22, "banner": "SSH-2.0-OpenSSH_10.0", "keys": ["ssh-ed25519 SHA256:e33oVG..."] },
        "http": { "status": 200, "server": "nginx" },
        "ports": [22, 80, 443]
      }
    },
    {
      "id": "ops-phone",
      "name": "Work phone",
      "profile": "phone",
      "vendor": "Google",
      "model": "Pixel 9",
      "os": { "name": "Android", "version": "17", "patch": "2026-10-05" },
      "cost": { "amount": 25, "currency": "USD", "interval": "month", "payee": "CARRIER EXAMPLE", "scope": "business" },
      "observed": {
        "at": "2026-10-28T05:00:00Z",
        "support": { "os_updates_until": "2031-08-01", "source": "https://support.google.com/pixelphone/answer/4457705" },
        "latest_patch": "2026-10-05"
      }
    }
  ]
}
```

The smallest valid inventory is one device with a name:

```json
{ "devices": [{ "name": "app1" }] }
```

The rules, and every one degrades:

1. **`devices[].name` is the only required key.** A reader lists what it was given and reports the rest as unstated rather than assumed.
2. **`id`** is stable for as long as the device is the same machine. It is the dedupe key: a reader that sees the same inventory and `id` tomorrow updates its row. Absent, the reader derives one from `name`. A rebuilt box on a new IP with the same job keeps its `id`; a second box doing the same job gets its own.
3. **`profile`** is `server`, `desktop`, `phone`, `tablet` or `other`. Absent means `server` when the device has `hostnames` or `addresses`, `other` when it has neither. Each profile's own keys are in its section below.
4. **`hostnames`** are names that resolve to the device. **`addresses`** are its public `ipv4` and `ipv6` addresses. Private addresses (RFC 1918, CGNAT, link-local, a tailnet's) go under `private` inside `addresses` and are never collected by an observer.
5. **`provider`** is who the device is rented from. `offer` names the [OpenServer](/docs/openserver) offer it was bought as, by the provider's descriptor URL and the offer's `id`, so a reader can show the provider's own specs and price beside the operator's. `account` is the operator's own reference at the provider, an order number or a contract, never a credential.
6. **`location`** is where the device is: `country` an ISO 3166-1 alpha-2 code, `region` in the operator's words. A phone or a laptop states it only if its owner wants it stated; an observer never infers a personal device's location.
7. **`hardware`** uses OpenServer's units unchanged: `vcpu`, `cores`, `ram_mb`, `vram_mb`, `arch`, and `storage` as a list of `{type, size_gb}`.
8. **`os`** is `name`, `version`, and for client profiles `patch`, the security patch level as the device reports it (`YYYY-MM-DD`).
9. **`status`** is `active`, `standby`, `retired` or `unknown`. A retired device stays in the file with its cost ended, so last month's books still add up. Absent means `active`.
10. **`updated`** is when the inventory last changed; ISO 8601. **`currency`** is the default for every `cost` that states none.
11. **Unknown keys are kept.** An operator says more than this document names, and a reader passes it through.

## Cost

`cost` is what the device costs to run. It is optional, and a published inventory may leave it out; the private copy handed to a finance tool keeps it.

- `amount` is a number; `currency` an ISO 4217 code; `interval` is `hour`, `month`, `year` or `once`.
- **Monthly run rate** is `amount` per `month`, `amount / 12` per `year`, `amount * 730` per `hour`. A `once` cost is a purchase, not a run rate: a reader leaves it out of the monthly figure unless `amortize_months` is set, when it counts `amount / amortize_months` until that many months after `since` have passed.
- `payee` is the name as it appears on a bank or card statement, so a finance reader can tell when a declared cost is a charge it already sees. `paid_with` is how it is paid: `card`, `bank`, `paypal`, `crypto`, `invoice`, or the operator's own word. A cost paid by PayPal or crypto is the reason this block exists: no bank feed will ever show it.
- `scope` is `business` or `personal`. `category` defaults to `hosting` for servers and `devices` for client profiles.
- `next_due` is the next billing date; `since` and `until` bound the cost. A cost past `until` is not counted.
- `group` is an id shared by several devices on one bill. A reader counts a group's cost once, from the device that states `amount`; the others state `group` alone.

**Rule for finance readers.** A declared cost and an observed charge for the same thing are one cost. A reader that matches a statement row to a device (by `payee`, amount within 10 percent, and the billing interval) shows the observed charge and marks the device's cost as **matched**; an unmatched declared cost is counted as **declared** and shown as such. The inventory never states its own total; every reader adds it up.

## Public metadata

`observed` is what an observer saw. The rule that bounds it:

**An observer collects only what anyone on the internet could see or look up about the device without its credentials.** DNS records, reverse DNS, the routing registry, a TLS certificate or SSH banner the device hands to every connection, an HTTP response header, which of a short list of well-known ports answer, and what the vendor publishes about the model. Never content, never anything behind a login, never a scan of devices the operator does not run.

Every observation carries `at`, when it was taken. A reader shows stale observations as stale.

| key | what | profiles |
|---|---|---|
| `dns` | `a` and `aaaa` records of each hostname | server, other |
| `ptr` | reverse DNS of each public address | server, other |
| `asn` | `number` and `org` of the network announcing each address, from a public routing registry | server, other |
| `tls` | `port`, `subject`, `issuer`, `not_after` of the certificate served | server, other |
| `ssh` | `port`, `banner`, `keys` (fingerprints) of the host keys offered | server, other |
| `http` | `status` and `server` header of `/` | server |
| `ports` | which of 22, 25, 53, 80, 443, 465, 587, 993, 2202, 3000, 5432, 6379, 8080, 8443 accept a connection | server, other |
| `wellknown` | which of `/.well-known/security.txt`, `openprofile.md`, `openserver.json`, `opendevice.json` answer 200 | server |
| `support` | the vendor's published end of OS or security updates for the model, with `source` | desktop, phone, tablet, other |
| `latest_patch` | the newest security patch level the vendor has published for the model | phone, tablet, desktop |
| `release` | when the model was first sold, from the vendor | desktop, phone, tablet |

A reader that compares `os.patch` with `observed.latest_patch` can say a phone is behind without ever touching it.

## Profiles

### server

The device is a machine that serves. It may state `provider.offer` to point at the [OpenServer](/docs/openserver) offer it was bought as; a reader that fetches that offer shows the provider's specs and list price beside the operator's `hardware` and `cost`, and flags the two disagreeing. `role` is what the box is for, in the operator's words. `agents` lists the software watching it, as `{name, version, id}` (a security daemon, a fleet agent), so a reader can tell which devices have none.

### desktop

[OpenDesktop](/docs/opendesktop): desktops, laptops, mini PCs and workstations. Adds `form` (`desktop`, `laptop`, `mini`, `workstation`), `vendor`, `model`, `serial` (optional, and never in a published file) and `user`, the person it is assigned to, as an [OpenProfile.md](/openprofile) URL.

### phone

[OpenPhone](/docs/openphone): a phone. Adds `vendor`, `model`, `user` and `line`, `true` when it carries a paid mobile line whose cost is the device's `cost`. The phone number is never a key; it is personal data and no reader of this file needs it.

### tablet

[OpenTablet](/docs/opentablet): a tablet. The same keys as a phone, with `cellular` as a boolean in place of `line`.

### other

A router, a single-board computer, a NAS, an appliance. Takes the server keys that apply.

## Discovery

A reader finds an inventory three ways, in this order:

1. A file or URL the operator hands it, with whatever credential the reader already uses for that operator. This is the usual case.
2. `/.well-known/opendevice.json` on the operator's origin, for an operator that publishes its fleet.
3. `<link rel="opendevice" href="...">` on the operator's home page, when the file lives somewhere else.

A published inventory is a claim by the operator; that it came from the operator's own origin is the verification. A device's `observed` block is a claim by the observer, and every reader may observe again.

## What is deliberately absent

**No credentials.** No passwords, keys, tokens or API secrets, ever. `account` is an order number, not a login.

**No live stats.** Load, memory in use and uptime belong to the fleet agent that reports them every few seconds. The inventory is what the device is, not how it is doing.

**No personal tracking.** No phone numbers, no location history, no browsing, no app lists. A client device's location is stated by its owner or not at all.

**No totals.** The inventory states each device's cost and nothing summed; every reader adds it up, so two readers of the same file agree.

## Related standards

- [OpenServer](/docs/openserver): the offer a server device was bought as, and its resource blocks [OpenCPU](/docs/opencpu), [OpenMemory](/docs/openmemory), [OpenDisk](/docs/opendisk), [OpenGPU](/docs/opengpu), [OpenBandwidth](/docs/openbandwidth).
- [OpenThreat](/docs/openthreat): what a scanner found on a device, keyed by the same hostnames.
- [OpenProfile.md](/openprofile): the operator, and the person a client device is assigned to.
- [OpenFleet](/docs/openfleet): the agents an operator runs. OpenFleet is who works; OpenDevice is what they work on.

## Implementations

- [`@profullstack/fleet`](https://www.npmjs.com/package/@profullstack/fleet): read, validate and observe an inventory, add up the monthly run rate, and export the costs for a finance tool. Ships the `fleet` CLI.
- [ThreatCrush](https://threatcrush.com/dashboard): the dashboard's fleet list shows every device in the inventory, with or without the daemon, and its monthly cost.
- [CoinPay](https://coinpayportal.com): finances counts declared device costs beside bank charges, matched or declared.
- [W3BS Fleet](https://w3bs.org/fleet): the device classes it manages are these profiles.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-28 | First publication: the inventory, five profiles, the cost block and its matching rule, public metadata and its bound. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
