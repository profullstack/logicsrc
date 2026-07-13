import { createRequire } from "node:module";
import type { CredShareStore } from "./store.js";
import { normalizeEmail } from "./store.js";
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
  CredShareToken
} from "./types.js";

/**
 * Supabase-backed CredShareStore (production). Uses the SERVICE ROLE key and
 * enforces authorization in the router, not via RLS — RLS on these tables is
 * deny-by-default defense-in-depth. Returns `undefined` when unconfigured so
 * the API falls back to the in-memory store for local dev.
 *
 * Table columns are snake_case; this module maps to/from the camelCase domain
 * types. See supabase/migrations/*_credshare.sql.
 */
export function createSupabaseCredShareStore(): CredShareStore | undefined {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return undefined;

  // Lazy-require so the API runs without @supabase/supabase-js installed when
  // Supabase isn't configured (the memory store needs no dependency).
  const require = createRequire(import.meta.url);
  const { createClient } = require("@supabase/supabase-js") as typeof import("@supabase/supabase-js");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const T = {
    users: "credshare_users",
    loginCodes: "credshare_login_codes",
    tokens: "credshare_tokens",
    teams: "credshare_teams",
    members: "credshare_members",
    invites: "credshare_invites",
    vaults: "credshare_vaults",
    grants: "credshare_vault_grants",
    secrets: "credshare_secrets",
    audit: "credshare_audit"
  } as const;

  const userOut = (r: Record<string, unknown>): CredShareUser => ({ id: r.id as string, email: r.email as string, publicKey: (r.public_key as string) ?? null, createdAt: r.created_at as string });
  const teamOut = (r: Record<string, unknown>): CredShareTeam => ({ id: r.id as string, slug: r.slug as string, name: r.name as string, createdBy: r.created_by as string, createdAt: r.created_at as string });
  const memberOut = (r: Record<string, unknown>): CredShareMember => ({ id: r.id as string, teamId: r.team_id as string, userId: (r.user_id as string) ?? null, email: r.email as string, role: r.role as CredShareMember["role"], status: r.status as CredShareMember["status"], invitedBy: (r.invited_by as string) ?? null, createdAt: r.created_at as string, joinedAt: (r.joined_at as string) ?? null });
  const vaultOut = (r: Record<string, unknown>): CredShareVault => ({ id: r.id as string, teamId: r.team_id as string, name: r.name as string, createdBy: r.created_by as string, createdAt: r.created_at as string });
  const secretOut = (r: Record<string, unknown>): CredShareSecret => ({ vaultId: r.vault_id as string, name: r.name as string, nonce: r.nonce as string, ciphertext: r.ciphertext as string, fingerprint: r.fingerprint as string, version: r.version as number, updatedBy: r.updated_by as string, updatedAt: r.updated_at as string });
  const grantOut = (r: Record<string, unknown>): CredShareGrant => ({ vaultId: r.vault_id as string, userId: r.user_id as string, wrappedDek: r.wrapped_dek as string, grantedBy: r.granted_by as string, createdAt: r.created_at as string });
  const auditOut = (r: Record<string, unknown>): CredShareAuditEvent => ({ id: r.id as string, teamId: (r.team_id as string) ?? null, vaultId: (r.vault_id as string) ?? null, actorUserId: r.actor_user_id as string, action: r.action as string, keyName: (r.key_name as string) ?? null, fingerprint: (r.fingerprint as string) ?? null, createdAt: r.created_at as string });

  async function one<T>(query: PromiseLike<{ data: unknown; error: unknown }>, map: (r: Record<string, unknown>) => T): Promise<T | undefined> {
    const { data, error } = await query;
    if (error) throw error;
    return data ? map(data as Record<string, unknown>) : undefined;
  }

  return {
    async upsertUserByEmail(email) {
      const key = normalizeEmail(email);
      const existing = await one(db.from(T.users).select("*").eq("email", key).maybeSingle(), userOut);
      if (existing) return existing;
      const { data, error } = await db.from(T.users).insert({ email: key }).select("*").single();
      if (error) throw error;
      return userOut(data);
    },
    async getUserByEmail(email) {
      return one(db.from(T.users).select("*").eq("email", normalizeEmail(email)).maybeSingle(), userOut);
    },
    async getUserById(id) {
      return one(db.from(T.users).select("*").eq("id", id).maybeSingle(), userOut);
    },
    async setUserPublicKey(userId, publicKey) {
      const { data, error } = await db.from(T.users).update({ public_key: publicKey }).eq("id", userId).select("*").single();
      if (error) throw error;
      return userOut(data);
    },

    async saveLoginCode(code: CredShareLoginCode) {
      await db.from(T.loginCodes).delete().eq("email", code.email);
      const { error } = await db.from(T.loginCodes).insert({ email: code.email, code_hash: code.codeHash, expires_at: code.expiresAt });
      if (error) throw error;
    },
    async consumeLoginCode(email, codeHash, nowDate) {
      const { data, error } = await db.from(T.loginCodes).select("*").eq("email", normalizeEmail(email)).eq("code_hash", codeHash).maybeSingle();
      if (error) throw error;
      if (!data || new Date(data.expires_at as string).getTime() < nowDate.getTime()) return false;
      await db.from(T.loginCodes).delete().eq("email", normalizeEmail(email));
      return true;
    },
    async saveToken(token: CredShareToken) {
      const { error } = await db.from(T.tokens).insert({ token_hash: token.tokenHash, user_id: token.userId });
      if (error) throw error;
    },
    async getUserIdForToken(tokenHash) {
      const { data, error } = await db.from(T.tokens).select("user_id").eq("token_hash", tokenHash).maybeSingle();
      if (error) throw error;
      if (data) await db.from(T.tokens).update({ last_used_at: new Date().toISOString() }).eq("token_hash", tokenHash);
      return (data?.user_id as string) ?? undefined;
    },
    async deleteToken(tokenHash) {
      await db.from(T.tokens).delete().eq("token_hash", tokenHash);
    },

    async createTeam({ slug, name, createdBy }) {
      const { data, error } = await db.from(T.teams).insert({ slug, name, created_by: createdBy }).select("*").single();
      if (error) throw error;
      return teamOut(data);
    },
    async getTeamBySlug(slug) {
      return one(db.from(T.teams).select("*").eq("slug", slug).maybeSingle(), teamOut);
    },
    async listTeamsForUser(userId) {
      const { data, error } = await db.from(T.members).select("team_id").eq("user_id", userId).eq("status", "active");
      if (error) throw error;
      const ids = (data ?? []).map((r) => r.team_id as string);
      if (ids.length === 0) return [];
      const { data: teams, error: teamErr } = await db.from(T.teams).select("*").in("id", ids);
      if (teamErr) throw teamErr;
      return (teams ?? []).map(teamOut);
    },
    async addMember(input) {
      const { data, error } = await db
        .from(T.members)
        .insert({ team_id: input.teamId, user_id: input.userId, email: input.email, role: input.role, status: input.status, invited_by: input.invitedBy, joined_at: input.joinedAt })
        .select("*")
        .single();
      if (error) throw error;
      return memberOut(data);
    },
    async getMember(teamId, userId) {
      return one(db.from(T.members).select("*").eq("team_id", teamId).eq("user_id", userId).maybeSingle(), memberOut);
    },
    async getMemberByEmail(teamId, email) {
      return one(db.from(T.members).select("*").eq("team_id", teamId).eq("email", normalizeEmail(email)).maybeSingle(), memberOut);
    },
    async listMembers(teamId) {
      const { data, error } = await db.from(T.members).select("*").eq("team_id", teamId).order("created_at");
      if (error) throw error;
      return (data ?? []).map(memberOut);
    },
    async updateMember(teamId, email, patch) {
      const update: Record<string, unknown> = {};
      if (patch.userId !== undefined) update.user_id = patch.userId;
      if (patch.status !== undefined) update.status = patch.status;
      if (patch.joinedAt !== undefined) update.joined_at = patch.joinedAt;
      if (patch.role !== undefined) update.role = patch.role;
      return one(db.from(T.members).update(update).eq("team_id", teamId).eq("email", normalizeEmail(email)).select("*").maybeSingle(), memberOut);
    },

    async createInvite(input) {
      const { data, error } = await db
        .from(T.invites)
        .insert({ team_id: input.teamId, email: input.email, role: input.role, token_hash: input.tokenHash, created_by: input.createdBy, expires_at: input.expiresAt })
        .select("*")
        .single();
      if (error) throw error;
      const r = data as Record<string, unknown>;
      return { id: r.id as string, teamId: r.team_id as string, email: r.email as string, role: r.role as CredShareInvite["role"], tokenHash: r.token_hash as string, createdBy: r.created_by as string, expiresAt: r.expires_at as string, acceptedAt: (r.accepted_at as string) ?? null, createdAt: r.created_at as string };
    },
    async getInviteByTokenHash(tokenHash) {
      const { data, error } = await db.from(T.invites).select("*").eq("token_hash", tokenHash).maybeSingle();
      if (error) throw error;
      if (!data) return undefined;
      const r = data as Record<string, unknown>;
      return { id: r.id as string, teamId: r.team_id as string, email: r.email as string, role: r.role as CredShareInvite["role"], tokenHash: r.token_hash as string, createdBy: r.created_by as string, expiresAt: r.expires_at as string, acceptedAt: (r.accepted_at as string) ?? null, createdAt: r.created_at as string };
    },
    async markInviteAccepted(id, at) {
      await db.from(T.invites).update({ accepted_at: at }).eq("id", id);
    },

    async createVault({ teamId, name, createdBy }) {
      const { data, error } = await db.from(T.vaults).insert({ team_id: teamId, name, created_by: createdBy }).select("*").single();
      if (error) throw error;
      return vaultOut(data);
    },
    async getVault(teamId, name) {
      return one(db.from(T.vaults).select("*").eq("team_id", teamId).eq("name", name).maybeSingle(), vaultOut);
    },
    async getVaultById(vaultId) {
      return one(db.from(T.vaults).select("*").eq("id", vaultId).maybeSingle(), vaultOut);
    },
    async listVaults(teamId) {
      const { data, error } = await db.from(T.vaults).select("*").eq("team_id", teamId).order("name");
      if (error) throw error;
      return (data ?? []).map(vaultOut);
    },
    async upsertGrant(grant) {
      const { error } = await db
        .from(T.grants)
        .upsert({ vault_id: grant.vaultId, user_id: grant.userId, wrapped_dek: grant.wrappedDek, granted_by: grant.grantedBy }, { onConflict: "vault_id,user_id" });
      if (error) throw error;
    },
    async getGrant(vaultId, userId) {
      return one(db.from(T.grants).select("*").eq("vault_id", vaultId).eq("user_id", userId).maybeSingle(), grantOut);
    },
    async listGrants(vaultId) {
      const { data, error } = await db.from(T.grants).select("*").eq("vault_id", vaultId);
      if (error) throw error;
      return (data ?? []).map(grantOut);
    },
    async listSecrets(vaultId) {
      const { data, error } = await db.from(T.secrets).select("*").eq("vault_id", vaultId).order("name");
      if (error) throw error;
      return (data ?? []).map(secretOut);
    },
    async putSecret(secret) {
      const { error } = await db
        .from(T.secrets)
        .upsert({ vault_id: secret.vaultId, name: secret.name, nonce: secret.nonce, ciphertext: secret.ciphertext, fingerprint: secret.fingerprint, version: secret.version, updated_by: secret.updatedBy, updated_at: secret.updatedAt }, { onConflict: "vault_id,name" });
      if (error) throw error;
    },
    async deleteSecret(vaultId, name) {
      await db.from(T.secrets).delete().eq("vault_id", vaultId).eq("name", name);
    },

    async appendAudit(event) {
      const { data, error } = await db
        .from(T.audit)
        .insert({ team_id: event.teamId, vault_id: event.vaultId, actor_user_id: event.actorUserId, action: event.action, key_name: event.keyName, fingerprint: event.fingerprint })
        .select("*")
        .single();
      if (error) throw error;
      return auditOut(data);
    },
    async listAudit(vaultId) {
      const { data, error } = await db.from(T.audit).select("*").eq("vault_id", vaultId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(auditOut);
    }
  };
}
