// App grants: hand one named secret to an external app, sealed in the person's
// browser to that app's per-user inbox key. See migrations/013_app_grants.sql.
//
// The app proves who it is by serving the grant manifest from its own origin
// over TLS; logicsrc fetches it, never trusts a body the app POSTed.
//
//   GET <origin>/.well-known/logicsrc-grant/<nonce>
//   { "v": 1, "app_name": "MeshHook",
//     "keys": [{ "name": "COINPAY_API_KEY", "description": "..." }],
//     "recipient": { "format": "sealed-secrets/inbox-v2", "app": "meshhook",
//                    "scope": "workflow_secrets", "user_id": "<app user id>",
//                    "inbox_public_key": "<base64>" },
//     "webhook_url": "<same origin, https>", "webhook_secret": "<32+ chars>",
//     "return_url": "<same origin>", "expires_at": <ms> }

import { createHash, createHmac, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const MANIFEST_PATH = "/.well-known/logicsrc-grant/";
export const RECIPIENT_FORMAT = "sealed-secrets/inbox-v2";
export const SEALED_PREFIX = "sealed:v2:";
export const MAX_KEYS = 20;
const KEY_NAME = /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/;

export class GrantError extends Error {
  constructor(message, status = 400, code = "bad_request") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Only https origins with a real host name (http://localhost only when allowed, for tests and dev). */
export function parseOrigin(raw, { allowLocal = false } = {}) {
  let u;
  try {
    u = new URL(String(raw ?? ""));
  } catch {
    throw new GrantError("origin must be a URL such as https://meshhook.com");
  }
  const local = allowLocal && u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname);
  if (u.protocol !== "https:" && !local) throw new GrantError("origin must be https");
  if (u.username || u.password || (u.pathname !== "/" && u.pathname !== "") || u.search || u.hash) {
    throw new GrantError("origin must be a bare origin, like https://meshhook.com");
  }
  if (!local && (isIP(u.hostname) || !u.hostname.includes("."))) throw new GrantError("origin must use a public host name");
  return u.origin;
}

/** v4/v6 ranges a manifest fetch must never reach (loopback, private, link-local, CGNAT, metadata). */
export function isPrivateAddress(ip) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") ||
    v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff");
}

async function assertPublicHost(hostname) {
  const addrs = await lookup(hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new GrantError(`${hostname} does not resolve`, 502, "origin_unreachable");
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new GrantError(`${hostname} resolves to a private address`, 400, "origin_private");
}

const sameOrigin = (url, origin) => {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
};

/** Validate a manifest against the origin it was fetched from. Returns a normalised copy. */
export function validateManifest(m, origin, { now = Date.now() } = {}) {
  if (!m || typeof m !== "object" || m.v !== 1) throw new GrantError("manifest must be an object with v: 1", 502, "bad_manifest");
  const appName = String(m.app_name ?? "").trim().slice(0, 80);
  if (!appName) throw new GrantError("manifest needs app_name", 502, "bad_manifest");
  if (!Array.isArray(m.keys) || !m.keys.length || m.keys.length > MAX_KEYS) throw new GrantError(`manifest needs 1 to ${MAX_KEYS} keys`, 502, "bad_manifest");
  const keys = m.keys.map((k) => {
    const name = String(k?.name ?? "");
    if (!KEY_NAME.test(name)) throw new GrantError(`"${name}" is not a valid key name`, 502, "bad_manifest");
    return { name, description: String(k?.description ?? "").slice(0, 200) };
  });
  const r = m.recipient ?? {};
  if (r.format !== RECIPIENT_FORMAT) throw new GrantError(`recipient.format must be ${RECIPIENT_FORMAT}`, 502, "bad_manifest");
  for (const f of ["app", "scope", "user_id", "inbox_public_key"]) {
    if (typeof r[f] !== "string" || !r[f]) throw new GrantError(`recipient.${f} is required`, 502, "bad_manifest");
  }
  if (!sameOrigin(m.webhook_url, origin)) throw new GrantError("webhook_url must be on the app's own origin", 502, "bad_manifest");
  if (typeof m.webhook_secret !== "string" || m.webhook_secret.length < 32) throw new GrantError("webhook_secret must be 32+ characters", 502, "bad_manifest");
  const returnUrl = m.return_url && sameOrigin(m.return_url, origin) ? m.return_url : origin;
  const expiresAt = Number(m.expires_at) || now + 15 * 60_000;
  if (expiresAt <= now) throw new GrantError("this grant request has expired; start again from the app", 410, "expired");
  return {
    v: 1,
    app_name: appName,
    keys,
    recipient: { format: r.format, app: r.app, scope: r.scope, user_id: r.user_id, inbox_public_key: r.inbox_public_key },
    webhook_url: m.webhook_url,
    webhook_secret: m.webhook_secret,
    return_url: returnUrl,
    expires_at: Math.min(expiresAt, now + 60 * 60_000),
  };
}

/** Fetch the manifest from the app's origin: TLS is what proves which app is asking. */
export async function fetchManifest(origin, nonce, { fetchImpl = fetch, allowLocal = false, now = Date.now() } = {}) {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(String(nonce ?? ""))) throw new GrantError("nonce must be 16 to 128 URL-safe characters");
  const o = parseOrigin(origin, { allowLocal });
  if (!allowLocal) await assertPublicHost(new URL(o).hostname);
  let res;
  try {
    res = await fetchImpl(`${o}${MANIFEST_PATH}${encodeURIComponent(nonce)}`, {
      headers: { accept: "application/json", "user-agent": "logicsrc-grants/1" },
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    throw new GrantError(`could not reach ${o}: ${e.message}`, 502, "origin_unreachable");
  }
  if (res.status === 404) throw new GrantError("the app does not know this request (expired or already used)", 404, "unknown_request");
  if (!res.ok) throw new GrantError(`${o} answered ${res.status}`, 502, "origin_error");
  const text = await res.text();
  if (text.length > 64_000) throw new GrantError("manifest too large", 502, "bad_manifest");
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new GrantError("manifest is not JSON", 502, "bad_manifest");
  }
  return validateManifest(body, o, { now });
}

/** A short, stable fingerprint of a recipient (what changes if the app's inbox key changes). */
export const recipientFingerprint = (r) =>
  createHash("sha256").update(`${r.app}\n${r.scope}\n${r.user_id}\n${r.inbox_public_key}`).digest("hex").slice(0, 16);

/**
 * Standard Webhooks signature: v1,<base64 HMAC-SHA256(secret, "<id>.<ts>.<body>")>.
 * The secret is the app's webhook_secret as UTF-8 (a whsec_ prefix is base64 per the spec).
 */
export function signWebhook(secret, id, ts, body) {
  const key = secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret, "utf8");
  return `v1,${createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")}`;
}

/** POST one event to the app. Returns { ok, status?, error? }; never throws. */
export async function sendWebhook(url, secret, payload, { fetchImpl = fetch, allowLocal = false } = {}) {
  // Re-checked on every delivery: a host that resolved publicly at consent time
  // may point inside our network by the time a rotation fires.
  if (!allowLocal) {
    try {
      await assertPublicHost(new URL(url).hostname);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  const body = JSON.stringify(payload);
  const id = `msg_${randomBytes(12).toString("hex")}`;
  const ts = Math.floor(Date.now() / 1000);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "webhook-id": id,
        "webhook-timestamp": String(ts),
        "webhook-signature": signWebhook(secret, id, ts, body),
        "user-agent": "logicsrc-grants/1",
      },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export const isSealed = (v) => typeof v === "string" && v.startsWith(SEALED_PREFIX) && v.length < 32_000;
