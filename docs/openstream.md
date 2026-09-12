# OpenStream

OpenStream is a lightweight, open standard for **losslessly relaying a byte stream between two endpoints**, maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

It answers one narrow question: how does one program hand another the exact bytes of a stream, smaller on the wire where they compress and unchanged where they do not, and prove at the far end that nothing was lost or altered. It is a **framing envelope**, not a compression algorithm. The bytes inside each frame are compressed with an established codec (Zstandard, gzip) or stored verbatim; OpenStream says how those frames are shaped, negotiated, validated, and ended.

Where [OpenSpec](./openspec-comparison.md) models a change and [OpenPRD](./openprd.md) models a product decision, OpenStream models a wire format: a contract two independent implementations can be written against. It is deliberately generic. Nothing in the byte layout names a product or a media type. [NixAmp](https://nixamp.com) is the reference implementation, relaying live audio and video channels and static files between servers; the format itself carries any stream of bytes.

## When to use it

Reach for OpenStream when a stream of bytes crosses a link you control on both ends and you want three things at once: fewer bytes where redundancy exists, the exact original bytes restored at the other end, and a clear signal when a transfer is cut short rather than finished. It is for endpoint-to-endpoint relays, not for delivery to a general-purpose client. A browser, a media player, or a plain HTTP consumer speaks its own protocols; OpenStream sits between two cooperating peers that both understand it, and each peer terminates it before handing ordinary bytes onward.

It is not transport security. Authentication and confidentiality come from the connection underneath (TLS), not from OpenStream. The per-frame digest is an integrity check on the payload, not a signature.

## The boundary

Every stream names the point at which its bytes were captured, so a saving is never claimed against the wrong thing. Two boundaries are defined:

- **source** — the bytes as they arrived at the sender, before any processing.
- **channel** — the bytes the sender produced after its own processing.

A receiver records the boundary and never presents a saving measured at one as if it were the other. An implementation that cannot provide a requested boundary refuses the request with a reason rather than substituting a different one.

## Wire layout

All integers are unsigned and big-endian. Every length is validated against a negotiated ceiling before a byte is allocated for it, so a hostile header cannot force a large allocation.

### Stream header (16 bytes, once at the start)

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 4 | Magic `NXS1` (`4e 58 53 31`) |
| 4 | 1 | Version (`01`) |
| 5 | 1 | Flags (`00`; none defined) |
| 6 | 1 | Boundary: `00` source, `01` channel |
| 7 | 1 | Reserved (`00`) |
| 8 | 4 | Generation |
| 12 | 4 | `maxFrameBytes`: the largest decoded size any frame may claim |

The **generation** changes whenever the underlying stream starts over. Frames from two generations never share a connection: a new generation is a new connection with a new stream header. A receiver refuses a header whose `maxFrameBytes` exceeds its own ceiling before it reads a frame.

### Frame header (48 bytes, before every frame)

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 1 | Type: `01` data, `02` end |
| 1 | 1 | Mode: `00` stored, `01` zstd, `02` gzip, `03` transform+zstd |
| 2 | 2 | Reserved (`0000`) |
| 4 | 4 | Sequence number, from 0, consecutive |
| 8 | 4 | Original length |
| 12 | 4 | Encoded length (payload bytes that follow) |
| 16 | 32 | SHA-256 |

For a **data** frame the SHA-256 is of the original bytes, and the payload follows the header. Every data frame is independently decodable: no dictionary and no window are carried between frames, so a frame can be validated and decoded on its own.

For the **end** frame there is no payload. Its two length fields together hold the generation's total original byte count (high word at offset 8, low word at offset 12), and its SHA-256 is of every original byte in order. A stream that stops without an end frame was cut off, and a conforming receiver reports that rather than treating a truncated transfer as complete.

### Modes

- `stored` — the payload is the original bytes; encoded length equals original length.
- `zstd` — one Zstandard frame.
- `gzip` — one gzip member.
- transform+zstd — a reversible, format-aware rearrangement applied before Zstandard (see [Format-aware transforms](#format-aware-transforms)).

A sender chooses `stored` whenever compression does not beat it by the negotiated margin, so an incompressible stream costs only the framing overhead, never more than the documented envelope size.

### Validation order

Before allocating for a payload, a receiver checks each frame header, in order:

1. type is data or end;
2. mode is known and was negotiated;
3. sequence number is the one expected;
4. original length is at most `maxFrameBytes`;
5. encoded length is at most original length plus a small fixed expansion allowance;
6. a stored frame's two lengths are equal.

After decoding, it checks that the decoded length equals the original length (with the decoder capped at that length, so a payload cannot expand past what it promised) and that the SHA-256 of the decoded bytes matches the header. For the end frame it checks that the running total and the running digest match the frame's. Anything after the end frame is an error. A frame that fails any check is never forwarded, and the connection is dropped.

### Test vectors

A stream header (version 1, channel boundary, generation 7, 256 KiB frames):

```
4e585331 01 00 01 00 00000007 00040000
```

A data frame, sequence 3, `stored`, original bytes `hello`:

```
01 00 0000 00000003 00000005 00000005
2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
68656c6c6f
```

The end frame after a one-frame stream carrying those five bytes (the digest is of the whole stream, here just `hello`):

```
02 00 0000 00000001 00000000 00000005
2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
```

## Negotiation

OpenStream rides on a request the two peers already share. A receiver asks with a media type that identifies the envelope and a header listing the modes it can decode; a sender answers with the envelope, the modes it will actually use (the receiver's list narrowed by its own policy), and the boundary. A sender that will not or cannot produce the stream answers in the request's ordinary error form instead, with a machine-readable reason, and the receiver falls back to an ordinary transfer. Compression is negotiated before the first byte, never assumed.

The envelope is not compressed again by any layer in between. A peer that terminates OpenStream declares the payload already-encoded so an intermediary does not gzip it a second time.

## Format-aware transforms

A mode may name a reversible transform applied before the general codec, chosen only when it makes the complete framed output smaller and only for inputs whose layout it recognises. A transform must be exactly reversible for every input, including malformed and unrecognised regions, and must be selected on measured output size rather than on the assumption that it helps. If it does not beat the plain codec on a representative corpus under the latency budget, it stays research-only and is not selected automatically. The reference implementation ships one such transform for MPEG transport streams, grouping packet headers apart from payloads; it is off by default and gated behind measurement.

## Recovery and boundaries

Independent frames are not, by themselves, media random-access points. A receiver joining a live stream mid-way gets bytes from the moment it joins and relies on its own decoder to resynchronise; the envelope does not fabricate a keyframe or an initialisation segment. A finite transfer that stops without its end frame is a truncation, reported as such, never a completed file. These properties are the contract a conforming implementation must preserve.

## Conformance

An implementation conforms when it:

- reads and writes the stream and frame headers exactly as laid out above, big-endian, and reproduces the test vectors;
- validates every field in the stated order before allocation, and rejects rather than forwards a frame that fails;
- restores the original bytes byte-for-byte at the declared boundary, with SHA-256 matching per frame and for the whole generation;
- stores any frame that does not beat stored by the negotiated margin, so an incompressible stream never grows beyond the envelope overhead;
- reports a stream that ends without its end frame as truncated;
- negotiates modes before the first byte and never emits a mode the receiver did not offer.

## Implementation

[NixAmp](https://nixamp.com) is the reference implementation. It relays a live channel or a static file between servers under this envelope, choosing Zstandard per block where it pays and storing the rest, and it publishes the same byte layout and test vectors alongside its code. The format carries any byte stream; media is only its first use.

## Benchmark reports

A claim about compression is only as good as a run anyone can reproduce, so every release of a reference implementation publishes a benchmark report: the envelope run over a defined corpus on real hardware, with recorded runtime and codec versions, proving byte-exact round trips, the overhead floor on incompressible input, the saving on compressible input, and the timings. Published reports are at [/docs/openstream/reports](/docs/openstream/reports).

Read the caveats in any report before quoting a number. OpenStream frames Zstandard and gzip; it is not a new algorithm, a synthetic padded stream flatters a codec by its padding, and an efficient real feed saves little. The one pass/fail is round-trip exactness, which must hold for every applicable codec on every sample.

## Status

OpenStream is at version 1 (`NXS1`). The wire format above is stable; future versions bump the magic and the stream-header version together, and a receiver refuses a version it does not understand rather than guessing.
