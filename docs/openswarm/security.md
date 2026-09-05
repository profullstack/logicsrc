# OpenSwarm Security Model

Version: **0.1** (draft)

This document collects the security claims the member documents make and
states plainly what the family does not protect.

## 1. What is protected, by what

| Asset | Protection | Where |
| --- | --- | --- |
| File contents | AES-256-CTR under a random content key; integrity from two SHA-256 merkle trees pinned by a signed manifest | ipfile §4 |
| Content key in transit | X25519 sealed box to the recipient's box key | ipfile §3.2 |
| Content key at rest for the owner | Sealed to the file box key; recoverable from seed plus manifest | core §4.3 |
| Manifest authenticity | Ed25519 by the file key and the publisher key, with a domain prefix | core §3.4 |
| Latest-manifest pointer | BEP 44 signature by the file key, `seq` monotonic | core §7.2 |
| Catalogue integrity | Per-entry signature plus hash chain; head on the DHT | ipdb §3 |
| Passes | Ed25519 by the hub; payer bound by a request signature | ippay §3 |
| Vouchers | Ed25519 by the payer; cumulative; `usd` recomputed by the payee | ippay §4 |
| Live segments | Same cipher; root in a signed head per unit; relays verify before forwarding | iplive §3 |
| Name to key | Registry pin (SHA-256 of SPKI) or DNS TXT, plus a signed record | ipname §4 |
| Peer identity on a connection | `hello` signature over infohash and both peer ids | ipfile §5.1 |
| Link confidentiality (optional) | MTP/1: X25519 + ML-KEM-768, ML-DSA-65, ChaCha20-Poly1305 | core §6.5 |
| Events | Standard Webhooks HMAC-SHA256 with timestamp tolerance | core §8 |

## 2. Key material

| Key | Type | Lives | Backs up as |
| --- | --- | --- | --- |
| Publisher seed | 32 bytes | Keystore or OpenCreds `key` item | The one thing to back up |
| File seed (derived) | HKDF from publisher seed and `fileId` | Never stored | Recomputed |
| File seed (standalone) | 32 random bytes | Keystore | Its own OpenCreds item |
| Content key | 32 random bytes | Keystore, `keys.owner`, keepers, grantees | `keys.owner` |
| Box keys | X25519 from the seeds | Derived | Recomputed |
| Hub signing key | Ed25519 | Hub HSM | Hub's problem |
| Payer EVM key | secp256k1 | `X402_PRIVATE_KEY`, wallet | Wallet |
| Node identity | libp2p Ed25519 | `~/.config/c0mpute/identity.key` | c0mpute's problem |

## 3. Threats and answers

**A public tracker or DHT node wants to know what a swarm is.** It gets an
infohash, a size, a piece length, a peer count, and a file named by a hex
string. The manifest is not on the DHT; the pointer to it is signed and
opaque. With `swarm.private` it gets nothing from the DHT at all.

**A peer wants bytes without paying.** It gets one credit window per
identity per session, then a choke. With `policy.vanilla: "ciphertext"` it
can get all the ciphertext free, by design, and cannot read it.

**A seeder wants to be paid for bytes it did not serve.** It cannot; the
voucher is signed by the payer for bytes the payer verified. Its only lever
is to stop serving after being paid for what it already sent.

**A payer signs vouchers past its cap to many seeders.** Each seeder was
exposed for one window. The hub pays in redemption order until the cap
and refuses the rest; the payer's standing records it and future passes
are refused.

**A payer or seeder replays a voucher.** It is cumulative and per triple;
replay pays zero.

**A hub key is stolen.** Free passes until manifests drop the hub. The hub
record SHOULD carry a successor key and publishers SHOULD list two hubs.

**A hub does not pay out.** It is a trusted processor; the answer is to
list a different hub. Receipts are signed, so non-payment is provable.

**The publisher seed is stolen.** Every derived file key is compromised:
the thief can revise manifests, change payout addresses and delegate
keepers. Detection is a manifest revision the owner did not make, visible
in the `ipdb` log. Remedy is publisher rotation (core §4.5) from a machine
the thief does not control; `successor` links require the new key too, so
the thief cannot forge the rotation.

**The publisher seed is lost.** Core §4.7. Nothing is unreadable; nothing
can be changed.

**A grantee leaks the content key.** Anyone with the key and the ciphertext
reads the file. The family prices access and does not prevent copying. A
leaked key is answered by re-encryption, which protects only future
readers. This is the same position every streaming service is in once the
frame is on a screen, stated rather than hidden behind a DRM promise.

**A relay forwards a bad segment.** Every downstream peer verifies the root
against a signed head and drops the relay.

**A Sybil of relays surrounds an origin.** They pull, earn nothing (nobody
pays them), and cost the origin upload up to `maxDownstream`. Pins and
hired relays are how an origin buys reach it controls.

**A registry hands out a wrong pin.** The record fails the pin check;
first-seen pinning in the resolver warns on change.

**An EIP-3009 proof is presented for a different resource.** Known
limitation of x402 v2: the struct cannot bind a resource. The hub records
nonce to resource at verify time and refuses reuse (ippay §3.2).

**A gateway is asked to serve plaintext to a bare `<video>` tag.** It serves
one credit window against the pass and then 402s; a gateway configured to
trust the pass for the whole title is taking the whole title as its
exposure, and the configuration says so.

## 4. What is deliberately visible

- File size, piece length, both infohashes, tracker list, peer count.
- Manifest `name` and `meta`, to anyone who obtains the manifest (public
  visibility) or any pass holder (pass visibility).
- The existence and sequence length of a feed; the content of a public
  feed.
- Segment sizes and timing of a live stream, to relays.
- Who paid whom how much, to the hub.
- The publisher's payout address, in the signed manifest.

## 5. Defaults an implementation MUST ship

| Setting | Default | Reason |
| --- | --- | --- |
| `policy.creditBytes` | 4 MiB (`ipfile`), 8 MiB (`iplive`) | Bounded exposure, no choke at the live edge |
| `policy.voucherBytes` | 1 MiB, 2 MiB | Four vouchers per window |
| `policy.vanilla` | `ciphertext` | Wider swarm at zero confidentiality cost |
| `visibility` | `public` | A catalogue that cannot be read is not a catalogue |
| Pass lifetime | 30 days | Long enough to stream a release, short enough to bound a stolen key |
| Key epoch (`iplive`) | 900 segments | 30 minutes at 2 s |
| Resolver cache | 300 s positive, 5 s negative | Matches moshpit-proxy |
| Keystore mode | 0600 | As every other Profullstack keystore |

## 6. Cryptographic agility

`cipher.alg`, `sigs[].alg`, `kdf` labels with `:v1` suffixes, and
extension names are all versioned data. A new cipher is a new `alg` value
and a new IV label; a new signature is a new `alg`; a breaking wire change
is a new extension name. Nothing is edited in place, for the reason
OpenCreds gives: peers that shipped the old value are still running.
