# paid2stream: The Server Protocol for Paid Live Streams

Status: 0.1 draft. Member of the [OpenSwarm](../openswarm.md) family.
Depends on the [core](./spec.md), [`iplive`](./iplive.md), [`ippay`](./ippay.md)
and [`paid2seed`](./paid2seed.md). Its client half is
[`pay2stream`](./pay2stream.md).

## 1. Scope

`paid2stream` is the side that gets paid to carry a live stream. It is
spoken by relays and gateways: peers on the `iplive` wire that take a
lease from a hub, stay online for a window, fan out segments, and, for a
gateway, turn the swarm into standard HLS for any player. It defines:

- **Leases** on a `pay2stream.offer`: one relay, one window, one price
  per relay-hour.
- **Proof of relaying.** Presence proofs by a verifier that connects as a
  peer and pulls segments, and a served-bytes ratio so a relay that is
  online and idle is not paid the floor for nothing.
- **Settlement.** Relay-hour accrual, a gateway bonus, receipts, payout
  through the `ippay` payee a relay already has for vouchers.
- **The gateway role**: the record, the HLS presentation in clear and
  sealed modes, the M3U and EPG, gateway-bound vouchers, and what a
  gateway must do when a channel is voided.
- **Regions and standing.**

Consent, offers, tickets and the viewer are [`pay2stream`](./pay2stream.md).
A hub implements both; a relay or gateway implements only this document.

### Non-goals

Deciding what a channel is. A relay sees a channel key, a basis, a
visibility and a price, and decides whether to carry it.

## 2. Terminology

- **Relay, viewer, channel, head, segment, part, epoch, origin.** As
  `iplive` §2.
- **Gateway.** A relay that also speaks HTTP: presents the channel as HLS
  and M3U, holds a grant, and signs vouchers on behalf of the HLS viewers
  bound to it.
- **Relay-hour.** One relay, connected and serving, for one hour.
- **Period.** `offer.proof.everyMinutes` long.

## 3. Leases

A `paid2stream.lease` is a `paid2seed.lease` with `priceUsdPerRelayHour`
in place of the GiB-month price, `graceMinutes` (default 5) in place of
`graceHours`, a `window` copied from the offer, and a `gateway` boolean
set when the relay commits to §5.

`POST /relays` with `{ "offer", "relay", "regions", "gateway": bool,
"sig" }`, `sig` by the relay key over `"openswarm:paid2stream:lease:v1" ||
offer id`. `201` with the lease; `409` when no slot is free or the relay
already holds one for this window; `403` below the standing floor. A
relay MUST be online and announced in the channel's peer set within the
grace window, and holds at most one lease per channel window. When an
offer is voided every lease on it is `voided` and the hub pushes
`paid2stream.lease.voided`.

## 4. Proof and settlement

### 4.1 Presence

A leased relay is proven for a period when a verifier finds it, at its
announced address, serving the channel: the verifier connects as an
`iplive` peer, receives a `head` no older than two segments, requests one
segment at each rendition in `capacity.renditions`, and receives them
within one segment duration each. The verifier signs a
`paid2stream.proof` with `{ "lease", "period", "head", "segments",
"latencyMs" }`. A relay that is connected but answers `deny rate` to a
verifier fails the period.

For a gateway, the verifier also fetches the media playlist and one
segment over HTTP (§5.3) and records `hls: true`.

### 4.2 Served bytes

Vouchers a relay redeems for this channel during the window are the
second measure. A hub MAY require, per offer, a minimum ratio of served
bytes to pulled bytes for a period to count, so a relay that is present
and idle while others carry the viewers is not paid the floor for nothing.
The default ratio is 1.0 after the first two periods.

### 4.3 Accrual and receipts

```
earnedUsd = priceUsdPerRelayHour * (everyMinutes / 60) * (1 + gatewayBonusBps / 10000 if gateway)
```

per proven period, integer micro-USD, rounded down, credited to the
relay's `ippay` payee balance with a `paid2stream.receipt` shaped as
`paid2seed.receipt`. Two consecutive failed periods end the lease and
reopen the slot. Vouchers are separate and additive; the hub's fee is the
broadcaster's at purchase, never the relay's.

### 4.4 Regions and standing

A relay declares `regions` in its lease request, self-reported and
verified only in the sense that a verifier records the latency it saw.
Standing is `paid2seed` §6.3 with periods in place of days; a hub shows a
relay's median verified latency per region beside it.

## 5. Gateways and HLS

A gateway is what makes this usable by a person with a television. Any
relay MAY be one; a c0mpute node with `c0mpute:role:gateway` is expected
to be one; the reference hub runs one.

### 5.1 Record

```json
{
  "openswarm": "0.1",
  "type": "paid2stream.gateway",
  "gateway": "ed25519:a41e…",
  "base": "https://gw-eu1.example.net/openswarm",
  "regions": ["eu"],
  "modes": ["clear", "sealed"],
  "lowLatency": true,
  "hubs": ["https://bittorrented.com/api/openswarm"],
  "createdAt": "2026-09-10T09:00:00.000Z",
  "sigs": [{ "alg": "ed25519", "key": "ed25519:a41e…", "sig": "…" }]
}
```

Registered with `POST /gateways`; listed in `GET /gateways` and, per
channel, in the `gateways` array of `GET /streams/<id>`. An origin MAY
name preferred gateways in its channel record's `relays` block.

### 5.2 Presenting a pass

A gateway MUST accept the ticket three ways: `?pass=<base64url pass>` on
the URL, as a cookie, and as `Authorization: Bearer`. It verifies the
pass against the hub key and its scope (`ippay` §3.1), checks `expiresAt`,
and MUST rate-limit failed presentations by source address. A pass bought
against another gateway is valid here if the hub lists this gateway for
the channel; the pass is the hub's record.

### 5.3 HLS presentation

For a channel it relays, a gateway serves:

| Path | Body |
| --- | --- |
| `hls/<channel>/master.m3u8` | One `EXT-X-STREAM-INF` per rendition in the channel record, `CODECS` and `BANDWIDTH` from it, `EXT-X-INDEPENDENT-SEGMENTS`. |
| `hls/<channel>/<rendition>.m3u8` | A media playlist rebuilt from the latest signed head: `EXT-X-MAP` for the init segment, one `EXTINF` per segment in the DVR window, `EXT-X-DISCONTINUITY` at a key epoch boundary in `sealed` mode, `EXT-X-PROGRAM-DATE-TIME` from the head's timestamp. With `lowLatency`, `EXT-X-PART` entries from `iplive` parts and `EXT-X-SERVER-CONTROL` with `CAN-BLOCK-RELOAD=YES`. |
| `hls/<channel>/<rendition>/<seq>.m4s` | The segment. |
| `hls/<channel>/init/<rendition>.mp4` | The init segment. |
| `hls/<channel>/key/<epoch>` | `sealed` mode only: the 16-byte HLS key, to a pass holder. |

**`clear` mode.** The gateway decrypts each `iplive` segment with the
grant it holds and serves plaintext over TLS. Every IPTV player
understands it, and it is exactly as private as the TLS session and the
pass. A gateway MUST NOT serve `clear` for a channel whose record has
`keys.modes` without `gateway` in it; that is how an origin refuses to be
decrypted by anyone but viewers.

**`sealed` mode.** The gateway re-encrypts each segment under a
per-epoch AES-128-CBC key and writes
`EXT-X-KEY:METHOD=AES-128,URI="key/<epoch>"`, so the playlist is standard
HLS with standard encryption and the key endpoint is where the pass is
checked. Segments may then be cached by any HTTP cache in the path. The
re-encryption is the gateway's cost; the origin's content key never
leaves the `iplive` layer.

Both modes are one segment behind the peer edge; `lowLatency` narrows that
to one part.

### 5.4 The M3U and the EPG

`GET <base>/channels.m3u?pass=<pass>` returns `#EXTM3U` with one
`#EXTINF` per channel the pass is in scope for, carrying `tvg-id`,
`tvg-name`, `tvg-logo` and `group-title` from the channel record's
`title`, `logo` and `group` fields (added to `iplive.channel` as OPTIONAL
by this document), each pointing at that channel's `master.m3u8` with the
pass attached. `GET <base>/epg.xml?pass=` returns XMLTV built from the
`pay2stream.listing` entries of those channels. This pair is what every
IPTV app asks for on setup, and it is how a gateway looks, to a
television, like the provider it replaces.

### 5.5 Gateway-bound vouchers

A gateway signs vouchers to its upstream for what it pulls, as any relay
does, and signs vouchers to itself on behalf of each bound viewer for what
it serves them, bounded by that viewer's ticket `capUsd`. It MUST NOT
sign a voucher for bytes it did not serve; the hub compares signed bytes
against the segment count in the window, and the gateway's standing is
what it loses.

### 5.6 Stopping

On `pay2stream.channel.voided` a gateway MUST stop serving the channel
within one segment duration, answer its playlists with `410`, and drop
the channel from `channels.m3u`. A gateway that keeps serving a voided
channel is delisted and its standing zeroed.

## 6. Hub API, relay and gateway side

Relative to `pay2stream.base`. The client side is `pay2stream` §7.

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `GET /streams?open&region` | none | Offers with free relay slots, and what each pays per hour. |
| `POST /relays` | relay signed | Take a lease (§3). |
| `GET /relays/<key>` | none | Standing, leases, median latency per region. |
| `GET /relays/<key>/leases?status` | none | What a relay resumes after a restart. |
| `POST /proofs` | verifier signed | Report a presence proof; returns the receipt. |
| `POST /gateways` | gateway signed | Register or update a gateway record. |
| `GET /passes/<id>` | none | Verify a presented ticket against the hub's record (`ippay` §5.2). |
| `POST /vouchers` | none | Redeem, as `ippay` §5.3; gateway-bound vouchers carry `boundBy`. |
| `POST /webhooks` | signed | Register a CloudEvents endpoint for a relay or gateway key. |

## 7. Relay and gateway client behaviour

1. Holds a relay key, registered as an `ippay` payee, stored as an
   OpenCreds `key` item.
2. Polls `GET /streams?open` on its hubs, filtered by the operator's
   policy: which `basis` values to carry, minimum price per hour,
   regions, upload to keep in reserve.
3. Takes a lease, connects to the channel's peers using the offer's pass,
   accepts up to `capacity.downstreamPerRelay` downstream peers, and
   stays for the window.
4. As a gateway: holds a grant, serves §5.3 in at least `clear` mode,
   §5.4, and the three pass presentations of §5.2.
5. Answers verifiers as ordinary peer traffic, and over HTTP for the
   gateway probe.
6. On restart, resumes leases from `GET /relays/<key>/leases?status=proven`.
7. Stops on a void (§5.6). Shows the operator, per lease, the basis,
   earned so far, viewers served, and the next period due.

## 8. Events

| `type` | Data | Subscriber |
| --- | --- | --- |
| `pay2stream.offer.listed`, `.active`, `.settled`, `.voided` | offer id | broadcaster, market followers |
| `paid2stream.lease.granted`, `.proven`, `.lapsed`, `.ended`, `.voided` | lease id, period, `earnedUsd` | relay, broadcaster |
| `pay2stream.channel.live`, `.ended`, `.voided` | channel key, gateways | relays, gateways, viewers with tickets |
| `pay2stream.listing.published` | listing id | market followers |

## 9. Security notes

- **Presence without service.** The served-bytes ratio (§4.2) is what
  stops a relay from collecting the floor while doing nothing.
- **Gateway over-signing.** Bounded per viewer by `capUsd`, and in
  aggregate by the hub's segment-count check and the gateway's standing.
- **Clear mode is clear.** A gateway is trusted with plaintext by the
  origin's choice of `keys.modes`; an origin that does not want that
  offers `sealed` only, or no gateways at all.
- **Relay regions are self-declared.** Only the verified latency beside
  them is evidence.

## 10. Implementations

| Piece | Where | Status |
| --- | --- | --- |
| Reference hub, server side, and the hub's own gateway | `profullstack/media-streamer` (bittorrented.com), Live TV | planned; the IPTV resale rail (`/api/public/iptv/<slug>/stream`) already seals HLS manifests per session, the central version of §5.3 |
| Gateway on the storage network | `profullstack/c0mpute` `c0mpute:role:gateway`, DIP 0019 playlist rebuild | mapping; DIP 0019 already rebuilds playlists from swarmed segments |
| Relay client | `torlink` with the `iplive` extension | planned |
| Shared relay and gateway code | `@profullstack/pay2seed` (one package for the four protocols) | planned |

## 11. Conformance

A **hub** on this side: leases as §3, at least one presence proof per
period and pays only proven periods (§4), lists gateways per channel,
pushes `channel.voided` to relays and gateways.

A **relay**: `iplive` §12 as a relay, plus §7. A **gateway**: a relay,
plus §5.2, §5.3 in at least `clear` mode, §5.4, §5.5 and §5.6.

## 12. Version history

- 0.1 (2026-09-06): first draft, as the server half; leases per
  relay-hour with a gateway bonus, presence proofs and the served-bytes
  ratio, gateways with clear and sealed HLS, the M3U and EPG pair,
  gateway-bound vouchers, stopping on a void.
