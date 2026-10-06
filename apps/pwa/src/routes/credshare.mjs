// LogicSRC credential sharing API (end-to-end encrypted team vaults).
//
// Zero-knowledge: this server only ever stores ciphertext, per-member sealed
// vault keys, and member identity public keys. All crypto happens in the CLI.
//
// Auth: the acting user comes from a browser session (req.user) OR a
// `Bearer lsk_…` API key (the logicsrc CLI). Mounted at /api/credshare.
//
// A MACHINE key (api_keys.kind = 'machine') is narrower than its owner: it sees
// one team, optionally only some of its vaults, holds its own identity key, and
// opens vaults only through credshare_key_grants. Each route says whether a
// machine key may call it at all (`machine: "read" | "write" | "register"`);
// anything unmarked is people-only. A read-only machine key gets a 403 on every
// write except registering its own public key.
import { Router } from "express";
import { get, all, run, batch } from "../db.mjs";
import { id, sha256 } from "../lib/crypto.mjs";
import { bearer, keyForBearer, keyCoversVault, normalizeKey } from "../lib/apikey.mjs";
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

const isMachine = (key) => key?.kind === "machine";

// Resolve the acting user (and the API key, when there is one) from session or Bearer.
async function actor(req) {
  if (req.user) return { user: req.user, key: null };
  return keyForBearer(bearer(req));
}

/**
 * Wrap a route. `machine` says what a machine key may do here:
 *   false (default)  people only — a machine key gets a 403
 *   "read"           allowed, GET only
 *   "write"          allowed unless the key is read-only
 *   "register"       allowed even for a read-only key (its own public key)
 */
function api(handler, { machine = false } = {}) {
  return async (req, res) => {
    const found = await actor(req);
    if (!found) return res.status(401).json({ error: "Not authenticated, or the API key is revoked or expired. Run: logicsrc login" });
    const { user, key } = found;
    req.apiKey = key;
    if (isMachine(key)) {
      if (!machine) {
        return res.status(403).json({ error: "A machine API key cannot do this. Use a person's login (logicsrc login).", code: "machine_key_forbidden" });
      }
      if (key.readOnly && machine !== "register" && req.method !== "GET") {
        return res.status(403).json({ error: "This machine API key is read-only.", code: "read_only_key" });
      }
    }
    try {
      await handler(req, res, user, key);
    } catch (e) {
      console.error("credshare:", e);
      res.status(500).json({ error: e.message || String(e) });
    }
  };
}

async function requireMember(res, slug, userId, key = null) {
  const team = await get(`SELECT * FROM credshare_teams WHERE slug = ?`, [slug]);
  if (!team) { res.status(404).json({ error: `Unknown team: ${slug}` }); return null; }
  if (isMachine(key) && key.team_id !== team.id) { res.status(403).json({ error: "This API key is scoped to another team." }); return null; }
  const member = await get(`SELECT * FROM credshare_members WHERE team_id = ? AND user_id = ?`, [team.id, userId]);
  if (!member || member.status !== "active") { res.status(403).json({ error: "You are not a member of this team." }); return null; }
  return { team, member };
}

async function publicKeyFor(userId) {
  const r = await get(`SELECT public_key FROM credshare_keys WHERE user_id = ?`, [userId]);
  return r?.public_key ?? null;
}

async function audit(ev) {
  await run(`INSERT INTO credshare_audit (id, team_id, vault_id, actor_user_id, action, key_name, fingerprint, created_at, actor_key_id) VALUES (?,?,?,?,?,?,?,?,?)`,
    [id(), ev.teamId ?? null, ev.vaultId ?? null, ev.actorUserId, ev.action, ev.keyName ?? null, ev.fingerprint ?? null, Date.now(), ev.actorKeyId ?? null]);
}

/** The key facts a client needs about its own credential (null for a browser session). */
function keyInfo(key, teamSlug = null) {
  if (!key) return null;
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    kind: key.kind,
    team: isMachine(key) ? teamSlug : null,
    vaults: isMachine(key) ? key.vaultScope : null,
    readOnly: isMachine(key) ? key.readOnly : false,
    expiresAt: key.expiresAt ?? null
  };
}

// ---- identity key + lookup ----
credshareRouter.post("/api/credshare/keys", api(async (req, res, user, key) => {
  const publicKey = req.body?.publicKey;
  if (typeof publicKey !== "string" || !publicKey) return res.status(422).json({ error: "Expected { publicKey }." });
  if (isMachine(key)) {
    // A machine key registers ITS OWN identity, on its own row. It never
    // touches the person's credshare_keys entry. Replacing a different key
    // drops this key's grants: they were sealed to the old key and cannot be
    // opened with the new one, so keeping them would only hide the breakage.
    let dropped = 0;
    if (key.public_key && key.public_key !== publicKey) {
      dropped = Number((await get(`SELECT COUNT(*) AS n FROM credshare_key_grants WHERE api_key_id = ?`, [key.id]))?.n || 0);
      await run(`DELETE FROM credshare_key_grants WHERE api_key_id = ?`, [key.id]);
    }
    if (key.public_key !== publicKey) {
      await run(`UPDATE api_keys SET public_key = ? WHERE id = ?`, [publicKey, key.id]);
      await audit({ teamId: key.team_id, actorUserId: user.id, actorKeyId: key.id, action: "key:register", keyName: key.name });
    }
    return res.json({ email: user.email, publicKey, keyId: key.id, droppedGrants: dropped });
  }
  await run(`INSERT INTO credshare_keys (user_id, public_key, updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET public_key = excluded.public_key, updated_at = excluded.updated_at`,
    [user.id, publicKey, Date.now()]);
  res.json({ email: user.email, publicKey });
}, { machine: "register" }));

credshareRouter.get("/api/credshare/me", api(async (_req, res, user, key) => {
  if (isMachine(key)) {
    const teams = await all(`SELECT t.id, t.slug, t.name FROM credshare_teams t JOIN credshare_members m ON m.team_id = t.id WHERE m.user_id = ? AND m.status = 'active' AND t.id = ?`, [user.id, key.team_id]);
    const team = await get(`SELECT slug FROM credshare_teams WHERE id = ?`, [key.team_id]);
    return res.json({ user: { id: user.id, email: user.email, publicKey: key.public_key ?? null }, teams, key: keyInfo(key, team?.slug ?? null) });
  }
  const teams = await all(`SELECT t.id, t.slug, t.name FROM credshare_teams t JOIN credshare_members m ON m.team_id = t.id WHERE m.user_id = ? AND m.status = 'active'`, [user.id]);
  res.json({ user: { id: user.id, email: user.email, publicKey: await publicKeyFor(user.id) }, teams, key: keyInfo(key) });
}, { machine: "read" }));

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
  await audit({ teamId: team.id, actorUserId: user.id, actorKeyId: req.apiKey?.id, action: "team:create" });
  res.status(201).json({ team: { id: team.id, slug: team.slug, name: team.name } });
}));

credshareRouter.get("/api/credshare/teams", api(async (_req, res, user, key) => {
  const teams = isMachine(key)
    ? await all(`SELECT t.id, t.slug, t.name FROM credshare_teams t JOIN credshare_members m ON m.team_id = t.id WHERE m.user_id = ? AND m.status = 'active' AND t.id = ? ORDER BY t.created_at`, [user.id, key.team_id])
    : await all(`SELECT t.id, t.slug, t.name FROM credshare_teams t JOIN credshare_members m ON m.team_id = t.id WHERE m.user_id = ? AND m.status = 'active' ORDER BY t.created_at`, [user.id]);
  res.json({ teams });
}, { machine: "read" }));

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
  await audit({ teamId: invite.team_id, actorUserId: user.id, actorKeyId: req.apiKey?.id, action: "team:join" });
  const team = await get(`SELECT id, slug, name FROM credshare_teams WHERE id = ?`, [invite.team_id]);
  res.json({ ok: true, team });
}));

// ---- vaults ----
credshareRouter.get("/api/credshare/teams/:slug/vaults", api(async (req, res, user, key) => {
  const ctx = await requireMember(res, req.params.slug, user.id, key); if (!ctx) return;
  if (isMachine(key)) {
    // A machine key sees the vaults in its scope, and "access" means a grant
    // sealed to ITS key, not to the person who made it.
    const rows = await all(
      `SELECT v.id,
              v.name,
              (SELECT COUNT(*) FROM credshare_secrets s
                WHERE s.vault_id = v.id) AS secret_count,
              EXISTS(SELECT 1 FROM credshare_key_grants g
                      WHERE g.vault_id = v.id AND g.api_key_id = ?) AS has_access
         FROM credshare_vaults v
        WHERE v.team_id = ?
        ORDER BY v.name`,
      [key.id, ctx.team.id]
    );
    return res.json({
      vaults: rows
        .filter((v) => keyCoversVault(key, v.name))
        .map((v) => ({ id: v.id, name: v.name, hasAccess: Boolean(v.has_access), secretCount: Number(v.secret_count || 0) }))
    });
  }
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
}, { machine: "read" }));

credshareRouter.post("/api/credshare/teams/:slug/vaults", api(async (req, res, user) => {
  const ctx = await requireMember(res, req.params.slug, user.id); if (!ctx) return;
  const name = slugify(req.body?.name);
  if (!name) return res.status(422).json({ error: "Vault name must be lowercase letters, numbers, and dashes." });
  const existing = await get(`SELECT id, name FROM credshare_vaults WHERE team_id = ? AND name = ?`, [ctx.team.id, name]);
  if (existing) return res.json({ vault: { id: existing.id, name: existing.name } });
  const vault = { id: id(), name };
  await run(`INSERT INTO credshare_vaults (id, team_id, name, created_by, created_at) VALUES (?,?,?,?,?)`, [vault.id, ctx.team.id, name, user.id, Date.now()]);
  await audit({ teamId: ctx.team.id, vaultId: vault.id, actorUserId: user.id, actorKeyId: req.apiKey?.id, action: "vault:create" });
  res.status(201).json({ vault });
}));

// ---- vault grants / secrets / audit (by vault id) ----
async function vaultCtx(res, vaultId, userId, key = null) {
  const vault = await get(`SELECT * FROM credshare_vaults WHERE id = ?`, [vaultId]);
  if (!vault) { res.status(404).json({ error: "Unknown vault." }); return null; }
  if (isMachine(key) && (vault.team_id !== key.team_id || !keyCoversVault(key, vault.name))) {
    res.status(403).json({ error: "This API key is not scoped to this vault." }); return null;
  }
  const member = await get(`SELECT * FROM credshare_members WHERE team_id = ? AND user_id = ?`, [vault.team_id, userId]);
  if (!member || member.status !== "active") { res.status(403).json({ error: "You are not a member of this vault's team." }); return null; }
  return vault;
}

credshareRouter.get("/api/credshare/vaults/:id/grant", api(async (req, res, user, key) => {
  const vault = await vaultCtx(res, req.params.id, user.id, key); if (!vault) return;
  if (isMachine(key)) {
    const kg = await get(`SELECT wrapped_dek FROM credshare_key_grants WHERE vault_id = ? AND api_key_id = ?`, [vault.id, key.id]);
    if (!kg) return res.status(403).json({ error: `This machine key (${key.name}) has not been granted this vault yet. A member runs: logicsrc teams grant <team> <project> <env> --key ${key.name}`, code: "no_key_grant" });
    // The one moment a machine can decrypt: worth a line in the vault's audit trail.
    await audit({ teamId: vault.team_id, vaultId: vault.id, actorUserId: user.id, actorKeyId: key.id, action: "vault:read", keyName: key.name });
    return res.json({ wrappedDek: kg.wrapped_dek });
  }
  const grant = await get(`SELECT wrapped_dek FROM credshare_vault_grants WHERE vault_id = ? AND user_id = ?`, [vault.id, user.id]);
  if (!grant) return res.status(403).json({ error: "You do not have access to this vault yet. Ask a member to grant you." });
  res.json({ wrappedDek: grant.wrapped_dek });
}, { machine: "read" }));

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

  // Machine keys hold the DEK through credshare_key_grants. A re-key makes every
  // one of those dead, so each is either re-sealed in this same transaction
  // (keyGrants: [{ keyId, wrappedDek }]) or dropped -- never left stale.
  const keyGrantsIn = Array.isArray(req.body?.keyGrants) ? req.body.keyGrants : [];
  const currentKeyGrants = await all(
    `SELECT g.api_key_id, k.name FROM credshare_key_grants g JOIN api_keys k ON k.id = g.api_key_id WHERE g.vault_id = ?`,
    [vault.id]
  );
  const currentKeyIds = new Map(currentKeyGrants.map((g) => [g.api_key_id, g.name]));
  const resealed = [];
  for (const g of keyGrantsIn) {
    if (!g || typeof g.keyId !== "string" || typeof g.wrappedDek !== "string" || !g.wrappedDek) {
      return res.status(422).json({ error: "Each key grant needs { keyId, wrappedDek }." });
    }
    if (!currentKeyIds.has(g.keyId)) {
      return res.status(409).json({ error: `Key ${g.keyId} holds no grant on this vault; grant it after the re-key instead.` });
    }
    resealed.push(g);
  }
  const resealedIds = new Set(resealed.map((g) => g.keyId));
  const droppedKeys = currentKeyGrants.filter((g) => !resealedIds.has(g.api_key_id)).map((g) => g.name);

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
  statements.push({ sql: `DELETE FROM credshare_key_grants WHERE vault_id = ?`, args: [vault.id] });
  for (const g of resealed) {
    statements.push({
      sql: `INSERT INTO credshare_key_grants (vault_id, api_key_id, wrapped_dek, granted_by, created_at) VALUES (?,?,?,?,?)`,
      args: [vault.id, g.keyId, g.wrappedDek, user.id, now]
    });
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
  res.json({
    ok: true,
    rekeyed: secrets.length,
    granted: resolved.map((g) => g.email),
    revoked: revokedUsers.map((r) => r.email),
    keysResealed: resealed.map((g) => currentKeyIds.get(g.keyId)),
    keysDropped: droppedKeys
  });
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
  await audit({ teamId: vault.team_id, vaultId: vault.id, actorUserId: user.id, actorKeyId: req.apiKey?.id, action: "vault:grant", keyName: email });
  res.status(201).json({ ok: true });
}));

// ---- machine-key grants: the vault key sealed to a machine key's own public key ----

/** Machine keys holding this vault, with their public keys (so a re-key can re-seal to them). */
credshareRouter.get("/api/credshare/vaults/:id/key-grants", api(async (req, res, user) => {
  const vault = await vaultCtx(res, req.params.id, user.id); if (!vault) return;
  const rows = await all(
    `SELECT g.api_key_id, g.created_at, k.name, k.prefix, k.public_key, k.read_only, k.expires_at, u.email AS owner
       FROM credshare_key_grants g
       JOIN api_keys k ON k.id = g.api_key_id
       LEFT JOIN users u ON u.id = k.user_id
      WHERE g.vault_id = ?
      ORDER BY k.name`,
    [vault.id]
  );
  res.json({
    keyGrants: rows.map((r) => ({
      keyId: r.api_key_id,
      name: r.name,
      prefix: r.prefix,
      owner: r.owner ?? null,
      publicKey: r.public_key ?? null,
      readOnly: Number(r.read_only) === 1,
      expiresAt: r.expires_at == null ? null : Number(r.expires_at),
      grantedAt: Number(r.created_at)
    }))
  });
}));

/**
 * Seal this vault's key to one of YOUR machine keys. The client unwraps the DEK
 * with the person's identity and re-seals it to the key's public key, exactly
 * as a member grant does; the server only checks who may and stores the box.
 */
credshareRouter.post("/api/credshare/vaults/:id/key-grants", api(async (req, res, user) => {
  const vault = await vaultCtx(res, req.params.id, user.id); if (!vault) return;
  const iHold = await get(`SELECT 1 FROM credshare_vault_grants WHERE vault_id = ? AND user_id = ?`, [vault.id, user.id]);
  if (!iHold) return res.status(403).json({ error: "Only a member with vault access can grant a key." });
  const keyId = req.body?.keyId, wrappedDek = req.body?.wrappedDek;
  if (typeof keyId !== "string" || !keyId || typeof wrappedDek !== "string" || !wrappedDek) {
    return res.status(422).json({ error: "Expected { keyId, wrappedDek }." });
  }
  const raw = await get(`SELECT * FROM api_keys WHERE id = ? AND user_id = ?`, [keyId, user.id]);
  if (!raw) return res.status(404).json({ error: "No such API key on your account." });
  const target = normalizeKey(raw);
  if (target.kind !== "machine") return res.status(422).json({ error: "Only a machine key can be granted a vault. A person's key reads through the person's own grant." });
  if (target.expiresAt !== null && target.expiresAt <= Date.now()) return res.status(409).json({ error: "That key has expired." });
  if (target.team_id !== vault.team_id) return res.status(409).json({ error: "That key is scoped to another team." });
  if (!keyCoversVault(target, vault.name)) return res.status(409).json({ error: `That key is not scoped to ${vault.name}. Its vaults: ${(target.vaultScope || []).join(", ")}.` });
  if (!target.public_key) {
    return res.status(409).json({ error: "That key has not registered its public key yet. Run any logicsrc command with the key once first (LOGICSRC_API_KEY=… logicsrc whoami).", code: "no_public_key" });
  }
  await run(`INSERT INTO credshare_key_grants (vault_id, api_key_id, wrapped_dek, granted_by, created_at) VALUES (?,?,?,?,?) ON CONFLICT(vault_id, api_key_id) DO UPDATE SET wrapped_dek = excluded.wrapped_dek, granted_by = excluded.granted_by, created_at = excluded.created_at`,
    [vault.id, target.id, wrappedDek, user.id, Date.now()]);
  await audit({ teamId: vault.team_id, vaultId: vault.id, actorUserId: user.id, actorKeyId: req.apiKey?.id, action: "vault:grant:key", keyName: target.name });
  res.status(201).json({ ok: true, keyId: target.id, name: target.name });
}));

credshareRouter.delete("/api/credshare/vaults/:id/key-grants/:keyId", api(async (req, res, user) => {
  const vault = await vaultCtx(res, req.params.id, user.id); if (!vault) return;
  const row = await get(
    `SELECT k.id, k.name, k.user_id FROM credshare_key_grants g JOIN api_keys k ON k.id = g.api_key_id WHERE g.vault_id = ? AND g.api_key_id = ?`,
    [vault.id, req.params.keyId]
  );
  if (!row) return res.status(404).json({ error: "That key holds no grant on this vault." });
  const iHold = await get(`SELECT 1 FROM credshare_vault_grants WHERE vault_id = ? AND user_id = ?`, [vault.id, user.id]);
  if (!iHold && row.user_id !== user.id) return res.status(403).json({ error: "Only the key's owner or a member with vault access can revoke it." });
  await run(`DELETE FROM credshare_key_grants WHERE vault_id = ? AND api_key_id = ?`, [vault.id, row.id]);
  await audit({ teamId: vault.team_id, vaultId: vault.id, actorUserId: user.id, actorKeyId: req.apiKey?.id, action: "vault:revoke:key", keyName: row.name });
  res.json({ ok: true, revoked: row.name });
}));

credshareRouter.get("/api/credshare/vaults/:id/secrets", api(async (req, res, user, key) => {
  const vault = await vaultCtx(res, req.params.id, user.id, key); if (!vault) return;
  const rows = await all(`SELECT * FROM credshare_secrets WHERE vault_id = ? ORDER BY name`, [vault.id]);
  res.json({ vaultId: vault.id, secrets: rows.map((s) => ({ name: s.name, nonce: s.nonce, ciphertext: s.ciphertext, fingerprint: s.fingerprint, version: s.version, updatedAt: s.updated_at })) });
}, { machine: "read" }));

credshareRouter.put("/api/credshare/vaults/:id/secrets", api(async (req, res, user, key) => {
  const vault = await vaultCtx(res, req.params.id, user.id, key); if (!vault) return;
  if (isMachine(key) && !(await get(`SELECT 1 FROM credshare_key_grants WHERE vault_id = ? AND api_key_id = ?`, [vault.id, key.id]))) {
    return res.status(403).json({ error: "A machine key can only write a vault it has been granted.", code: "no_key_grant" });
  }
  const actorKeyId = key?.id ?? null;
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
    await audit({ teamId: vault.team_id, vaultId: vault.id, actorUserId: user.id, action: prev ? "secret:update" : "secret:add", keyName: u.name, fingerprint: u.fingerprint, actorKeyId });
    applied.push(u.name);
  }
  for (const raw of deletes) {
    const name = typeof raw === "string" ? raw : null;
    if (!name) continue;
    await run(`DELETE FROM credshare_secrets WHERE vault_id = ? AND name = ?`, [vault.id, name]);
    await audit({ teamId: vault.team_id, vaultId: vault.id, actorUserId: user.id, action: "secret:remove", keyName: name, actorKeyId });
    applied.push(name);
  }
  res.json({ ok: true, applied });
}, { machine: "write" }));

credshareRouter.get("/api/credshare/vaults/:id/audit", api(async (req, res, user, key) => {
  const vault = await vaultCtx(res, req.params.id, user.id, key); if (!vault) return;
  const auditRows = await all(`SELECT * FROM credshare_audit WHERE vault_id = ? ORDER BY created_at DESC`, [vault.id]);
  res.json({ audit: auditRows });
}, { machine: "read" }));
