import { randomUUID, createHash } from "node:crypto";
import type {
  CredShareUser,
  CredShareTeam,
  CredShareMember,
  CredShareInvite,
  CredShareVault,
  CredShareGrant,
  CredShareSecret,
  CredShareAuditEvent,
  CredShareLoginCode,
  CredShareToken,
  MemberRole,
  MemberStatus
} from "./types.js";

/**
 * Storage boundary for the credential-sharing server. The router talks only to
 * this interface, so it can run against an in-memory map (tests / local dev) or
 * Supabase (production) without changing a line of route logic.
 */
export interface CredShareStore {
  // users + keys
  upsertUserByEmail(email: string): Promise<CredShareUser>;
  getUserByEmail(email: string): Promise<CredShareUser | undefined>;
  getUserById(id: string): Promise<CredShareUser | undefined>;
  setUserPublicKey(userId: string, publicKey: string): Promise<CredShareUser>;

  // auth
  saveLoginCode(code: CredShareLoginCode): Promise<void>;
  consumeLoginCode(email: string, codeHash: string, now: Date): Promise<boolean>;
  saveToken(token: CredShareToken): Promise<void>;
  getUserIdForToken(tokenHash: string): Promise<string | undefined>;
  deleteToken(tokenHash: string): Promise<void>;

  // teams + members
  createTeam(input: { slug: string; name: string; createdBy: string }): Promise<CredShareTeam>;
  getTeamBySlug(slug: string): Promise<CredShareTeam | undefined>;
  listTeamsForUser(userId: string): Promise<CredShareTeam[]>;
  addMember(input: Omit<CredShareMember, "id" | "createdAt">): Promise<CredShareMember>;
  getMember(teamId: string, userId: string): Promise<CredShareMember | undefined>;
  getMemberByEmail(teamId: string, email: string): Promise<CredShareMember | undefined>;
  listMembers(teamId: string): Promise<CredShareMember[]>;
  updateMember(
    teamId: string,
    email: string,
    patch: Partial<Pick<CredShareMember, "userId" | "status" | "joinedAt" | "role">>
  ): Promise<CredShareMember | undefined>;

  // invites
  createInvite(input: Omit<CredShareInvite, "id" | "createdAt" | "acceptedAt">): Promise<CredShareInvite>;
  getInviteByTokenHash(tokenHash: string): Promise<CredShareInvite | undefined>;
  markInviteAccepted(id: string, at: string): Promise<void>;

  // vaults + grants + secrets
  createVault(input: { teamId: string; name: string; createdBy: string }): Promise<CredShareVault>;
  getVault(teamId: string, name: string): Promise<CredShareVault | undefined>;
  getVaultById(vaultId: string): Promise<CredShareVault | undefined>;
  listVaults(teamId: string): Promise<CredShareVault[]>;
  upsertGrant(grant: CredShareGrant): Promise<void>;
  getGrant(vaultId: string, userId: string): Promise<CredShareGrant | undefined>;
  listGrants(vaultId: string): Promise<CredShareGrant[]>;
  listSecrets(vaultId: string): Promise<CredShareSecret[]>;
  putSecret(secret: CredShareSecret): Promise<void>;
  deleteSecret(vaultId: string, name: string): Promise<void>;

  // audit
  appendAudit(event: Omit<CredShareAuditEvent, "id" | "createdAt">): Promise<CredShareAuditEvent>;
  listAudit(vaultId: string): Promise<CredShareAuditEvent[]>;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** In-memory store — used by tests and single-process local dev. */
export function createMemoryCredShareStore(): CredShareStore {
  const users = new Map<string, CredShareUser>(); // by id
  const usersByEmail = new Map<string, string>(); // email -> id
  const loginCodes = new Map<string, CredShareLoginCode>(); // email -> code
  const tokens = new Map<string, CredShareToken>(); // tokenHash -> token
  const teams = new Map<string, CredShareTeam>(); // by id
  const teamsBySlug = new Map<string, string>(); // slug -> id
  const members: CredShareMember[] = [];
  const invites = new Map<string, CredShareInvite>(); // by id
  const vaults = new Map<string, CredShareVault>(); // by id
  const grants = new Map<string, CredShareGrant>(); // `${vaultId}:${userId}`
  const secrets = new Map<string, CredShareSecret>(); // `${vaultId}:${name}`
  const audit: CredShareAuditEvent[] = [];

  const iso = () => new Date().toISOString();

  return {
    async upsertUserByEmail(email) {
      const key = normalizeEmail(email);
      const existingId = usersByEmail.get(key);
      if (existingId) {
        return users.get(existingId)!;
      }
      const user: CredShareUser = { id: randomUUID(), email: key, publicKey: null, createdAt: iso() };
      users.set(user.id, user);
      usersByEmail.set(key, user.id);
      return user;
    },
    async getUserByEmail(email) {
      const id = usersByEmail.get(normalizeEmail(email));
      return id ? users.get(id) : undefined;
    },
    async getUserById(id) {
      return users.get(id);
    },
    async setUserPublicKey(userId, publicKey) {
      const user = users.get(userId);
      if (!user) throw new Error("user not found");
      user.publicKey = publicKey;
      return user;
    },

    async saveLoginCode(code) {
      loginCodes.set(normalizeEmail(code.email), code);
    },
    async consumeLoginCode(email, codeHash, now) {
      const key = normalizeEmail(email);
      const code = loginCodes.get(key);
      if (!code || code.codeHash !== codeHash || new Date(code.expiresAt).getTime() < now.getTime()) {
        return false;
      }
      loginCodes.delete(key);
      return true;
    },
    async saveToken(token) {
      tokens.set(token.tokenHash, token);
    },
    async getUserIdForToken(tokenHash) {
      const token = tokens.get(tokenHash);
      if (token) {
        token.lastUsedAt = iso();
      }
      return token?.userId;
    },
    async deleteToken(tokenHash) {
      tokens.delete(tokenHash);
    },

    async createTeam({ slug, name, createdBy }) {
      const team: CredShareTeam = { id: randomUUID(), slug, name, createdBy, createdAt: iso() };
      teams.set(team.id, team);
      teamsBySlug.set(slug, team.id);
      return team;
    },
    async getTeamBySlug(slug) {
      const id = teamsBySlug.get(slug);
      return id ? teams.get(id) : undefined;
    },
    async listTeamsForUser(userId) {
      const teamIds = new Set(members.filter((m) => m.userId === userId && m.status === "active").map((m) => m.teamId));
      return [...teamIds].map((id) => teams.get(id)!).filter(Boolean);
    },
    async addMember(input) {
      const member: CredShareMember = { ...input, id: randomUUID(), createdAt: iso() };
      members.push(member);
      return member;
    },
    async getMember(teamId, userId) {
      return members.find((m) => m.teamId === teamId && m.userId === userId);
    },
    async getMemberByEmail(teamId, email) {
      const key = normalizeEmail(email);
      return members.find((m) => m.teamId === teamId && m.email === key);
    },
    async listMembers(teamId) {
      return members.filter((m) => m.teamId === teamId);
    },
    async updateMember(teamId, email, patch) {
      const key = normalizeEmail(email);
      const member = members.find((m) => m.teamId === teamId && m.email === key);
      if (!member) return undefined;
      Object.assign(member, patch);
      return member;
    },

    async createInvite(input) {
      const invite: CredShareInvite = { ...input, id: randomUUID(), acceptedAt: null, createdAt: iso() };
      invites.set(invite.id, invite);
      return invite;
    },
    async getInviteByTokenHash(tokenHash) {
      return [...invites.values()].find((i) => i.tokenHash === tokenHash);
    },
    async markInviteAccepted(id, at) {
      const invite = invites.get(id);
      if (invite) invite.acceptedAt = at;
    },

    async createVault({ teamId, name, createdBy }) {
      const vault: CredShareVault = { id: randomUUID(), teamId, name, createdBy, createdAt: iso() };
      vaults.set(vault.id, vault);
      return vault;
    },
    async getVault(teamId, name) {
      return [...vaults.values()].find((v) => v.teamId === teamId && v.name === name);
    },
    async getVaultById(vaultId) {
      return vaults.get(vaultId);
    },
    async listVaults(teamId) {
      return [...vaults.values()].filter((v) => v.teamId === teamId);
    },
    async upsertGrant(grant) {
      grants.set(`${grant.vaultId}:${grant.userId}`, grant);
    },
    async getGrant(vaultId, userId) {
      return grants.get(`${vaultId}:${userId}`);
    },
    async listGrants(vaultId) {
      return [...grants.values()].filter((g) => g.vaultId === vaultId);
    },
    async listSecrets(vaultId) {
      return [...secrets.values()].filter((s) => s.vaultId === vaultId).sort((a, b) => a.name.localeCompare(b.name));
    },
    async putSecret(secret) {
      secrets.set(`${secret.vaultId}:${secret.name}`, secret);
    },
    async deleteSecret(vaultId, name) {
      secrets.delete(`${vaultId}:${name}`);
    },

    async appendAudit(event) {
      const full: CredShareAuditEvent = { ...event, id: randomUUID(), createdAt: iso() };
      audit.push(full);
      return full;
    },
    async listAudit(vaultId) {
      return audit.filter((e) => e.vaultId === vaultId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
  };
}

export type { MemberRole, MemberStatus };
