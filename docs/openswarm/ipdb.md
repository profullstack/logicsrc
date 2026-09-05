# ipdb: The Replicated Catalogue

Version: **0.1** (draft)
Status: draft. Extends the OpenSwarm core ([spec.md](./spec.md)). Nothing
below is implemented.

## 1. Scope

`ipdb` is the catalogue: the place a client asks "what is this swarm", "what
has this publisher released", "what is in this playlist". It defines:

1. A **feed**: a signed, hash-linked, append-only log owned by one key.
2. An **entry**: one log item that puts or deletes a record under a key.
3. **Heads**: how the latest state of a feed is announced on the DHT.
4. **Replication**: how feeds move between peers, as `ipfile` swarms and as
   gossip on swarm connections.
5. **Queries**: a JSON query shape a local replica and a gateway both answer.

It is a database of records, not of bytes. A manifest is in `ipdb`; the
file it describes is in an `ipfile` swarm.

### Non-goals

Multi-writer documents. A feed has one writer. Two people editing one
playlist is two feeds and a view over both, or a future CRDT record type.
Global search ranking. Consistency across feeds; each feed is consistent
with itself and that is all that is promised.

## 2. Terminology

| Term | Meaning |
| --- | --- |
| **feed** | A log identified by `(feed key, name)`. |
| **feed key** | An Ed25519 key. A publisher's default feed uses the publisher key itself. |
| **entry** | A record of type `ipdb.entry`, sequenced and chained. |
| **key** | A string unique within a feed that later entries overwrite. |
| **head** | The latest entry of a feed. |
| **segment** | A batch of entries stored as one file for replication. |
| **replica** | A peer holding some feeds, verified, queryable. |
| **follow** | A replica's decision to keep a feed current. |

## 3. Data model

### 3.1 Feed keys

The default feed is the publisher key with name `default`. Named feeds
derive from the publisher seed the same way files do:

```
feedSeed = HKDF-SHA256(ikm = publisher seed, salt = utf8(name), info = "openswarm:feed:v1")
feed key = Ed25519 keypair from feedSeed
```

A feed reference is written `ed25519:<hex>/<name>`; the default feed is
`ed25519:<hex>/default`. Names match `^[a-z0-9][a-z0-9-]{0,63}$`.

### 3.2 Entry

```json
{
  "openswarm": "0.1",
  "type": "ipdb.entry",
  "feed": "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e",
  "name": "default",
  "seq": 12,
  "prev": "sha256:ba8cd1a97b865a05cdc5840c63b086dd463624a831874c1ba0d7c4ce6f806f7a",
  "op": "put",
  "key": "file:ed25519:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d",
  "kind": "ipfile.manifest",
  "subject": "sha256:41d10f45e705e0526c9eeedf62b32dda3daaf552dd9b6a7b09e01776b05813bb",
  "record": {
    "openswarm": "0.1",
    "type": "ipfile.manifest",
    "file": "ed25519:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d",
    "rev": 1,
    "createdAt": "2026-09-05T18:00:00.000Z",
    "sigs": []
  },
  "createdAt": "2026-09-05T18:00:05.000Z",
  "sigs": [
    {
      "alg": "ed25519",
      "key": "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e",
      "sig": "RGRH7pDpXYcagULqj+8z05pLH99Lc6yLmfdbYgtGeRpjX5l0NcT3QSq9AWBtLw+5+JJiKoZ3s4ty74q/zBSE8w=="
    }
  ]
}
```

(The embedded manifest is abbreviated here; in a real entry it is the
complete record with its signatures.)

| Field | Rule |
| --- | --- |
| `feed`, `name` | The feed. The entry MUST be signed by `feed`. |
| `seq` | 1 for the first entry, then `prev.seq + 1`. |
| `prev` | Record id of entry `seq - 1`, or `null` for `seq` 1. |
| `op` | `put` or `del`. |
| `key` | The logical key. Convention: `<noun>:<identifier>`, e.g. `file:ed25519:...`, `track:sha256:...`, `playlist:my-mix`. |
| `kind` | The embedded record's `type`. Absent for `del`. |
| `subject` | The embedded record's id. Absent for `del`. A replica MUST recompute it and refuse a mismatch. |
| `record` | The complete embedded record. Absent for `del`. Its own signatures MUST verify. |

An entry is at most 256 KiB. A record larger than that is published as an
`ipfile` and the entry embeds an `ipfile.manifest` pointing at it, with
`kind` naming the payload type in `record.meta.kind`.

### 3.3 State

The state of a feed is the map `key -> latest put record` after applying
entries in `seq` order, with `del` removing the key. A replica exposes both
the log (for audit and replication) and the state (for queries). A record
that was overwritten stays in the log; that is what makes a manifest
revision history free.

Across feeds there is no merge. A query over several feeds returns matches
from each; the `feed` of every result is returned with it.

### 3.4 Head

```json
{
  "openswarm": "0.1",
  "type": "ipdb.head",
  "feed": "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e",
  "name": "default",
  "seq": 12,
  "head": "sha256:41d10f45e705e0526c9eeedf62b32dda3daaf552dd9b6a7b09e01776b05813bb",
  "segments": [
    { "from": 1, "to": 10, "file": "ed25519:d2d05fcad07ecbee6ff87c95159ec9969fce6c0fb9f41ff78c2c07ebe8a06c94" }
  ],
  "createdAt": "2026-09-05T18:00:05.000Z",
  "sigs": [
    {
      "alg": "ed25519",
      "key": "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e",
      "sig": "RGRH7pDpXYcagULqj+8z05pLH99Lc6yLmfdbYgtGeRpjX5l0NcT3QSq9AWBtLw+5+JJiKoZ3s4ty74q/zBSE8w=="
    }
  ]
}
```

`segments` lists the `ipfile` swarms that hold sealed ranges of the log
(§5.1). Entries after the last segment are fetched by gossip (§5.2).

## 4. Publishing

`ip db put <key> <record.json>` appends an entry. `ip file add` appends one
automatically under `file:<file key>` in the default feed. `ip audio
publish`, `ip video publish` and `ip live create` do the same for their
records. A publisher never edits a feed by hand; every tool that creates a
record appends it.

Rules for the writer:

- `seq` MUST be strictly sequential. A gap is a fork.
- Two entries with the same `seq` from the same feed are a **fork**. A
  replica that observes a fork MUST keep both, mark the feed forked from that
  `seq`, and stop applying either branch to state until the feed publishes
  an `ipdb.entry` with `op: "put"`, `key: "ipdb:resolve"`, and a record
  naming the surviving branch head. Forks happen when a seed is restored on
  two machines; they are detected, not prevented.
- A `del` of a key that was never put is valid and does nothing.

## 5. Replication

### 5.1 Segments as ipfile swarms

Every 1000 entries, or daily, the writer seals entries `from..to` as one
file: newline-delimited canonical JSON, one entry per line. It publishes the
file as an `ipfile` with `pricing.perGib` and `keyUsd` at `0.000000` and
`keys.public` set to the content key, so the swarm is readable by anyone
while staying an ordinary `ipfile` for seeders, gateways and c0mpute pin
jobs. The head lists the segment. Readers verify each line's chain as they
apply it, so a segment served by a stranger is safe.

### 5.2 Gossip on swarm connections

Peers that advertise `ipdb` in the BEP 10 handshake exchange heads on any
swarm connection:

| `t` | Payload | Meaning |
| --- | --- | --- |
| `heads` | `{ "f": [ { "k": <32 bytes>, "n": string, "s": int } ] }` | Feeds I follow and the seq I have. At most 64 per message. |
| `entries_req` | `{ "k": <32 bytes>, "n": string, "from": int, "to": int }` | Send me entries in the range. At most 100. |
| `entries` | `{ "r": [bytes] }` | Entries as JSON, in seq order. |
| `head` | `{ "r": bytes }` | An `ipdb.head` record, when the sender has a newer one. |

A peer sends `heads` once after `hello` and again whenever a followed feed
advances. A peer that receives a `heads` with a higher `s` for a feed it
follows sends `entries_req`. Gossip fills the tail after the last segment
and keeps replicas close to real time without any peer being special.

### 5.3 DHT announcement

The head is a BEP 44 mutable item (core §7.3):

```
k    = feed key
salt = "ipdb:" + name
seq  = head seq
v    = bencoded { "h": <head record id, 32 bytes>, "s": <seq> }
```

A client with only a feed reference does `get` on the DHT, obtains `h`,
then asks any peer or gateway for the head record by id, then segments and
tail. A gateway also serves `GET /db/feeds/<key>/<name>/head`.

### 5.4 Following

`ip db follow ed25519:<hex>/default` marks a feed followed: the replica
keeps its head current by DHT polling (every 10 minutes, or on `head`
gossip), fetches segments, and applies entries. A c0mpute node with role
`index` follows every feed it is paid to follow (`c0mpute.md` §3).

## 6. Queries

### 6.1 Shape

```json
{
  "type": "ipaudio.track",
  "feeds": ["ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e/default"],
  "where": [
    ["record.artist", "==", "Ada"],
    ["record.durationMs", ">=", 120000]
  ],
  "orderBy": [["record.createdAt", "desc"]],
  "limit": 20,
  "cursor": null
}
```

| Field | Rule |
| --- | --- |
| `type` | The embedded record type to match. REQUIRED. |
| `feeds` | Feed references to search. `null` means every followed feed. |
| `where` | Conjunction of `[path, op, value]`. Paths dot into the entry; `record.` reaches the embedded record. |
| `orderBy` | List of `[path, "asc"|"desc"]`. |
| `limit` | 1 to 200. |
| `cursor` | Opaque, from a previous result. |

Operators: `==`, `!=`, `<`, `<=`, `>`, `>=`, `in`, `contains` (array
membership or substring), `prefix`. No joins, no aggregation in 0.1; a
rating average is computed by the caller from the entries it gets back.

### 6.2 Result

```json
{
  "results": [
    {
      "feed": "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e/default",
      "key": "track:sha256:d6c3f8285b7871d6a400cba14408288a9acde679f12e1e7dc276f29ca7c493ff",
      "seq": 14,
      "subject": "sha256:d6c3f8285b7871d6a400cba14408288a9acde679f12e1e7dc276f29ca7c493ff",
      "record": { "openswarm": "0.1", "type": "ipaudio.track", "sigs": [] }
    }
  ],
  "cursor": "eyJzZXEiOjE0fQ",
  "asOf": { "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e/default": 27 }
}
```

`asOf` reports the head seq of each feed the answer was computed from, so a
caller can tell a stale replica from an empty one.

### 6.3 Over HTTP

`POST /db/query` on a gateway with the query as the body. A gateway MAY
require a pass (`Authorization: Bearer`) and MAY sell one over x402 for
queries the way a hub sells swarm passes; the reference price is
`0.000100` USD per query. A public gateway with no charge is the common case
and is what bittorrented.com's `/dht` browse would become for `ipfile`
swarms it can resolve.

## 7. Record kinds carried

`ipdb` carries any record type. These are the ones the family defines and
the keys they use:

| Kind | Key convention | Defined in |
| --- | --- | --- |
| `ipfile.manifest` | `file:<file key>` | ipfile |
| `ipaudio.release` | `release:<record id of first revision>` | ipaudio |
| `ipaudio.track` | `track:<record id of first revision>` | ipaudio |
| `ipvideo.title` | `title:<record id of first revision>` | ipvideo |
| `iplive.channel` | `channel:<channel key>` | iplive |
| `ipname.pin` | `name:<moshpit name>` | ipname |
| `ipdb.playlist` | `playlist:<slug>` | this document §7.1 |
| `ipdb.rating` | `rating:<subject record id>` | this document §7.2 |

### 7.1 Playlist

```json
{
  "openswarm": "0.1",
  "type": "ipdb.playlist",
  "slug": "late-night",
  "title": "Late night",
  "items": [
    { "kind": "ipaudio.track", "subject": "sha256:d6c3f8285b7871d6a400cba14408288a9acde679f12e1e7dc276f29ca7c493ff", "feed": "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e/default" }
  ],
  "createdAt": "2026-09-05T19:00:00.000Z",
  "sigs": []
}
```

A playlist item references a record by id and the feed it was found in, so
a reader can fetch it even if the playlist author's replica is gone. The
media-streamer `collections` table maps onto this one to one.

### 7.2 Rating

```json
{
  "openswarm": "0.1",
  "type": "ipdb.rating",
  "subject": "sha256:d6c3f8285b7871d6a400cba14408288a9acde679f12e1e7dc276f29ca7c493ff",
  "value": 4,
  "createdAt": "2026-09-05T19:05:00.000Z",
  "sigs": []
}
```

`value` is 1 to 5. One rating per subject per feed, by the key convention.
An aggregate is `query type ipdb.rating where record.subject == ...` over
the feeds a caller trusts; a gateway MAY cache the count and mean.

## 8. Local storage

A replica stores entries in a local database. The reference layout is
SQLite with tables `feeds(key, name, seq, head, forked_at)`,
`entries(feed, name, seq, id, prev, op, key, kind, subject, json)`,
`state(feed, name, key, seq, kind, subject)`, and one FTS table over
`record.title`, `record.artist`, `record.name` for the `contains`
operator. This is the layout the `ip` CLI would use; a gateway on Postgres
does the same with jsonb. Nothing in the wire depends on it.

## 9. Security notes

- **Authenticity.** Every entry is signed by the feed key and chained. A
  replica cannot insert, reorder or drop an entry without breaking the chain
  to the announced head.
- **Freshness.** The DHT head carries `seq`; BEP 44 refuses a lower `seq`.
  A replica that shows an old head is stale, not lying, and `asOf` says so.
- **Embedded records** verify on their own signatures. A feed cannot put
  someone else's manifest under its own key and have it trusted as theirs;
  the manifest's `publisher` signature is the authority, the feed entry is
  the announcement.
- **Spam.** A gateway that follows any feed anyone asks for will be filled.
  Following is a decision; `c0mpute` index jobs are paid per followed feed
  for that reason.
- **Privacy.** A feed is public by construction. A private catalogue is a
  segment published as a paid `ipfile` (no `keys.public`), and the entries
  are then readable only by pass holders. The head still reveals the seq.

## 10. Events

| Type | Emitted by |
| --- | --- |
| `com.logicsrc.openswarm.ipdb.entry.appended.v1` | writer |
| `com.logicsrc.openswarm.ipdb.head.published.v1` | writer |
| `com.logicsrc.openswarm.ipdb.fork.detected.v1` | replica |

## 11. Implementations

| Piece | Exists | Where | What is new |
| --- | --- | --- | --- |
| Infohash catalogue with browse and search | Yes (central) | `media-streamer` `dht_torrents`, `/api/dht/browse`, `services/dht-search-api` | Learning what an infohash is from a signed feed instead of BEP 9 names |
| Collections, playlists, favourites | Yes (central) | `media-streamer` `collections`, `collection_items` | The `ipdb.playlist` record as the portable form |
| Signed append-only log | Partly | Moshpit `moshpit_tld_log` (server side, `seq` cursor) | The feed as a client-verifiable chain with DHT heads |
| Entry, head, segments, gossip, query shape | No | | All of it |

## 12. Conformance

A replica verifies chains and embedded signatures per §3, detects forks
per §4, replicates by segments and gossip per §5, and answers every
operator in §6.1. A writer never emits a gap. A gateway serves `POST
/db/query` and the head route in §5.3.

## 13. Version history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-09-05 | Initial draft. |
