# ipaudio: Audio on ipfile Swarms

Version: **0.1** (draft)
Status: draft. Extends the OpenSwarm core ([spec.md](./spec.md)) and rides
on [ipfile](./ipfile.md), [ippay](./ippay.md) and [ipdb](./ipdb.md).
Nothing below is implemented.

## 1. Scope

`ipaudio` defines the records that make an `ipfile` playable as music or
speech:

1. A **track**: renditions (each one an `ipfile`), a seek index, gapless
   trim values, contributors and royalty split.
2. A **release**: an ordered set of tracks with artwork and release metadata.
3. **Streaming rules**: how a player maps time to pieces, buffers, switches
   bitrate and plays two tracks without a gap.
4. A **gateway bridge** for players that only speak HTTP.

Everything about bytes, keys, payment and discovery is `ipfile` and `ippay`.
This document adds no wire messages.

### Non-goals

A player. Loudness normalisation. A recommendation system. DRM beyond
`ipfile` key delivery. Radio (a continuous stream is `iplive`).

## 2. Terminology

| Term | Meaning |
| --- | --- |
| **rendition** | One encoding of a track, stored as one `ipfile`. |
| **anchor** | A `[timeMs, byteOffset]` pair at which decoding can start. |
| **seek index** | The list of anchors for a rendition. |
| **gapless trim** | Encoder delay and end padding in samples, so tracks join without silence. |

## 3. Data model

### 3.1 Track

```json
{
  "openswarm": "0.1",
  "type": "ipaudio.track",
  "publisher": "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e",
  "title": "Interview with Ada",
  "artist": "Ada",
  "artists": [{ "name": "Ada", "role": "primary" }],
  "durationMs": 2941200,
  "isrc": null,
  "language": "en",
  "artwork": "ed25519:d2d05fcad07ecbee6ff87c95159ec9969fce6c0fb9f41ff78c2c07ebe8a06c94",
  "renditions": [
    {
      "id": "opus-96",
      "codec": "opus",
      "container": "ogg",
      "bitrateKbps": 96,
      "sampleRate": 48000,
      "channels": 2,
      "file": "ed25519:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d",
      "size": 35294400,
      "gapless": { "encoderDelay": 312, "endPadding": 1216 },
      "index": [[0, 0], [2000, 24012], [4000, 48160], [6000, 72301]]
    },
    {
      "id": "flac",
      "codec": "flac",
      "container": "flac",
      "bitrateKbps": 0,
      "sampleRate": 48000,
      "channels": 2,
      "file": "ed25519:00bc9c01ca00938016e276fe5b5748cfe13fd02bc53cc651535682c8dd5c83be",
      "size": 734003200,
      "gapless": { "encoderDelay": 0, "endPadding": 0 },
      "index": [[0, 8192], [2000, 507904], [4000, 1007616], [6000, 1503232]]
    }
  ],
  "royalties": [
    { "label": "Ada", "network": "eip155:8453", "address": "0xCC3b072391AE7A8d10cF00DdC5F61DB2cA5541E5", "bps": 8000 },
    { "label": "Producer", "network": "eip155:8453", "address": "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf", "bps": 2000 }
  ],
  "createdAt": "2026-09-05T18:05:00.000Z",
  "sigs": [
    {
      "alg": "ed25519",
      "key": "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e",
      "sig": "RGRH7pDpXYcagULqj+8z05pLH99Lc6yLmfdbYgtGeRpjX5l0NcT3QSq9AWBtLw+5+JJiKoZ3s4ty74q/zBSE8w=="
    }
  ]
}
```

(`index` is truncated to four anchors here. A real one has one anchor per
two seconds of audio.)

| Field | Rule |
| --- | --- |
| `publisher` | Signs the record. MUST equal the `publisher` of every referenced `ipfile` manifest. |
| `durationMs` | Of the plaintext audio. |
| `artwork` | File key of an `ipfile` holding a JPEG or PNG. MAY be null. |
| `renditions[].codec` | One of `opus`, `aac`, `flac`, `mp3`. |
| `renditions[].container` | `ogg` for Opus, `mp4` for AAC (fragmented, CMAF), `flac`, `mp3`. |
| `renditions[].bitrateKbps` | Target bitrate; `0` for lossless. |
| `renditions[].file` | The `ipfile` manifest's file key. |
| `renditions[].size` | MUST equal that manifest's `size`. |
| `renditions[].gapless` | Samples to trim at the start and end, as the encoder reported. `0` for FLAC. |
| `renditions[].index` | Anchors, ascending by time, first at `[0, o]` where `o` is the byte offset of the first decodable unit after headers. |
| `royalties` | How the publisher's share of every voucher is split (§5). |

A track MUST have at least one rendition. Every rendition of a track MUST
have anchors at the same set of `timeMs` values (§4.3).

### 3.2 Release

```json
{
  "openswarm": "0.1",
  "type": "ipaudio.release",
  "publisher": "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e",
  "title": "Conversations, Volume 1",
  "artist": "Ada",
  "kind": "podcast",
  "releasedAt": "2026-09-05",
  "upc": null,
  "artwork": "ed25519:d2d05fcad07ecbee6ff87c95159ec9969fce6c0fb9f41ff78c2c07ebe8a06c94",
  "tracks": [
    {
      "position": 1,
      "subject": "sha256:d6c3f8285b7871d6a400cba14408288a9acde679f12e1e7dc276f29ca7c493ff",
      "feed": "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e/default"
    }
  ],
  "description": "Long-form interviews.",
  "createdAt": "2026-09-05T18:06:00.000Z",
  "sigs": [
    {
      "alg": "ed25519",
      "key": "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e",
      "sig": "RGRH7pDpXYcagULqj+8z05pLH99Lc6yLmfdbYgtGeRpjX5l0NcT3QSq9AWBtLw+5+JJiKoZ3s4ty74q/zBSE8w=="
    }
  ]
}
```

`kind` is one of `album`, `ep`, `single`, `podcast`, `audiobook`,
`compilation`. `tracks[].subject` is the record id of the track's first
revision, which is also its `ipdb` key (`track:<id>`), so a track can be
revised without breaking the release.

### 3.3 Where records live

Both records are `ipdb` entries in the publisher's feed under
`track:<id>` and `release:<id>`. The renditions are `ipfile` manifests under
`file:<file key>` in the same feed. A client that finds a release has
everything it needs in one feed.

## 4. Streaming

### 4.1 Time to pieces

To play from time `t` on rendition `r`:

```
anchor  = the last index entry with timeMs <= t
offset  = anchor.byteOffset
piece   = floor(offset / manifest.pieceLength)
```

Request pieces from `piece` onward in order. Decrypt each as it completes
(`ipfile` §4.1), verify against the plaintext piece layer, and feed the
decoder from `offset`. The first decodable unit is guaranteed at the anchor
because the index was built from container boundaries (Ogg page, MP4
fragment, MP3 frame, FLAC frame).

### 4.2 Buffering

A player SHOULD hold the pieces covering the next 30 seconds and request
the next piece when the buffer drops below 15 seconds. It SHOULD send
vouchers on the `ipfile` schedule regardless of playback state; a paused
player that has received bytes still owes for them.

With 256 KiB pieces and a 96 kbps rendition a piece is about 21 seconds of
audio. That is why `ipaudio` recommends 256 KiB: one piece is one buffer
step.

### 4.3 Adaptive bitrate

Because every rendition shares the same anchor times, a switch is: finish
the current anchor interval on rendition A, start the next interval on
rendition B from its anchor at the same `timeMs`. The publisher guarantees
alignment by encoding every rendition with the same segment duration
(2000 ms recommended). A player picks the highest `bitrateKbps` whose piece
download rate over the last 10 seconds exceeds 1.5 times the bitrate.

Switching renditions means joining a second swarm. The pass is per file, so
a pass scoped by `publishers` rather than `files` is what a player wants
(`ippay` §3.1).

### 4.4 Gapless

When track A ends and track B begins, the player trims `endPadding` samples
from A's decoded tail and `encoderDelay` samples from B's decoded head, and
concatenates the sample streams. It MUST have B's first piece decrypted
before A's last anchor interval starts, which means it holds a grant for B
already. A release player therefore requests the grant for track `n + 1`
when track `n` starts.

## 5. Royalties

An `ipfile` manifest names one `pricing.payTo` for the publisher's share.
`ipaudio` splits that share further with `royalties`: a list of recipients
and basis points summing to 10000. A hub applies the split when it can see
the track record for a file; the `ipfile` manifest's `meta.track` field
carries the track's record id so the hub can look it up in `ipdb`. Where
the hub cannot find the track, the whole publisher share goes to `payTo`
and a `com.logicsrc.openswarm.ippay.split.unresolved.v1` event is emitted.

A contributor is paid per byte served of any rendition of the track. That
is the whole royalty model: no plays counted, no per-stream rate, no
minimum. It is a consequence of `ippay`, not a separate system.

## 6. Publishing procedure

`ip audio publish <track.json>` where the input names source files:

1. For each rendition requested (`--renditions opus-96,flac`), transcode
   with ffmpeg or submit an `ipaudio.transcode` job to c0mpute
   (`c0mpute.md` §3). Record `encoderDelay` and `endPadding` from the
   encoder.
2. Build the seek index by walking container boundaries at 2000 ms steps.
3. `ip file add` each rendition with `--piece-length 262144`,
   `--meta.track <placeholder>`; collect file keys.
4. Write the track record, sign, `ip db put track:<id>`. Revise each
   rendition manifest's `meta.track` to the track id (metadata-only revision).
5. Optionally write or update a release.

## 7. Gateway bridge

A gateway that is also a keeper (holds the content key under a delegating
grant) MAY serve decrypted audio to pass holders:

```
GET /audio/<track record id>/<rendition id>
Authorization: Bearer <base64url pass>
Range: bytes=0-
```

It returns `206` with the plaintext bytes, `Content-Type` from the
container, `Accept-Ranges: bytes`, and `X-OpenSwarm-Credit` per `ippay` §7.
This is what lets a podcast app, a car, or bittorrented.com's existing
`<AudioPlayer>` (which plays a plain URL) consume an `ipaudio` track. The
gateway is the payee for those bytes and is paid by voucher like any
seeder; the client is the pass holder's HTTP library, which sends vouchers
in `X-OpenSwarm-Voucher`.

A gateway MAY also render an RSS 2.0 feed for a `podcast` release with
`<enclosure>` URLs of the form above, so a release is subscribable in any
podcast client that can send a bearer header, and previewable in any
client at all if the publisher sets `perGib` and `keyUsd` to zero.

## 8. Recommended encodings

| Rendition id | Codec | Container | Settings |
| --- | --- | --- | --- |
| `opus-64` | Opus | Ogg | 64 kbps VBR, 48 kHz, speech |
| `opus-96` | Opus | Ogg | 96 kbps VBR, 48 kHz |
| `opus-160` | Opus | Ogg | 160 kbps VBR, 48 kHz, music |
| `aac-128` | AAC-LC | fragmented MP4 | 128 kbps, for Safari and CarPlay |
| `flac` | FLAC | FLAC | Lossless, source sample rate |

Ogg Opus and FLAC carry their own seek structure; the index is still
REQUIRED so a player never has to read the container to find a piece.

## 9. Security and privacy

Nothing beyond `ipfile`. Two notes: a rendition list reveals bitrates and
sizes to anyone who has the track record, and a seek index reveals the
container's page structure; neither reveals audio. A publisher who does
not want the catalogue public uses a paid `ipdb` segment (`ipdb` §9).

## 10. Events

| Type | Emitted by |
| --- | --- |
| `com.logicsrc.openswarm.ipaudio.track.published.v1` | publisher |
| `com.logicsrc.openswarm.ipaudio.release.published.v1` | publisher |

Play counts are not events in this family. A client MAY report them to a
publisher's webhook as `com.logicsrc.openswarm.ipaudio.play.v1` with
`{ "track", "rendition", "ms" }`; nothing in the payment loop depends on it.

## 11. Implementations

| Piece | Exists | Where | What is new |
| --- | --- | --- | --- |
| Plain-URL audio player, range streaming, HLS fallback | Yes | `media-streamer` `<AudioPlayer>`, `/api/stream`, `/api/stream/hls` | The gateway bridge is what it would point at |
| Podcast catalogue and RSS | Yes | `p0dcasters.com`, `media-streamer` podcasts lib | Rendering RSS from a release record |
| Per-rendition transcode on the network | Yes (video) | `c0mpute` `ffmpeg.transcode` | An audio preset with gapless values in the result |
| Track and release records, seek index, gapless join, royalty split | No | | All of it |

## 12. Conformance

An `ipaudio` player maps time to pieces per §4.1, switches only at shared
anchors per §4.3, trims per §4.4, and holds a valid pass for every rendition
it fetches. A publisher emits records per §3 with aligned anchors. A gateway
implementing §7 applies `ippay` §7 headers.

## 13. Version history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-09-05 | Initial draft. |
