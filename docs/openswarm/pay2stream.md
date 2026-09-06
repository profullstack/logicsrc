# pay2stream: The Client Protocol for Paid Live Streams

Status: 0.1 draft. Member of the [OpenSwarm](../openswarm.md) family.
Depends on the [core](./spec.md), [`iplive`](./iplive.md), [`ippay`](./ippay.md)
and [`pay2seed`](./pay2seed.md). Its server half is
[`paid2stream`](./paid2stream.md).

## 1. Scope

`pay2stream` is the side that pays for a live stream. Two parties speak it
over HTTPS to a hub and to a gateway:

- **A broadcaster**, who attests a channel (consent), buys guaranteed
  relay capacity for a window, publishes listings, and sets ticket prices.
- **A viewer**, who buys a ticket and watches, either as an `iplive` peer
  or, out of the box, on any player that speaks **HLS**: VLC, TiviMate,
  Kodi, hls.js, an Apple TV, a Smart TV app. The viewer never installs
  anything new. What they get is a URL with a pass on it, and an M3U plus
  an EPG that look, to a television, like the provider they replace.

The BitTorrent side, how a relay takes a lease, proves it is online and
serving, runs a gateway that turns swarmed segments into HLS, and is paid,
is [`paid2stream`](./paid2stream.md). One hub implements both. A player
implements nothing; that is the point.

### Prior art

Ace Stream (TorrentStream, 2013) proved BitTorrent carries live television
to millions of viewers at once. It never paid a relay, never recorded
consent, and never opened its engine. `pay2stream` and `paid2stream` are
the open answer to the same problem with those three things added.

### Non-goals

Encoding and ingest (`iplive` §6, c0mpute DIP 0019). Chat, ads, a guide
format beyond the M3U attributes every IPTV player already reads. DRM past
the key a viewer is granted; a gateway serving clear HLS is serving
plaintext to whoever holds the pass, and this document says so.

## 2. Terminology

- **Origin, relay, viewer, channel, head, segment, part, epoch.** As
  `iplive` §2.
- **Broadcaster.** The identity that attests the channel and buys relay
  offers. Usually the publisher of the `iplive.channel`.
- **Gateway.** A relay that presents the channel over HTTP as HLS and M3U
  (`paid2stream` §5).
- **Ticket.** An `ippay.pass` scoped to one or more channel keys, with a
  window: a game, a day, a month.
- **Listing.** A signed `ipdb` entry saying what is on when, at what price.

## 3. Consent

A channel is listed on a hub only against a `pay2seed.attestation`
(`pay2seed` §3) whose `subject` names the channel:

```json
"subject": { "channel": "ed25519:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d" }
```

`visibility` is `public` for a channel any viewer may buy, `private` for
one whose tickets a broadcaster hands out themselves. `basis` is any value
from `pay2seed` §3.2 except `personal`. The attestation MUST be signed by
the channel key and the publisher key, as the channel record itself is
(`iplive` §3.1).

Two things are stated because they are where live streaming has always
gone wrong:

- A broadcaster relaying a feed they receive under a subscription that
  forbids redistribution has no basis in the table and MUST NOT attest
  `licensed`. A hub that learns of it treats the attestation as false.
- A broadcaster with a licence that does permit redistribution (a
  league's own OTT rights, a broadcaster's own channel, a creator's own
  camera) attests `licensed` or `own` and names the licence in
  `description`. That is the entire difference between an IPTV reseller
  and a pirate, and it is now a signed record on a public standing.

The claim window (`pay2seed` §3.3) applies to a public channel before its
first listing, not to each broadcast.

## 4. Relay offers

A broadcaster buys relays the way a requester buys seeders: an offer with
a budget escrowed at the hub, so a stream has relays before its first
viewer arrives and keeps them when vouchers alone would not.

```json
{
  "openswarm": "0.1",
  "type": "pay2stream.offer",
  "hub": "ed25519:c9f1…",
  "broadcaster": "ed25519:5d29…",
  "attestation": "sha256:8e1c…",
  "channel": "ed25519:0d87…",
  "window": { "startsAt": "2026-09-12T18:30:00.000Z", "endsAt": "2026-09-12T22:00:00.000Z" },
  "relays": { "min": 4, "max": 12 },
  "regions": ["eu", "us-east"],
  "capacity": { "downstreamPerRelay": 8, "renditions": ["1080p", "720p"] },
  "priceUsdPerRelayHour": "0.050000",
  "gatewayBonusBps": 5000,
  "budgetUsd": "4.200000",
  "proof": { "everyMinutes": 10, "verifiers": ["hub", "broadcaster"] },
  "pass": { "…": "an ippay.pass scoped to the channel, so relays can pull" },
  "payment": { "network": "eip155:8453", "nonce": "0x2f0a…" },
  "createdAt": "2026-09-10T09:00:00.000Z",
  "sigs": [{ "alg": "ed25519", "key": "ed25519:c9f1…", "sig": "…" }]
}
```

| Field | Rule |
| --- | --- |
| `attestation` | An honoured attestation for `channel` (§3). |
| `window` | When relays are wanted. A standing channel MAY post rolling 24 h windows. |
| `relays.min`, `max` | Leases before the offer is `active`; the cap. |
| `regions` | OPTIONAL. Region labels a relay self-declares; the hub prefers matching relays and never refuses others. |
| `capacity.downstreamPerRelay` | The `iplive` `maxDownstream` a leased relay MUST accept. |
| `priceUsdPerRelayHour` | The floor a relay earns per proven hour online, on top of vouchers. |
| `gatewayBonusBps` | OPTIONAL. Extra floor, in basis points of the hourly price, for a relay that also runs a gateway. |
| `budgetUsd` | Escrowed: at least `max * priceUsdPerRelayHour * hours * (1 + gatewayBonusBps/10000)`. |
| `proof.everyMinutes` | Period length, 5 to 60. |
| `pass` | So a leased relay can pull from upstream as a paying peer; the upstream `perGib` cost is the broadcaster's, not the relay's. |

Purchase, lifecycle, voiding and refund are as `pay2seed` §4.2, over x402
at `POST /streams`.

## 5. Tickets and listings

A **ticket** is an `ippay.pass` with `scope.channels` (added to the pass
record by this document; the hub verifies it as it verifies
`scope.files`) and a window: the hub sells `expiresAt` as short as one
hour for a channel whose record sets `ticket.minHours`, and as long as its
`passDays`. Pricing is the channel's `keyUsd` per grant plus `perGib`
served; a broadcaster who wants a flat ticket sets `perGib` to zero and
`keyUsd` to the ticket price, and the pass's `capUsd` to zero. Nobody
pays for bytes twice.

A **listing** is an `ipdb` entry of type `pay2stream.listing`: channel,
title, start, end, description, and the ticket price at the time, signed
by the channel key. Listings are what a market page and an EPG are built
from, and what a viewer buys against.

## 6. Watching

### 6.1 As a peer

`iplive` §7: resolve the channel, buy or reuse a ticket with `grant: true`,
connect to two peers, pull segments, send vouchers. This is the browser
player on bittorrented.com and the `ip live watch` command.

### 6.2 On any HLS player

An HLS player cannot sign a voucher, so the viewer's ticket is bought with
a gateway's key as `payer` (`ippay` §3.3) and the viewer's own identity
recorded by the hub as `boundBy`. The gateway then signs vouchers on the
viewer's behalf, bounded by the ticket's `capUsd`, which is the whole of
the viewer's exposure. A viewer who disputes a gateway's spend has the
hub's `GET /passes/<id>` record and the gateway's standing.

The ticket reaches the player as a bearer token in the URL, because that
is the only credential an IPTV player can carry:

```
https://gw-eu1.example.net/openswarm/hls/<channel key>/master.m3u8?pass=<base64url pass>
```

Gateways also accept the pass as a cookie and as `Authorization: Bearer`
for browser players (`paid2stream` §5.2).

The pair every IPTV app asks for on setup:

```
https://gw-eu1.example.net/openswarm/channels.m3u?pass=<pass>
https://gw-eu1.example.net/openswarm/epg.xml?pass=<pass>
```

The M3U lists every channel the ticket is in scope for, with `tvg-id`,
`tvg-name`, `tvg-logo` and `group-title`; the EPG is XMLTV built from the
listings. Point TiviMate or Kodi at those two and it is done. Latency is
one segment behind the peer edge, one part with low latency.

Which gateway? `GET /streams/<id>` lists the gateways currently relaying
the channel with their regions and median verified latency; a hub's own
gateway is always among them. A viewer client picks the nearest, and a
ticket bought against one gateway is presentable at any gateway the hub
lists for the channel, since the pass is the hub's record, not the
gateway's.

## 7. Hub API, client side

Relative to a `pay2stream.base` the hub adds to its `ippay.hub` record as
`pay2seed` adds its own. The relay and gateway side is `paid2stream` §6.

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `POST /streams` | x402 + `X-OpenSwarm-Payer` | Buy a relay offer (§4). |
| `GET /streams?live&region&basis&minPrice` | none | Channels currently live with their gateways and listings; offers with free relay slots. |
| `GET /streams/<id>` | none | The offer, leases, gateways, the latest listing. |
| `DELETE /streams/<id>` | broadcaster signed | Void and refund the unearned budget. |
| `POST /listings` | channel signed | Publish a `pay2stream.listing` (also replicated on the channel's `ipdb` feed). |
| `GET /tickets?payer&channel&hours` | x402 + `X-OpenSwarm-Payer` | Buy a ticket (§5). `payer` MAY be a gateway key with the viewer's own key as `X-OpenSwarm-Bound-By`. |
| `GET /gateways?region&channel` | none | Gateways, and which channels each currently relays. |
| `POST /notices` | signed | As `pay2seed` §8; voiding ends every lease and delists every gateway for the channel. |

## 8. Client behaviour

A **broadcaster client** (`ip live` plus `ip stream offer` and
`ip stream ticket` in [cli.md](./cli.md); bittorrented.com's Live TV rent-out
form) attests before listing, buys offers only against its own attestation,
includes a pass in the offer, publishes a listing for every window, and
receives notices at its endpoint.

A **viewer client** (a web page, `ip live watch`, or a plain IPTV app with
a URL pasted in) buys or reuses a ticket, prefers a gateway by region, and
MUST NOT send a ticket to a gateway the hub does not list for that channel.

## 9. Security notes

- **Clear HLS is clear.** A ticket holder can capture the stream. So could
  a peer with a grant. The spec does not pretend otherwise.
- **Pass in the URL.** It is a bearer token in a log line on every proxy
  in the path. Hubs SHOULD sell short tickets to gateway-bound viewers and
  viewers SHOULD prefer the cookie form where a player supports it.
- **Gateway as payer.** The viewer's exposure is `capUsd`; the gateway's
  incentive to over-sign is bounded by its standing and by the hub
  comparing signed bytes with the segment count in the window.
- **A stolen feed with a signed attestation** is the failure this spec
  moves from "impossible to know" to "a named key, a public standing, and
  a notice that ends it".

## 10. Implementations

| Piece | Where | Status |
| --- | --- | --- |
| Reference hub, client side: attestations, offers, tickets, listings, market | `profullstack/media-streamer` (bittorrented.com), Live TV | planned; the IPTV resale rail sells per-game passes today, centrally |
| Viewer in the browser | bittorrented.com, tipoffwatch, genrewatch players (hls.js, mpegts.js) | no change for HLS; `iplive` peer mode planned |
| Players | VLC, TiviMate, Kodi, Apple, Android TV | no work |
| Broadcaster CLI | `ip stream …` ([cli.md](./cli.md)) | proposed |

## 11. Conformance

A **hub** on this side: everything `pay2seed` §11 requires of it, over
channels; sells tickets bound to gateways; lists gateways per channel.

A **broadcaster client** and a **viewer client**: §8.

## 12. Version history

- 0.1 (2026-09-06): first draft, as the client half; consent for
  channels, relay offers, tickets and listings, watching as a peer or on
  any HLS player.
