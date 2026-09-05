# ippay: Passes, Vouchers and Settlement

Version: **0.1** (draft)
Status: draft. Extends the OpenSwarm core ([spec.md](./spec.md)). The x402
half exists (`@profullstack/x402-gateway`, CoinPay); the pass and voucher
half does not.

## 1. Scope

`ippay` defines how money moves in an OpenSwarm swarm:

1. A **pass**: a hub-signed record that lets one payer spend up to a cap on
   named files, bought over x402 in USDC.
2. A **voucher**: a payer-signed, cumulative IOU to one payee for verified
   bytes, exchanged on the swarm wire or over HTTP.
3. A **hub**: the settlement service that sells passes, redeems vouchers,
   splits the value between publisher, payee and itself, and pays out.
4. **Reputation**: the minimum a hub records so a seeder can bound its risk.

It reuses the x402 v2 offer and proof exactly as CoinPay speaks them and as
`x402-gateway` already sells crawl passes. It does not define a token, a
chain, or an on-chain payment channel.

### Non-goals

Trustless settlement. A hub is trusted to pay out what it accepted, the way
a payment processor is. Anyone may run a hub; a manifest lists which hubs a
publisher trusts. Per-request on-chain payments: a 16 KiB block is worth
about 0.00000015 USD at the reference price, and no chain settles that.

## 2. Terminology

| Term | Meaning |
| --- | --- |
| **payer** | The identity that bought a pass and signs vouchers. Usually a leecher or viewer. |
| **payee** | The identity a voucher is signed to. A seeder, relay, keeper or gateway. |
| **cap** | The most a pass can spend across all payees. |
| **standing** | The hub's record of a payer's or payee's behaviour. |

## 3. Passes

### 3.1 Record

```json
{
  "openswarm": "0.1",
  "type": "ippay.pass",
  "hub": "ed25519:c9f17d4eaf2b28122b46d111cef6697d2c3f708a19d4628bce5c0304481b355b",
  "payer": "ed25519:00bc9c01ca00938016e276fe5b5748cfe13fd02bc53cc651535682c8dd5c83be",
  "scope": {
    "files": ["ed25519:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d"],
    "publishers": []
  },
  "capUsd": "2.000000",
  "grants": ["ed25519:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d"],
  "paidUsd": "2.500000",
  "payment": {
    "network": "eip155:8453",
    "nonce": "0x2f0a9c1b8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a"
  },
  "issuedAt": "2026-09-05T18:00:40.000Z",
  "expiresAt": "2026-10-05T18:00:40.000Z",
  "createdAt": "2026-09-05T18:00:40.000Z",
  "sigs": [
    {
      "alg": "ed25519",
      "key": "ed25519:c9f17d4eaf2b28122b46d111cef6697d2c3f708a19d4628bce5c0304481b355b",
      "sig": "RGRH7pDpXYcagULqj+8z05pLH99Lc6yLmfdbYgtGeRpjX5l0NcT3QSq9AWBtLw+5+JJiKoZ3s4ty74q/zBSE8w=="
    }
  ]
}
```

| Field | Rule |
| --- | --- |
| `hub` | The hub's signing key. A seeder verifies the signature against the key in the hub record (§6.1), fetched once and cached. |
| `payer` | The identity that will sign vouchers. Bound at purchase time (§3.3). |
| `scope.files` | File keys this pass may spend on. `["*"]` means any file whose manifest lists this hub. |
| `scope.publishers` | Publisher keys; any file by one of them is in scope. Either list MAY be empty; at least one MUST be non-empty. |
| `capUsd` | Spending cap across all vouchers. |
| `grants` | Files for which `keyUsd` was paid. A pass buys one grant per listed file. |
| `paidUsd` | What was paid: `capUsd` plus each granted file's `keyUsd`. |
| `payment.nonce` | The EIP-3009 nonce of the proof that bought it. Lets the pass be traced to a settlement. |
| `expiresAt` | Hubs SHOULD issue 30 day passes. Unspent cap is not refunded in 0.1. |

A pass is self-contained. Presented over HTTP it is
`Authorization: Bearer <base64url(canonical JSON of the record including sigs)>`.
A verifier needs the hub's public key and a clock; no round trip.

### 3.2 Purchase over x402

A client asks the hub for a pass. The hub answers 402 with CoinPay's x402 v2
offer. The client pays and retries. This is the same exchange
`@profullstack/x402-gateway` runs for `/crawl`.

```
GET /passes?payer=00bc9c01ca00938016e276fe5b5748cfe13fd02bc53cc651535682c8dd5c83be
           &file=0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d
           &cap=2.000000&grant=1
Host: coinpayportal.com
Accept: application/json
```

```
HTTP/1.1 402 Payment Required
Content-Type: application/json; charset=utf-8
Cache-Control: no-store
Vary: Accept, X-Payment

{
  "x402Version": 2,
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "amount": "2500000",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo": "0xCC3b072391AE7A8d10cF00DdC5F61DB2cA5541E5",
      "resource": "https://coinpayportal.com/api/openswarm/passes?payer=00bc9c01ca00938016e276fe5b5748cfe13fd02bc53cc651535682c8dd5c83be&file=0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d&cap=2.000000&grant=1",
      "description": "OpenSwarm pass: 2.000000 USD cap plus 1 key grant",
      "mimeType": "application/json",
      "maxTimeoutSeconds": 300,
      "extra": { "name": "USD Coin", "version": "2" }
    }
  ],
  "pass": { "capUsd": "2.000000", "keyUsd": "0.500000", "expiresInDays": 30 }
}
```

`amount` is in the asset's smallest unit: 2.5 USDC is `2500000`. The client
signs an EIP-3009 `transferWithAuthorization` for that amount to `payTo`
(the `@profullstack/x402-client` `pay()` call, or CoinPay Wallet in a
browser) and retries with the proof:

```
GET /passes?payer=...&file=...&cap=2.000000&grant=1
X-PAYMENT: <base64 JSON proof>
PAYMENT-SIGNATURE: <same, v2 header name>
```

The hub calls CoinPay `/api/x402/verify` with `expected: { amount, resource,
payTo, asset }` from the entry it offered, then `/api/x402/settle`. On
`settled: true` it returns `200` with the pass record as the body and
`X-OpenSwarm-Pass: <base64url record>` as a header. A replayed proof returns
the pass it already bought, with `replayed: true` in a wrapper, and never a
second pass.

The `payer` key is in the resource URL on purpose. EIP-3009 cannot bind a
resource; a proof for one resource can be presented for another from the
same merchant at the same or lower price. The hub therefore records
`nonce -> resource` at verify time and refuses a nonce for any other
resource, which closes the gap for passes.

### 3.3 Binding the payer

The pass names an Ed25519 `payer`. The buyer proves control of it by signing
the request: header `X-OpenSwarm-Payer: <base64 Ed25519 signature over
"openswarm:passreq:v1" || resource URL>`. Without it the hub MUST refuse to
issue; otherwise anyone who observed a proof could bind the pass to their
own key.

### 3.4 Direct key purchase

A key service (`ipfile` §5.5, URL mode) MAY sell a grant without a hub: its
402 offers `keyUsd` alone. That is a publisher running the x402-gateway
pattern on its own key endpoint. It gets no per-byte income that way; it is
the choice for a publisher who pays for distribution with free webseeds.

## 4. Vouchers

### 4.1 Record

```json
{
  "openswarm": "0.1",
  "type": "ippay.voucher",
  "pass": "sha256:39655de63a29b02c90b236fa870fe6f8dfad1f52a8119fe4df85e88cd6ab02fd",
  "payer": "ed25519:00bc9c01ca00938016e276fe5b5748cfe13fd02bc53cc651535682c8dd5c83be",
  "payee": "ed25519:d2d05fcad07ecbee6ff87c95159ec9969fce6c0fb9f41ff78c2c07ebe8a06c94",
  "file": "ed25519:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d",
  "swarm": "sha256:4b74eb43677e4d03af5fb0856333f9aa21d9a5a3bbf944b13aa7eef379c7a342",
  "seq": 3,
  "bytes": 268435456,
  "usd": "0.002500",
  "createdAt": "2026-09-05T18:04:02.000Z",
  "sigs": [
    {
      "alg": "ed25519",
      "key": "ed25519:00bc9c01ca00938016e276fe5b5748cfe13fd02bc53cc651535682c8dd5c83be",
      "sig": "RGRH7pDpXYcagULqj+8z05pLH99Lc6yLmfdbYgtGeRpjX5l0NcT3QSq9AWBtLw+5+JJiKoZ3s4ty74q/zBSE8w=="
    }
  ]
}
```

| Field | Rule |
| --- | --- |
| `pass` | Record id of the pass. |
| `payer` | MUST equal the pass's `payer`. The signature MUST be by this key. |
| `payee` | The identity being paid. From the peer's `hello`. |
| `file`, `swarm` | The file key and `infohashV2` the bytes belong to. |
| `seq` | Starts at 1 per (pass, payee, swarm) and increases by one. |
| `bytes` | Cumulative verified ciphertext bytes received from this payee on this swarm under this pass. Never decreases. |
| `usd` | Cumulative value, computed per §4.2 from `bytes` and the manifest's `perGib`. |

A voucher is cumulative, so only the latest one per (pass, payee, swarm)
matters. A payee stores the latest and discards the rest. Redemption is one
record per triple, however long the session was.

### 4.2 Value

```
perGibMicro = perGib * 1_000_000            (exact: the string has 6 places)
usdMicro    = floor(bytes * perGibMicro / 2^30)
usd         = usdMicro formatted with 6 places
```

Integer arithmetic only. For `perGib = "0.010000"` and `bytes = 268435456`
(256 MiB): `268435456 * 10000 / 1073741824 = 2500`, so `"0.002500"`. A
payee MUST recompute `usd` and reject a voucher whose `usd` differs from the
computed value, so a payer cannot understate by editing the number.

### 4.3 Exchange

On the swarm wire a voucher travels in the `ipfile` `voucher` message
(`ipfile` §5.2) or the `iplive` `voucher` message. Over HTTP it travels as
`X-OpenSwarm-Voucher: <base64url record>` on the request that would push
unpaid bytes past the interval (§7).

### 4.4 Validation by the payee

1. Signature by `payer`; `payer` equals the pass's payer.
2. Pass signature by a hub in the manifest's `pricing.hubs`, pass not
   expired, file in scope.
3. `payee` is this peer. `swarm` is this swarm.
4. `seq` is exactly previous `seq + 1` (or 1 for the first).
5. `bytes` is at least previous `bytes` and at most bytes actually served.
6. `usd` recomputes.

A voucher failing 1 to 4 or 6 is rejected with `voucher-invalid`. One
failing 5 by claiming too much is accepted at the served amount and the
excess is reported to the hub as `overclaim`. One claiming less than
previous is `voucher-stale`.

## 5. The hub

### 5.1 Hub record

Published at `GET <base>/.well-known/openswarm-hub.json`:

```json
{
  "openswarm": "0.1",
  "type": "ippay.hub",
  "key": "ed25519:c9f17d4eaf2b28122b46d111cef6697d2c3f708a19d4628bce5c0304481b355b",
  "name": "CoinPay",
  "base": "https://coinpayportal.com/api/openswarm",
  "networks": ["eip155:8453", "eip155:137", "eip155:1"],
  "assets": {
    "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "eip155:137": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    "eip155:1": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
  },
  "minHubBps": 300,
  "payout": { "minUsd": "1.000000", "schedule": "daily" },
  "passDays": 30,
  "createdAt": "2026-09-05T00:00:00.000Z",
  "sigs": [
    {
      "alg": "ed25519",
      "key": "ed25519:c9f17d4eaf2b28122b46d111cef6697d2c3f708a19d4628bce5c0304481b355b",
      "sig": "RGRH7pDpXYcagULqj+8z05pLH99Lc6yLmfdbYgtGeRpjX5l0NcT3QSq9AWBtLw+5+JJiKoZ3s4ty74q/zBSE8w=="
    }
  ]
}
```

The record is self-signed; trust in the hub key comes from the manifest that
lists the hub's `base`, from TLS to that base, and optionally from an MTP/1
pin. `minHubBps` is the least `split.hubBps` a manifest may set for this hub
to sell passes for it.

### 5.2 API

All bodies are JSON. Records are verified on receipt.

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `GET /.well-known/openswarm-hub.json` | none | Hub record. |
| `GET /passes?payer&file|publisher&cap&grant` | x402 + `X-OpenSwarm-Payer` | Buy a pass (§3.2). |
| `GET /passes/<id>` | none | `{ "pass", "spentUsd", "grantsUsed": [...], "status": "active|expired|revoked" }`. |
| `POST /vouchers` | none | Body: one voucher or an array. Returns receipts (§5.3). |
| `POST /grants` | none | Body: `{ "grant": <record without sealed>, "manifest": <record> }`. Keeper reports a grant. |
| `POST /payees` | signed | Body: `{ "payee", "payTo": { "network", "address" }, "sig" }`, `sig` by the payee key over `"openswarm:payee:v1" || address`. |
| `GET /payees/<key>` | none | `{ "payTo", "balanceUsd", "paidOutUsd", "standing" }`. |
| `GET /payers/<key>/standing` | none | `{ "passes", "overclaims", "capExceeded", "freeloads", "since" }`. |
| `POST /reports` | signed | `{ "kind": "freeload", "payer", "swarm", "unpaidBytes", "reporter", "sig" }`. |
| `POST /webhooks` | publisher signed | Register a CloudEvents endpoint for a publisher key. |

### 5.3 Redemption and receipts

For each voucher the hub:

1. Validates §4.4 steps 1, 2 and 6 (it cannot check 3 to 5; those were the
   payee's job, and the payee signed nothing, so an inflated voucher only
   hurts the payer).
2. Loads the latest accepted voucher for the triple. Accepts only the
   increase in `usd` since it, so re-submitting an old voucher pays nothing.
3. Applies the cap: `spentUsd + increase <= capUsd`. If not, accepts the
   remainder up to the cap with status `partial`, or `cap-exceeded` if
   nothing remains.
4. Fetches the manifest for `file` (from `ipdb`, a gateway, or the DHT) and
   applies `split`.
5. Credits the payee, the publisher's `payTo`, and itself.
6. Returns a receipt:

```json
{
  "openswarm": "0.1",
  "type": "ippay.receipt",
  "voucher": "sha256:d6c3f8285b7871d6a400cba14408288a9acde679f12e1e7dc276f29ca7c493ff",
  "pass": "sha256:39655de63a29b02c90b236fa870fe6f8dfad1f52a8119fe4df85e88cd6ab02fd",
  "payee": "ed25519:d2d05fcad07ecbee6ff87c95159ec9969fce6c0fb9f41ff78c2c07ebe8a06c94",
  "status": "accepted",
  "accepted": { "bytes": 268435456, "usd": "0.002500" },
  "split": { "publisherUsd": "0.001750", "payeeUsd": "0.000625", "hubUsd": "0.000125" },
  "createdAt": "2026-09-05T18:10:00.000Z",
  "sigs": [
    {
      "alg": "ed25519",
      "key": "ed25519:c9f17d4eaf2b28122b46d111cef6697d2c3f708a19d4628bce5c0304481b355b",
      "sig": "RGRH7pDpXYcagULqj+8z05pLH99Lc6yLmfdbYgtGeRpjX5l0NcT3QSq9AWBtLw+5+JJiKoZ3s4ty74q/zBSE8w=="
    }
  ]
}
```

Split arithmetic is in micro-USD, integer, with the remainder after
`floor` for each share going to the publisher. `2500 * 7000 / 10000 = 1750`,
`2500 * 2500 / 10000 = 625`, `2500 * 500 / 10000 = 125`.

### 5.4 Key grants

`POST /grants` lets a keeper collect `keeperBps` of `keyUsd` and marks the
grant on the pass as used. The hub verifies the grant signature is by the
file key or a keeper in the manifest, that the pass listed the file in
`grants`, and that no grant was recorded for that pass and file before. A
second grant for the same pass and file is refused; the peer already holds
the key.

### 5.5 Standing

A hub keeps, per payer: passes issued, overclaims, cap-exceeded redemptions,
freeload reports. Per payee: vouchers redeemed, overclaims accepted against
it. A seeder MAY consult `GET /payers/<key>/standing` before extending a
window larger than the manifest minimum, and MUST NOT refuse a peer for
standing alone when the manifest's `creditBytes` window is what it offers.
Standing is advisory; the credit window is the guarantee.

### 5.6 Payout

The hub pays each payee's balance to its registered `payTo` in USDC on the
payee's network when it reaches `payout.minUsd`, on `payout.schedule`. The
publisher's share goes to the manifest's `pricing.payTo`. The hub keeps its
share. A payout emits `com.logicsrc.openswarm.ippay.payout.sent.v1`.

Where the hub is CoinPay: today's x402 rail pays a merchant's own wallet
directly and collects no platform fee. A hub is different: it is the
merchant for the pass sale, holds the balance, and pays out. This is a
custodial position and is flagged as an open question in the PR.

## 6. Payees

### 6.1 Registering

A seeder, relay, keeper or gateway that wants to be paid registers once:

```json
{
  "payee": "ed25519:d2d05fcad07ecbee6ff87c95159ec9969fce6c0fb9f41ff78c2c07ebe8a06c94",
  "payTo": { "network": "eip155:8453", "address": "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf" },
  "sig": "RGRH7pDpXYcagULqj+8z05pLH99Lc6yLmfdbYgtGeRpjX5l0NcT3QSq9AWBtLw+5+JJiKoZ3s4ty74q/zBSE8w=="
}
```

Vouchers redeemed before registration accumulate and pay out once an
address exists. A c0mpute node registers its libp2p-adjacent OpenSwarm
identity this way at first start (`c0mpute.md` §2).

### 6.2 Relationship to the file key

A publisher's payout address is in its signed manifest and can only be
changed by a manifest revision, that is, by the file key. A payee's payout
address is registered at the hub by the payee key. The two never mix: a
publisher that also seeds its own file is paid twice, once as publisher and
once as payee, to two addresses it may set to the same value.

## 7. HTTP presentation

A gateway or key service applies the same rules over HTTP:

| Header | Direction | Meaning |
| --- | --- | --- |
| `Authorization: Bearer <base64url pass>` | request | The pass. |
| `X-OpenSwarm-Voucher: <base64url voucher>` | request | A voucher covering bytes received so far. |
| `X-OpenSwarm-Credit: unpaid=<bytes>; limit=<bytes>; owed=<usd>` | response | Sent with every 206 so the client knows when to voucher. |
| `402` with `X-OpenSwarm-Credit` and no x402 body | response | Window exhausted; send a voucher and retry. |

The gateway's `payee` is its identity key, published in the hub record it
registered with and returned in `X-OpenSwarm-Payee` on every response.

## 8. Events

| Type | Emitted by |
| --- | --- |
| `com.logicsrc.openswarm.ippay.pass.issued.v1` | hub |
| `com.logicsrc.openswarm.ippay.voucher.redeemed.v1` | hub |
| `com.logicsrc.openswarm.ippay.voucher.rejected.v1` | hub |
| `com.logicsrc.openswarm.ippay.grant.recorded.v1` | hub |
| `com.logicsrc.openswarm.ippay.payout.sent.v1` | hub |
| `com.logicsrc.openswarm.ippay.report.filed.v1` | hub |

Publishers subscribe with `POST /webhooks`. Delivery is per core §8.2.

## 9. Security notes

- **Hub compromise.** A hub key signs passes. A stolen key mints free
  passes until the manifest's `hubs` list is revised. Hubs SHOULD keep the
  signing key in an HSM and publish a successor key in the hub record before
  rotating.
- **Pass theft.** A pass is bearer for HTTP presentation but useless without
  the payer's private key on the swarm, since vouchers must be signed by
  `payer`. A gateway that accepts a pass without a voucher is serving one
  window on trust, same as a seeder.
- **Voucher replay.** Cumulative and per-triple; a replay pays nothing.
- **Cap races.** Two seeders redeem at once past the cap: the hub serialises
  per pass, so exactly one gets the remainder. Each seeder's exposure was one
  window regardless.
- **Payee address change.** Signed by the payee key. A hub SHOULD hold
  payouts for 24 hours after a change and notify the previous address's
  webhook.

## 10. Implementations

| Piece | Exists | Where | What is new |
| --- | --- | --- | --- |
| x402 v2 offer, `X-PAYMENT` proof, verify and settle, HMAC passes | Yes | `x402-gateway` (`src/x402.js`, `src/pass.js`), CoinPay `/api/x402/*` | The pass record replaces the HMAC token; scope, cap, grants |
| Node payer with EIP-3009 signing | Yes | `x402-client` | Nothing; it can buy a pass unchanged |
| Browser payer | Yes | CoinPay Wallet, `@profullstack/coinpay` `x402-browser.js` | Nothing |
| Pay-per-pass grants with concurrency caps | Yes (central) | `media-streamer` IPTV and seedbox rails | The swarm version does not need the session table; the window is the cap |
| Vouchers, receipts, split, payees, standing, payout batching | No | | All of it |

## 11. Conformance

A payee implementation validates vouchers per §4.4 and redeems per §5.2.
A payer implementation computes `usd` per §4.2 and never signs for bytes it
has not verified. A hub implements every row of §5.2, the receipt of §5.3,
and the arithmetic of §4.2 and §5.3 exactly.

## 12. Version history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-09-05 | Initial draft. |
