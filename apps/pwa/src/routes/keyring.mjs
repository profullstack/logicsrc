// The keyring (`logicsrc keyring`): SSH keys and other key pairs, synced to the
// account as ciphertext.
//
// Zero-knowledge. The CLI uploads the keyring's meta (OpenCreds VaultMeta: the
// user key wrapped under the keyring passphrase, which never leaves the
// client) and per key: the public half in the clear and the private half as an
// AES-256-GCM envelope. Nothing here can decrypt an envelope, and every write
// is checked so that a buggy or hostile client cannot park a plaintext private
// key in the database by mistake: any field that looks like private key
// material is refused with 422.
//
// Auth: a person's `Bearer lsk_…` key (the CLI, the MCP server) for every
// call; a browser session may read (GET) for the /keyring page. Machine keys
// are refused: the keyring is the person's alone. Mounted at /api/keyring, and
// the page at /keyring.
import { Router } from "express";
import { get, all, run } from "../db.mjs";
import { bearer, keyForBearer } from "../lib/apikey.mjs";
import { page, footer, appBar, esc } from "../lib/html.mjs";
import { requireAuth } from "../lib/session.mjs";

export const keyringRouter = Router();

export const KEYRING_TYPES = ["ssh-ed25519", "ssh-rsa", "ssh-ecdsa", "gpg", "age", "generic"];
export const MAX_ENTRIES = 1000;

// Private key material in every format we know of. Checked against the whole
// request body, so it does not matter which field it was smuggled into.
const PRIVATE_MATERIAL = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
  /-----BEGIN PGP PRIVATE KEY BLOCK-----/,
  /AGE-SECRET-KEY-1/,
  /PuTTY-User-Key-File-/,
  /b3BlbnNzaC1rZXktdjE/ // base64 of "openssh-key-v1", the OpenSSH private key body
];
export const containsPrivateMaterial = (text) => PRIVATE_MATERIAL.some((re) => re.test(text));

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v, max) => typeof v === "string" && v.length <= max;

function auth({ write }) {
  return (handler) => async (req, res) => {
    let user = null;
    const token = bearer(req);
    if (token) {
      const found = await keyForBearer(token);
      if (!found) return res.status(401).json({ error: "Not authenticated. Run: logicsrc login" });
      if (found.key.kind === "machine") {
        return res.status(403).json({ error: "A machine API key cannot use the personal keyring.", code: "machine_key_forbidden" });
      }
      user = found.user;
    } else if (req.user && !write) {
      user = req.user;
    } else if (req.user && write) {
      return res.status(403).json({ error: "Changes to the keyring go through the CLI (Bearer key), not the browser session." });
    } else {
      return res.status(401).json({ error: "Not authenticated. Run: logicsrc login" });
    }
    try {
      await handler(req, res, user);
    } catch (e) {
      console.error("keyring:", e);
      res.status(500).json({ error: e.message || String(e) });
    }
  };
}
const reader = auth({ write: false });
const writer = auth({ write: true });

const iso = (ms) => (ms === null || ms === undefined ? null : new Date(Number(ms)).toISOString());

export function entryJson(row, { envelope = true } = {}) {
  return {
    id: row.id,
    name: row.name,
    type: row.key_type,
    filename: row.filename,
    publicKey: row.public_key,
    fingerprint: row.fingerprint,
    comment: row.comment || "",
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    deletedAt: iso(row.deleted_at),
    ...(envelope ? { envelope: row.envelope ? JSON.parse(row.envelope) : null } : {})
  };
}

/** Validate an uploaded entry; returns an error string or null. */
export function entryProblem(id, e) {
  if (!isObject(e)) return "Expected { entry }.";
  if (containsPrivateMaterial(JSON.stringify(e))) {
    return "Refused: the entry contains plaintext private key material. Only ciphertext may be uploaded.";
  }
  if (e.id !== id || !/^[A-Za-z0-9-]{1,64}$/.test(id)) return "entry.id must match the URL and be a uuid.";
  if (!str(e.name, 128) || !e.name) return "entry.name is required (max 128).";
  if (!KEYRING_TYPES.includes(e.type)) return `entry.type must be one of ${KEYRING_TYPES.join(", ")}.`;
  if (!str(e.filename, 255) || !e.filename || /[/\\]/.test(e.filename)) return "entry.filename must be a bare file name.";
  if (!str(e.publicKey ?? "", 16384)) return "entry.publicKey is too long.";
  if (!str(e.fingerprint ?? "", 128)) return "entry.fingerprint is too long.";
  if (!str(e.comment ?? "", 1024)) return "entry.comment is too long.";
  if (Number.isNaN(Date.parse(e.updatedAt))) return "entry.updatedAt must be an ISO date.";
  if (e.deletedAt) {
    if (e.envelope !== null && e.envelope !== undefined) return "A deleted entry carries no envelope.";
  } else {
    const env = e.envelope;
    if (!isObject(env)) return "entry.envelope is required.";
    const extra = Object.keys(env).filter((k) => !["id", "type", "ciphertext", "iv", "v", "revision"].includes(k));
    if (extra.length) return `entry.envelope has unexpected fields: ${extra.join(", ")}.`;
    if (env.id !== id) return "entry.envelope.id must match the entry id (it is bound into the ciphertext).";
    if (typeof env.ciphertext !== "string" || !B64.test(env.ciphertext) || env.ciphertext.length < 24 || env.ciphertext.length > 262144) {
      return "entry.envelope.ciphertext must be base64 AES-GCM ciphertext.";
    }
    // A "ciphertext" that decodes to a PEM/OpenSSH/age key is a plaintext key in base64.
    if (containsPrivateMaterial(Buffer.from(env.ciphertext, "base64").toString("latin1"))) {
      return "Refused: entry.envelope.ciphertext decodes to a plaintext private key. Only ciphertext may be uploaded.";
    }
    if (typeof env.iv !== "string" || !B64.test(env.iv) || Buffer.from(env.iv, "base64").length !== 12) return "entry.envelope.iv must be a base64 96-bit IV.";
  }
  return null;
}

const metaProblem = (meta) =>
  !isObject(meta) || typeof meta.protectedUserKey !== "string" || !meta.protectedUserKey || typeof meta.kdfSalt !== "string"
    ? "Expected { meta } with protectedUserKey and kdfSalt (OpenCreds VaultMeta)."
    : containsPrivateMaterial(JSON.stringify(meta))
      ? "Refused: meta contains private key material."
      : null;

const sameKeyring = (a, b) => a.kdfSalt === b.kdfSalt && a.protectedUserKey === b.protectedUserKey;

// ---- API ----

// The whole keyring. Envelopes only when asked (?include=envelopes): the page
// and the MCP list need public halves alone.
keyringRouter.get("/api/keyring", reader(async (req, res, user) => {
  const withEnvelopes = String(req.query.include || "") === "envelopes";
  const vault = await get(`SELECT * FROM keyring_vaults WHERE user_id = ?`, [user.id]);
  const rows = await all(`SELECT * FROM keyring_entries WHERE user_id = ? ORDER BY name`, [user.id]);
  const entries = rows
    .filter((r) => withEnvelopes || !r.deleted_at)
    .map((r) => entryJson(r, { envelope: withEnvelopes }));
  res.set("Cache-Control", "no-store");
  res.json({ meta: vault ? JSON.parse(vault.meta) : null, entries });
}));

keyringRouter.get("/api/keyring/entries/:id", reader(async (req, res, user) => {
  const row = await get(`SELECT * FROM keyring_entries WHERE user_id = ? AND (id = ? OR name = ?) AND deleted_at IS NULL`, [user.id, req.params.id, req.params.id]);
  if (!row) return res.status(404).json({ error: "No such key." });
  res.set("Cache-Control", "no-store");
  res.json({ entry: entryJson(row, { envelope: String(req.query.include || "") === "envelope" }) });
}));

keyringRouter.put("/api/keyring/meta", writer(async (req, res, user) => {
  const meta = req.body?.meta;
  const problem = metaProblem(meta);
  if (problem) return res.status(422).json({ error: problem });
  const now = Date.now();
  await run(`INSERT INTO keyring_vaults (user_id, meta, created_at, updated_at) VALUES (?,?,?,?) ON CONFLICT (user_id) DO NOTHING`,
    [user.id, JSON.stringify(meta), now, now]);
  const row = await get(`SELECT meta FROM keyring_vaults WHERE user_id = ?`, [user.id]);
  const current = JSON.parse(row.meta);
  if (sameKeyring(current, meta)) return res.json({ ok: true });
  res.status(409).json({ ok: false, meta: current, error: "The account already holds a different keyring." });
}));

// Upsert one entry, last-writer-wins on the client's updatedAt/deletedAt.
keyringRouter.put("/api/keyring/entries/:id", writer(async (req, res, user) => {
  const id = req.params.id;
  const e = req.body?.entry;
  const problem = entryProblem(id, e);
  if (problem) return res.status(422).json({ error: problem });
  if (!(await get(`SELECT 1 FROM keyring_vaults WHERE user_id = ?`, [user.id]))) {
    return res.status(409).json({ error: "Push the keyring meta first." });
  }
  const count = await get(`SELECT COUNT(*) AS n FROM keyring_entries WHERE user_id = ?`, [user.id]);
  const existing = await get(`SELECT * FROM keyring_entries WHERE user_id = ? AND id = ?`, [user.id, id]);
  if (!existing && Number(count?.n || 0) >= MAX_ENTRIES) return res.status(413).json({ error: `At most ${MAX_ENTRIES} keys.` });

  const updatedAt = Date.parse(e.updatedAt);
  const deletedAt = e.deletedAt ? Date.parse(e.deletedAt) : null;
  const stamp = Math.max(updatedAt, deletedAt || 0);
  if (existing && Math.max(Number(existing.updated_at), Number(existing.deleted_at || 0)) > stamp) {
    return res.status(409).json({ ok: false, entry: entryJson(existing) });
  }
  const envelope = e.deletedAt ? null : JSON.stringify({ id: e.envelope.id, type: e.envelope.type, ciphertext: e.envelope.ciphertext, iv: e.envelope.iv, ...(e.envelope.v ? { v: e.envelope.v } : {}) });
  const createdAt = Date.parse(e.createdAt) || updatedAt;
  const args = [e.name, e.type, e.filename, e.publicKey || "", e.fingerprint || "", e.comment || "", envelope, updatedAt, deletedAt];
  if (existing) {
    await run(`UPDATE keyring_entries SET name = ?, key_type = ?, filename = ?, public_key = ?, fingerprint = ?, comment = ?, envelope = ?, updated_at = ?, deleted_at = ? WHERE user_id = ? AND id = ?`,
      [...args, user.id, id]);
  } else {
    await run(`INSERT INTO keyring_entries (name, key_type, filename, public_key, fingerprint, comment, envelope, updated_at, deleted_at, user_id, id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [...args, user.id, id, createdAt]);
  }
  res.json({ ok: true });
}));

// Remove one key: a tombstone, so the removal reaches the user's other machines.
keyringRouter.delete("/api/keyring/entries/:id", writer(async (req, res, user) => {
  const row = await get(`SELECT * FROM keyring_entries WHERE user_id = ? AND (id = ? OR name = ?) AND deleted_at IS NULL`, [user.id, req.params.id, req.params.id]);
  if (!row) return res.status(404).json({ error: "No such key." });
  const now = Date.now();
  await run(`UPDATE keyring_entries SET envelope = NULL, deleted_at = ?, updated_at = ? WHERE user_id = ? AND id = ?`, [now, now, user.id, row.id]);
  res.json({ ok: true, id: row.id, name: row.name });
}));

// Replace the account's keyring (`logicsrc keyring sync --use-local`).
keyringRouter.delete("/api/keyring", writer(async (_req, res, user) => {
  await run(`DELETE FROM keyring_entries WHERE user_id = ?`, [user.id]);
  await run(`DELETE FROM keyring_vaults WHERE user_id = ?`, [user.id]);
  res.json({ ok: true });
}));

// ---- the page ----

const when = (ms) => (ms ? new Date(Number(ms)).toISOString().slice(0, 16).replace("T", " ") : "—");

export function keyringPageBody(rows) {
  const list = rows.length
    ? `<div class="table-scroll"><table><thead><tr><th>Name</th><th>Type</th><th>Fingerprint</th><th>Comment</th><th>Updated (UTC)</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr>
        <td><code>${esc(r.name)}</code><div class="faint mono" style="font-size:.72rem">restores to ~/.ssh/${esc(r.filename)}</div></td>
        <td class="mono">${esc(r.key_type)}</td>
        <td><code class="fp">${esc(r.fingerprint || "—")}</code></td>
        <td>${esc(r.comment || "—")}</td>
        <td class="mono" style="white-space:nowrap">${esc(when(r.updated_at))}</td>
        <td style="white-space:nowrap"><button class="btn compact" data-kr-copy="${esc(r.id)}">Copy public</button>
          <button class="btn compact" data-kr-download="${esc(r.id)}" data-kr-file="${esc(r.filename)}">Decrypt &amp; download</button></td>
      </tr><tr class="kr-pub"><td colspan="6"><pre class="mono" data-kr-pub="${esc(r.id)}" style="white-space:pre-wrap;word-break:break-all;margin:0;font-size:.74rem">${esc(r.public_key)}</pre></td></tr>`).join("")}</tbody></table></div>`
    : `<p class="faint mono" style="font-size:.85rem">No keys yet. From a terminal: <code>logicsrc keyring add ~/.ssh/id_ed25519 &amp;&amp; logicsrc keyring sync</code></p>`;
  return `<main class="wrap" style="max-width:920px;padding:26px 0 40px">
    <div class="section-title"><h1 style="font-size:1.6rem">Keyring</h1><span class="count">${rows.length}</span></div>
    <p class="dim" style="font-size:.9rem">SSH keys and other key pairs from <code>logicsrc keyring</code>. Public keys are shown as stored. Private keys are held only as ciphertext; <b>Decrypt &amp; download</b> asks for your keyring passphrase and decrypts in this tab. The passphrase and the private key are never sent to the server.</p>
    <div class="card"><div class="card-body">${list}
      <div id="kr-status" class="mono faint" style="font-size:.8rem;margin-top:10px" role="status"></div>
    </div></div>
    <details style="margin-top:18px"><summary class="dim" style="cursor:pointer">Restore from a terminal</summary>
<pre class="mono" style="font-size:.8rem">curl -fsSL https://logicsrc.com/install.sh | sh
logicsrc login
logicsrc keyring sync
logicsrc keyring restore id_ed25519      # writes ~/.ssh/id_ed25519 (600) + .pub (644)</pre></details>
  </main>`;
}

keyringRouter.get("/keyring", requireAuth, async (req, res) => {
  const rows = await all(`SELECT id, name, key_type, filename, public_key, fingerprint, comment, updated_at FROM keyring_entries WHERE user_id = ? AND deleted_at IS NULL ORDER BY name`, [req.user.id]);
  res.set("Cache-Control", "no-store");
  res.type("html").send(page({
    title: "LogicSRC ▸ keyring",
    body: `${appBar(req)}${keyringPageBody(rows)}${footer}`,
    head: `<script src="/keyring.js" defer></script>`
  }));
});
