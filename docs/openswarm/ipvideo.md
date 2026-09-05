# ipvideo: Video on Demand on ipfile Swarms

Version: **0.1** (draft)
Status: draft. Extends the OpenSwarm core ([spec.md](./spec.md)) and rides
on [ipfile](./ipfile.md), [ippay](./ippay.md) and [ipdb](./ipdb.md).
Nothing below is implemented.

## 1. Scope

`ipvideo` defines the records that make a set of `ipfile` swarms playable
as a film, an episode or a clip:

1. A **title**: renditions (CMAF fragmented MP4, one `ipfile` each), a
   segment index, subtitles, thumbnails, chapters, artwork.
2. **Playback rules**: segment-aligned adaptive bitrate over pieces, MSE in
   the browser.
3. A **gateway bridge** that renders HLS for players that speak nothing
   else.
4. **Transcode on c0mpute**: how the renditions get made.

Bytes, keys, payment and discovery are `ipfile` and `ippay`. No new wire
messages.

### Non-goals

Live (that is `iplive`). Interactive video. Ad insertion (c0mpute's DAI
DIPs may reference a title; this document does not). DRM in the device
sense.

## 2. Terminology

| Term | Meaning |
| --- | --- |
| **rendition** | One encoding ladder step, stored as one `ipfile` in CMAF form. |
| **segment** | A fragmented MP4 `moof + mdat` pair, starting with a keyframe. |
| **init segment** | The `ftyp + moov` bytes a decoder needs before any segment. |
| **segment index** | The list of `{ t, d, o, l }` for every segment of a rendition. |
| **ladder** | The set of renditions of a title, aligned on segment boundaries. |

## 3. Data model

### 3.1 Title

```json
{
  "openswarm": "0.1",
  "type": "ipvideo.title",
  "publisher": "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e",
  "title": "The Interview",
  "kind": "movie",
  "series": null,
  "season": null,
  "episode": null,
  "year": 2026,
  "durationMs": 5400000,
  "language": "en",
  "artwork": {
    "poster": "ed25519:d2d05fcad07ecbee6ff87c95159ec9969fce6c0fb9f41ff78c2c07ebe8a06c94",
    "backdrop": null
  },
  "renditions": [
    {
      "id": "1080p",
      "container": "cmaf",
      "codecs": "avc1.640028,mp4a.40.2",
      "width": 1920,
      "height": 1080,
      "frameRate": 24,
      "bitrateKbps": 5000,
      "file": "ed25519:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d",
      "size": 3375000000,
      "init": { "o": 0, "l": 1524 },
      "segmentsFile": "ed25519:00bc9c01ca00938016e276fe5b5748cfe13fd02bc53cc651535682c8dd5c83be"
    },
    {
      "id": "480p",
      "container": "cmaf",
      "codecs": "avc1.64001e,mp4a.40.2",
      "width": 854,
      "height": 480,
      "frameRate": 24,
      "bitrateKbps": 1400,
      "file": "ed25519:d2d05fcad07ecbee6ff87c95159ec9969fce6c0fb9f41ff78c2c07ebe8a06c94",
      "size": 945000000,
      "init": { "o": 0, "l": 1498 },
      "segments": [
        { "t": 0, "d": 4000, "o": 1498, "l": 702113 },
        { "t": 4000, "d": 4000, "o": 703611, "l": 698402 }
      ]
    }
  ],
  "audio": [
    { "id": "en", "language": "en", "label": "English", "channels": 2, "default": true }
  ],
  "subtitles": [
    { "id": "en-cc", "language": "en", "kind": "captions", "format": "vtt", "file": "ed25519:c9f17d4eaf2b28122b46d111cef6697d2c3f708a19d4628bce5c0304481b355b" }
  ],
  "thumbnails": {
    "file": "ed25519:4b74eb43677e4d03af5fb0856333f9aa21d9a5a3bbf944b13aa7eef379c7a342",
    "vtt": "ed25519:ba8cd1a97b865a05cdc5840c63b086dd463624a831874c1ba0d7c4ce6f806f7a",
    "intervalMs": 10000
  },
  "chapters": [
    { "t": 0, "title": "Opening" },
    { "t": 1830000, "title": "The question" }
  ],
  "royalties": [],
  "createdAt": "2026-09-05T18:20:00.000Z",
  "sigs": [
    {
      "alg": "ed25519",
      "key": "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e",
      "sig": "RGRH7pDpXYcagULqj+8z05pLH99Lc6yLmfdbYgtGeRpjX5l0NcT3QSq9AWBtLw+5+JJiKoZ3s4ty74q/zBSE8w=="
    }
  ]
}
```

(The `480p` segment list is truncated to two entries; a real one has one
entry per segment.)

| Field | Rule |
| --- | --- |
| `kind` | `movie`, `episode`, `clip`, `trailer`. `series`, `season`, `episode` are set for `episode`. |
| `renditions[].container` | `cmaf` in this version: fragmented MP4 per ISO 23000-19, one segment per `moof`. |
| `renditions[].codecs` | RFC 6381 string as MSE `isTypeSupported` wants it. |
| `renditions[].file` | The `ipfile` manifest's file key. `size` MUST match. |
| `renditions[].init` | Byte range of the init segment within the plaintext. |
| `renditions[].segments` | Inline index, or `segmentsFile`: file key of a free `ipfile` (`keys.public` set) whose plaintext is the JSON array. Inline when under 64 KiB, file otherwise. |
| `segments[].t`, `d` | Presentation start and duration in ms. `o`, `l`: byte offset and length in the plaintext. |
| `audio` | Audio tracks muxed in the renditions. Alternate-language audio is a rendition with `codecs` of audio only and `video: false`. |
| `subtitles[].format` | `vtt` in this version. Each is a free `ipfile` unless the publisher prices it. |
| `thumbnails` | A sprite sheet `ipfile` and a WebVTT file mapping times to sprite regions, as hls.js and video.js expect. |
| `royalties` | As `ipaudio` §5. Empty means the whole publisher share goes to `payTo`. |

Every rendition MUST share the same `t` list. Every segment MUST start with
a keyframe. Segment duration SHOULD be 4000 ms, matching c0mpute's
live-stream DIP (`-hls_time 4`) so a recorded live stream and a VOD title
use one ladder.

### 3.2 Where records live

`ipdb` under `title:<id>` in the publisher's feed. Renditions, subtitles
and thumbnails are `ipfile` manifests in the same feed with
`meta.title = <title record id>`.

## 4. Playback

### 4.1 Segment to pieces

To play segment `s` of rendition `r`:

```
first piece = floor(s.o / pieceLength)
last piece  = floor((s.o + s.l - 1) / pieceLength)
```

Request those pieces; decrypt; verify against the plaintext piece layer;
slice `[s.o, s.o + s.l)`; append to the MSE `SourceBuffer` after the init
segment. With 1 MiB pieces and a 5 Mbps rendition a 4 s segment is about
2.5 MiB, so two to three pieces.

### 4.2 Adaptive bitrate

Switch at segment boundaries only. The next segment is fetched from the
rendition whose `bitrateKbps` is the highest below 0.8 times the measured
piece throughput over the last 10 seconds, with a two-segment hysteresis
before stepping up. Because `t` lists are shared, the MSE buffer stays
contiguous across a switch; a new init segment is appended before the
first segment of the new rendition, as in any CMAF player.

### 4.3 Buffering and priority

Hold 30 seconds ahead. Request the pieces for the next segment with
sequential priority (what media-streamer's `torrent.select` does for range
streaming today). Seeking to time `t`: find the segment with the largest
`t <= target`, drop outstanding requests, start there. A player MUST keep
sending vouchers for bytes received while seeking, including bytes it then
discards; discarded bytes were still served.

### 4.4 Browser

A browser peer is a WebTorrent client with the `ipfile` extension, a
WebCrypto AES-CTR decryptor, and MSE. This is bittorrented.com's player
with three additions and no server in the path. Where MSE is unavailable
(some iOS contexts), the gateway bridge in §5 applies.

## 5. Gateway bridge

A keeper gateway renders HLS from the title record:

```
GET /video/<title id>/master.m3u8
GET /video/<title id>/<rendition id>/index.m3u8
GET /video/<title id>/<rendition id>/data        (plaintext, Range)
Authorization: Bearer <base64url pass>
```

The media playlist uses `#EXT-X-MAP` for the init range and
`#EXT-X-BYTERANGE` for every segment against the single `data` URL, so the
gateway serves plaintext by range from decrypted pieces and never has to
split files. Subtitles become `#EXT-X-MEDIA` entries pointing at
`/file/<file key>/data`. Credit and voucher headers are as `ippay` §7; a
player that cannot send vouchers (a bare `<video>` tag) is limited to the
pass's first credit window unless the gateway is configured to trust the
pass for the title's full size.

HLS's own encryption (`EXT-X-KEY` with AES-128-CBC) is not used. The
gateway is a keeper; it decrypts. A publisher who does not want any
gateway holding a key does not delegate to one, and browser MSE is the
only path.

## 6. Transcode on c0mpute

`ip video publish <source> --ladder default` submits one c0mpute job per
rendition. The existing `ffmpeg.transcode` workload takes
`TranscodeSpec { codec, bitrate_bps, width, height, keyframe_interval,
hardware_pref, extra_ffmpeg_args }`; `ipvideo` adds `extra_ffmpeg_args`
that force CMAF output and a 4 s keyframe interval, and expects the result
to include the segment index. The proposed `ipvideo.transcode` workload
(`c0mpute.md` §3) is that: a wrapper whose `TranscodeResult` carries
`segments`, `init`, `codecs` and gapless-irrelevant fields, and whose
output is handed to `ip file add` on the worker so the rendition is seeded
from where it was made.

Default ladder:

| id | codecs | size | bitrate |
| --- | --- | --- | --- |
| `1080p` | `avc1.640028,mp4a.40.2` | 1920x1080 | 5000 kbps |
| `720p` | `avc1.64001f,mp4a.40.2` | 1280x720 | 2800 kbps |
| `480p` | `avc1.64001e,mp4a.40.2` | 854x480 | 1400 kbps |
| `360p` | `avc1.64001e,mp4a.40.2` | 640x360 | 800 kbps |
| `1080p-av1` | `av01.0.08M.08,opus` | 1920x1080 | 3000 kbps, optional |

## 7. Security and privacy

As `ipfile`. A segment index reveals segment sizes, which for a
constant-quality encode leak scene complexity over time; a publisher who
cares uses constant bitrate. Subtitle files are small free swarms and
reveal the dialogue to anyone; price them if that matters.

## 8. Events

| Type | Emitted by |
| --- | --- |
| `com.logicsrc.openswarm.ipvideo.title.published.v1` | publisher |
| `com.logicsrc.openswarm.ipvideo.transcode.completed.v1` | c0mpute worker |

## 9. Implementations

| Piece | Exists | Where | What is new |
| --- | --- | --- | --- |
| Browser WebTorrent player, MSE-compatible fMP4 output, HLS fallback, range seeking | Yes | `media-streamer` (`media-player-modal.tsx`, `transcoding.ts`, `/api/stream/hls`) | Piece decryption before MSE; the title record instead of `vod_titles` |
| Hardware ffmpeg transcode job with codec ladder | Yes | `c0mpute` (`c0mpute-transcode`, `TranscodeSpec`) | CMAF output flags and the segment index in the result |
| VOD catalogue with per-title price and pass window | Yes (central) | `media-streamer` `vod_titles`, `vod_providers` | The title record and `ipfile` pricing replace both tables |
| Thumbnail VTT, chapters, subtitle tracks | Partly | hls.js and video.js conventions | The record fields |
| Title record, segment index file, HLS bridge from records | No | | All of it |

## 10. Conformance

A player fetches by segment per §4.1, switches at boundaries per §4.2,
and vouchers for discarded bytes per §4.3. A publisher emits aligned
ladders with keyframe-aligned segments. A gateway implementing §5 renders
byte-range HLS and applies `ippay` §7.

## 11. Version history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-09-05 | Initial draft. |
