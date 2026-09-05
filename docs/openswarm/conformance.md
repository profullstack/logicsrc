# OpenSwarm Conformance

Version: **0.1** (draft)

Conformance is claimed per **profile**. An implementation names the
profiles it meets; it does not have to meet all of them. Each profile is
a checklist over the member documents plus the fixture suite that will
ship with the reference implementation.

## 1. Profiles

| Profile | Who | Documents |
| --- | --- | --- |
| `core` | Anything that reads or writes records | spec.md |
| `publisher` | Creates manifests, tracks, titles, channels, feeds | spec, ipfile §3 and §8, ipdb §4, plus the media documents it emits |
| `seeder` | Serves `ipfile` pieces for payment | spec, ipfile §5 and §6, ippay §4.4 |
| `leecher` | Fetches and pays | spec, ipfile §5 and §10, ippay §3 and §4 |
| `keeper` | Grants keys | ipfile §5.5, ippay §5.4 |
| `gateway` | HTTP webseed, bridges, queries | ipfile §6.4, ippay §7, ipaudio §7, ipvideo §5, ipdb §6.3 |
| `hub` | Sells passes, redeems vouchers, pays out | ippay §3, §5, §6 |
| `origin` | Runs a live channel | iplive §3, §4, §6 |
| `relay` | Relays live segments | iplive §4, §5 |
| `viewer` | Watches live | iplive §7 |
| `replica` | Holds and queries feeds | ipdb §3, §5, §6 |
| `resolver` | Resolves names | ipname §4 |
| `cli` | The `ip` command | cli.md |

## 2. Checklists

### 2.1 `core`

- [ ] C1. Canonicalises with RFC 8785 and computes record ids per spec §3.3.
- [ ] C2. Verifies `ed25519` signatures with the domain prefix of spec §3.4.
- [ ] C3. Ignores `mldsa65` entries it cannot verify without failing the record.
- [ ] C4. Preserves unknown fields on round trip.
- [ ] C5. Derives file, feed, channel and box keys per spec §4 so that the
      fixture seed produces the fixture public keys.
- [ ] C6. Computes BEP 52 pieces roots and hybrid infohashes per spec §5
      matching the fixture torrent.
- [ ] C7. Reads and writes the BEP 44 pointer of spec §7.2.

### 2.2 `publisher`

- [ ] P1. Emits `ipfile.manifest` with both signatures, correct roots and a
      `keys.owner` the fixture seed can open.
- [ ] P2. Revisions increase `rev`, keep `fileId`, and metadata-only
      revisions keep `cipherRoot` and `keyId`.
- [ ] P3. Appends an `ipdb.entry` for every record it creates, with no
      sequence gap.
- [ ] P4. Media records reference only files it also published, with
      matching `size`.
- [ ] P5. Audio and video renditions are aligned (ipaudio §4.3, ipvideo §3.1).

### 2.3 `seeder`

- [ ] S1. Sends `hello` before any other `ipfile` message and refuses
      messages from a peer that has not.
- [ ] S2. Keeps a peer choked until a valid pass arrives, or treats it as
      vanilla per `policy.vanilla`.
- [ ] S3. Never exceeds the credit window unpaid; sends `credit` when it
      chokes for that reason.
- [ ] S4. Validates vouchers per ippay §4.4 including recomputing `usd`.
- [ ] S5. Rejects a voucher not signed to its own identity.
- [ ] S6. Serves the plaintext piece layer on `layer_req`.
- [ ] S7. Redeems the latest voucher per triple at the hub.

### 2.4 `leecher`

- [ ] L1. Verifies the manifest against the file key it started from.
- [ ] L2. Buys or reuses a pass in scope before sending `pass`.
- [ ] L3. Signs vouchers only for verified bytes, on the interval, with
      cumulative `bytes` and correct `usd`.
- [ ] L4. Verifies the piece layer against `plainRoot` before trusting an
      entry; verifies every decrypted piece.
- [ ] L5. Checks `sha256(key) == keyId` on every grant.
- [ ] L6. Sends `bye done`.

### 2.5 `keeper`

- [ ] K1. Grants only against a valid pass with the file in `grants`, or a
      delegating grant.
- [ ] K2. Seals to the requester's `box` from its `hello`.
- [ ] K3. Reports every grant to the hub.

### 2.6 `gateway`

- [ ] G1. Serves `/swarm/<infohashV2>/{manifest,layer,data}` with Range.
- [ ] G2. Applies the pass and voucher headers of ippay §7 and returns
      `X-OpenSwarm-Credit` on every 206.
- [ ] G3. If a keeper: audio and video bridges decrypt only for a valid pass.
- [ ] G4. If a replica: answers `POST /db/query` with `asOf`.

### 2.7 `hub`

- [ ] H1. Publishes a signed hub record at the well-known path.
- [ ] H2. Sells passes over x402 with the CoinPay v2 offer, binds the payer
      by `X-OpenSwarm-Payer`, and records nonce to resource.
- [ ] H3. Redeems vouchers with the arithmetic of ippay §4.2 and §5.3
      exactly; the fixture receipts match byte for byte.
- [ ] H4. Enforces the cap per pass across payees and returns `partial` and
      `cap-exceeded` correctly.
- [ ] H5. Records grants once per pass and file.
- [ ] H6. Pays out on schedule and emits the events of ippay §8.

### 2.8 `origin`, `relay`, `viewer`

- [ ] O1. Signs a head per announced unit, chained by `prev`.
- [ ] O2. Rotates the content key per epoch and announces one segment early.
- [ ] O3. Writes a final head with `live: false`.
- [ ] R1. Verifies a segment root against a signed head before forwarding.
- [ ] R2. Honours `window` and never serves below `live - buffer`.
- [ ] R3. Answers `deny rate` with the current head when full.
- [ ] V1. Drops to the live edge rather than stalling.
- [ ] V2. Vouchers every peer that served it.
- [ ] V3. Requests a new grant on `keyId` change.

### 2.9 `replica`

- [ ] D1. Verifies chains and embedded signatures; refuses a `subject`
      mismatch.
- [ ] D2. Detects forks and freezes state until resolved.
- [ ] D3. Replicates by segments and gossip.
- [ ] D4. Implements every query operator of ipdb §6.1.

### 2.10 `resolver`

- [ ] N1. Applies clearnet-first before any registry call.
- [ ] N2. Verifies the pin, the signature and the `name` match.
- [ ] N3. Reports the anchor kind.

## 3. Fixture suite

The reference implementation will publish, under `packages/openswarm/
fixtures/`, a deterministic set built from one seed:

| Fixture | Contents |
| --- | --- |
| `seed.json` | A 32-byte seed and every public key derived from it. |
| `file-small/` | A 3 MiB plaintext, its content key, ciphertext, piece layers, hybrid `.torrent`, and manifest. |
| `records/` | One valid record of every registered type, plus one invalid variant each (bad signature, bad chain, bad `usd`). |
| `session.jsonl` | A scripted `ipfile` session: handshake dicts, `hello`s, pass, three vouchers, grant, in order. |
| `receipts.json` | The receipts a hub must return for `session.jsonl`. |
| `queries.json` | Queries over `records/` and their exact results. |
| `names.json` | Registry responses and the expected resolutions, including a pin mismatch. |

A profile is conformant when every checklist item is met and the relevant
fixtures pass. Until the reference implementation exists, the checklists
are the whole of conformance, and a claim is a claim.

## 4. Interoperability

As with OpenCreds, a round trip inside one implementation proves only that
the code agrees with itself. The interop test that matters is: a swarm
seeded by implementation A, paid for by a leecher from implementation B,
with vouchers redeemed at hub C, decrypts to `plainRoot`. The first three
implementations to exist should be tested that way before any of them
claims 1.0.
