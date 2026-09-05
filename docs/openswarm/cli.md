# The `ip` CLI (proposed)

Version: **0.1** (draft)
Status: proposal. No binary exists. Names and flags here are the contract
an implementation would meet; they are not a promise that this is the
final surface.

## 1. Shape

One binary, `ip`, with a noun-verb tree. Every command accepts `--json`
for machine output and returns exit code 0 on success, 2 on a usage error,
3 on a verification failure (signature, hash, chain), 4 on a payment
failure (no pass, cap reached, hub refused), 5 on a network failure.

Configuration lives at `~/.config/ip/config.json`; the keystore at
`~/.config/ip/keys/` with mode 0600, or in an OpenCreds vault when
`ip init --vault` is used. The local `ipdb` replica is
`~/.local/share/ip/db.sqlite`.

## 2. Commands

### 2.1 Identity

```
ip init [--vault] [--name <label>]
ip key show [--box]
ip key export --out <file>         # the seed, encrypted with a passphrase
ip key import <file>
ip key rotate                        # mints a new seed, revises every file (core §4.5)
ip key bind-pq <mldsa65 key file>    # publishes an openswarm.binding
```

### 2.2 Files

```
ip file add <path> [--per-gib <usd>] [--key-price <usd>] [--public] [--private]
            [--standalone-key] [--piece-length <bytes>] [--tracker <url>]... [--webseed <url>]...
            [--hub <url>]... [--pay-to <network>:<address>] [--split <pub>,<seed>,<hub>]
            [--keeper <ed25519:...>]... [--meta.<k> <v>]... [--feed <name>]
ip file get <file key | infohash | ip:// url | magnet> --out <path> [--pass <file>] [--tunnel mtp] [--stream]
ip file revise <file key> [--per-gib ...] [--tracker ...] [--pay-to ...]     # metadata-only revision
ip file reencrypt <file key>                                                # new content key, new swarm
ip file rotate <file key>                                                   # successor file key
ip file seed [<file key>... | --all] [--vanilla ciphertext|deny]
ip file share <file key> --to <ip:// name | x25519 key> [--grant] [--delegate --expires <days>]
ip file pin <file key> --days <n> [--min-peers <n>] [--erasure <k>,<p>] [--max-price <usd>]
ip file keep-hire <file key> --days <n> [--max-price <usd>]
ip file status <file key>                       # manifest, revs, peers seen, bytes served, earnings
```

`ip file add` prints the file key, both infohashes, the manifest id and
the `magnet:` and `ip://` forms. With `--json` it prints the manifest.

### 2.3 Payment

```
ip pass buy --hub <url> (--file <key> | --publisher <key>) --cap <usd> [--grant] [--days <n>]
ip pass list
ip pass show <pass id>
ip payee register --hub <url> --pay-to <network>:<address>
ip payee balance [--hub <url>]
ip voucher redeem [--all | --swarm <infohash>]     # normally automatic; manual for audit
ip hub info <url>
```

`ip pass buy` performs the x402 exchange with the key from
`X402_PRIVATE_KEY` or `--key-file`, the same as `x402 pay`.

### 2.4 Audio

```
ip audio publish <track.json | source files...> [--release <release.json>] [--renditions <ids>]
                 [--on c0mpute --max-price <usd>] [--royalty <address>:<bps>]... [file add flags]
ip audio play <track id | ip:// url> [--rendition <id>]
ip audio rss <release id> --gateway <url> --out <feed.xml>
```

### 2.5 Video

```
ip video publish <source> [--ladder default | <ids>] [--subtitle <lang>:<file.vtt>]...
                 [--thumbnails] [--chapters <file>] [--on c0mpute --max-price <usd>] [file add flags]
ip video play <title id | ip:// url>
ip video hls <title id> --gateway <url>          # prints the master playlist URL
```

### 2.6 Live

```
ip live create <name> [--latency normal|low] [--segment-ms <n>] [--per-gib <usd>] [--key-price <usd>]
               [--rendition <id>:<codecs>:<w>x<h>:<kbps>]... [--relays any | <keys>]
ip live start <name> --input <rtmp:// | srt:// | file> [--record] [--max-downstream <n>]
ip live stop <name>
ip live watch <channel key | ip:// url> [--rendition <id>] [--out <file>]
ip live relay <channel key> [--max-downstream <n>]
ip live relay-hire <channel key> --hours <n> --relays <n> [--max-downstream <n>] [--max-price <usd>]
```

### 2.7 Catalogue

```
ip db put <key> <record.json> [--feed <name>]
ip db del <key> [--feed <name>]
ip db get <ip:// url | feed/key>
ip db query [--type <t>] [--feed <ref>]... [--where '<path> <op> <value>']... [--order <path>:asc|desc] [--limit <n>]
ip db follow <feed ref>
ip db unfollow <feed ref>
ip db head [<feed ref>]
ip db segment [--feed <name>]                    # seal a segment now
ip db index-hire <feed ref>... --days <n> [--max-price <usd>]
```

`--where` takes one clause per flag; the value is JSON (`'"Ada"'`, `120000`).

### 2.8 Names

```
ip name set <name> [--gateway <url>] [--hub <url>]... [--mtp-pin <pin>] [--feed <ref>]...
ip name resolve <name>
ip name pin <name>                                # prints the registry pin value and the TXT record
```

### 2.9 Node

```
ip node status
ip node hello <peer address>                       # diagnostic: handshake and print the peer's hello
```

A c0mpute worker embeds the same library; `c0mpute worker start --openswarm`
is the daemon form and `ip` is the operator's tool.

## 3. Output examples

```
$ ip file add ./interview.flac --per-gib 0.01 --key-price 0.50
file       ed25519:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d
manifest   sha256:41d10f45e705e0526c9eeedf62b32dda3daaf552dd9b6a7b09e01776b05813bb
infohash   v1 a3ce2180413415d7cf4268fb892b8ffd539e8459
           v2 4b74eb43677e4d03af5fb0856333f9aa21d9a5a3bbf944b13aa7eef379c7a342
size       734003200 (700 pieces of 1048576)
magnet     magnet:?xs=urn:btpk:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d&s=ipfile
url        ip://ed25519:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d?file
seeding    yes (2 trackers, dht)
```

```
$ ip file get ed25519:0d87e0...295d --out ./interview.flac
pass       reused sha256:39655d...02fd (cap 2.000000, spent 0.000000)
peers      3 (2 paid, 1 gateway)
progress   734003200 / 734003200   verified plainRoot ok
vouchers   3 signed, 0.006836 USD
key        granted by ed25519:d2d05f...6c94 (keeper)
```

## 4. Environment

| Variable | Meaning |
| --- | --- |
| `IP_HOME` | Overrides the config directory. |
| `IP_HUB` | Default hub URL. |
| `X402_PRIVATE_KEY` | EVM key used to buy passes, shared with `x402-client`. |
| `IP_TRACKERS` | Comma list of default trackers for `file add`. |
| `MOSHPIT_RESOLVE_MODE` | Passed through to name resolution (`ipname` §4.2). |

## 5. Conformance

A CLI claiming this contract implements every command in §2 with these
exit codes, prints the fields in §3 for `add` and `get`, and never writes a
seed or a content key to stdout unless asked with an explicit `--reveal`.
