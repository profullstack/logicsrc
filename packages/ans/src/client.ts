// ANS registry HTTP client (the network half). Pairs with the offline verifier
// in ./verify — callers should resolve() then verifyResolution() rather than
// trusting resolve() output directly.

import { toAnsName } from './name.js';
import { rootKeysFromEntries, type RootKeyEntry } from './verify/rootkeys.js';
import { fromBase64 } from './bytes.js';
import type {
  AnsIdentity,
  AnsName,
  RegisterRequest,
  Registration,
  RegistrationStatus,
  RootKeys,
} from './types.js';

export interface AnsClientOptions {
  registryUrl: string;
  token?: string;
  /** Pin verifier keys instead of trusting GET /root-keys (recommended in-house). */
  pinnedRootKeys?: RootKeyEntry[];
  fetch?: typeof fetch;
}

interface ResolveResponse {
  name: string;
  endpoint?: string;
  capabilities?: string[];
  certChainPem?: string;
  serverCertTlsa?: string;
  events?: { type: string; at: string; payload?: unknown }[];
  /** base64-encoded COSE_Sign1 receipt bytes. */
  receipt: string;
}

export class AnsClient {
  private readonly base: string;
  private readonly doFetch: typeof fetch;

  constructor(private readonly opts: AnsClientOptions) {
    this.base = opts.registryUrl.replace(/\/+$/, '');
    const f = opts.fetch ?? globalThis.fetch;
    if (!f) throw new Error('AnsClient: no fetch available; pass opts.fetch');
    this.doFetch = f;
  }

  async resolve(name: string | AnsName): Promise<AnsIdentity> {
    const ans = toAnsName(name);
    const body = await this.get<ResolveResponse>(`/v1/resolve/${encodeURIComponent(ans.raw)}`);
    return {
      name: toAnsName(body.name),
      endpoint: body.endpoint,
      capabilities: body.capabilities ?? [],
      certChainPem: body.certChainPem,
      serverCertTlsa: body.serverCertTlsa,
      events: body.events ?? [],
      receipt: { cbor: fromBase64(body.receipt) },
    };
  }

  async rootKeys(): Promise<RootKeys> {
    if (this.opts.pinnedRootKeys) return rootKeysFromEntries(this.opts.pinnedRootKeys);
    // M1: registry serves a JWKS-style list. sumdb-note parsing is M2.
    const body = await this.get<{ keys: RootKeyEntry[] }>('/root-keys');
    return rootKeysFromEntries(body.keys);
  }

  async register(req: RegisterRequest): Promise<Registration> {
    const body = await this.post<{ challengeToken: string; recordName?: string }>('/v1/register', {
      agent: req.agent,
      domain: req.domain,
      version: req.version,
      endpoint: req.endpoint,
      capabilities: req.capabilities ?? [],
      verify: req.verify,
    });
    const name = toAnsName(`ans://v${req.version}.${req.agent}.${req.domain}`);
    const challenge = {
      type: 'TXT' as const,
      name: body.recordName ?? `_ans-challenge.${req.agent}.${req.domain}`,
      value: body.challengeToken,
    };
    if (req.dns) await req.dns.upsertTxt({ name: challenge.name, value: challenge.value });
    return { name, challenge };
  }

  async status(name: string | AnsName): Promise<RegistrationStatus> {
    const ans = toAnsName(name);
    return this.get<RegistrationStatus>(`/v1/status/${encodeURIComponent(ans.raw)}`);
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.opts.token) headers.Authorization = `Bearer ${this.opts.token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await this.doFetch(`${this.base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`ANS ${method} ${path} failed: ${response.status} ${text || response.statusText}`);
    return (text ? JSON.parse(text) : {}) as T;
  }
}
