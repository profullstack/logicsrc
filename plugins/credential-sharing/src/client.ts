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
  email: string;
  role: "owner" | "admin" | "member";
  status: "active" | "invited";
  hasPublicKey: boolean;
  joinedAt: string | null;
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
  hasPublicKey: boolean;
  hasAccess: boolean;
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

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.token) headers["authorization"] = `Bearer ${this.token}`;
    const response = await fetch(`${this.apiUrl}/api/credshare${path}`, {
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
    return this.request<{ user: RemoteUser; teams: RemoteTeam[] }>("GET", "/me");
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
    return this.request<{ invite: { id: string; email: string; role: string; expiresAt: string }; emailSent: boolean; token?: string }>(
      "POST",
      `/teams/${encodeURIComponent(slug)}/invites`,
      { email, role }
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
    return this.request<{ wrappedDek: string }>("GET", `/vaults/${encodeURIComponent(vaultId)}/grant`);
  }
  listGrants(vaultId: string) {
    return this.request<{ grants: RemoteGrantRow[] }>("GET", `/vaults/${encodeURIComponent(vaultId)}/grants`);
  }
  putGrant(vaultId: string, email: string, wrappedDek: string) {
    return this.request<{ ok: boolean }>("POST", `/vaults/${encodeURIComponent(vaultId)}/grants`, { email, wrappedDek });
  }
  listSecrets(vaultId: string) {
    return this.request<{ vaultId: string; secrets: RemoteSecret[] }>("GET", `/vaults/${encodeURIComponent(vaultId)}/secrets`);
  }
  putSecrets(vaultId: string, upserts: Array<{ name: string; nonce: string; ciphertext: string; fingerprint: string }>, deletes: string[]) {
    return this.request<{ ok: boolean; applied: string[] }>("PUT", `/vaults/${encodeURIComponent(vaultId)}/secrets`, { upserts, deletes });
  }
  listAudit(vaultId: string) {
    return this.request<{ audit: Array<Record<string, unknown>> }>("GET", `/vaults/${encodeURIComponent(vaultId)}/audit`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
