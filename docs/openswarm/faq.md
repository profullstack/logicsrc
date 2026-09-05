# OpenSwarm FAQ

**Is this IPFS?**
No. IPFS is content addressing plus a DHT plus its own wire protocol, with
no payment and no encryption. OpenSwarm is BitTorrent plus payment plus
encryption, carried as BEP 10 extension messages, so every existing
torrent client, tracker and crawler still understands the swarm. A file's
identifier is a BEP 52 pieces root rather than a CID because that is the
tree a BitTorrent v2 client already verifies.

**Why not a blockchain, a token or a payment channel?**
Because a 16 KiB block at the reference price is worth 0.00000015 USD and
no chain settles that. Passes are bought on chain once (x402, USDC);
vouchers are off-chain IOUs redeemed at a hub; payouts are batched. The
hub is trusted like a payment processor is trusted, and the spec says so
rather than pretending otherwise.

**Who runs a hub?**
Anyone. CoinPay is the proposed reference because it already does the x402
verify and settle half. A manifest lists the hubs its publisher accepts,
and a seeder refuses passes from any other. Two hubs on a manifest is the
recommended posture.

**Can a seeder get paid for bytes it did not send?**
No. A voucher is signed by the payer for bytes the payer already verified.

**Can a leecher get bytes without paying?**
One credit window's worth, per identity, per session. Then it is choked.
That is the design: bounded loss instead of a trustless protocol nobody
would implement.

**What happens to a vanilla client that finds the swarm?**
It sees a one-file torrent named by a hex string. If the publisher set
`policy.vanilla` to `ciphertext`, it can download the ciphertext for free
and cannot read it. If `deny`, it is choked. It never receives an
extension message.

**Does this work in a browser?**
Yes. WebTorrent supports BEP 10 extensions, WebCrypto has Ed25519, X25519
and AES-CTR, and MSE plays CMAF. bittorrented.com's player plus three
additions is the reference browser peer. A browser can only reach WebRTC
peers, so a swarm needs one hybrid seeder that announces to a wss tracker.

**Why derive file keys from one publisher key?**
So there is one thing to back up. A publisher seed plus any manifest
recovers that file's private key and its content key. A standalone key is
available for a file that will change hands.

**What if I lose the seed?**
Nothing becomes unreadable and nothing can be changed: prices, payout
address and trackers are frozen at the last signed manifest. Store the
seed in an OpenCreds vault.

**Can a key be revoked after delivery?**
No. A delivered key is held by the peer. Re-encryption under a new key
protects future readers only. Live streams rotate keys every epoch for
exactly this reason.

**Why AES-CTR and not an AEAD?**
Length-preserving and seekable: a block decrypts without the rest of the
piece. Integrity comes from two signed merkle trees, which is stronger than
a per-piece tag because it is bound to the publisher's signature.

**How does a Moshpit name fit?**
A name's owner registers a pin of kind `openswarm` over its publisher key
and serves a signed record at `/.well-known/openswarm.json`. A resolver
checks the pin, then the signature. Ordinary domains use a TXT record.
Clearnet wins by default, as everywhere in Moshpit.

**How does c0mpute fit?**
A node bids on pin, keep, gateway, transcode, relay and index jobs, and is
paid by vouchers for every byte it serves regardless of jobs. See
[c0mpute.md](./c0mpute.md).

**Is the catalogue private?**
A feed is public by construction. A private catalogue is a feed segment
published as a paid `ipfile`, readable only by pass holders.

**Why is the family called OpenSwarm and the protocols `ip*`?**
The family name follows the LogicSRC convention and names the shared
object. The protocol names are the ones the tools will be called by. The
working name was IPMedia; see the overview for why it changed.

**What exists today?**
The x402 sale and CoinPay settlement, the browser player and hybrid seeder,
the DHT crawl, CloudEvents and Standard Webhooks, the MTP/1 transport, the
Moshpit registry, and c0mpute's store, transcode, gateway and live-stream
design. Everything that mentions a pass, a voucher, a grant, a manifest, a
feed or a head is new.
