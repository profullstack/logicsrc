// App grants (see lib/app-grants.mjs and migrations/013_app_grants.sql).
//
//   GET    /grant?origin=<https origin>&nonce=<n>   consent page (session)
//   POST   /api/v1/app-grants/requests/:id/approve   sealed values from the browser (session)
//   POST   /api/v1/app-grants/requests/:id/deny
//   GET    /api/v1/app-grants[?fingerprint=<fp>]     yours, or every active grant on a value
//                                                    in vaults you can open (rotation)
//   POST   /api/v1/app-grants/:id/deliveries         re-seal after rotation (session or person key)
//   DELETE /api/v1/app-grants/:id                    revoke
//   GET    /apps                                     the apps holding your keys (session)
//
// Values are decrypted and sealed only in the browser or the CLI; this file
// handles ciphertext and metadata. Signing keys (wallet keys, seeds, SSH keys)
// are never granted to an app.

import { Router } from "express";
import { get, all, run } from "../db.mjs";
import { id } from "../lib/crypto.mjs";
import { page, appBar, esc } from "../lib/html.mjs";
import { requireAuth } from "../lib/session.mjs";
import { isSigningKeyName } from "../lib/signing-keys.mjs";
import { api, audit } from "./credshare.mjs";
import { GrantError, fetchManifest, isSealed, recipientFingerprint, sendWebhook } from "../lib/app-grants.mjs";

export const appGrantsRouter = Router();

// Tests point manifests at a local server; production only fetches public https origins.
const ALLOW_LOCAL = process.env.APP_GRANTS_ALLOW_LOCAL === "1";
let fetchImpl = (...a) => fetch(...a);
export const _setFetch = (f) => (fetchImpl = f);

const fail = (res, e) => {
  if (e instanceof GrantError) return res.status(e.status).json({ error: e.message, code: e.code });
  console.error("app-grants:", e);
  return res.status(500).json({ error: e.message || String(e) });
};

/** Vaults this person can open (they hold a grant), for the consent page's picker. */
async function openableVaults(userId) {
  return all(
    `SELECT v.id, v.name, t.slug AS team FROM credshare_vault_grants g
       JOIN credshare_vaults v ON v.id = g.vault_id
       JOIN credshare_teams t ON t.id = v.team_id
       JOIN credshare_members m ON m.team_id = t.id AND m.user_id = g.user_id AND m.status = 'active'
      WHERE g.user_id = ? ORDER BY t.slug, v.name`,
    [userId],
  );
}

async function canOpenVault(userId, vaultId) {
  return Boolean(await get(
    `SELECT 1 FROM credshare_vault_grants g JOIN credshare_vaults v ON v.id = g.vault_id
       JOIN credshare_members m ON m.team_id = v.team_id AND m.user_id = g.user_id AND m.status = 'active'
      WHERE g.user_id = ? AND g.vault_id = ?`,
    [userId, vaultId],
  ));
}

const parseJson = (s, d = null) => {
  try {
    return typeof s === "string" ? JSON.parse(s) : s ?? d;
  } catch {
    return d;
  }
};

async function deliver(grants, type, sealedById = {}) {
  // One webhook per grant: an app may route keys to different places.
  const out = [];
  for (const g of grants) {
    const payload = {
      type,
      grant_id: g.id,
      request_id: g.request_id,
      key_name: g.key_name,
      recipient_user_id: parseJson(g.recipient, {})?.user_id ?? null,
      ...(sealedById[g.id] ? { sealed: sealedById[g.id] } : {}),
    };
    const r = await sendWebhook(g.webhook_url, g.webhook_secret, payload, { fetchImpl });
    await run(`UPDATE app_grants SET last_delivered_at = ?, last_error = ? WHERE id = ?`, [r.ok ? Date.now() : g.last_delivered_at ?? null, r.ok ? null : r.error, g.id]);
    out.push({ grant_id: g.id, key_name: g.key_name, delivered: r.ok, ...(r.ok ? {} : { error: r.error }) });
  }
  return out;
}

// ---------------------------------------------------------------- consent page

appGrantsRouter.get("/grant", requireAuth, async (req, res) => {
  const user = req.user;
  let manifest, origin;
  try {
    origin = String(req.query.origin ?? "");
    manifest = await fetchManifest(origin, req.query.nonce, { fetchImpl, allowLocal: ALLOW_LOCAL });
    origin = new URL(origin).origin;
  } catch (e) {
    const msg = e instanceof GrantError ? e.message : "could not load this request";
    return res.status(e.status ?? 400).type("html").send(page({ title: "LogicSRC ▸ app request", body: `${appBar(req)}<main class="wrap"><h1>Can't load this request</h1><p>${esc(msg)}</p></main>` }));
  }

  // One request per (origin, nonce); it belongs to the first person who opens it.
  let reqRow = await get(`SELECT * FROM app_grant_requests WHERE origin = ? AND nonce = ?`, [origin, String(req.query.nonce)]);
  if (reqRow && reqRow.user_id !== user.id) {
    return res.status(409).type("html").send(page({ body: `${appBar(req)}<main class="wrap"><h1>Request already taken</h1><p>Another account opened this request. Start again from the app.</p></main>` }));
  }
  if (!reqRow) {
    reqRow = { id: id(), status: "pending" };
    await run(
      `INSERT INTO app_grant_requests (id, origin, nonce, app_name, manifest, user_id, status, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      [reqRow.id, origin, String(req.query.nonce), manifest.app_name, JSON.stringify(manifest), user.id, "pending", Date.now(), manifest.expires_at],
    );
  }
  if (reqRow.status !== "pending") {
    return res.type("html").send(page({ body: `${appBar(req)}<main class="wrap"><h1>Already ${esc(reqRow.status)}</h1><p><a href="${esc(manifest.return_url)}">Back to ${esc(manifest.app_name)}</a></p></main>` }));
  }

  const vaults = await openableVaults(user.id);
  const pk = (await get(`SELECT public_key FROM credshare_keys WHERE user_id = ?`, [user.id]))?.public_key ?? "";
  const signing = manifest.keys.filter((k) => isSigningKeyName(k.name)).map((k) => k.name);
  const host = new URL(origin).host;
  const body = `${appBar(req)}
<main class="wrap" id="grant" data-request-id="${esc(reqRow.id)}" data-public-key="${esc(pk)}" data-return-url="${esc(manifest.return_url)}"
      data-recipient="${esc(JSON.stringify(manifest.recipient))}">
  <h1>${esc(manifest.app_name)} wants keys from your vault</h1>
  <p class="lead">Verified origin: <b>${esc(host)}</b>. logicsrc fetched this request from <code>${esc(origin)}</code> over TLS.
     Each value is decrypted here in your browser and sealed so that only your account on ${esc(host)} can open it, and only while you have unlocked it there.</p>
  ${signing.length ? `<p class="warn">Refused: ${signing.map(esc).join(", ")} ${signing.length > 1 ? "are" : "is"} a signing key (wallet, seed or SSH). Those never leave logicsrc.</p>` : ""}
  ${pk ? "" : `<p class="warn">Your account has no identity key yet. Run <code>logicsrc login</code> once, then reload.</p>`}
  <section class="card">
    <label>Vault <select id="grant-vault">${vaults.map((v) => `<option value="${esc(v.id)}">${esc(v.team)} / ${esc(v.name)}</option>`).join("") || `<option value="">No vaults you can open</option>`}</select></label>
    <table class="kv"><thead><tr><th>${esc(manifest.app_name)} asks for</th><th>From this secret in the vault</th></tr></thead><tbody>
      ${manifest.keys.filter((k) => !signing.includes(k.name)).map((k) => `<tr data-key="${esc(k.name)}"><td><code>${esc(k.name)}</code>${k.description ? `<br><small>${esc(k.description)}</small>` : ""}</td><td><input name="src" value="${esc(k.name)}" aria-label="Source secret for ${esc(k.name)}"></td></tr>`).join("")}
    </tbody></table>
    <label>Your identity key <textarea id="grant-key" rows="2" placeholder="Paste keys.secretKey from ~/.config/logicsrc/identity.json (or the whole file)"></textarea></label>
    <p class="hint">Already unlocked a vault in this tab? The key is reused. It never leaves this page.</p>
    <div class="row"><button class="btn" id="grant-approve" type="button">Seal and send to ${esc(host)}</button>
      <button class="btn ghost" id="grant-deny" type="button">Deny</button></div>
    <p id="grant-status" role="status"></p>
  </section>
</main>
<script src="/vendor/libsodium.js" defer></script>
<script src="/vendor/libsodium-wrappers.js" defer></script>
<script type="module" src="/app-grant.js"></script>`;
  res.type("html").send(page({ title: `LogicSRC ▸ ${manifest.app_name} wants keys`, body }));
});

// -------------------------------------------------------------- approve / deny

appGrantsRouter.post("/api/v1/app-grants/requests/:id/approve", api(async (req, res, user) => {
  try {
    const r = await get(`SELECT * FROM app_grant_requests WHERE id = ?`, [req.params.id]);
    if (!r || r.user_id !== user.id) throw new GrantError("unknown request", 404, "unknown_request");
    if (r.status !== "pending") throw new GrantError(`request is ${r.status}`, 409, "not_pending");
    if (Number(r.expires_at) <= Date.now()) throw new GrantError("request expired; start again from the app", 410, "expired");
    const manifest = parseJson(r.manifest);
    const wanted = new Set(manifest.keys.map((k) => k.name));
    const items = Array.isArray(req.body?.deliveries) ? req.body.deliveries : [];
    if (!items.length) throw new GrantError("nothing to grant");

    const rows = [];
    for (const d of items) {
      if (!wanted.has(d.key_name)) throw new GrantError(`${manifest.app_name} did not ask for ${d.key_name}`);
      if (isSigningKeyName(d.key_name) || isSigningKeyName(d.source_name)) throw new GrantError(`${d.source_name || d.key_name} is a signing key; it never leaves logicsrc`, 403, "signing_key");
      if (!isSealed(d.sealed)) throw new GrantError(`${d.key_name}: not a sealed value`);
      if (!(await canOpenVault(user.id, d.vault_id))) throw new GrantError("you cannot open that vault", 403, "no_vault_access");
      const s = await get(`SELECT fingerprint FROM credshare_secrets WHERE vault_id = ? AND name = ?`, [d.vault_id, d.source_name]);
      if (!s) throw new GrantError(`no secret ${d.source_name} in that vault`, 404, "no_secret");
      if (s.fingerprint !== d.fingerprint) throw new GrantError(`${d.source_name} changed since you opened it; reload and try again`, 409, "stale");
      rows.push({ ...d, fingerprint: s.fingerprint });
    }

    const recipient = JSON.stringify(manifest.recipient);
    const rfp = recipientFingerprint(manifest.recipient);
    const grants = [];
    const sealedById = {};
    for (const d of rows) {
      const g = {
        id: id(), request_id: r.id, user_id: user.id, origin: r.origin, app_name: r.app_name, key_name: d.key_name,
        vault_id: d.vault_id, source_name: d.source_name, fingerprint: d.fingerprint, recipient, recipient_fingerprint: rfp,
        webhook_url: manifest.webhook_url, webhook_secret: manifest.webhook_secret, status: "active", created_at: Date.now(),
      };
      await run(
        `INSERT INTO app_grants (id, request_id, user_id, origin, app_name, key_name, vault_id, source_name, fingerprint, recipient, recipient_fingerprint, webhook_url, webhook_secret, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [g.id, g.request_id, g.user_id, g.origin, g.app_name, g.key_name, g.vault_id, g.source_name, g.fingerprint, g.recipient, g.recipient_fingerprint, g.webhook_url, g.webhook_secret, g.status, g.created_at],
      );
      const vault = await get(`SELECT team_id FROM credshare_vaults WHERE id = ?`, [d.vault_id]);
      await audit({ req, teamId: vault?.team_id ?? null, vaultId: d.vault_id, actorUserId: user.id, action: "app:grant", keyName: `${d.source_name} -> ${new URL(r.origin).host} ${d.key_name}`, fingerprint: d.fingerprint });
      grants.push(g);
      sealedById[g.id] = d.sealed;
    }
    await run(`UPDATE app_grant_requests SET status = 'approved', decided_at = ? WHERE id = ?`, [Date.now(), r.id]);
    const delivered = await deliver(grants, "grant.delivered", sealedById);
    res.json({ ok: true, return_url: manifest.return_url, delivered });
  } catch (e) {
    fail(res, e);
  }
}));

appGrantsRouter.post("/api/v1/app-grants/requests/:id/deny", api(async (req, res, user) => {
  const r = await get(`SELECT * FROM app_grant_requests WHERE id = ?`, [req.params.id]);
  if (!r || r.user_id !== user.id) return res.status(404).json({ error: "unknown request" });
  if (r.status === "pending") await run(`UPDATE app_grant_requests SET status = 'denied', decided_at = ? WHERE id = ?`, [Date.now(), r.id]);
  res.json({ ok: true, return_url: parseJson(r.manifest)?.return_url ?? r.origin });
}));

// ------------------------------------------------------------ list / rotate / revoke

const publicGrant = (g) => ({
  id: g.id, app_name: g.app_name, origin: g.origin, key_name: g.key_name, vault_id: g.vault_id, source_name: g.source_name,
  fingerprint: g.fingerprint, recipient: parseJson(g.recipient), status: g.status, created_at: Number(g.created_at),
  last_delivered_at: g.last_delivered_at == null ? null : Number(g.last_delivered_at), last_error: g.last_error ?? null,
});

appGrantsRouter.get("/api/v1/app-grants", api(async (req, res, user) => {
  const fp = req.query.fingerprint ? String(req.query.fingerprint) : null;
  if (!fp) {
    const rows = await all(`SELECT * FROM app_grants WHERE user_id = ? ORDER BY created_at DESC`, [user.id]);
    return res.json({ grants: rows.map(publicGrant) });
  }
  // Rotation: every active grant of this value in a vault the caller can open,
  // whoever made it, so a teammate's rotation reaches the apps too.
  const rows = await all(`SELECT * FROM app_grants WHERE fingerprint = ? AND status = 'active'`, [fp]);
  const out = [];
  for (const g of rows) if (await canOpenVault(user.id, g.vault_id)) out.push(publicGrant(g));
  res.json({ grants: out });
}));

appGrantsRouter.post("/api/v1/app-grants/:id/deliveries", api(async (req, res, user) => {
  try {
    const g = await get(`SELECT * FROM app_grants WHERE id = ?`, [req.params.id]);
    if (!g || g.status !== "active") throw new GrantError("unknown or revoked grant", 404, "unknown_grant");
    if (!(await canOpenVault(user.id, g.vault_id))) throw new GrantError("you cannot open that grant's vault", 403, "no_vault_access");
    const { sealed, fingerprint } = req.body ?? {};
    if (!isSealed(sealed)) throw new GrantError("not a sealed value");
    const s = await get(`SELECT fingerprint FROM credshare_secrets WHERE vault_id = ? AND name = ?`, [g.vault_id, g.source_name]);
    if (!s || s.fingerprint !== fingerprint) throw new GrantError("fingerprint does not match the vault's current value", 409, "stale");
    await run(`UPDATE app_grants SET fingerprint = ? WHERE id = ?`, [fingerprint, g.id]);
    const vault = await get(`SELECT team_id FROM credshare_vaults WHERE id = ?`, [g.vault_id]);
    await audit({ req, teamId: vault?.team_id ?? null, vaultId: g.vault_id, actorUserId: user.id, action: "app:grant:update", keyName: `${g.source_name} -> ${new URL(g.origin).host} ${g.key_name}`, fingerprint });
    const [d] = await deliver([{ ...g, fingerprint }], "grant.updated", { [g.id]: sealed });
    res.json({ ok: true, ...d });
  } catch (e) {
    fail(res, e);
  }
}));

appGrantsRouter.delete("/api/v1/app-grants/:id", api(async (req, res, user) => {
  const g = await get(`SELECT * FROM app_grants WHERE id = ?`, [req.params.id]);
  if (!g || g.user_id !== user.id) return res.status(404).json({ error: "unknown grant" });
  if (g.status === "active") {
    await run(`UPDATE app_grants SET status = 'revoked', revoked_at = ? WHERE id = ?`, [Date.now(), g.id]);
    const vault = await get(`SELECT team_id FROM credshare_vaults WHERE id = ?`, [g.vault_id]);
    await audit({ req, teamId: vault?.team_id ?? null, vaultId: g.vault_id, actorUserId: user.id, action: "app:revoke", keyName: `${new URL(g.origin).host} ${g.key_name}` });
    await deliver([g], "grant.revoked");
  }
  res.json({ ok: true, note: "The app deleted its copy if it was online. A value it already opened is still known to it: rotate the key to be sure." });
}));

// ------------------------------------------------------------------ /apps page

appGrantsRouter.get("/apps", requireAuth, async (req, res) => {
  const rows = (await all(`SELECT * FROM app_grants WHERE user_id = ? ORDER BY status, created_at DESC`, [req.user.id])).map(publicGrant);
  const body = `${appBar(req)}<main class="wrap"><h1>Apps holding your keys</h1>
  <p class="lead">Each row is one secret sealed to one app. Revoking tells the app to delete its copy; rotate the key too if it may have been used.</p>
  ${rows.length ? `<table class="kv"><thead><tr><th>App</th><th>Key</th><th>From</th><th>Status</th><th></th></tr></thead><tbody>
  ${rows.map((g) => `<tr><td>${esc(g.app_name)}<br><small>${esc(new URL(g.origin).host)}</small></td><td><code>${esc(g.key_name)}</code></td><td><code>${esc(g.source_name)}</code></td>
    <td>${esc(g.status)}${g.last_error ? `<br><small>last delivery failed: ${esc(g.last_error)}</small>` : ""}</td>
    <td>${g.status === "active" ? `<button class="btn compact ghost" data-revoke="${esc(g.id)}">Revoke</button>` : ""}</td></tr>`).join("")}
  </tbody></table>` : `<p>No app holds a key from your vaults.</p>`}
  <script type="module" src="/app-grant.js"></script></main>`;
  res.type("html").send(page({ title: "LogicSRC ▸ apps", body }));
});
