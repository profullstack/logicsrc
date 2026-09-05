# ipname: Names for Publishers

Version: **0.1** (draft)
Status: draft. A thin bridge between the OpenSwarm core
([spec.md](./spec.md)) and the Moshpit registry. Nothing below is
implemented.

## 1. Scope

`ipname` answers one question: given a name a person can type, what
publisher key and what catalogue does it mean? It defines:

1. An `ipname.pin` record a publisher signs, served from the name's host.
2. A Moshpit registry pin kind, `openswarm`, that anchors that record.
3. A DNS TXT form for ordinary domains.
4. The `ip://` URL.

It does not define a naming system. Moshpit names exist (`label.tld`,
registry at `pit.moshcode.sh`) and DNS exists. `ipname` maps both to keys.

## 2. Terminology

| Term | Meaning |
| --- | --- |
| **name** | A Moshpit name (`chovy.hacker`) or a DNS host (`example.com`). |
| **pin** | In the Moshpit registry, `base64(SHA-256(SubjectPublicKeyInfo))` of a key, with a `kind`. |
| **openswarm pin** | A registry pin of kind `openswarm` over the publisher's Ed25519 SPKI (RFC 8410). |
| **name record** | The `ipname.pin` record at `/.well-known/openswarm.json`. |

## 3. The name record

```json
{
  "openswarm": "0.1",
  "type": "ipname.pin",
  "name": "chovy.hacker",
  "publisher": "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e",
  "feeds": [
    "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e/default",
    "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e/podcasts"
  ],
  "gateway": "https://gw.c0mpute.com",
  "hubs": ["https://coinpayportal.com/api/openswarm"],
  "mtp": "sK8m2eLwG4l3iF5oT9uYQ6c1Vb0nZxA7hE2dR8pJkLw=",
  "createdAt": "2026-09-05T18:30:00.000Z",
  "sigs": [
    {
      "alg": "ed25519",
      "key": "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e",
      "sig": "RGRH7pDpXYcagULqj+8z05pLH99Lc6yLmfdbYgtGeRpjX5l0NcT3QSq9AWBtLw+5+JJiKoZ3s4ty74q/zBSE8w=="
    }
  ]
}
```

| Field | Rule |
| --- | --- |
| `name` | The name this record is served for. A record served under a different host MUST be refused. |
| `publisher` | The key that signs the record and every feed it lists. |
| `feeds` | Feed references (`ipdb` §3.1). The first is the default. |
| `gateway` | An HTTP gateway that serves this publisher's swarms and `POST /db/query`. MAY be null. |
| `hubs` | Hubs the publisher sells passes through. |
| `mtp` | The publisher's MTP/1 pin, if it runs a Moshpit transport endpoint. MAY be null. |

The record is also put in `ipdb` under `name:<name>` in the default feed,
so a replica that has the feed can answer the reverse question: what names
does this key claim.

## 4. Resolution

### 4.1 Moshpit names

A Moshpit name has exactly two labels of letters and digits. The registry
holds a `target` host and a list of pins per name. `ipname` uses both:

1. `GET https://pit.moshcode.sh/api/moshpit/pins?name=chovy.hacker` returns
   `{ "name", "pins": [...], "target" }`. Pins are objects or strings
   depending on the registry version; the resolver looks for entries of
   kind `openswarm`.
2. Fetch `https://<target>/.well-known/openswarm.json` (through
   `moshpit-proxy` when the target is itself a Moshpit name, plain HTTPS
   when it is a clearnet host).
3. Compute `base64(SHA-256(SPKI(record.publisher)))` and require it to equal
   an `openswarm` pin. Verify the record signature. Require `record.name`
   to equal the queried name.

The registry pin is the anchor. The registry is not trusted for the key
itself; it is trusted to say which hash the name's owner registered, and
the owner's key is whatever hashes to that. This is the same argument
`moshpit-proxy` makes for TLS pins and `qrypt.chat` makes for `mtp` pins,
and the pin format is byte-identical so one registry field carries all
three kinds.

Writing the pin is one registry call by the name's owner:

```
POST https://app.moshcode.sh/api/moshpit/tlds/hacker/pins
Authorization: Bearer <MOSHPIT_API_KEY>
{ "label": "chovy", "pin": "base64...", "kind": "openswarm", "note": "OpenSwarm publisher key" }
```

`kind: "openswarm"` does not exist in the registry today; adding it is a
one-line change to the accepted kinds and is listed as an open question.

### 4.2 House policy: clearnet first

Moshpit's `prefer` rule applies unchanged: a name that resolves on the
public DNS root is a clearnet host by default, and the registry is
consulted only in `fallback` or `moshpit` mode. `ipname` MUST use
`@moshcoder/moshpit-resolve`'s `decideResolution` (or an equivalent) before
touching the registry, so that `example.com` is never redirected to a pit
record because someone claimed `.com` as an ending.

### 4.3 DNS hosts

For a clearnet host, the anchor is a TXT record:

```
_openswarm.example.com.  IN TXT  "v=openswarm1; key=ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e"
```

The resolver fetches `https://example.com/.well-known/openswarm.json` and
requires `record.publisher` to equal the TXT key. Without the TXT record
the resolver MAY accept the well-known record on the strength of TLS alone
and MUST report the lower assurance to the caller (`"anchor": "tls"`
rather than `"anchor": "dns"` or `"anchor": "moshpit"`).

### 4.4 Caching

A resolved name is cached for the shorter of 300 seconds and the registry's
own TTL, matching `moshpit-proxy`'s pin cache. A negative result is cached
for 5 seconds.

## 5. The ip URL

```
ip://<name or key>[/<feed>[/<key>]]
```

| Example | Meaning |
| --- | --- |
| `ip://chovy.hacker` | The publisher's default feed. |
| `ip://chovy.hacker/podcasts` | A named feed. |
| `ip://chovy.hacker/default/track:sha256:d6c3f8285b7871d6a400cba14408288a9acde679f12e1e7dc276f29ca7c493ff` | One record by `ipdb` key. |
| `ip://ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e` | The same publisher by key; no name resolution. |
| `ip://ed25519:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d?file` | A file by its file key: BEP 44 lookup, no feed. |

A gateway maps `ip://` to HTTPS: `https://<gateway>/ip/<name or key>/...`
with the same path. A `magnet:` link with `xs=urn:btpk:<file key>&s=ipfile`
is the BitTorrent-native equivalent of the last row and opens in any BEP 46
client, which then needs the `ipfile` extension to do anything with it.

## 6. Security notes

- **Registry compromise** can change a pin. A resolver that has seen a name
  before SHOULD keep the last verified publisher key and warn on change, the
  way `moshpit-proxy` handles a pin rotation with `MOSHPIT_PROXY_TOFU`.
- **Host compromise** can serve a different record, which fails the pin.
- **Name squatting** is the registry's problem, and only the ending owner
  can mint names under it.
- **Privacy**: resolving a name tells the registry which names a client
  asks about, as DNS does. A client that already holds a key never resolves.

## 7. Events

None. Name changes surface as `ipdb.entry.appended` for `name:<name>`.

## 8. Implementations

| Piece | Exists | Where | What is new |
| --- | --- | --- | --- |
| Registry with per-name pins of kind `tls` and `mtp` | Yes | `pit.moshcode.sh`, `moshpit_name_pins` | The `openswarm` kind |
| Pin lookup, cache, TOFU handling | Yes | `moshpit-proxy` `lib/pins.ts` | Reuse as the resolver's registry client |
| Clearnet-first decision | Yes | `@moshcoder/moshpit-resolve` | Called before any registry lookup |
| Name record, TXT form, `ip://` URL | No | | All of it |

## 9. Conformance

A resolver implements §4.1 to §4.4, refuses a record whose `name` or pin
does not match, and reports the anchor kind. A publisher serves the record
at the well-known path over HTTPS and keeps it in `ipdb`.

## 10. Version history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-09-05 | Initial draft. |
