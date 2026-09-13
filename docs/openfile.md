# OpenFile

OpenFile is one file a publisher serves about the files it has published: what each one is, how big, how to fetch it over a swarm or over plain HTTP, how to verify the bytes, on what basis it may be distributed, what it costs, and who is holding it right now. A directory reads the publisher's own file instead of crawling the DHT for bare infohashes, a browser with no torrent client still gets the bytes, and the publisher stays the author of its own listing. It is the web-facing door onto an [OpenSwarm](/openswarm) `ipfile` swarm, and it works for a plain HTTP download too. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. A description of a file a directory will read, published so a publisher can serve one and any reader can read it.

Slug: `openfile`

## The problem

A file on a swarm is findable by its infohash and by nothing else. A DHT crawl sees forty million of them and can say what none of them are. OpenSwarm fixed the inside of the swarm: an `ipfile` manifest names the file, signs the price and the payout, and encrypts the pieces; `pay2seed` attaches consent and a README; `ipdb` replicates the catalogue between peers. What none of that gives a person with a browser, a search engine, or a directory is a URL to start from. The manifest lives on the DHT under a key, the catalogue is a feed found through the DHT, and a reader that speaks only HTTP is outside looking in.

The pieces exist. `/.well-known/` is where a host says things about itself. Gateways already serve swarm bytes as webseeds. What is missing is the one file that puts a publisher's catalogue where an HTTP reader can fetch it, in a shape every reader agrees on, so a file can be found instead of crawled.

## Terms

- A **publisher** is whoever put a file up and signed for it: a person, an organisation, an agent. Its **descriptor** is the file it serves about its files.
- A **file** is one published thing: a document, a recording, a dataset, a release, a bundle. On a swarm it is one `ipfile` manifest; over HTTP it is one URL.
- A **holder** is anything that currently has the bytes and will serve them: a seeder with a lease, a gateway, a peer.
- A **directory** is anything that reads descriptors and lists files across publishers: a search index, a database, a media site, an agent's own cache.
- A **reader** is anything that reads a descriptor: a directory, a person's terminal, a program, an agent.

## The descriptor

A publisher serves a JSON document at `/.well-known/openfile.json` on its own origin.

```json
{
  "publisher": {
    "name": "Dartmoor Field Recordings",
    "web": "https://dartmoor.example",
    "operator": "https://dartmoor.example/.well-known/openprofile.md",
    "key": "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e",
    "feed": "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e/default",
    "hubs": ["https://bittorrented.com/api/openswarm"]
  },
  "updated": "2026-09-13T06:00:00Z",
  "files": [
    {
      "id": "sha256:d6c3f8285b7871d6a400cba14408288a9acde679f12e1e7dc276f29ca7c493ff",
      "name": "interview-2026-09-05.flac",
      "url": "https://dartmoor.example/recordings/interview-2026-09-05",
      "descriptor": "https://dartmoor.example/recordings/interview-2026-09-05.openfile.json",
      "size": 734003200,
      "contentType": "audio/flac",
      "pieces": { "length": 1048576, "count": 700, "layer": "https://gw.c0mpute.com/swarm/4b74eb43677e4d03af5fb0856333f9aa21d9a5a3bbf944b13aa7eef379c7a342/layer" },
      "swarm": {
        "file": "ed25519:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d",
        "infohashV1": "sha1:a3ce2180413415d7cf4268fb892b8ffd539e8459",
        "infohashV2": "sha256:4b74eb43677e4d03af5fb0856333f9aa21d9a5a3bbf944b13aa7eef379c7a342",
        "manifest": "https://gw.c0mpute.com/swarm/4b74eb43677e4d03af5fb0856333f9aa21d9a5a3bbf944b13aa7eef379c7a342/manifest",
        "trackers": ["wss://tracker.openwebtorrent.com", "udp://tracker.opentrackr.org:1337/announce"],
        "private": false
      },
      "encryption": "ipfile",
      "fetch": [
        { "kind": "ipfile", "url": "magnet:?xs=urn:btpk:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d&s=ipfile" },
        { "kind": "webseed", "url": "https://gw.c0mpute.com/swarm/4b74eb43677e4d03af5fb0856333f9aa21d9a5a3bbf944b13aa7eef379c7a342/data" },
        { "kind": "http", "url": "https://gw.c0mpute.com/file/d6c3f8285b7871d6a400cba14408288a9acde679f12e1e7dc276f29ca7c493ff" },
        { "kind": "hls", "url": "https://gw.c0mpute.com/file/d6c3f8285b7871d6a400cba14408288a9acde679f12e1e7dc276f29ca7c493ff/index.m3u8" }
      ],
      "attestation": {
        "record": "sha256:8e1c4a0b9d2f7e6c5b4a3d2e1f0c9b8a7d6e5f4c3b2a1d0e9f8c7b6a5d4e3f2c",
        "basis": "own",
        "license": "CC-BY-4.0",
        "notice": "https://dartmoor.example/.well-known/pay2seed-notice"
      },
      "readme": "https://dartmoor.example/recordings/interview-2026-09-05/README.md",
      "price": { "amount": 0.5, "currency": "USD", "per": "key", "offer": "https://keys.dartmoor.example/openswarm/grant?file=0d87e09c" },
      "holders": "https://bittorrented.com/api/openswarm/files/d6c3f8285b7871d6a400cba14408288a9acde679f12e1e7dc276f29ca7c493ff/holders",
      "updated": "2026-09-13T06:00:00Z"
    }
  ]
}
```

The smallest valid descriptor is a publisher with a name and a file with a content hash and a name:

```json
{ "publisher": { "name": "Dartmoor Field Recordings" }, "files": [{ "id": "sha256:d6c3f828…c493ff", "name": "interview-2026-09-05.flac" }] }
```

The rules, and every one degrades:

1. **`publisher.name`, `files[].id` and `files[].name` are the only required keys.** A descriptor with those alone is valid. A reader lists what it was given and reports the rest as unstated rather than assumed.
2. **`files[].id` is the content hash of the plaintext**, `sha256:` and hex. For an `ipfile` swarm it is the manifest's `plainRoot`, so the id a reader gets here is the root the decrypted file verifies against. For a plain HTTP file it is the SHA-256 of the bytes. It is the dedupe key: two publishers serving the same bytes list the same id, and a directory that meets the same id twice has one file with two publishers, not two files.
3. **`publisher`** is who put it up. `web` is the site, `operator` the person or organisation answerable as an [OpenProfile.md](/openprofile) URL, `key` the OpenSwarm publisher key that signed the manifests, `feed` the `ipdb` feed a swarm reader can follow instead of polling this file, `hubs` the `ippay` hubs whose passes the publisher accepts. A publisher with no swarm has none of the last three.
4. **`updated`** on the descriptor is when anything in it last changed; **`updated`** on a file is when that file last changed and wins for that file. A reader with the descriptor's `updated` unchanged since its last fetch may skip the rest.
5. **`descriptor`** is the URL of the same file object served on its own, next to the file: `<name>.openfile.json`, or wherever the publisher puts it. A reader handed a single file's descriptor by that route has everything below without the listing.
6. **`size`, `contentType`, `pieces`** describe the bytes. `size` is the plaintext length in bytes. `pieces.length` is the piece length, a power of two; `pieces.count` follows from it; `pieces.layer` is where to fetch the plaintext piece layer, so a reader can verify each piece as it arrives rather than the whole at the end.
7. **`swarm`** is how a torrent client reaches it: the `ipfile` file key, both infohashes, where the signed manifest can be fetched over HTTP, the trackers, and whether the swarm is private. Absent means there is no swarm and `fetch` is the whole story.
8. **`encryption`** is `ipfile` or `none`. Absent means `ipfile`: a file on a swarm is ciphertext by default, and a publisher that wants anyone to read the bytes off the wire says `none` as an explicit act. It says nothing about HTTP fetches, which a gateway serves decrypted to a pass holder.
9. **`fetch`** is the list of ways to get the bytes, each `{kind, url}`, in the publisher's order of preference. `kind` is `ipfile` (a magnet for an OpenSwarm client), `magnet` (a vanilla magnet), `webseed` (BEP 19 ciphertext by range), `http` (the plaintext by range from a gateway, behind a pass when there is a price), `hls` (a media file as a standard playlist from a gateway, sealed when there is a price). A reader picks the first kind it speaks. A browser with nothing installed speaks `http` and `hls`, which is the point.
10. **`attestation`** is the consent the file was published under, as `pay2seed` defines it: the record id, the `basis` (`own`, `licensed`, `open-license`, `public-domain`, `personal`), the SPDX `license` when the basis is a licence, and the `notice` endpoint. A file with no attestation is listed as unattested, and a directory that requires consent does not list it.
11. **`readme`** is the URL of the swarm's `README.md`, the one `pay2seed` requires at the root of every listed swarm. A directory renders it as the file's page.
12. **`price`** is what the bytes or the key cost, or absent for free. `amount` and `currency` as ISO 4217; `per` is `key` (one grant, the `ipfile` `keyUsd`), `gib` (per GiB served, the `ipfile` `perGib`), or `fetch` (a flat price for an HTTP download). `offer` is a URL that answers `402` with an x402 offer, exactly as `ippay` sells a pass, so a reader with a wallet and no hub account can pay where it stands.
13. **`holders`** is a URL that answers with who has the bytes right now, or the same list inline. The shape is below.
14. **Unknown keys are kept.** A publisher says more than this document names, and a reader passes it through under the publisher's own key. `ipaudio`, `ipvideo` and any later member of the family put their record here.

Serve it as `application/json`. The descriptor is a claim; that it came from the publisher's own origin is one verification, and the manifest's signature by `publisher.key` is the other.

## Holders

A file is only as available as the machines holding it. `holders` answers the question a reader asks before it commits to a fetch:

```json
{
  "id": "sha256:d6c3f8285b7871d6a400cba14408288a9acde679f12e1e7dc276f29ca7c493ff",
  "updated": "2026-09-13T06:14:02Z",
  "holders": [
    { "kind": "seeder", "id": "ed25519:a41e…", "lease": "sha256:5c02…", "provenAt": "2026-09-13T06:00:05Z", "countries": ["DE"], "disk": "https://seeder-a41e.example/.well-known/opendisk.json" },
    { "kind": "gateway", "url": "https://gw.c0mpute.com", "seenAt": "2026-09-13T06:13:40Z", "countries": ["US"] },
    { "kind": "peer", "id": "ed25519:77aa…", "seenAt": "2026-09-13T05:58:11Z" }
  ]
}
```

- **`kind`** is `seeder` (holds a `paid2seed` lease and passed its last proof), `gateway` (serves the file over HTTP), or `peer` (was seen in the swarm; nothing is promised).
- **`provenAt`** is when a seeder last answered a storage challenge or probe; **`seenAt`** is when a gateway or peer was last reached. A reader shows the age and treats a holder older than one proof period as unknown.
- **`lease`** is the `paid2seed` lease record, so a reader can check the seeder's standing at the hub rather than take the list's word.
- **`disk`** is the holder's own [OpenDisk](/opendisk) descriptor when it serves one, so a reader that likes a holder can rent more of it.

The list is usually served by a hub, because the hub is what holds the leases and runs the proofs; `bittorrented.com` serves it for every swarm it lists. A publisher may inline a snapshot for a file it seeds itself. Either way the list is a claim about the moment it was made, and a reader that needs certainty fetches.

## Discovery

A reader finds a descriptor four ways, in this order:

1. `/.well-known/openfile.json` on the publisher's origin.
2. `<link rel="openfile" href="...">` in the HTML of a page about a file, or a `Link: <...>; rel="openfile"` header on the file itself or its page.
3. `<name>.openfile.json` next to the file, for a directory listing or a static site.
4. A URL handed to the reader directly.

A descriptor is **verified** when it was fetched from the same origin as `publisher.web`, or from `/.well-known/` on the origin the reader was pointed at. A file inside it is verified a second way when its `swarm.manifest` fetches, its first signature is by `swarm.file`, its second is by `publisher.key`, and its `plainRoot` equals `id`. A directory shows both facts. One found by the fourth route on some other host is a claim about the publisher by whoever hosts it, and a directory marks it so.

## Fetching and verifying

A conforming reader that wants the bytes:

1. Picks the first `fetch` entry whose `kind` it speaks.
2. Pays if there is a `price`: a swarm client buys a pass at one of `publisher.hubs`; an HTTP client requests `price.offer`, gets a `402` and an x402 offer, pays, and presents the pass as `Authorization: Bearer` on the gateway, as `ippay` §7 defines.
3. Fetches. Over `ipfile` it verifies each piece against the plaintext piece layer as `ipfile` §5.6 says. Over `http` it fetches the layer from `pieces.layer` and verifies each piece the same way, or hashes the whole and compares with `id` at the end when there is no layer.
4. Refuses bytes that fail either check, and says which holder served them.

Nothing in this is new. It is `ipfile` §10 written for a client that started from a URL instead of a key.

## Directories

A directory reading descriptors:

1. **Fetches on a schedule, daily at least**, and follows `publisher.feed` on the swarm when it can, because the feed is the same catalogue with a head a DHT `get` finds.
2. **Dedupes on `id`.** The same content hash from two publishers is one file with two listings, and a reader sees both names and both attestations.
3. **Keeps the publisher's words.** The `name`, the README, the extra keys. A directory normalises for search and displays what the publisher wrote.
4. **Lists nothing it could not verify from the origin or the manifest**, and marks which of the two it has.
5. **Shows the basis** beside every file it lists, as `paid2seed` §6.2 makes a seeder client show it. A reader knows whether it is looking at somebody's own work, an open licence, or a claim.
6. **Reports absence as absence.** An unstated price is free; an unstated attestation is unattested, not consented; an unstated holder list is unknown, not empty.

The first directory reading OpenFile is `bittorrented.com`, which today lists bare infohashes from a DHT crawl and will list consented swarms beside them with their README as the page. A file's `holders` there come from its own leases and probes. [nichedb.dev](https://nichedb.dev) lists holders that serve an OpenDisk descriptor in its hosting collection.

## What is deliberately absent

**No new swarm format.** The swarm is `ipfile`, the manifest is `ipfile`'s, the consent is `pay2seed`'s, the payment is `ippay`'s. This document is a JSON door onto records that already exist, so a publisher that already serves a swarm writes the file from what it has.

**No search.** A descriptor lists one publisher's files. Finding a file across publishers is a directory's job, and two directories reading the same descriptors list the same files.

**No trust score.** `verified` is a fact about where the file came from and who signed the manifest. `basis` is what the publisher claimed. Whether either is true is the reader's judgement, with the operator's profile and the notice endpoint as the place to start.

**No DRM.** A pass holder gets the key and the bytes, as `ipfile` says. A publisher that wants to control a device after delivery is reading the wrong specification.

**No product domain yet.** A directory and a marketplace for OpenFile is planned under a name not yet chosen. `bittorrented.com` is the reference reader until then.

## Serving one

By hand, from the manifests a publisher already signed. `ip file add` writes the swarm; the descriptor is the same fields, exported, at a fixed URL. A static site commits `openfile.json` next to `robots.txt` and one `<name>.openfile.json` beside each file.

## Related standards

- [OpenSwarm](/openswarm): `ipfile` for the swarm and manifest, `pay2seed` for the attestation and the README, `paid2seed` for leases and proofs, `ippay` for passes and the x402 offer, `ipdb` for the feed.
- [OpenDisk](/opendisk): what a holder serves about the disk it rents, and how a publisher buys more holders.
- [OpenServer](/openserver): how a gateway or a seeder is listed as a hosting offer.
- [OpenProfile.md](/openprofile): the `operator` behind a publisher.
- [OpenMCP](/openmcp): a directory that also serves its rows over MCP describes that door with an OpenMCP descriptor.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-13 | First publication: the descriptor, the per-file descriptor, holders, discovery, fetching and verifying, what a directory owes a publisher. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
