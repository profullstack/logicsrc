// `logicsrc login` OAuth-style flow (authorization code + PKCE + loopback):
//   GET  /cli/authorize   browser lands here (login required) → approve page
//   POST /cli/authorize   approve → mint a code, redirect to the CLI's loopback
//   POST /cli/token       CLI exchanges code + verifier → an lsk_ API key (bearer)
//   GET  /api/me          Bearer → who am I (for `logicsrc whoami`)
//
// …and the device-authorization flow, for CLIs on a machine with no browser
// (SSH, droplets, containers) where a 127.0.0.1 redirect_uri is unreachable:
//   POST /cli/device/code   CLI asks for a device_code + short user_code
//   GET  /cli/device        human opens this anywhere, types/confirms the code
//   POST /cli/device        approve (or deny) the pending code
//   POST /cli/device/token  CLI polls with device_code → an lsk_ API key
import { Router } from "express";
import crypto from "node:crypto";
import { get, run } from "../db.mjs";
import { token, sha256 } from "../lib/crypto.mjs";
import { page, footer, appBar, esc } from "../lib/html.mjs";
import { requireAuth, csrfInput } from "../lib/session.mjs";
import { createApiKey, bearer, userForApiKey } from "../lib/apikey.mjs";
import { requestOrigin } from "../lib/origin.mjs";
import { config } from "../config.mjs";

export const cliRouter = Router();

// Only loopback redirect URIs are allowed (the CLI listens on 127.0.0.1).
function loopbackOk(uri) {
  try {
    const u = new URL(uri);
    return u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
  } catch { return false; }
}

cliRouter.get("/cli/authorize", requireAuth, (req, res) => {
  const { redirect_uri, state, code_challenge } = req.query;
  if (!loopbackOk(redirect_uri) || !state || !code_challenge) {
    return res.status(400).type("html").send(page({ body: `<main class="wrap" style="padding-top:12vh"><h1>Bad CLI request</h1><p class="dim mono">missing/invalid redirect_uri, state, or code_challenge.</p></main>` }));
  }
  const name = String(req.query.name || "logicsrc cli").slice(0, 40);
  const body = `${appBar(req.user)}
  <main class="wrap" style="max-width:460px;padding-top:8vh">
    <div class="card"><div class="card-body" style="text-align:center">
      <div style="font-size:2rem">🔑</div>
      <h1 style="font-size:1.4rem;margin:10px 0">Authorize the LogicSRC CLI</h1>
      <p class="dim mono" style="font-size:.82rem">Grant <b class="green">${esc(name)}</b> on this machine access to manage teams &amp; encrypted credentials as <b>${esc(req.user.email || req.user.display_name)}</b>.</p>
      <form method="post" action="/cli/authorize" style="margin-top:18px">
        ${csrfInput(req)}
        <input type="hidden" name="redirect_uri" value="${esc(redirect_uri)}">
        <input type="hidden" name="state" value="${esc(state)}">
        <input type="hidden" name="code_challenge" value="${esc(code_challenge)}">
        <input type="hidden" name="name" value="${esc(name)}">
        <button class="btn acid block" type="submit">Authorize &amp; connect</button>
      </form>
      <p class="faint mono" style="font-size:.72rem;margin-top:12px">You'll return to your terminal.</p>
    </div></div>
  </main>${footer}`;
  res.type("html").send(page({ title: "LogicSRC ▸ authorize CLI", body }));
});

cliRouter.post("/cli/authorize", requireAuth, async (req, res) => {
  const { redirect_uri, state, code_challenge, name } = req.body;
  if (!loopbackOk(redirect_uri) || !state || !code_challenge) return res.status(400).send("bad request");
  const code = token(24);
  const now = Date.now();
  await run(
    `INSERT INTO cli_auth_codes (code,user_id,code_challenge,redirect_uri,name,created_at,expires_at) VALUES (?,?,?,?,?,?,?)`,
    [code, req.user.id, code_challenge, redirect_uri, String(name || "cli").slice(0, 40), now, now + 5 * 60 * 1000]
  );
  const u = new URL(redirect_uri);
  u.searchParams.set("code", code);
  u.searchParams.set("state", state);
  res.redirect(u.toString());
});

cliRouter.post("/cli/token", async (req, res) => {
  const { code, code_verifier } = req.body || {};
  if (!code || !code_verifier) return res.status(400).json({ error: "code and code_verifier required" });
  const row = await get(`SELECT * FROM cli_auth_codes WHERE code = ?`, [code]);
  if (!row || row.used || row.expires_at < Date.now()) return res.status(400).json({ error: "invalid or expired code" });

  // PKCE: base64url(sha256(verifier)) must equal the stored challenge
  const challenge = crypto.createHash("sha256").update(String(code_verifier)).digest("base64url");
  if (challenge !== row.code_challenge) return res.status(400).json({ error: "PKCE verification failed" });

  await run(`UPDATE cli_auth_codes SET used = 1 WHERE code = ?`, [code]);
  const user = await get(`SELECT * FROM users WHERE id = ?`, [row.user_id]);
  const { plaintext } = await createApiKey(user.id, row.name || "logicsrc cli");
  res.json({ access_token: plaintext, token_type: "bearer", user: { id: user.id, email: user.email || null, name: user.display_name } });
});

// ---- device authorization (no browser on the CLI's machine) ----

const DEVICE_TTL_MS = 10 * 60 * 1000;
const DEVICE_POLL_SECONDS = 5;
// Unambiguous alphabet — no 0/O, 1/I/L, U/V confusion when read off a screen.
const CODE_ALPHABET = "BCDFGHJKMNPQRSTWXYZ23456789";

function userCode() {
  const bytes = crypto.randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (i === 3) out += "-";
  }
  return out;
}

/** Normalize whatever the human typed (spaces, lowercase, missing dash). */
function normalizeUserCode(input) {
  const raw = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

cliRouter.post("/cli/device/code", async (req, res) => {
  const name = String(req.body?.name || "logicsrc cli").slice(0, 40);
  const deviceCode = token(32);
  const now = Date.now();

  // Retry on the (vanishingly unlikely) user_code collision.
  let code;
  for (let attempt = 0; attempt < 5 && !code; attempt++) {
    const candidate = userCode();
    const clash = await get(`SELECT user_code FROM cli_device_codes WHERE user_code = ? AND expires_at > ?`, [candidate, now]);
    if (!clash) code = candidate;
  }
  if (!code) return res.status(503).json({ error: "could not allocate a user code — try again" });

  await run(
    `INSERT INTO cli_device_codes (device_code_hash,user_code,name,status,created_at,expires_at) VALUES (?,?,?,'pending',?,?)`,
    [sha256(deviceCode), code, name, now, now + DEVICE_TTL_MS]
  );
  // Echo back the host the CLI actually called us on, not $PUBLIC_ORIGIN — the
  // user is told to open this link, and it has to be a domain they can reach.
  const origin = requestOrigin(req, config.origin);
  res.json({
    device_code: deviceCode,
    user_code: code,
    verification_uri: `${origin}/cli/device`,
    verification_uri_complete: `${origin}/cli/device?user_code=${encodeURIComponent(code)}`,
    expires_in: Math.floor(DEVICE_TTL_MS / 1000),
    interval: DEVICE_POLL_SECONDS
  });
});

const devicePage = (req, body) =>
  page({ title: "LogicSRC ▸ authorize CLI", body: `${appBar(req.user)}<main class="wrap" style="max-width:460px;padding-top:8vh">${body}</main>${footer}` });

const deviceResult = (req, res, status, heading, detail) =>
  res.status(status).type("html").send(devicePage(req, `<div class="card"><div class="card-body" style="text-align:center">
      <h1 style="font-size:1.4rem;margin:10px 0">${heading}</h1>
      <p class="dim mono" style="font-size:.82rem">${detail}</p>
    </div></div>`));

cliRouter.get("/cli/device", requireAuth, async (req, res) => {
  const code = normalizeUserCode(req.query.user_code);
  const row = code ? await get(`SELECT * FROM cli_device_codes WHERE user_code = ?`, [code]) : null;
  const pending = row && row.status === "pending" && row.expires_at > Date.now();

  // No (or an unusable) code in the URL → ask the human to type the one their terminal is showing.
  if (!pending) {
    const problem = !code ? "" : !row ? "That code doesn't exist — check for typos."
      : row.status !== "pending" ? "That code was already used."
      : "That code expired — run <code>logicsrc login</code> again.";
    return res.status(code ? 400 : 200).type("html").send(devicePage(req, `<div class="card"><div class="card-body">
      <div style="font-size:2rem;text-align:center">🔑</div>
      <h1 style="font-size:1.4rem;margin:10px 0;text-align:center">Authorize the LogicSRC CLI</h1>
      <p class="dim mono" style="font-size:.82rem;text-align:center">Enter the code shown in your terminal.</p>
      ${problem ? `<p class="mono" style="font-size:.8rem;color:#c2410c;text-align:center">${problem}</p>` : ""}
      <form method="get" action="/cli/device" style="margin-top:18px">
        <input name="user_code" value="${esc(code)}" placeholder="XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false"
               style="width:100%;padding:12px;font-family:ui-monospace,monospace;font-size:1.2rem;letter-spacing:.18em;text-align:center;text-transform:uppercase">
        <button class="btn acid block" type="submit" style="margin-top:12px">Continue</button>
      </form>
    </div></div>`));
  }

  res.type("html").send(devicePage(req, `<div class="card"><div class="card-body" style="text-align:center">
      <div style="font-size:2rem">🔑</div>
      <h1 style="font-size:1.4rem;margin:10px 0">Authorize the LogicSRC CLI</h1>
      <p class="dim mono" style="font-size:.82rem">Grant <b class="green">${esc(row.name || "logicsrc cli")}</b> access to manage teams &amp; encrypted credentials as <b>${esc(req.user.email || req.user.display_name)}</b>.</p>
      <p class="mono" style="font-size:1.2rem;letter-spacing:.18em;margin:14px 0">${esc(row.user_code)}</p>
      <p class="faint mono" style="font-size:.72rem">Only approve this if the code matches the one in your terminal.</p>
      <form method="post" action="/cli/device" style="margin-top:18px">
        ${csrfInput(req)}
        <input type="hidden" name="user_code" value="${esc(row.user_code)}">
        <button class="btn acid block" type="submit" name="action" value="approve">Authorize &amp; connect</button>
        <button class="btn block" type="submit" name="action" value="deny" style="margin-top:8px">Deny</button>
      </form>
    </div></div>`));
});

cliRouter.post("/cli/device", requireAuth, async (req, res) => {
  const code = normalizeUserCode(req.body?.user_code);
  const deny = req.body?.action === "deny";
  const row = code ? await get(`SELECT * FROM cli_device_codes WHERE user_code = ?`, [code]) : null;
  if (!row) return deviceResult(req, res, 400, "Unknown code", "That code doesn't exist — check for typos.");
  if (row.status !== "pending") return deviceResult(req, res, 400, "Already used", "That code was already approved or denied.");
  if (row.expires_at < Date.now()) return deviceResult(req, res, 400, "Code expired", "Run <code>logicsrc login</code> again for a fresh code.");

  await run(`UPDATE cli_device_codes SET status = ?, user_id = ? WHERE user_code = ?`, [deny ? "denied" : "approved", req.user.id, code]);
  return deny
    ? deviceResult(req, res, 200, "Denied", "Nothing was granted. You can close this tab.")
    : deviceResult(req, res, 200, `<span class="green">You're in.</span>`, "Return to your terminal — you can close this tab.");
});

cliRouter.post("/cli/device/token", async (req, res) => {
  const deviceCode = req.body?.device_code;
  if (!deviceCode) return res.status(400).json({ error: "invalid_request" });
  const row = await get(`SELECT * FROM cli_device_codes WHERE device_code_hash = ?`, [sha256(String(deviceCode))]);
  if (!row) return res.status(400).json({ error: "invalid_grant" });

  const now = Date.now();
  // Rate-limit impatient pollers, per the device-flow convention.
  const tooSoon = row.last_polled_at && now - row.last_polled_at < (DEVICE_POLL_SECONDS - 1) * 1000;
  await run(`UPDATE cli_device_codes SET last_polled_at = ? WHERE device_code_hash = ?`, [now, row.device_code_hash]);
  if (tooSoon) return res.status(400).json({ error: "slow_down", interval: DEVICE_POLL_SECONDS });
  if (row.status === "used") return res.status(400).json({ error: "invalid_grant" });
  if (row.status === "denied") return res.status(400).json({ error: "access_denied" });
  if (row.expires_at < now) return res.status(400).json({ error: "expired_token" });
  if (row.status !== "approved") return res.status(400).json({ error: "authorization_pending", interval: DEVICE_POLL_SECONDS });

  await run(`UPDATE cli_device_codes SET status = 'used' WHERE device_code_hash = ?`, [row.device_code_hash]);
  const user = await get(`SELECT * FROM users WHERE id = ?`, [row.user_id]);
  if (!user) return res.status(400).json({ error: "invalid_grant" });
  const { plaintext } = await createApiKey(user.id, row.name || "logicsrc cli");
  res.json({ access_token: plaintext, token_type: "bearer", user: { id: user.id, email: user.email || null, name: user.display_name } });
});

cliRouter.get("/api/me", async (req, res) => {
  const user = await userForApiKey(bearer(req));
  if (!user) return res.status(401).json({ error: "invalid or missing API key" });
  res.json({ id: user.id, email: user.email || null, name: user.display_name });
});
