import { createHash, createHmac, generateKeyPairSync, pbkdf2Sync, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { generateRandomSecret } from "./rotation-catalog.js";

/**
 * Built-in rotators for `method: "provider"`. Each one is two-phase:
 *
 *   mint()       create the new credential at the provider; the old one stays live
 *   (caller)     write it to every vault holding the old value, redeploy the
 *                consumers, health-check them
 *   revokeOld()  only now kill the old credential
 *   rollback()   on any failure before revokeOld: undo mint, so the old value
 *                (still in the vaults' history and in the consumers) keeps working
 *
 * `overlap` says whether old and new really are valid at the same time. When
 * the provider has a single slot (a CoinPay webhook secret, a Postgres role
 * password) it is false: the caller still rolls back, but consumers see a short
 * window of failures, so the weekly job leaves those to a person.
 *
 * Nothing here prints or logs a secret value; errors carry provider status
 * codes and messages only.
 */

export interface RotatorContext {
  key: string;
  oldValue: string;
  /** Decrypted values of the first vault holding the key, by name (companions: public halves, DB URLs). */
  vaultValues: Record<string, string>;
  /** Rotator bookkeeping saved after the last rotation (provider key ids). */
  state: Record<string, string>;
  /** Admin credentials for rotators that need them (CLOUDFLARE_ADMIN_API_TOKEN, ...). */
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  /** Runs a process with stdin; secrets travel on stdin or env, never argv. */
  run?: (cmd: string, args: string[], opts: { input?: string; env?: Record<string, string> }) => { status: number | null; stdout: string; stderr: string };
  now: Date;
}

export interface Minted {
  value: string;
  /** Extra values written beside it in the same vaults (by key name): the VAPID public key, rewritten DB URLs. */
  companions?: Record<string, string>;
  /** Saved to the key's __ROTATE__ entry so the next rotation can revoke this credential by id. */
  state?: Record<string, string>;
  /** Kill the old credential. Returns a note when it has to be done by hand. */
  revokeOld(): Promise<string | undefined>;
  /** Undo mint (delete the new credential / restore the old password). */
  rollback(): Promise<string | undefined>;
}

export interface ProviderRotator {
  id: string;
  title: string;
  overlap: boolean;
  /** null when it can run; otherwise why not (missing admin credential, wrong key type). */
  preflight(ctx: RotatorContext): Promise<string | null>;
  mint(ctx: RotatorContext): Promise<Minted>;
}

export class RotatorError extends Error {}

const day = (d: Date) => d.toISOString().slice(0, 10);

async function call(ctx: RotatorContext, url: string, init: RequestInit & { token: string }): Promise<{ status: number; body: any }> {
  const { token, headers, ...rest } = init;
  const res = await ctx.fetch(url, {
    ...rest,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json", ...(headers as Record<string, string> | undefined) }
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body };
}

function fail(what: string, r: { status: number; body: any }): never {
  const msg = r.body?.message ?? r.body?.error ?? r.body?.errors?.[0]?.message ?? r.body?.raw ?? "";
  throw new RotatorError(`${what}: HTTP ${r.status}${msg ? ` ${String(msg).slice(0, 160)}` : ""}`);
}

// ---- Resend -------------------------------------------------------------------------------

const RESEND = "https://api.resend.com";

/**
 * Resend: POST /api-keys mints, DELETE /api-keys/:id revokes; both need a
 * full-access key. The old key itself is used when it has full access,
 * otherwise RESEND_ADMIN_API_KEY. Resend never shows which id a token is, so
 * the old key is revoked by the id saved at the previous rotation; the first
 * time round that id is unknown and revoking is a one-line manual step.
 */
export const resendRotator: ProviderRotator = {
  id: "resend",
  title: "Resend API key",
  overlap: true,
  async preflight(ctx) {
    const token = adminFor(ctx);
    const r = await call(ctx, `${RESEND}/api-keys`, { method: "GET", token });
    if (r.status === 200) return null;
    if (!ctx.env.RESEND_ADMIN_API_KEY) return `this key cannot manage API keys (HTTP ${r.status}); set RESEND_ADMIN_API_KEY to a full-access key`;
    return `RESEND_ADMIN_API_KEY cannot manage API keys (HTTP ${r.status})`;
  },
  async mint(ctx) {
    const token = adminFor(ctx);
    // A full-access old key gets a full-access successor; anything else gets sending only.
    const own = await call(ctx, `${RESEND}/api-keys`, { method: "GET", token: ctx.oldValue });
    const permission = own.status === 200 ? "full_access" : "sending_access";
    const name = `logicsrc ${ctx.key.toLowerCase()} ${day(ctx.now)}`;
    const r = await call(ctx, `${RESEND}/api-keys`, { method: "POST", token, body: JSON.stringify({ name, permission }) });
    if (r.status !== 200 && r.status !== 201) fail("Resend create key", r);
    const id = String(r.body?.id ?? "");
    const value = String(r.body?.token ?? "");
    if (!id || !value) throw new RotatorError("Resend create key: response had no id/token");
    const oldId = ctx.state.keyId;
    return {
      value,
      state: { keyId: id },
      async revokeOld() {
        if (!oldId) return `Resend does not say which key id the old token is: delete the previous key in ${"https://resend.com/api-keys"} (keep "${name}").`;
        const d = await call(ctx, `${RESEND}/api-keys/${oldId}`, { method: "DELETE", token: value });
        if (d.status !== 200 && d.status !== 204 && d.status !== 404) fail("Resend delete old key", d);
        return undefined;
      },
      async rollback() {
        const d = await call(ctx, `${RESEND}/api-keys/${id}`, { method: "DELETE", token });
        return d.status < 300 || d.status === 404 ? undefined : `delete the new Resend key "${name}" by hand (HTTP ${d.status})`;
      }
    };
  }
};

function adminFor(ctx: RotatorContext): string {
  return ctx.env.RESEND_ADMIN_API_KEY || ctx.oldValue;
}

// ---- Cloudflare ---------------------------------------------------------------------------

const CF = "https://api.cloudflare.com/client/v4";

/**
 * Cloudflare user API tokens: /user/tokens/verify names the token id, the
 * token's policies are copied into a new token, and the old one is deleted
 * after the consumers are healthy. Reading and creating tokens needs "API
 * Tokens Write": CLOUDFLARE_ADMIN_API_TOKEN, or the token itself if it has it.
 */
export const cloudflareTokenRotator: ProviderRotator = {
  id: "cloudflare-token",
  title: "Cloudflare API token",
  overlap: true,
  async preflight(ctx) {
    const v = await call(ctx, `${CF}/user/tokens/verify`, { method: "GET", token: ctx.oldValue });
    if (v.status !== 200 || !v.body?.result?.id) return `not a live user API token (verify HTTP ${v.status}); account tokens and Global API keys rotate by hand`;
    const admin = ctx.env.CLOUDFLARE_ADMIN_API_TOKEN || ctx.oldValue;
    const r = await call(ctx, `${CF}/user/tokens/${v.body.result.id}`, { method: "GET", token: admin });
    if (r.status !== 200) return `cannot read token policies (HTTP ${r.status}); set CLOUDFLARE_ADMIN_API_TOKEN to a token with "API Tokens Write"`;
    return null;
  },
  async mint(ctx) {
    const admin = ctx.env.CLOUDFLARE_ADMIN_API_TOKEN || ctx.oldValue;
    const v = await call(ctx, `${CF}/user/tokens/verify`, { method: "GET", token: ctx.oldValue });
    const oldId = String(v.body?.result?.id ?? "");
    if (!oldId) fail("Cloudflare verify", v);
    const cur = await call(ctx, `${CF}/user/tokens/${oldId}`, { method: "GET", token: admin });
    if (cur.status !== 200) fail("Cloudflare read token", cur);
    const t = cur.body.result;
    const policies = (t.policies ?? []).map((p: any) => ({
      effect: p.effect,
      resources: p.resources,
      permission_groups: (p.permission_groups ?? []).map((g: any) => ({ id: g.id }))
    }));
    const baseName = String(t.name ?? ctx.key).replace(/ \(rotated \d{4}-\d{2}-\d{2}\)$/, "");
    const body: Record<string, unknown> = { name: `${baseName} (rotated ${day(ctx.now)})`, policies };
    if (t.condition) body.condition = t.condition;
    if (t.expires_on) body.expires_on = t.expires_on;
    if (t.not_before) body.not_before = t.not_before;
    const r = await call(ctx, `${CF}/user/tokens`, { method: "POST", token: admin, body: JSON.stringify(body) });
    if (r.status !== 200) fail("Cloudflare create token", r);
    const id = String(r.body?.result?.id ?? "");
    const value = String(r.body?.result?.value ?? "");
    if (!id || !value) throw new RotatorError("Cloudflare create token: no id/value in the response");
    return {
      value,
      state: { tokenId: id },
      async revokeOld() {
        const d = await call(ctx, `${CF}/user/tokens/${oldId}`, { method: "DELETE", token: admin === ctx.oldValue ? value : admin });
        if (d.status !== 200 && d.status !== 404) fail("Cloudflare delete old token", d);
        return undefined;
      },
      async rollback() {
        const d = await call(ctx, `${CF}/user/tokens/${id}`, { method: "DELETE", token: admin });
        return d.status === 200 || d.status === 404 ? undefined : `delete the new Cloudflare token "${body.name}" by hand (HTTP ${d.status})`;
      }
    };
  }
};

// ---- CoinPay (our own API) ----------------------------------------------------------------

function coinpayBase(ctx: RotatorContext): string {
  // COINPAY_API_URL elsewhere in the fleet carries an /api suffix; accept both.
  return (ctx.env.COINPAY_ROTATE_URL || ctx.env.COINPAY_API_URL || "https://coinpayportal.com").replace(/\/+$/, "").replace(/\/api$/, "");
}

/** A merchant session: COINPAY_ROTATE_TOKEN, or log in with COINPAY_ROTATE_EMAIL + COINPAY_ROTATE_PASSWORD. */
async function coinpaySession(ctx: RotatorContext): Promise<string | null> {
  if (ctx.env.COINPAY_ROTATE_TOKEN) return ctx.env.COINPAY_ROTATE_TOKEN;
  if (!ctx.env.COINPAY_ROTATE_EMAIL || !ctx.env.COINPAY_ROTATE_PASSWORD) return null;
  const res = await ctx.fetch(`${coinpayBase(ctx)}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ctx.env.COINPAY_ROTATE_EMAIL, password: ctx.env.COINPAY_ROTATE_PASSWORD })
  });
  const body = (await res.json().catch(() => null)) as any;
  return res.ok && body?.token ? String(body.token) : null;
}

/** The business that owns a key: GET /api/businesses accepts the key itself and lists the owner's businesses. */
async function coinpayBusiness(ctx: RotatorContext, match: (b: any) => boolean): Promise<any | null> {
  const r = await call(ctx, `${coinpayBase(ctx)}/api/businesses`, { method: "GET", token: ctx.oldValue });
  if (r.status !== 200) return null;
  return (r.body?.businesses ?? []).find(match) ?? null;
}

/**
 * CoinPay business API keys. A business has one legacy key (businesses.api_key)
 * and any number of scoped keys (business_api_keys, cp_live_ + 8 char prefix).
 * Rotation always mints a scoped key with the old key's scopes ("*" for the
 * legacy key) so old and new work side by side; revoking the old one means
 * DELETE for a scoped key, or regenerating the legacy slot (its new value is
 * thrown away unread) for the legacy key.
 */
export const coinpayApiKeyRotator: ProviderRotator = {
  id: "coinpay-api-key",
  title: "CoinPay business API key",
  overlap: true,
  async preflight(ctx) {
    if (!(await coinpaySession(ctx))) return "needs a CoinPay merchant session: set COINPAY_ROTATE_TOKEN, or COINPAY_ROTATE_EMAIL + COINPAY_ROTATE_PASSWORD (owner of the business)";
    return null;
  },
  async mint(ctx) {
    const session = await coinpaySession(ctx);
    if (!session) throw new RotatorError("no CoinPay merchant session");
    const base = coinpayBase(ctx);
    const r = await call(ctx, `${base}/api/businesses`, { method: "GET", token: ctx.oldValue });
    if (r.status !== 200) fail("CoinPay: the old key does not authenticate", r);
    const businesses: any[] = r.body?.businesses ?? [];
    let business = businesses.find((b) => b.api_key === ctx.oldValue) ?? null;
    let scoped: any = null;
    if (!business) {
      const prefix = ctx.oldValue.startsWith("cp_live_") ? ctx.oldValue.slice(0, 16) : "";
      for (const b of businesses) {
        const k = await call(ctx, `${base}/api/businesses/${b.id}/api-keys`, { method: "GET", token: session });
        const hit = (k.body?.keys ?? []).find((x: any) => !x.revoked_at && prefix && x.prefix === prefix);
        if (hit) {
          business = b;
          scoped = hit;
          break;
        }
      }
    }
    if (!business) throw new RotatorError("CoinPay: no business of this merchant owns the key (wrong COINPAY_ROTATE_* account?)");
    const name = `logicsrc ${ctx.key.toLowerCase()} ${day(ctx.now)}`;
    const created = await call(ctx, `${base}/api/businesses/${business.id}/api-keys`, {
      method: "POST",
      token: session,
      body: JSON.stringify({ name, scopes: scoped?.scopes?.length ? scoped.scopes : ["*"] })
    });
    if (created.status !== 201 && created.status !== 200) fail("CoinPay create scoped key", created);
    const value = String(created.body?.apiKey ?? "");
    const newId = String(created.body?.key?.id ?? "");
    if (!value || !newId) throw new RotatorError("CoinPay create scoped key: no key in the response");
    return {
      value,
      state: { businessId: String(business.id), keyId: newId },
      async revokeOld() {
        const d = scoped
          ? await call(ctx, `${base}/api/businesses/${business.id}/api-keys/${scoped.id}`, { method: "DELETE", token: session })
          : await call(ctx, `${base}/api/businesses/${business.id}/api-key`, { method: "POST", token: session });
        if (d.status >= 300 && d.status !== 404) fail("CoinPay revoke old key", d);
        return undefined;
      },
      async rollback() {
        const d = await call(ctx, `${base}/api/businesses/${business.id}/api-keys/${newId}`, { method: "DELETE", token: session });
        return d.status < 300 || d.status === 404 ? undefined : `revoke the new CoinPay key "${name}" by hand (HTTP ${d.status})`;
      }
    };
  }
};

/**
 * CoinPay webhook secret: one per business, regenerated in place, so there is
 * no overlap and no way back to the old value. Consumers fail signature
 * checks until they restart; CoinPay retries failed deliveries.
 */
export const coinpayWebhookSecretRotator: ProviderRotator = {
  id: "coinpay-webhook-secret",
  title: "CoinPay webhook secret",
  overlap: false,
  async preflight(ctx) {
    if (!(await coinpaySession(ctx))) return "needs a CoinPay merchant session: set COINPAY_ROTATE_TOKEN, or COINPAY_ROTATE_EMAIL + COINPAY_ROTATE_PASSWORD";
    if (!findApiKey(ctx)) return "no CoinPay API key in the same vault to find the business with";
    return null;
  },
  async mint(ctx) {
    const session = await coinpaySession(ctx);
    const apiKey = findApiKey(ctx);
    if (!session || !apiKey) throw new RotatorError("needs a CoinPay merchant session and the vault's CoinPay API key");
    const base = coinpayBase(ctx);
    const r = await call(ctx, `${base}/api/businesses`, { method: "GET", token: apiKey });
    const business = (r.body?.businesses ?? []).find((b: any) => b.webhook_secret === ctx.oldValue);
    if (!business) throw new RotatorError("CoinPay: no business has this webhook secret");
    const g = await call(ctx, `${base}/api/businesses/${business.id}/webhook-secret`, { method: "POST", token: session });
    if (g.status !== 200) fail("CoinPay regenerate webhook secret", g);
    const value = String(g.body?.secret ?? "");
    if (!value) throw new RotatorError("CoinPay regenerate webhook secret: no secret in the response");
    return {
      value,
      async revokeOld() {
        return undefined; // regenerating already killed it
      },
      async rollback() {
        return "CoinPay cannot restore an old webhook secret: the new one is live, so keep it and finish redeploying the consumers";
      }
    };
  }
};

function findApiKey(ctx: RotatorContext): string | undefined {
  const name = Object.keys(ctx.vaultValues).find((k) => /^(COINPAY|COINPAYPORTAL)(_[A-Z0-9]+)*_API_KEY$/.test(k) && ctx.vaultValues[k]);
  return name ? ctx.vaultValues[name] : undefined;
}

// ---- VAPID (local) ------------------------------------------------------------------------

/** A Web Push VAPID pair: P-256, public as uncompressed point, both base64url. */
export function newVapidPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pub = publicKey.export({ format: "jwk" });
  const priv = privateKey.export({ format: "jwk" });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x!, "base64url"), Buffer.from(pub.y!, "base64url")]);
  return { publicKey: raw.toString("base64url"), privateKey: String(priv.d) };
}

export const vapidRotator: ProviderRotator = {
  id: "vapid",
  title: "Web Push VAPID key pair",
  overlap: false,
  async preflight(ctx) {
    return vapidPublicNames(ctx).length ? null : "no VAPID public key beside the private one: the browser side would not get the new key";
  },
  async mint(ctx) {
    const pair = newVapidPair();
    const companions = Object.fromEntries(vapidPublicNames(ctx).map((n) => [n, pair.publicKey]));
    return {
      value: pair.privateKey,
      companions,
      async revokeOld() {
        return undefined; // nothing to revoke: subscriptions made with the old public key just stop
      },
      async rollback() {
        return undefined; // the caller restores the old pair from the vaults
      }
    };
  }
};

function vapidPublicNames(ctx: RotatorContext): string[] {
  return Object.keys(ctx.vaultValues).filter((k) => /VAPID/.test(k) && /PUB/.test(k));
}

// ---- Postgres role password ---------------------------------------------------------------

/** A SCRAM-SHA-256 verifier, so the plaintext password never reaches the server log. */
export function scramVerifier(password: string, salt = randomBytes(16), iterations = 4096): string {
  const salted = pbkdf2Sync(password.normalize("NFKC"), salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

interface PgTarget {
  urlKey: string;
  url: URL;
}

function pgTargets(ctx: RotatorContext): PgTarget[] {
  const out: PgTarget[] = [];
  for (const [k, v] of Object.entries(ctx.vaultValues)) {
    if (!/^postgres(ql)?:\/\//.test(v)) continue;
    try {
      const url = new URL(v);
      if (decodeURIComponent(url.password) === ctx.oldValue) out.push({ urlKey: k, url });
    } catch {
      /* not a URL */
    }
  }
  return out;
}

/** Every connection string in the vault holding the old password, rewritten to the new one. */
export function rewriteUrls(values: Record<string, string>, oldPassword: string, newPassword: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) continue;
    try {
      const url = new URL(v);
      if (url.password && decodeURIComponent(url.password) === oldPassword) {
        url.password = encodeURIComponent(newPassword);
        out[k] = url.toString();
      }
    } catch {
      /* not a URL */
    }
  }
  return out;
}

/**
 * ALTER ROLE CURRENT_USER for the role in the vault's connection string (a
 * role may always change its own password). Sends a SCRAM verifier on stdin of
 * psql, never the plaintext. Rollback sets the old password back. Self-hosted
 * Supabase stacks are refused: the same password is shared by six service roles
 * and the stack's own .env, which this rotator does not restart.
 */
export const postgresRoleRotator: ProviderRotator = {
  id: "postgres-role",
  title: "Postgres role password",
  overlap: false,
  async preflight(ctx) {
    if (/^SUPABASE_/.test(ctx.key) || Object.keys(ctx.vaultValues).some((k) => k === "POSTGRES_PASSWORD" && "JWT_SECRET" in ctx.vaultValues))
      return "self-hosted Supabase shares this password with its service roles: follow the runbook (Postgres / Supabase section)";
    if (!pgTargets(ctx).length) return "no postgres:// URL with this password in the vault, so the host and role are unknown";
    if (!ctx.run) return "no process runner (psql) available";
    return null;
  },
  async mint(ctx) {
    const target = pgTargets(ctx)[0];
    if (!target || !ctx.run) throw new RotatorError("no postgres target");
    const value = generateRandomSecret({ format: "alnum", length: 40 });
    const apply = (password: string, current: string): string | undefined => {
      const url = new URL(target.url.toString());
      url.password = "";
      const r = ctx.run!("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", url.toString()], {
        env: { PGPASSWORD: current, PGCONNECT_TIMEOUT: "10" },
        input: `ALTER ROLE CURRENT_USER PASSWORD '${scramVerifier(password)}';\n`
      });
      return r.status === 0 ? undefined : `psql exited ${r.status}: ${r.stderr.trim().slice(0, 200)}`;
    };
    const err = apply(value, ctx.oldValue);
    if (err) throw new RotatorError(`ALTER ROLE failed: ${err}`);
    return {
      value,
      companions: rewriteUrls(ctx.vaultValues, ctx.oldValue, value),
      async revokeOld() {
        return undefined; // the old password died with ALTER ROLE
      },
      async rollback() {
        return apply(ctx.oldValue, value);
      }
    };
  }
};

export const ROTATORS: Record<string, ProviderRotator> = Object.fromEntries(
  [resendRotator, cloudflareTokenRotator, coinpayApiKeyRotator, coinpayWebhookSecretRotator, vapidRotator, postgresRoleRotator].map((r) => [r.id, r])
);

export function defaultRun(cmd: string, args: string[], opts: { input?: string; env?: Record<string, string> }) {
  const r = spawnSync(cmd, args, { input: opts.input, env: { ...process.env, ...opts.env }, encoding: "utf8", timeout: 60_000 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? (r.error ? String(r.error.message) : "") };
}
