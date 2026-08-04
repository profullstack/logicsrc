// LogicSRC credential sharing API (end-to-end encrypted team vaults).
//
// Zero-knowledge: this server only ever stores ciphertext, per-member sealed
// vault keys, and member identity public keys. All crypto happens in the CLI.
//
// Auth: the acting user comes from a browser session (req.user) OR a
// `Bearer lsk_…` API key (the logicsrc CLI). Mounted at /api/credshare.
import { Router } from "express";
import { get, all, run, batch } from "../db.mjs";
import { id, sha256 } from "../lib/crypto.mjs";
import { bearer, userForApiKey } from "../lib/apikey.mjs";
import {
  TeamMemberError,
  normEmail,
  issueTeamInvite,
  changeMemberRole,
  removeTeamMember
} from "../lib/team-members.mjs";

export const credshareRouter = Router();

const norm = normEmail;
const slugify = (s) => {
  const v = String(s || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(v) ? v : null;
};

// Resolve the acting user from session or API key.
async function actor(req) {
  if (req.user) return req.user;
  return userForApiKey(bearer(req));
}
function api(handler) {
  return async (req, res) => {
    const user = await actor(req);
    if (!user) return res.status(401).json({ error: "Not authenticated. Run: logicsrc login" });
    try {
      await handler(req, res, user);
    } catch (e) {
      console.error("credshare:", e);
      res.status(500).json({ error: e.message || String(e) });
    }
  };
}

async function requireMember(res, slug, userId) {
  const team = await get(`SELECT * FROM credshare_teams WHERE slug = ?`, [slug]);
  if (!team) { res.status(404).json({ error: `Unknown team: ${slug}` }); return null; }
  const member = await get(`SELECT * FROM credshare_members WHERE team_id = ? AND user_id = ?`, [team.id, userId]);
  if (!member || member.status !== "active") { res.status(403).json({ error: "You are not a member of this team." }); return null; }
  return { team, member };
}

async function publicKeyFor(userId) {
  const r = await get(`SELECT public_key FROM credshare_keys WHERE user_id = ?`, [userId]);
  return r?.public_key ?? null;
}

async function audit(ev) {
  await run(`INSERT INTO credshare_audit (id, team_id, vault_id, actor_user_id, action, key_name, fingerprint, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [id(), ev.teamId ?? null, ev.vaultId ?? null, ev.actorUserId, ev.action, ev.keyName ?? null, ev.fingerprint ?? null, Date.now()]);
}

// ---- identity key + lookup ----
credshareRouter.post("/api/credshare/keys", api(async (req, res, user) => {
  const publicKey = req.body?.publicKey;
  if (typeof publicKey !== "string" || !publicKey) return res.status(422).json({ error: "Expected { publicKey }." });
  await run(`INSERT INTO credshare_keys (user_id, public_key, updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET public_key = excluded.public_key, updated_at = excluded.updated_at`,
    [user.id, publicKey, Date.now()]);
  res.json({ email: user.email, publicKey });
}));

credshareRouter.get("/api/credshare/me", api(async (_req, res, user) => {
  const teams = await all(`SELECT t.id, t.slug, t.name FROM credshare_teams t JOIN credshare_members m ON m.team_id = t.id WHERE m.user_id = ? AND m.status = 'active'`, [user.id]);
  res.json({ user: { id: user.id, email: user.email, publicKey: await publicKeyFor(user.id) }, teams });
}));

credshareRouter.get("/api/credshare/users", api(async (req, res) => {
  const email = norm(req.query.email);
  if (!email) return res.status(422).json({ error: "Expected ?email=" });
  const u = await get(`SELECT id FROM users WHERE email = ?`, [email]);
  res.json({ email, userId: u?.id ?? null, publicKey: u ? await publicKeyFor(u.id) : null });
}));

// ---- teams / members / invites ----
credshareRouter.post("/api/credshare/teams", api(async (req, res, user) => {
  const slug = slugify(req.body?.slug);
  if (!slug) return res.status(422).json({ error: "Slug must be lowercase letters, numbers, and dashes." });
  if (await get(`SELECT 1 FROM credshare_teams WHERE slug = ?`, [slug])) return res.status(409).json({ error: `Team slug "${slug}" is taken.` });
  const team = { id: id(), slug, name: (req.body?.name && String(req.body.name)) || slug, createdBy: user.id, createdAt: Date.now() };
  await run(`INSERT INTO credshare_teams (id, slug, name, created_by, created_at) VALUES (?,?,?,?,?)`, [team.id, team.slug, team.name, team.createdBy, team.createdAt]);
  await run(`INSERT INTO credshare_members (id, team_id, user_id, email, role, status, joined_at, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [id(), team.id, user.id, norm(user.email) || user.id, "owner", "active", Date.now(), Date.now()]);
  await audit({ teamId: team.id, actorUserId: user.id, action: "team:create" });
  res.status(201).json({ team: { id: team.id, slug: team.slug, name: team.name } });
}));

credshareRouter.get("/api/credshare/teams", api(async (_req, res, user) => {
  const teams = await all(`SELECT t.id, t.slug, t.name FROM credshare_teams t JOIN credshare_members m ON m.team_id = t.id WHERE m.user_id = ? AND m.status = 'active' ORDER BY t.created_at`, [user.id]);
  res.json({ teams });
}));

credshareRouter.get("/api/credshare/teams/:slug/members", api(async (req, res, user) => {
  const ctx = await requireMember(res, req.params.slug, user.id); if (!ctx) return;
  const rows = await all(`SELECT * FROM credshare_members WHERE team_id = ? ORDER BY created_at`, [ctx.team.id]);
  const members = [];
  for (const m of rows) members.push({ id: m.id, email: m.email, role: m.role, status: m.status, hasPublicKey: m.user_id ? Boolean(await publicKeyFor(m.user_id)) : false, joinedAt: m.joined_at });
  res.json({ members });
}));

credshareRouter.post("/api/credshare/teams/:slug/invites", api(async (req, res, user) => {
  const ctx = await requireMember(res, req.params.slug, user.id); if (!ctx) return;
  try {
    const result = await issueTeamInvite({
      team: ctx.team,
      actor: { ...ctx.member, email: user.email },
      email: req.body?.email,
      role: req.body?.role
    });
    res.status(201).json({
      invite: result.invite,
      emailSent: result.emailSent,
      resent: result.resent,
      ...(result.emailSent ? {} : { token: result.token })
    });
  } catch (error) {
    if (error instanceof TeamMemberError) return res.status(error.status).json({ error: error.message, code: error.code });
    throw error;
  }
}));

credshareRouter.patch("/api/credshare/teams/:slug/members/:memberId", api(async (req, res, user) => {
  const ctx = await requireMember(res, req.params.slug, user.id); if (!ctx) return;
  try {
    const member = await changeMemberRole({
      team: ctx.team,
      actor: ctx.member,
      memberId: req.params.memberId,
      role: req.body?.role
    });
    res.json({ member: { id: member.id, email: member.email, role: member.role, status: member.status } });
  } catch (error) {
    if (error instanceof TeamMemberError) return res.status(error.status).json({ error: error.message, code: error.code });
    throw error;
  }
}));

credshareRouter.delete("/api/credshare/teams/:slug/members/:memberId", api(async (req, res, user) => {
  const ctx = await requireMember(res, req.params.slug, user.id); if (!ctx) return;
  try {
    const result = await removeTeamMember({ team: ctx.team, actor: ctx.member, memberId: req.params.memberId });
    res.json({
      ok: true,
      removed: result.member.email,
      revokedVaultGrants: result.revokedVaultGrants,
      rotationRequired: result.rotationRequired
    });
  } catch (error) {
    if (error instanceof TeamMemberError) return res.status(error.status).json({ error: error.message, code: error.code });
    throw error;
  }
}));

credshareRouter.post("/api/credshare/invites/accept", api(async (req, res, user) => {
  const raw = req.body?.token;
  if (!raw) return res.status(422).json({ error: "Expected { token }." });
  const invite = await get(`SELECT * FROM credshare_invites WHERE token_hash = ?`, [sha256(String(raw))]);
  if (!invite) return res.status(404).json({ error: "Invite not found." });
  if (invite.accepted_at) return res.status(409).json({ error: "Invite already used." });
  if (invite.expires_at < Date.now()) return res.status(410).json({ error: "Invite expired." });
  if (norm(invite.email) !== norm(user.email)) return res.status(403).json({ error: `This invite is for ${invite.email}, not ${user.email}.` });
  await run(`UPDATE credshare_members SET user_id = ?, status = 'active', joined_at = ? WHERE team_id = ? AND email = ?`, [user.id, Date.now(), invite.team_id, norm(invite.email)]);
  await run(`UPDATE credshare_invites SET accepted_at = ? WHERE id = ?`, [Date.now(), invite.id]);
  await audit({ teamId: invite.team_id, actorUserId: user.id, action: "team:join" });
  const team = await get(`SELECT id, slug, name FROM credshare_teams WHERE id = ?`, [invite.team_id]);
  res.json({ ok: true, team });
}));

// ---- vaults ----
credshareRouter.get("/api/credshare/teams/:slug/vaults", api(async (req, res, user) => {
  const ctx = await requireMember(res, req.params.slug, user.id); if (!ctx) return;
  // One statement, not one per vault. libSQL is remote, so every execute() is a
  // network round trip: the previous loop cost 2N+1 of them, and a team with 176
  // vaults spent ~10s here -- doubled by `teams pull`, which resolves the vault
  // id twice. Both correlated subqueries are covered by existing primary keys
  // (credshare_secrets is keyed (vault_id, name), grants (vault_id, user_id)),
  // so this is an index scan per vault inside the database rather than a
  // round trip per vault across the network.
  const vaults = await all(
    `SELECT v.id,
            v.name,
            (SELECT COUNT(*) FROM credshare_secrets s
              WHERE s.vault_id = v.id) AS secret_count,
            EXISTS(SELECT 1 FROM credshare_vault_grants g
                    WHERE g.vault_id = v.id AND g.user_id = ?) AS has_access
       FROM credshare_vaults v
      WHERE v.team_id = ?
      ORDER BY v.name`,
    [user.id, ctx.team.id]
  );
  res.json({
    vaults: vaults.map((v) => ({
      id: v.id,
      name: v.name,
      hasAccess: Boolean(v.has_access),
      secretCount: Number(v.secret_count || 0)
    }))
  });
}));

credshareRouter.post("/api/credshare/teams/:slug/vaults", api(async (req, res, user) => {
  const ctx = await requireMember(res, req.params.slug, user.id); if (!ctx) return;
  const name = slugify(req.body?.name);
  if (!name) return res.status(422).json({ error: "Vault name must be lowercase letters, numbers, and dashes." });
  const existing = await get(`SELECT id, name FROM credshare_vaults WHERE team_id = ? AND name = ?`, [ctx.team.id, name]);
  if (existing) return res.json({ vault: { id: existing.id, name: existing.name } });
  const vault = { id: id(), name };
  await run(`INSERT INTO credshare_vaults (id, team_id, name, created_by, created_at) VALUES (?,?,?,?,?)`, [vault.id, ctx.team.id, name, user.id, Date.now()]);
  await audit({ teamId: ctx.team.id, vaultId: vault.id, actorUserId: user.id, action: "vault:create" });
  res.status(201).json({ vault });
}));

// ---- vault grants / secrets / audit (by vault id) ----
async function vaultCtx(res, vaultId, userId) {
  const vault = await get(`SELECT * FROM credshare_vaults WHERE id = ?`, [vaultId]);
  if (!vault) { res.status(404).json({ error: "Unknown vault." }); return null; }
  const member = await get(`SELECT * FROM credshare_members WHERE team_id = ? AND user_id = ?`, [vault.team_id, userId]);
  if (!member || member.status !== "active") { res.status(403).json({ error: "You are not a member of this vault's team." }); return null; }
  return vault;
}

credshareRouter.get("/api/credshare/vaults/:id/grant", api(async (req, res, user) => {
  const vault = await vaultCtx(res, req.params.id, user.id); if (!vault) return;
  const grant = await get(`SELECT wrapped_dek FROM credshare_vault_grants WHERE vault_id = ? AND user_id = ?`, [vault.id, user.id]);
  if (!grant) return res.status(403).json({ error: "You do not have access to this vault yet. Ask a member to grant you." });
  res.json({ wrappedDek: grant.wrapped_dek });
}));

credshareRouter.get("/api/credshare/vaults/:id/grants", api(async (req, res, user) => {
  const vault = await vaultCtx(res, req.params.id, user.id); if (!vault) return;
  const granted = new Set((await all(`SELECT user_id FROM credshare_vault_grants WHERE vault_id = ?`, [vault.id])).map((r) => r.user_id));
  const members = await all(`SELECT * FROM credshare_members WHERE team_id = ?`, [vault.team_id]);
  const grants = [];
  for (const m of members) {
    // The public key is included so a client can re-seal the vault key to every
    // member in one pass (see rekey). Public keys are public by construction --
    // they exist to be sealed against -- and this route is already member-only.
    const publicKey = m.user_id ? await publicKeyFor(m.user_id) : null;
    grants.push({
      email: m.email,
      publicKey,
      status: m.status,
      hasPublicKey: Boolean(publicKey),
      hasAccess: Boolean(m.user_id && granted.has(m.user_id))
    });
  }
  res.json({ grants });
}));

// Re-key a vault: swap in a fresh DEK, re-seal it to the members who keep
// access, and re-encrypt every secret under it. Values do not change, which the
// server enforces by requiring each submitted fingerprint to equal the stored
// one -- it cannot see values, but it can prove they were not swapped.
//
// This is ONE transaction on purpose. The DEK is recoverable only through the
// grants, so a half-applied rotation (new grants over old ciphertext, or the
// reverse) would make the vault permanently unreadable by everyone.
credshareRouter.post("/api/credshare/vaults/:id/rekey", api(async (req, res, user) => {
  const vault = await vaultCtx(res, req.params.id, user.id); if (!vault) return;
  const iHold = await get(`SELECT 1 FROM credshare_vault_grants WHERE vault_id = ? AND user_id = ?`, [vault.id, user.id]);
  if (!iHold) return res.status(403).json({ error: "Only a member with vault access can re-key it." });

  const grants = Array.isArray(req.body?.grants) ? req.body.grants : null;
  const secrets = Array.isArray(req.body?.secrets) ? req.body.secrets : null;
  const revoke = Array.isArray(req.body?.revoke) ? req.body.revoke.map(norm) : [];
  if (!grants || !secrets) return res.status(422).json({ error: "Expected { grants, secrets, revoke? }." });
  if (grants.length === 0) return res.status(422).json({ error: "A re-key must keep at least one member, or the vault becomes unreadable." });

  // The caller must keep their own access; otherwise they lock themselves out
  // the moment the transaction commits.
  const me = await get(`SELECT email FROM users WHERE id = ?`, [user.id]);
  if (!grants.some((g) => norm(g?.email) === norm(me?.email))) {
    return res.status(422).json({ error: "A re-key must include your own grant." });
  }

  // Every secret must be accounted for, with an unchanged fingerprint. This is
  // what makes "re-key" distinct from "write": no value may change here.
  const stored = await all(`SELECT name, fingerprint FROM credshare_secrets WHERE vault_id = ?`, [vault.id]);
  const storedByName = new Map(stored.map((s) => [s.name, s.fingerprint]));
  if (secrets.length !== stored.length) {
    return res.status(409).json({ error: `Re-key covers ${secrets.length} secret(s) but the vault holds ${stored.length}. Re-read the vault and retry.` });
  }
  for (const s of secrets) {
    if (!s || typeof s.name !== "string" || typeof s.nonce !== "string" || typeof s.ciphertext !== "string" || typeof s.fingerprint !== "string") {
      return res.status(422).json({ error: "Each secret needs { name, nonce, ciphertext, fingerprint }." });
    }
    if (!storedByName.has(s.name)) {
      return res.status(409).json({ error: `"${s.name}" is not in this vault. Re-read the vault and retry.` });
    }
    if (storedByName.get(s.name) !== s.fingerprint) {
      return res.status(409).json({ error: `Re-key would change the value of "${s.name}". A re-key re-encrypts; it never changes values.` });
    }
  }

  // Resolve grant targets before writing anything.
  const resolved = [];
  for (const g of grants) {
    const email = norm(g?.email);
    if (!email || typeof g?.wrappedDek !== "string" || !g.wrappedDek) {
      return res.status(422).json({ error: "Each grant needs { email, wrappedDek }." });
    }
    const target = await get(`SELECT id FROM users WHERE email = ?`, [email]);
    if (!target) return res.status(409).json({ error: `${email} has not logged in yet, so the vault key cannot be sealed to them.` });
    resolved.push({ email, userId: target.id, wrappedDek: g.wrappedDek });
  }

  const revokedUsers = [];
  for (const email of revoke) {
    const target = await get(`SELECT id FROM users WHERE email = ?`, [email]);
    if (target) revokedUsers.push({ email, userId: target.id });
  }

  const now = Date.now();
  const statements = [];
  for (const s of secrets) {
    statements.push({
      sql: `UPDATE credshare_secrets SET nonce = ?, ciphertext = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE vault_id = ? AND name = ?`,
      args: [s.nonce, s.ciphertext, user.id, now, vault.id, s.name]
    });
  }
  for (const g of resolved) {
    statements.push({
      sql: `INSERT INTO credshare_vault_grants (vault_id, user_id, wrapped_dek, granted_by, created_at) VALUES (?,?,?,?,?) ON CONFLICT(vault_id, user_id) DO UPDATE SET wrapped_dek = excluded.wrapped_dek, granted_by = excluded.granted_by, created_at = excluded.created_at`,
      args: [vault.id, g.userId, g.wrappedDek, user.id, now]
    });
  }
  for (const r of revokedUsers) {
    statements.push({ sql: `DELETE FROM credshare_vault_grants WHERE vault_id = ? AND user_id = ?`, args: [vault.id, r.userId] });
  }
  statements.push({
    sql: `INSERT INTO credshare_audit (id, team_id, vault_id, actor_user_id, action, key_name, fingerprint, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    args: [id(), vault.team_id, vault.id, user.id, "vault:rekey", null, null, now]
  });
  for (const r of revokedUsers) {
    statements.push({
      sql: `INSERT INTO credshare_audit (id, team_id, vault_id, actor_user_id, action, key_name, fingerprint, created_at) VALUES (?,?,?,?,?,?,?,?)`,
      args: [id(), vault.team_id, vault.id, user.id, "vault:revoke", r.email, null, now]
    });
  }

  await batch(statements);
  res.json({ ok: true, rekeyed: secrets.length, granted: resolved.map((g) => g.email), revoked: revokedUsers.map((r) => r.email) });
}));

credshareRouter.post("/api/credshare/vaults/:id/grants", api(async (req, res, user) => {
  const vault = await vaultCtx(res, req.params.id, user.id); if (!vault) return;
  const iHold = await get(`SELECT 1 FROM credshare_vault_grants WHERE vault_id = ? AND user_id = ?`, [vault.id, user.id]);
  const anyGrants = await get(`SELECT 1 FROM credshare_vault_grants WHERE vault_id = ?`, [vault.id]);
  if (!iHold && anyGrants) return res.status(403).json({ error: "Only a member with vault access can grant others." });
  const email = norm(req.body?.email), wrappedDek = req.body?.wrappedDek;
  if (!email || typeof wrappedDek !== "string" || !wrappedDek) return res.status(422).json({ error: "Expected { email, wrappedDek }." });
  const target = await get(`SELECT id FROM users WHERE email = ?`, [email]);
  if (!target) return res.status(404).json({ error: "Target user has not logged in yet." });
  if (!(await publicKeyFor(target.id))) return res.status(409).json({ error: "Target user has not uploaded a public key yet." });
  await run(`INSERT INTO credshare_vault_grants (vault_id, user_id, wrapped_dek, granted_by, created_at) VALUES (?,?,?,?,?) ON CONFLICT(vault_id, user_id) DO UPDATE SET wrapped_dek = excluded.wrapped_dek, granted_by = excluded.granted_by, created_at = excluded.created_at`,
    [vault.id, target.id, wrappedDek, user.id, Date.now()]);
  await audit({ teamId: vault.team_id, vaultId: vault.id, actorUserId: user.id, action: "vault:grant", keyName: email });
  res.status(201).json({ ok: true });
}));

credshareRouter.get("/api/credshare/vaults/:id/secrets", api(async (req, res, user) => {
  const vault = await vaultCtx(res, req.params.id, user.id); if (!vault) return;
  const rows = await all(`SELECT * FROM credshare_secrets WHERE vault_id = ? ORDER BY name`, [vault.id]);
  res.json({ vaultId: vault.id, secrets: rows.map((s) => ({ name: s.name, nonce: s.nonce, ciphertext: s.ciphertext, fingerprint: s.fingerprint, version: s.version, updatedAt: s.updated_at })) });
}));

credshareRouter.put("/api/credshare/vaults/:id/secrets", api(async (req, res, user) => {
  const vault = await vaultCtx(res, req.params.id, user.id); if (!vault) return;
  const upserts = Array.isArray(req.body?.upserts) ? req.body.upserts : [];
  const deletes = Array.isArray(req.body?.deletes) ? req.body.deletes : [];
  const applied = [];
  for (const u of upserts) {
    if (!u || typeof u.name !== "string" || typeof u.nonce !== "string" || typeof u.ciphertext !== "string" || typeof u.fingerprint !== "string") {
      return res.status(422).json({ error: "Each upsert needs { name, nonce, ciphertext, fingerprint }." });
    }
    const prev = await get(`SELECT version FROM credshare_secrets WHERE vault_id = ? AND name = ?`, [vault.id, u.name]);
    const version = (prev?.version ?? 0) + 1;
    await run(`INSERT INTO credshare_secrets (vault_id, name, nonce, ciphertext, fingerprint, version, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(vault_id, name) DO UPDATE SET nonce = excluded.nonce, ciphertext = excluded.ciphertext, fingerprint = excluded.fingerprint, version = excluded.version, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      [vault.id, u.name, u.nonce, u.ciphertext, u.fingerprint, version, user.id, Date.now()]);
    await audit({ teamId: vault.team_id, vaultId: vault.id, actorUserId: user.id, action: prev ? "secret:update" : "secret:add", keyName: u.name, fingerprint: u.fingerprint });
    applied.push(u.name);
  }
  for (const raw of deletes) {
    const name = typeof raw === "string" ? raw : null;
    if (!name) continue;
    await run(`DELETE FROM credshare_secrets WHERE vault_id = ? AND name = ?`, [vault.id, name]);
    await audit({ teamId: vault.team_id, vaultId: vault.id, actorUserId: user.id, action: "secret:remove", keyName: name });
    applied.push(name);
  }
  res.json({ ok: true, applied });
}));

credshareRouter.get("/api/credshare/vaults/:id/audit", api(async (req, res, user) => {
  const vault = await vaultCtx(res, req.params.id, user.id); if (!vault) return;
  const auditRows = await all(`SELECT * FROM credshare_audit WHERE vault_id = ? ORDER BY created_at DESC`, [vault.id]);
  res.json({ audit: auditRows });
}));
