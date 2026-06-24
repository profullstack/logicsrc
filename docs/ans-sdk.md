# ANS SDK (`@logicsrc/ans`)

`@logicsrc/ans` is the LogicSRC TypeScript SDK for the
[Agent Name Service](https://github.com/agentnameservice) (ANS): the JS/TS
client + **offline verifier** for resolving an agent *name* to a verifiable,
versioned identity.

ANS is "DNS for agents": where DNS resolves a domain to an address, ANS resolves
an agent name (`ans://v1.0.0.my-agent.example.com`) to a cryptographic identity,
anchored to domain ownership (DNS/ACME) and backed by a private CA plus an
append-only **transparency log** (SCITT/COSE receipts, RFC 9162 / RFC 6962).

Upstream ANS ships SDKs for Go, Java, and Rust — **but not JavaScript/TypeScript**,
which is the language of the agent/MCP/web ecosystem (LogicSRC, sh1pt, AgentBBS).
This SDK fills that gap and makes ANS a first-class identity source alongside the
existing LogicSRC DID model.

## Why this lives in LogicSRC

- **No upstream TS SDK.** Go/Java/Rust only. This is a clean, reusable OSS
  artifact and a first-mover contribution.
- **LogicSRC is already an identity layer.** Identity here is a DID (via the
  `coinpay` plugin's `did.auth`). ANS is the *naming + domain-anchored
  verification* layer that DIDs lack — they are complementary, not competing
  (see [DID bridge](#did-bridge)).
- **Multiple in-house consumers.** [AgentGit](./agentgit.md) members, the
  `sh1pt` `registry-ans` ship target, AgentBBS join-time verification, and
  `commandboard` discovery can all consume one SDK.

The split, stated once:

- **ANS answers**: *what is this agent's canonical name, is it really it, and
  which version/endpoint?* — discovery + domain-anchored verification.
- **LogicSRC DID answers**: *is this a portable identity I can authorize, pay,
  and score?* — sovereign identity + reputation + payment rails.

## Scope

In scope for the SDK:

1. **Resolver** — `ans://` name → `AnsIdentity` (cert chain, endpoint, version,
   lifecycle events) via the registry HTTP API.
2. **Offline verifier** — cryptographically verify a resolution against the
   transparency log **without trusting the operator** beyond advertised root
   keys. This is the hard, high-value part and ports the `ans-verify` semantics
   to TS.
3. **Registration client** — open a registration, drive a domain-ownership
   challenge (DNS-01 / ACME), and read back the issued identity + receipt.
4. **DID bridge** — map between an `ans://` name and a LogicSRC/`coinpay` DID.

Out of scope (delegated, not reimplemented):

- Running a registry or transparency log (that's the upstream Go `ans` server).
- DNS record application — delegated to a DNS provider. In sh1pt that's its DNS
  adapters; in LogicSRC the caller supplies a `DnsApplier` (see
  [Registration](#registration)).
- Certificate issuance / the private CA (server-side).

## Architecture

```txt
        @logicsrc/ans  (this package)
   ┌──────────────────────────────────────────┐
   │  AnsClient                                 │
   │   ├─ resolve(name)      ── registry HTTP ──┼──► ANS registry
   │   ├─ register(req)      ── registry HTTP ──┼──►  (Go `ans` server)
   │   └─ rootKeys()         ── registry HTTP ──┘
   │                                            │
   │  Verifier (offline, pure)                  │
   │   ├─ verifyReceipt(receipt, rootKeys)      │  COSE_Sign1 + Merkle proof
   │   └─ verifyResolution(identity, opts)      │  (no network)
   │                                            │
   │  DidBridge                                 │
   │   ├─ ansNameForDid(did)                    │
   │   └─ didForAnsName(name)                   │
   └──────────────────────────────────────────┘
        ▲                         ▲
        │ consumed by             │
   sh1pt registry-ans      AgentGit / AgentBBS / commandboard
```

The **Verifier is pure and dependency-light** (crypto + CBOR/COSE only, no
`fetch`), so it runs in Node, Deno, Bun, edge runtimes, and the browser, and is
trivially unit-testable with fixtures captured from the upstream Go server.

## Capabilities

```txt
name.resolve          resolve an ans:// name to an identity
name.verify           offline-verify a resolution against the transparency log
name.register         open a registration + domain-ownership challenge
name.status           poll a pending registration / verification
receipt.verify        verify a SCITT COSE_Sign1 inclusion receipt
rootkeys.fetch        fetch + parse the registry root-keys (sumdb-note)
did.bind              bind an ans:// name to a LogicSRC DID
did.resolve           resolve a DID to its ans:// name (and back)
```

## Package layout

```txt
packages/ans/
  package.json            @logicsrc/ans  (ESM, tsc build, vitest)
  tsconfig.json           extends ../../tsconfig.base.json
  src/
    index.ts              public exports
    types.ts              AnsName, AnsIdentity, Receipt, RootKeys, …
    name.ts               parse/format ans:// names (zod-validated)
    client.ts             AnsClient — registry HTTP (resolve/register/status)
    verify/
      receipt.ts          COSE_Sign1 parse + ES256 verify
      merkle.ts           RFC 6962 leaf hash + inclusion-proof walk
      rootkeys.ts         sumdb-note root-keys parser + kid→key map
      index.ts            verifyReceipt(), verifyResolution()
    did.ts                DidBridge (ANS ↔ coinpay DID)
    index.test.ts         unit tests (fixtures/ from upstream Go server)
  fixtures/               captured receipts, root-keys, resolutions
```

`@logicsrc/ans` is a **leaf package** (like `@logicsrc/sdk`): it depends only on
crypto/CBOR libraries and `@logicsrc/schemas` for shared types. The `coinpay`
DID coupling stays behind a small injected interface so the verifier core has no
LogicSRC dependency and could be published standalone.

## Public API (TypeScript surface)

```ts
// ── names ───────────────────────────────────────────────────────────
/** ans://v<semver>.<agent>.<domain> */
export interface AnsName {
  raw: string;          // "ans://v1.0.0.my-agent.example.com"
  version: string;      // "1.0.0"
  agent: string;        // "my-agent"
  domain: string;       // "example.com"
}
export function parseAnsName(raw: string): AnsName;     // throws on malformed
export function formatAnsName(parts: Omit<AnsName, 'raw'>): string;

// ── identity / receipts ─────────────────────────────────────────────
export interface AnsIdentity {
  name: AnsName;
  endpoint?: string;             // advertised agent endpoint
  capabilities: string[];
  certChainPem: string;          // identity cert (private-CA signed, mTLS)
  serverCertTlsa?: string;       // optional BYOC pinned TLSA
  events: LifecycleEvent[];      // from the transparency log
  receipt: Receipt;              // SCITT COSE_Sign1 inclusion receipt
}
export interface LifecycleEvent { type: string; at: string; payload?: unknown; }
export interface Receipt { cbor: Uint8Array; }   // raw COSE_Sign1 bytes
export interface RootKeys { keys: Map<string /*4-byte kid hex*/, CryptoKey>; }

// ── client (network) ────────────────────────────────────────────────
export interface AnsClientOptions {
  registryUrl: string;                 // e.g. https://registry.ans.dev
  token?: string;                      // for register/status
  pinnedRootKeysPem?: string;          // skip /root-keys; trust this instead
  fetch?: typeof fetch;                // injectable for tests/edge
}
export class AnsClient {
  constructor(opts: AnsClientOptions);
  resolve(name: string | AnsName): Promise<AnsIdentity>;
  rootKeys(): Promise<RootKeys>;
  register(req: RegisterRequest): Promise<Registration>;
  status(name: string | AnsName): Promise<RegistrationStatus>;
}

// ── verifier (offline, pure, no network) ────────────────────────────
export interface VerifyOptions { rootKeys: RootKeys; now?: Date; }
export interface VerifyResult { ok: boolean; reason?: string; rootHashHex: string; }
export function verifyReceipt(receipt: Receipt, opts: VerifyOptions): Promise<VerifyResult>;
export function verifyResolution(id: AnsIdentity, opts: VerifyOptions): Promise<VerifyResult>;

// ── registration ────────────────────────────────────────────────────
export interface RegisterRequest {
  agent: string; domain: string; version: string;
  endpoint?: string; capabilities?: string[];
  verify: 'dns' | 'acme';
  dns?: DnsApplier;                    // when set, SDK applies the challenge
}
/** Caller-supplied DNS automation (e.g. a sh1pt DNS adapter). */
export interface DnsApplier {
  upsertTxt(record: { name: string; value: string }): Promise<void>;
}
export interface Registration { name: AnsName; challenge: { type: 'TXT'; name: string; value: string }; }
export interface RegistrationStatus { state: 'pending' | 'verifying' | 'live' | 'failed'; message?: string; }

// ── DID bridge ──────────────────────────────────────────────────────
export interface DidBridge {
  ansNameForDid(did: string): Promise<AnsName | null>;
  didForAnsName(name: string | AnsName): Promise<string | null>;
}
```

### Usage sketches

```ts
// Resolve + verify (the common path; trustless)
const ans = new AnsClient({ registryUrl: 'https://registry.ans.dev' });
const id = await ans.resolve('ans://v1.0.0.my-agent.example.com');
const { ok } = await verifyResolution(id, { rootKeys: await ans.rootKeys() });
if (!ok) throw new Error('unverified agent identity');

// Register with automated DNS (DNS applier supplied by the caller, e.g. sh1pt)
const reg = await ans.register({
  agent: 'my-agent', domain: 'example.com', version: '1.0.0',
  endpoint: 'https://my-agent.example.com', verify: 'dns',
  dns: { upsertTxt: ({ name, value }) => dnsAdapter.upsertTxt(name, value) },
});
```

## Verification algorithm

Ports the upstream `ans-verify` flow. Pure functions over bytes; the only trust
input is the root keys (fetched once, or pinned):

1. Obtain root keys: parse `/root-keys` (sumdb-note format) **or** the pinned
   PEM. Build a `kid (4-byte) → verifier key` map.
2. Parse the receipt as `COSE_Sign1` (RFC 8152 tag 18, ES256).
3. Extract the Merkle inclusion proof + leaf payload from the protected/unprotected
   headers.
4. Compute the leaf hash via RFC 6962: `SHA-256(0x00 || payload)`.
5. Walk the Merkle path from the leaf hash to the claimed root hash.
6. ES256-verify the COSE `Sig_structure` signature using the `kid`-mapped key.
7. Cross-check leaf-hash consistency and the resolved identity binding (name,
   cert, lifecycle).

`verifyResolution()` wires the resolved `AnsIdentity` through steps 2–7 and also
checks the cert chain binds to the resolved `domain`.

## DID bridge

The bridge is where ANS and the LogicSRC/`coinpay` DID model meet — directly the
"CoinPay DID ↔ ANS" question.

- **`did:web` under a verified ANS domain.** Once a name's domain is ANS-verified,
  the agent's `coinpay` DID can be published as `did:web:<domain>:<agent>` and
  resolved from the same anchor. ANS provides the discoverable human-readable
  name + transparency proof; the DID provides the portable identity + reputation
  receipts + payment rails.
- **Binding direction.** `did.bind` records the `ans://` ↔ DID mapping (as an ANS
  lifecycle event and/or a `coinpay` DID service entry). `DidBridge` reads it both
  ways so AgentGit can keep authenticating with a DID while exposing a verifiable
  ANS name to the outside world.
- **No DID minting here.** The SDK never issues DIDs (that's `coinpay`) and never
  issues ANS certs (that's the registry). It only *binds* and *resolves*.

## Milestones

- **M1 — Resolver + offline verifier.** `parseAnsName`, `AnsClient.resolve`,
  `rootKeys`, `verifyReceipt`/`verifyResolution`, fixtures from the upstream Go
  server. This is the standalone-publishable core and unblocks read-side
  consumers.
- **M2 — Registration client.** `register`/`status` + the `DnsApplier` hook.
  Lets the sh1pt `registry-ans` target complete its `TODO(M2)` (apply challenge,
  verify, poll receipt) by delegating to this SDK instead of hand-rolled `fetch`.
- **M3 — DID bridge.** `DidBridge` + `did:web` publication under the verified
  domain, wired through the `coinpay` plugin. Gate on M1+M2 and on how far the
  upstream IETF draft has stabilized.

## Dependencies & testing

- **Crypto/CBOR:** prefer WebCrypto (`crypto.subtle`, ES256) for portability;
  a minimal COSE/CBOR decoder (e.g. `cbor-x` or a vendored decoder) for
  `COSE_Sign1`. Keep the verifier free of Node-only APIs so it runs on edge and
  in the browser.
- **Validation:** `zod` for name + wire-shape parsing (matches LogicSRC schema
  conventions; consider emitting the shapes into `@logicsrc/schemas`).
- **Tests:** capture real `/root-keys`, resolutions, and receipts from a local
  upstream `ans` server into `fixtures/`; unit-test the verifier against them
  (happy path + tampered-payload, wrong-kid, bad-proof, expired-cert negatives).
  Verifier is `vitest run src` like the other packages, with no network.

## Risks / open questions

- **Draft-stage standard.** ANS wire formats (receipt headers, root-keys note)
  may shift; pin to a server commit for fixtures and version the SDK against it.
- **More centralized than DIDs.** ANS uses a registry + private CA. Treat ANS as
  *naming/discovery/verification* and keep sovereign identity in the DID layer;
  do not let ANS become the system of record for identity.
- **CBOR/COSE surface in TS.** No single blessed lib; the verifier's COSE_Sign1
  handling is the main implementation risk — keep it small, vendored if needed,
  and fixture-driven.
- **Trust bootstrap.** `pinnedRootKeysPem` vs `/root-keys` is a real trust
  decision; default to pinning for in-house consumers (AgentGit/AgentBBS) and
  document the TOFU tradeoff for `/root-keys`.

## First consumers

- **sh1pt `registry-ans` target** — replaces its hand-rolled `fetch` register
  call and completes M2 verification by depending on `@logicsrc/ans`.
- **AgentGit / AgentBBS** — verify an agent's `ans://` name at join/merge time
  alongside the existing DID auth.
- **commandboard discovery** — resolve + verify advertised agent endpoints.
