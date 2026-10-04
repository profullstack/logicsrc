// Sync for the personal vault (`logicsrc vault`, OpenCreds) — one per account.
//
// Zero-knowledge: the CLI uploads the vault's meta (key material wrapped under
// the master password), an encrypted folder list, and item envelopes. Nothing
// here can decrypt any of it, and nothing here needs to.
//
// Concurrency is optimistic. Every write names the revision it was based on;
// a write against a revision someone else already moved is answered with the
// current row instead of being applied, and the client resolves it. That is
// the reason the spec stores one row per item: two machines editing two
// different passwords both win, and two editing the same one find out.
//
// Auth: browser session or `Bearer lsk_…` (the logicsrc CLI). Mounted at /api/opencreds.
import { Router } from "express";
import { get, all, run } from "../db.mjs";
import { bearer, userForApiKey } from "../lib/apikey.mjs";

export const opencredsRouter = Router();

/** Upper bound on one push, in items. The client batches below this. */
export const MAX_ITEMS_PER_PUSH = 500;

function api(handler) {
  return async (req, res) => {
    const user = req.user || (await userForApiKey(bearer(req)));
    if (!user) return res.status(401).json({ error: "Not authenticated. Run: logicsrc login" });
    try {
      await handler(req, res, user);
    } catch (e) {
      console.error("opencreds:", e);
      res.status(500).json({ error: e.message || String(e) });
    }
  };
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const nonNegInt = (v) => Number.isInteger(v) && v >= 0;

function vaultJson(row) {
  return {
    meta: JSON.parse(row.meta),
    metaRevision: Number(row.meta_revision),
    folders: row.folders ? { ...JSON.parse(row.folders), revision: Number(row.folders_revision) } : null,
    updatedAt: Number(row.updated_at)
  };
}

function itemJson(row) {
  const envelope = row.envelope ? JSON.parse(row.envelope) : null;
  const revision = Number(row.revision);
  return { id: row.id, envelope: envelope && { ...envelope, revision }, revision, seq: Number(row.seq) };
}

const vaultRow = (userId) => get(`SELECT * FROM opencreds_vaults WHERE user_id = ?`, [userId]);
const itemRow = (userId, id) => get(`SELECT * FROM opencreds_items WHERE user_id = ? AND id = ?`, [userId, id]);
const NEXT_SEQ = `(SELECT COALESCE(MAX(seq), 0) + 1 FROM opencreds_items WHERE user_id = ?)`;

// ---- the vault: meta + folders ----
opencredsRouter.get("/api/opencreds/vault", api(async (_req, res, user) => {
  const row = await vaultRow(user.id);
  if (!row) return res.status(404).json({ vault: null });
  const counts = await get(
    `SELECT COUNT(*) AS n, MAX(seq) AS seq FROM opencreds_items WHERE user_id = ? AND envelope IS NOT NULL`, [user.id]);
  res.json({ vault: { ...vaultJson(row), itemCount: Number(counts?.n || 0) } });
}));

opencredsRouter.put("/api/opencreds/vault/meta", api(async (req, res, user) => {
  const { meta, baseRevision } = req.body || {};
  if (!isObject(meta) || typeof meta.protectedUserKey !== "string" || !nonNegInt(baseRevision)) {
    return res.status(422).json({ error: "Expected { meta, baseRevision }." });
  }
  const text = JSON.stringify(meta), now = Date.now();
  if (baseRevision === 0) {
    await run(`INSERT INTO opencreds_vaults (user_id, meta, meta_revision, created_at, updated_at) VALUES (?,?,1,?,?) ON CONFLICT (user_id) DO NOTHING`,
      [user.id, text, now, now]);
  } else {
    await run(`UPDATE opencreds_vaults SET meta = ?, meta_revision = meta_revision + 1, updated_at = ? WHERE user_id = ? AND meta_revision = ?`,
      [text, now, user.id, baseRevision]);
  }
  // Read back: our exact meta at base+1 means this write is the one that landed.
  const row = await vaultRow(user.id);
  if (row && row.meta === text && Number(row.meta_revision) === baseRevision + 1) {
    return res.json({ ok: true, revision: baseRevision + 1 });
  }
  res.status(409).json({ ok: false, vault: row ? vaultJson(row) : null });
}));

opencredsRouter.put("/api/opencreds/vault/folders", api(async (req, res, user) => {
  const { ciphertext, iv, baseRevision } = req.body || {};
  if (typeof ciphertext !== "string" || typeof iv !== "string" || !nonNegInt(baseRevision)) {
    return res.status(422).json({ error: "Expected { ciphertext, iv, baseRevision }." });
  }
  if (!(await vaultRow(user.id))) return res.status(409).json({ ok: false, error: "Push the vault meta first." });
  const text = JSON.stringify({ ciphertext, iv });
  await run(`UPDATE opencreds_vaults SET folders = ?, folders_revision = folders_revision + 1, updated_at = ? WHERE user_id = ? AND folders_revision = ?`,
    [text, Date.now(), user.id, baseRevision]);
  const row = await vaultRow(user.id);
  if (row.folders === text && Number(row.folders_revision) === baseRevision + 1) {
    return res.json({ ok: true, revision: baseRevision + 1 });
  }
  res.status(409).json({ ok: false, vault: vaultJson(row) });
}));

// Replace the account's vault (`logicsrc vault sync --use-local`): drop it and
// every item so the next push starts from revision 0.
opencredsRouter.delete("/api/opencreds/vault", api(async (_req, res, user) => {
  await run(`DELETE FROM opencreds_items WHERE user_id = ?`, [user.id]);
  await run(`DELETE FROM opencreds_vaults WHERE user_id = ?`, [user.id]);
  res.json({ ok: true });
}));

// ---- items ----
// `since` is inclusive: a seq can repeat under concurrent pushes, and an item
// seen twice at the same revision is a no-op on the client.
opencredsRouter.get("/api/opencreds/items", api(async (req, res, user) => {
  const since = Number.parseInt(String(req.query.since ?? "0"), 10) || 0;
  const rows = await all(`SELECT * FROM opencreds_items WHERE user_id = ? AND seq >= ? ORDER BY seq`, [user.id, since]);
  const items = rows.map(itemJson);
  res.json({ items, cursor: items.reduce((max, i) => Math.max(max, i.seq), since) });
}));

opencredsRouter.put("/api/opencreds/items", api(async (req, res, user) => {
  const changes = Array.isArray(req.body?.changes) ? req.body.changes : null;
  if (!changes) return res.status(422).json({ error: "Expected { changes: [{ id, envelope|null, baseRevision }] }." });
  if (changes.length > MAX_ITEMS_PER_PUSH) return res.status(413).json({ error: `At most ${MAX_ITEMS_PER_PUSH} items per push.` });
  for (const c of changes) {
    const ok = isObject(c) && typeof c.id === "string" && c.id.length > 0 && c.id.length <= 128 && nonNegInt(c.baseRevision) &&
      (c.envelope === null || (isObject(c.envelope) && c.envelope.id === c.id && typeof c.envelope.ciphertext === "string" && typeof c.envelope.iv === "string"));
    if (!ok) return res.status(422).json({ error: `Malformed change${isObject(c) && c.id ? ` for ${c.id}` : ""}.` });
  }
  if (!(await vaultRow(user.id))) return res.status(409).json({ error: "Push the vault meta first." });

  const applied = [], conflicts = [];
  for (const c of changes) {
    // The server's revision is authoritative; the client's local counter is not stored.
    const envelope = c.envelope ? JSON.stringify((({ revision: _r, ...rest }) => rest)(c.envelope)) : null;
    const type = c.envelope && Number.isInteger(c.envelope.type) ? c.envelope.type : null;
    const now = Date.now();
    if (c.baseRevision === 0) {
      await run(`INSERT INTO opencreds_items (user_id, id, type, envelope, revision, seq, updated_at) VALUES (?,?,?,?,1,${NEXT_SEQ},?) ON CONFLICT (user_id, id) DO NOTHING`,
        [user.id, c.id, type, envelope, user.id, now]);
    } else {
      await run(`UPDATE opencreds_items SET type = ?, envelope = ?, revision = revision + 1, seq = ${NEXT_SEQ}, updated_at = ? WHERE user_id = ? AND id = ? AND revision = ?`,
        [type, envelope, user.id, now, user.id, c.id, c.baseRevision]);
    }
    const row = await itemRow(user.id, c.id);
    if (row && (row.envelope ?? null) === envelope && Number(row.revision) === c.baseRevision + 1) {
      applied.push({ id: c.id, revision: Number(row.revision), seq: Number(row.seq) });
    } else {
      conflicts.push(row ? itemJson(row) : { id: c.id, envelope: null, revision: 0, seq: 0 });
    }
  }
  res.json({ applied, conflicts });
}));
