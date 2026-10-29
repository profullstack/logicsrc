/**
 * Typed client for the LogicSRC team credential-sharing API (commandboard-api,
 * routes under /api/credshare). Used by both the `team` credential provider and
 * the CLI `teams`/`login` commands.
 *
 * All secret material sent through this client is already ciphertext (or a DEK
 * sealed to a member public key). The server is zero-knowledge for values.
 */

export interface TeamClientOptions {
  apiUrl: string;
  token?: string;
}

export interface RemoteUser {
  id: string;
  email: string;
  publicKey: string | null;
}

export interface RemoteTeam {
  id: string;
  slug: string;
  name: string;
}

export interface RemoteMember {
  id: string;
  email: string;
  role: "owner" | "admin" | "member";
  status: "active" | "invited";
  hasPublicKey: boolean;
  /** The member's identity public key and its fingerprint (servers before 2026-10-28 omit these). */
  publicKey?: string | null;
  fingerprint?: string | null;
  joinedAt: string | null;
}

/** One audit row, as GET /teams/:slug/audit returns it. */
export interface RemoteAuditRow {
  at: number;
  action: string;
  actor: string | null;
  vault: string | null;
  target: string | null;
  fingerprint: string | null;
  apiKey: string | null;
  apiKeyKind: string | null;
  ip: string | null;
  userAgent: string | null;
}

export interface RemoteVault {
  id: string;
  name: string;
  hasAccess: boolean;
  secretCount: number;
}

export interface RemoteSecret {
  name: string;
  nonce: string;
  ciphertext: string;
  fingerprint: string;
  version: number;
  updatedAt: string;
}

export interface RemoteGrantRow {
  email: string;
  /** X25519 public key, so a client can re-seal to every member in one pass. */
  publicKey: string | null;
  status: "active" | "invited";
  hasPublicKey: boolean;
  hasAccess: boolean;
}

export interface RekeyResult {
  ok: boolean;
  rekeyed: number;
  granted: string[];
  revoked: string[];
  /** Machine keys re-sealed to the new DEK, and the ones dropped (servers before machine keys omit these). */
  keysResealed?: string[];
  keysDropped?: string[];
  /** The vault's key version after this re-key. */
  keyVersion?: number;
}

/** The credential a request was made with, as /api/credshare/me describes it. Null for a browser session. */
export interface RemoteKeyInfo {
  id: string;
  name: string;
  prefix: string;
  kind: "user" | "machine";
  /** Machine keys only: the one team the key may see. */
  team: string | null;
  /** Machine keys only: the vault names it may see, or null for every vault in the team. */
  vaults: string[] | null;
  readOnly: boolean;
  expiresAt: number | null;
}

/** One of the caller's API keys, as GET /api/keys lists it. Never carries a secret. */
export interface RemoteApiKey {
  id: string;
  name: string;
  prefix: string;
  kind: "user" | "machine";
  team: string | null;
  vaults: string[] | null;
  readOnly: boolean;
  expiresAt: number | null;
  expired: boolean;
  /** The machine's own identity public key, once it has run one command. */
  publicKey: string | null;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface CreateApiKeyInput {
  name: string;
  kind?: "user" | "machine";
  team?: string;
  vaults?: string[];
  readOnly?: boolean;
  /** ms epoch, an ISO date, or a duration such as 30d / 12h. */
  expiresAt?: number | string;
}

/** A machine key holding a vault, with its public key so a re-key can re-seal to it. */
export interface RemoteKeyGrant {
  keyId: string;
  name: string;
  prefix: string;
  owner: string | null;
  publicKey: string | null;
  readOnly: boolean;
  expiresAt: number | null;
  grantedAt: number;
}

export class TeamApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "TeamApiError";
  }
}

export interface RemoteRotationPlanItem {
  key: string;
  method: string;
  provider?: string;
  recipe?: string;
  automatic: boolean;
  owner: string | null;
  url: string | null;
  steps: string[];
  vaults: string[];
  vaultCount: number;
  lastRotated: string;
  hasEntry: boolean;
  [k: string]: unknown;
}

export interface RemoteRotationRun {
  id: string;
  keys: string[];
  project: string | null;
  env: string | null;
  approve: boolean;
  options: { desktop?: string; propagate?: boolean; allowRoll?: boolean; due?: boolean; maxAgeDays?: number };
  status: string;
  due?: boolean;
  approvedBy?: string | null;
  createdAt: number;
  summary: string | null;
}

export class TeamClient {
  private readonly apiUrl: string;
  private token?: string;

  constructor(options: TeamClientOptions) {
    this.apiUrl = options.apiUrl.replace(/\/$/, "");
    this.token = options.token;
  }

  setToken(token: string): void {
    this.token = token;
  }

  private request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.requestAt<T>(`/api/credshare${path}`, method, body);
  }

  private async requestAt<T>(fullPath: string, method: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.token) headers["authorization"] = `Bearer ${this.token}`;
    const response = await fetch(`${this.apiUrl}${fullPath}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    const parsed = text ? (JSON.parse(text) as unknown) : undefined;
    if (!response.ok) {
      const message = isRecord(parsed) && typeof parsed.error === "string" ? parsed.error : `${response.status} ${response.statusText}`;
      throw new TeamApiError(response.status, message);
    }
    return parsed as T;
  }

  // ---- auth ----
  requestLoginCode(email: string) {
    return this.request<{ ok: boolean; emailSent: boolean; devCode?: string }>("POST", "/auth/request", { email });
  }
  verifyLoginCode(email: string, code: string) {
    return this.request<{ token: string; user: RemoteUser }>("POST", "/auth/verify", { email, code });
  }
  uploadPublicKey(publicKey: string) {
    return this.request<{ email: string; publicKey: string }>("POST", "/keys", { publicKey });
  }
  me() {
    return this.request<{ user: RemoteUser; teams: RemoteTeam[]; key?: RemoteKeyInfo | null }>("GET", "/me");
  }
  logout() {
    return this.request<{ ok: boolean }>("POST", "/logout");
  }
  lookupUser(email: string) {
    return this.request<{ email: string; userId: string | null; publicKey: string | null }>("GET", `/users?email=${encodeURIComponent(email)}`);
  }

  // ---- teams / members / invites ----
  createTeam(slug: string, name?: string) {
    return this.request<{ team: RemoteTeam }>("POST", "/teams", { slug, name });
  }
  listTeams() {
    return this.request<{ teams: RemoteTeam[] }>("GET", "/teams");
  }
  listMembers(slug: string) {
    return this.request<{ members: RemoteMember[] }>("GET", `/teams/${encodeURIComponent(slug)}/members`);
  }
  invite(slug: string, email: string, role?: "owner" | "admin" | "member") {
    return this.request<{ invite: { id: string; email: string; role: string; expiresAt: number }; emailSent: boolean; resent: boolean; token?: string }>(
      "POST",
      `/teams/${encodeURIComponent(slug)}/invites`,
      { email, role }
    );
  }
  updateMemberRole(slug: string, memberId: string, role: "owner" | "admin" | "member") {
    return this.request<{ member: Pick<RemoteMember, "id" | "email" | "role" | "status"> }>(
      "PATCH",
      `/teams/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}`,
      { role }
    );
  }
  removeMember(slug: string, memberId: string) {
    return this.request<{ ok: boolean; removed: string; revokedVaultGrants: number; rotationRequired: boolean }>(
      "DELETE",
      `/teams/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}`
    );
  }
  acceptInvite(token: string) {
    return this.request<{ ok: boolean; team?: RemoteTeam }>("POST", "/invites/accept", { token });
  }

  // ---- vaults / grants / secrets ----
  listVaults(slug: string) {
    return this.request<{ vaults: RemoteVault[] }>("GET", `/teams/${encodeURIComponent(slug)}/vaults`);
  }
  createVault(slug: string, name: string) {
    return this.request<{ vault: { id: string; name: string } }>("POST", `/teams/${encodeURIComponent(slug)}/vaults`, { name });
  }
  getMyGrant(vaultId: string) {
    return this.request<{ wrappedDek: string; keyVersion?: number }>("GET", `/vaults/${encodeURIComponent(vaultId)}/grant`);
  }
  /** Every vault grant the caller holds, for re-sealing them during an identity rotation. */
  myGrants() {
    return this.request<{ grants: Array<{ vaultId: string; vault: string; team: string; wrappedDek: string }> }>("GET", "/me/grants");
  }
  /** A random answer sealed to the caller's CURRENT identity key: opening it proves possession. */
  identityChallenge() {
    return this.request<{ challengeId: string; sealed: string; publicKey: string; fingerprint: string; expiresAt: number }>("POST", "/keys/challenge", {});
  }
  rotateIdentity(body: { publicKey: string; challengeId: string; answer: string; grants: Array<{ vaultId: string; wrappedDek: string }> }) {
    return this.request<{ ok: boolean; publicKey: string; fingerprint: string; previousFingerprint: string; regranted: number }>("POST", "/keys/rotate", body);
  }
  teamAudit(slug: string, query: { vault?: string; actor?: string; action?: string; since?: number; limit?: number } = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    const suffix = qs.toString() ? `?${qs}` : "";
    return this.request<{ audit: RemoteAuditRow[] }>("GET", `/teams/${encodeURIComponent(slug)}/audit${suffix}`);
  }
  listGrants(vaultId: string) {
    return this.request<{ grants: RemoteGrantRow[] }>("GET", `/vaults/${encodeURIComponent(vaultId)}/grants`);
  }
  putGrant(vaultId: string, email: string, wrappedDek: string) {
    return this.request<{ ok: boolean }>("POST", `/vaults/${encodeURIComponent(vaultId)}/grants`, { email, wrappedDek });
  }
  // ---- key rotation: plan + run queue (never values) ----
  rotationPlan(slug: string, query: { project?: string; env?: string; key?: string } = {}) {
    const qs = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => Boolean(e[1]))).toString();
    return this.request<{ team: string; plan: RemoteRotationPlanItem[] }>("GET", `/teams/${encodeURIComponent(slug)}/rotation${qs ? `?${qs}` : ""}`);
  }
  listRotationRuns(slug: string, status?: string) {
    return this.request<{ runs: RemoteRotationRun[] }>("GET", `/teams/${encodeURIComponent(slug)}/rotation/runs${status ? `?status=${encodeURIComponent(status)}` : ""}`);
  }
  queueRotationRun(slug: string, body: { keys: string[]; project?: string; env?: string; approve?: boolean; desktop?: string; propagate?: boolean; allowRoll?: boolean }) {
    return this.request<{ run: RemoteRotationRun }>("POST", `/teams/${encodeURIComponent(slug)}/rotation/runs`, body);
  }
  /** Queue every automatic key past the team's max age (90 days by default) as one run awaiting approval. */
  queueDueRotation(slug: string) {
    return this.request<{ run: RemoteRotationRun | null; created: boolean; due: number; maxAgeDays: number; approveUrl: string }>("POST", `/teams/${encodeURIComponent(slug)}/rotation/due`);
  }
  approveRotationRun(slug: string, id: string) {
    return this.request<{ run: RemoteRotationRun }>("POST", `/teams/${encodeURIComponent(slug)}/rotation/runs/${encodeURIComponent(id)}/approve`);
  }
  claimRotationRun(slug: string, id: string) {
    return this.request<{ run: RemoteRotationRun }>("POST", `/teams/${encodeURIComponent(slug)}/rotation/runs/${encodeURIComponent(id)}/claim`);
  }
  reportRotationRun(slug: string, id: string, body: { status?: "failed"; error?: string; results: unknown[] }) {
    return this.request<{ run: RemoteRotationRun }>("POST", `/teams/${encodeURIComponent(slug)}/rotation/runs/${encodeURIComponent(id)}/result`, body);
  }

  listSecrets(vaultId: string) {
    return this.request<{ vaultId: string; keyVersion?: number; secrets: RemoteSecret[] }>("GET", `/vaults/${encodeURIComponent(vaultId)}/secrets`);
  }
  /**
   * `keyVersion` is the vault key version the ciphertext was made under (from
   * getMyGrant). The server refuses the write if the vault was re-keyed since,
   * so nothing lands under a retired key.
   */
  putSecrets(vaultId: string, upserts: Array<{ name: string; nonce: string; ciphertext: string; fingerprint: string }>, deletes: string[], keyVersion?: number) {
    return this.request<{ ok: boolean; applied: string[] }>("PUT", `/vaults/${encodeURIComponent(vaultId)}/secrets`, { upserts, deletes, ...(keyVersion !== undefined ? { keyVersion } : {}) });
  }
  /**
   * Swap the vault to a fresh DEK. The whole next state goes over in one call
   * because the server applies it in a single transaction — see rekey.ts for
   * why a partial rotation is unrecoverable.
   */
  rekeyVault(
    vaultId: string,
    body: {
      grants: Array<{ email: string; wrappedDek: string }>;
      secrets: Array<{ name: string; nonce: string; ciphertext: string; fingerprint: string }>;
      revoke: string[];
      keyGrants?: Array<{ keyId: string; wrappedDek: string }>;
    }
  ) {
    return this.request<RekeyResult>("POST", `/vaults/${encodeURIComponent(vaultId)}/rekey`, body);
  }
  // ---- machine-key grants (the vault key sealed to a machine key's own public key) ----
  listKeyGrants(vaultId: string) {
    return this.request<{ keyGrants: RemoteKeyGrant[] }>("GET", `/vaults/${encodeURIComponent(vaultId)}/key-grants`);
  }
  putKeyGrant(vaultId: string, keyId: string, wrappedDek: string) {
    return this.request<{ ok: boolean; keyId: string; name: string }>("POST", `/vaults/${encodeURIComponent(vaultId)}/key-grants`, { keyId, wrappedDek });
  }
  deleteKeyGrant(vaultId: string, keyId: string) {
    return this.request<{ ok: boolean; revoked: string }>("DELETE", `/vaults/${encodeURIComponent(vaultId)}/key-grants/${encodeURIComponent(keyId)}`);
  }

  // ---- API keys (/api/keys; a person's credential only, never a machine key) ----
  listApiKeys() {
    return this.requestAt<{ keys: RemoteApiKey[] }>("/api/keys", "GET");
  }
  createApiKey(input: CreateApiKeyInput) {
    return this.requestAt<{ key: RemoteApiKey; secret: string }>("/api/keys", "POST", input);
  }
  revokeApiKey(keyId: string) {
    return this.requestAt<{ ok: boolean; revoked: string }>(`/api/keys/${encodeURIComponent(keyId)}`, "DELETE");
  }

  listAudit(vaultId: string) {
    return this.request<{ audit: Array<Record<string, unknown>> }>("GET", `/vaults/${encodeURIComponent(vaultId)}/audit`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
