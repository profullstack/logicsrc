// Public types for @logicsrc/ans. See docs/ans-sdk.md for the full spec.

/** Parsed ans://v<semver>.<agent>.<domain> name. */
export interface AnsName {
  raw: string;
  version: string;
  agent: string;
  domain: string;
}

/** Lifecycle event recorded in the transparency log. */
export interface LifecycleEvent {
  type: string;
  at: string;
  payload?: unknown;
}

/** Raw SCITT COSE_Sign1 inclusion receipt bytes. */
export interface Receipt {
  cbor: Uint8Array;
}

/** A resolved, not-yet-verified agent identity. */
export interface AnsIdentity {
  name: AnsName;
  endpoint?: string;
  capabilities: string[];
  certChainPem?: string;
  serverCertTlsa?: string;
  events: LifecycleEvent[];
  receipt: Receipt;
}

/** Registry transparency-log verifier keys, indexed by 4-byte kid (lowercase hex). */
export interface RootKeys {
  keys: Map<string, CryptoKey>;
}

export interface VerifyOptions {
  rootKeys: RootKeys;
  now?: Date;
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
  /** Transparency-log root hash the receipt was proven against (hex). */
  rootHashHex?: string;
}

export interface RegisterRequest {
  agent: string;
  domain: string;
  version: string;
  endpoint?: string;
  capabilities?: string[];
  verify: 'dns' | 'acme';
  dns?: DnsApplier;
}

/** Caller-supplied DNS automation (e.g. a sh1pt DNS adapter) for verify-dns. */
export interface DnsApplier {
  upsertTxt(record: { name: string; value: string }): Promise<void>;
}

export interface Registration {
  name: AnsName;
  challenge: { type: 'TXT'; name: string; value: string };
}

export interface RegistrationStatus {
  state: 'pending' | 'verifying' | 'live' | 'failed';
  message?: string;
}

/** Bidirectional map between an ans:// name and a LogicSRC/coinpay DID (M3). */
export interface DidBridge {
  ansNameForDid(did: string): Promise<AnsName | null>;
  didForAnsName(name: string | AnsName): Promise<string | null>;
}
