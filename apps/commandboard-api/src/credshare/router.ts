import { randomBytes, createHash } from "node:crypto";
import { hashToken, normalizeEmail, type CredShareStore } from "./store.js";
import type { CredShareMember, MemberRole } from "./types.js";

export interface CredShareRequest {
  method: string;
  /** Path AFTER the /api/credshare prefix, e.g. "/teams/acme/members". */
  path: string;
  query: URLSearchParams;
  body: unknown;
  /** Bearer token (without the "Bearer " prefix), if present. */
  token?: string;
}

export interface CredShareResponse {
  status: number;
  body: unknown;
}

export interface CredShareEmailSender {
  sendLoginCode(email: string, code: string): Promise<void>;
  sendInvite(input: { email: string; token: string; teamName: string; teamSlug: string; invitedByEmail: string }): Promise<void>;
}

export interface CredShareApiOptions {
  store: CredShareStore;
  email?: CredShareEmailSender;
  /** Public base URL used to build invite-accept links in emails. */
  webBaseUrl?: string;
  now?: () => Date;
  /** Test seams. */
  generateCode?: () => string;
  generateToken?: () => string;
  loginCodeTtlMs?: number;
  inviteTtlMs?: number;
}

const ROLE_RANK: Record<MemberRole, number> = { member: 0, admin: 1, owner: 2 };

function ok(body: unknown, status = 200): CredShareResponse {
  return { status, body };
}
function err(status: number, message: string): CredShareResponse {
  return { status, body: { error: message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** A member view safe to return to teammates (no tokens/keys, just identity + status). */
function memberView(m: CredShareMember, publicKey: string | null | undefined, hasGrant?: boolean) {
  return {
    email: m.email,
    role: m.role,
    status: m.status,
    hasPublicKey: Boolean(publicKey),
    ...(hasGrant === undefined ? {} : { hasVaultAccess: hasGrant }),
    joinedAt: m.joinedAt
  };
}

export function createCredShareApi(options: CredShareApiOptions) {
  const { store, email } = options;
  const now = options.now ?? (() => new Date());
  const generateCode = options.generateCode ?? (() => String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0"));
  const generateToken = options.generateToken ?? (() => randomBytes(32).toString("base64url"));
  const loginCodeTtlMs = options.loginCodeTtlMs ?? 10 * 60 * 1000;
  const inviteTtlMs = options.inviteTtlMs ?? 7 * 24 * 60 * 60 * 1000;

  async function currentUserId(req: CredShareRequest): Promise<string | undefined> {
    if (!req.token) return undefined;
    return store.getUserIdForToken(hashToken(req.token));
  }

  type MemberGuard =
    | { ok: true; team: Awaited<ReturnType<CredShareStore["getTeamBySlug"]>> & object; member: CredShareMember }
    | { ok: false; response: CredShareResponse };

  async function requireMember(teamSlug: string, userId: string): Promise<MemberGuard> {
    const team = await store.getTeamBySlug(teamSlug);
    if (!team) return { ok: false, response: err(404, `Unknown team: ${teamSlug}`) };
    const member = await store.getMember(team.id, userId);
    if (!member || member.status !== "active") {
      return { ok: false, response: err(403, "You are not a member of this team.") };
    }
    return { ok: true, team, member };
  }

  async function handle(req: CredShareRequest): Promise<CredShareResponse> {
    const { method, path } = req;

    // ---- auth (unauthenticated) ------------------------------------------
    if (method === "POST" && path === "/auth/request") {
      if (!isRecord(req.body) || !str(req.body.email)) return err(422, "Expected { email }.");
      const emailAddr = normalizeEmail(str(req.body.email)!);
      const code = generateCode();
      await store.saveLoginCode({
        email: emailAddr,
        codeHash: createHash("sha256").update(code).digest("hex"),
        expiresAt: new Date(now().getTime() + loginCodeTtlMs).toISOString(),
        createdAt: now().toISOString()
      });
      let delivered = false;
      if (email) {
        await email.sendLoginCode(emailAddr, code);
        delivered = true;
      }
      // When no email transport is configured (local dev/tests), echo the code so
      // the flow is still usable. Never echo it once real delivery is on.
      return ok({ ok: true, emailSent: delivered, ...(delivered ? {} : { devCode: code }) });
    }

    if (method === "POST" && path === "/auth/verify") {
      if (!isRecord(req.body) || !str(req.body.email) || !str(req.body.code)) return err(422, "Expected { email, code }.");
      const emailAddr = normalizeEmail(str(req.body.email)!);
      const codeHash = createHash("sha256").update(str(req.body.code)!).digest("hex");
      const valid = await store.consumeLoginCode(emailAddr, codeHash, now());
      if (!valid) return err(401, "Invalid or expired code.");
      const user = await store.upsertUserByEmail(emailAddr);
      const token = generateToken();
      await store.saveToken({ tokenHash: hashToken(token), userId: user.id, createdAt: now().toISOString(), lastUsedAt: null });
      return ok({ token, user: { id: user.id, email: user.email, publicKey: user.publicKey } });
    }

    // ---- everything below requires a valid token -------------------------
    const userId = await currentUserId(req);
    if (!userId) return err(401, "Missing or invalid token. Run: logicsrc login --email you@example.com");
    const me = await store.getUserById(userId);
    if (!me) return err(401, "Unknown user for token.");

    if (method === "POST" && path === "/logout") {
      if (req.token) await store.deleteToken(hashToken(req.token));
      return ok({ ok: true });
    }

    if (method === "POST" && path === "/keys") {
      if (!isRecord(req.body) || !str(req.body.publicKey)) return err(422, "Expected { publicKey }.");
      const updated = await store.setUserPublicKey(userId, str(req.body.publicKey)!);
      return ok({ email: updated.email, publicKey: updated.publicKey });
    }

    if (method === "GET" && path === "/me") {
      const teams = await store.listTeamsForUser(userId);
      return ok({ user: { id: me.id, email: me.email, publicKey: me.publicKey }, teams });
    }

    if (method === "GET" && path === "/users") {
      const target = req.query.get("email");
      if (!target) return err(422, "Expected ?email=");
      const user = await store.getUserByEmail(target);
      return ok({ email: normalizeEmail(target), userId: user?.id ?? null, publicKey: user?.publicKey ?? null });
    }

    // ---- teams -----------------------------------------------------------
    if (method === "POST" && path === "/teams") {
      if (!isRecord(req.body) || !str(req.body.slug)) return err(422, "Expected { slug, name? }.");
      const slug = normalizeSlug(str(req.body.slug)!);
      if (!slug) return err(422, "Slug must be lowercase letters, numbers, and dashes.");
      if (await store.getTeamBySlug(slug)) return err(409, `Team slug "${slug}" is taken.`);
      const team = await store.createTeam({ slug, name: str(req.body.name) ?? slug, createdBy: userId });
      await store.addMember({
        teamId: team.id,
        userId,
        email: me.email,
        role: "owner",
        status: "active",
        invitedBy: null,
        joinedAt: now().toISOString()
      });
      await store.appendAudit({ teamId: team.id, vaultId: null, actorUserId: userId, action: "team:create", keyName: null, fingerprint: null });
      return ok({ team }, 201);
    }

    if (method === "GET" && path === "/teams") {
      return ok({ teams: await store.listTeamsForUser(userId) });
    }

    const membersMatch = /^\/teams\/([^/]+)\/members$/.exec(path);
    if (membersMatch && method === "GET") {
      const guard = await requireMember(decodeURIComponent(membersMatch[1]), userId);
      if (!guard.ok) return guard.response;
      const rows = await store.listMembers(guard.team.id);
      const views = await Promise.all(
        rows.map(async (m) => {
          const u = m.userId ? await store.getUserById(m.userId) : undefined;
          return memberView(m, u?.publicKey);
        })
      );
      return ok({ members: views });
    }

    // ---- invites ---------------------------------------------------------
    const invitesMatch = /^\/teams\/([^/]+)\/invites$/.exec(path);
    if (invitesMatch && method === "POST") {
      const guard = await requireMember(decodeURIComponent(invitesMatch[1]), userId);
      if (!guard.ok) return guard.response;
      if (ROLE_RANK[guard.member.role] < ROLE_RANK.admin) return err(403, "Only owners and admins can invite.");
      if (!isRecord(req.body) || !str(req.body.email)) return err(422, "Expected { email, role? }.");
      const inviteEmail = normalizeEmail(str(req.body.email)!);
      const role = (str(req.body.role) as MemberRole) ?? "member";
      if (!(role in ROLE_RANK)) return err(422, "role must be owner|admin|member.");

      // Ensure a (possibly invited) member row exists.
      const existing = await store.getMemberByEmail(guard.team.id, inviteEmail);
      if (!existing) {
        const invitedUser = await store.getUserByEmail(inviteEmail);
        await store.addMember({
          teamId: guard.team.id,
          userId: invitedUser?.id ?? null,
          email: inviteEmail,
          role,
          status: "invited",
          invitedBy: userId,
          joinedAt: null
        });
      }
      const token = generateToken();
      const invite = await store.createInvite({
        teamId: guard.team.id,
        email: inviteEmail,
        role,
        tokenHash: hashToken(token),
        createdBy: userId,
        expiresAt: new Date(now().getTime() + inviteTtlMs).toISOString()
      });
      await store.appendAudit({ teamId: guard.team.id, vaultId: null, actorUserId: userId, action: "team:invite", keyName: inviteEmail, fingerprint: null });
      let delivered = false;
      if (email) {
        await email.sendInvite({ email: inviteEmail, token, teamName: guard.team.name, teamSlug: guard.team.slug, invitedByEmail: me.email });
        delivered = true;
      }
      return ok(
        { invite: { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt }, emailSent: delivered, ...(delivered ? {} : { token }) },
        201
      );
    }

    if (method === "POST" && path === "/invites/accept") {
      if (!isRecord(req.body) || !str(req.body.token)) return err(422, "Expected { token }.");
      const invite = await store.getInviteByTokenHash(hashToken(str(req.body.token)!));
      if (!invite) return err(404, "Invite not found.");
      if (invite.acceptedAt) return err(409, "Invite already used.");
      if (new Date(invite.expiresAt).getTime() < now().getTime()) return err(410, "Invite expired.");
      if (invite.email !== me.email) return err(403, `This invite is for ${invite.email}, not ${me.email}.`);
      await store.updateMember(invite.teamId, me.email, { userId, status: "active", joinedAt: now().toISOString() });
      await store.markInviteAccepted(invite.id, now().toISOString());
      await store.appendAudit({ teamId: invite.teamId, vaultId: null, actorUserId: userId, action: "team:join", keyName: null, fingerprint: null });
      const team = (await store.listTeamsForUser(userId)).find((t) => t.id === invite.teamId);
      return ok({ ok: true, team });
    }

    // ---- vaults ----------------------------------------------------------
    const vaultsMatch = /^\/teams\/([^/]+)\/vaults$/.exec(path);
    if (vaultsMatch) {
      const guard = await requireMember(decodeURIComponent(vaultsMatch[1]), userId);
      if (!guard.ok) return guard.response;
      if (method === "GET") {
        const vaults = await store.listVaults(guard.team.id);
        const rows = await Promise.all(
          vaults.map(async (v) => ({
            id: v.id,
            name: v.name,
            hasAccess: Boolean(await store.getGrant(v.id, userId)),
            secretCount: (await store.listSecrets(v.id)).length
          }))
        );
        return ok({ vaults: rows });
      }
      if (method === "POST") {
        if (!isRecord(req.body) || !str(req.body.name)) return err(422, "Expected { name }.");
        const name = normalizeSlug(str(req.body.name)!);
        if (!name) return err(422, "Vault name must be lowercase letters, numbers, and dashes.");
        const existing = await store.getVault(guard.team.id, name);
        if (existing) return ok({ vault: existing });
        const vault = await store.createVault({ teamId: guard.team.id, name, createdBy: userId });
        await store.appendAudit({ teamId: guard.team.id, vaultId: vault.id, actorUserId: userId, action: "vault:create", keyName: null, fingerprint: null });
        return ok({ vault }, 201);
      }
    }

    // ---- vault grants / secrets / audit (addressed by vault id) ----------
    const vaultIdMatch = /^\/vaults\/([^/]+)\/(grant|grants|secrets|audit)$/.exec(path);
    if (vaultIdMatch) {
      const vaultId = decodeURIComponent(vaultIdMatch[1]);
      const sub = vaultIdMatch[2];
      const vault = await store.getVaultById(vaultId);
      if (!vault) return err(404, "Unknown vault.");
      const member = await store.getMember(vault.teamId, userId);
      if (!member || member.status !== "active") return err(403, "You are not a member of this vault's team.");

      if (sub === "grant" && method === "GET") {
        const grant = await store.getGrant(vaultId, userId);
        if (!grant) return err(403, "You do not have access to this vault yet. Ask a member to grant you.");
        return ok({ wrappedDek: grant.wrappedDek });
      }

      if (sub === "grants") {
        if (method === "GET") {
          const grants = await store.listGrants(vaultId);
          const grantedUserIds = new Set(grants.map((g) => g.userId));
          const members = await store.listMembers(vault.teamId);
          const rows = await Promise.all(
            members.map(async (m) => {
              const u = m.userId ? await store.getUserById(m.userId) : undefined;
              return { email: m.email, hasPublicKey: Boolean(u?.publicKey), hasAccess: Boolean(m.userId && grantedUserIds.has(m.userId)) };
            })
          );
          return ok({ grants: rows });
        }
        if (method === "POST") {
          // The caller must already hold access (they can produce a valid wrapped DEK).
          const iHold = await store.getGrant(vaultId, userId);
          if (!iHold && (await store.listGrants(vaultId)).length > 0) {
            return err(403, "Only a member with vault access can grant others.");
          }
          if (!isRecord(req.body) || !str(req.body.wrappedDek) || !str(req.body.email)) {
            return err(422, "Expected { email, wrappedDek }.");
          }
          const targetUser = await store.getUserByEmail(str(req.body.email)!);
          if (!targetUser) return err(404, "Target user has not logged in yet.");
          if (!targetUser.publicKey) return err(409, "Target user has not uploaded a public key yet.");
          await store.upsertGrant({ vaultId, userId: targetUser.id, wrappedDek: str(req.body.wrappedDek)!, grantedBy: userId, createdAt: now().toISOString() });
          await store.appendAudit({ teamId: vault.teamId, vaultId, actorUserId: userId, action: "vault:grant", keyName: targetUser.email, fingerprint: null });
          return ok({ ok: true }, 201);
        }
      }

      if (sub === "secrets") {
        if (method === "GET") {
          const secrets = await store.listSecrets(vaultId);
          return ok({
            vaultId,
            secrets: secrets.map((s) => ({ name: s.name, nonce: s.nonce, ciphertext: s.ciphertext, fingerprint: s.fingerprint, version: s.version, updatedAt: s.updatedAt }))
          });
        }
        if (method === "PUT") {
          if (!isRecord(req.body)) return err(422, "Expected { upserts?, deletes? }.");
          const upserts = Array.isArray(req.body.upserts) ? req.body.upserts : [];
          const deletes = Array.isArray(req.body.deletes) ? req.body.deletes : [];
          const existing = new Map((await store.listSecrets(vaultId)).map((s) => [s.name, s]));
          const applied: string[] = [];
          for (const raw of upserts) {
            if (!isRecord(raw) || !str(raw.name) || !str(raw.nonce) || !str(raw.ciphertext) || !str(raw.fingerprint)) {
              return err(422, "Each upsert needs { name, nonce, ciphertext, fingerprint }.");
            }
            const name = str(raw.name)!;
            const prev = existing.get(name);
            await store.putSecret({
              vaultId,
              name,
              nonce: str(raw.nonce)!,
              ciphertext: str(raw.ciphertext)!,
              fingerprint: str(raw.fingerprint)!,
              version: (prev?.version ?? 0) + 1,
              updatedBy: userId,
              updatedAt: now().toISOString()
            });
            await store.appendAudit({ teamId: vault.teamId, vaultId, actorUserId: userId, action: prev ? "secret:update" : "secret:add", keyName: name, fingerprint: str(raw.fingerprint)! });
            applied.push(name);
          }
          for (const raw of deletes) {
            const name = str(raw);
            if (!name) continue;
            await store.deleteSecret(vaultId, name);
            await store.appendAudit({ teamId: vault.teamId, vaultId, actorUserId: userId, action: "secret:remove", keyName: name, fingerprint: null });
            applied.push(name);
          }
          return ok({ ok: true, applied });
        }
      }

      if (sub === "audit" && method === "GET") {
        return ok({ audit: await store.listAudit(vaultId) });
      }
    }

    return err(404, "Not found");
  }

  return { handle };
}

function normalizeSlug(input: string): string | undefined {
  const slug = input.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(slug) ? slug : undefined;
}
