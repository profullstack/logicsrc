import { createHash, createHmac, pbkdf2Sync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  cloudflareTokenRotator,
  coinpayApiKeyRotator,
  coinpayWebhookSecretRotator,
  newVapidPair,
  postgresRoleRotator,
  resendRotator,
  rewriteUrls,
  scramVerifier,
  vapidRotator,
  type RotatorContext
} from "./rotators.js";

type Handler = (method: string, url: URL, auth: string, body: any) => { status: number; body?: any };

function fakeFetch(handler: Handler): { fetch: typeof fetch; calls: Array<{ method: string; path: string; auth: string }> } {
  const calls: Array<{ method: string; path: string; auth: string }> = [];
  const f = (async (input: any, init: any = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? "GET").toUpperCase();
    const auth = String(init.headers?.authorization ?? "").replace(/^Bearer /, "");
    calls.push({ method, path: url.pathname, auth });
    const r = handler(method, url, auth, init.body ? JSON.parse(init.body) : null);
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;
  return { fetch: f, calls };
}

const ctx = (over: Partial<RotatorContext>): RotatorContext => ({
  key: "K",
  oldValue: "old-value-xxxxxxxxxxxx",
  vaultValues: {},
  state: {},
  env: {},
  fetch: fetch,
  now: new Date("2026-10-29T00:00:00Z"),
  ...over
});

describe("resend", () => {
  it("mints with the old full-access key, revokes the old id from state only after revokeOld, rolls back the new one", async () => {
    const keys = new Map([["old-id", "re_old_xxxxxxxxxxxxxxxx"]]);
    const { fetch, calls } = fakeFetch((m, url, auth, body) => {
      const live = [...keys.values()].includes(auth);
      if (!live) return { status: 401, body: { message: "API key is invalid" } };
      if (m === "GET" && url.pathname === "/api-keys") return { status: 200, body: { data: [...keys.keys()].map((id) => ({ id })) } };
      if (m === "POST" && url.pathname === "/api-keys") {
        keys.set("new-id", "re_new_yyyyyyyyyyyyyyyy");
        expect(body.permission).toBe("full_access");
        return { status: 201, body: { id: "new-id", token: "re_new_yyyyyyyyyyyyyyyy" } };
      }
      if (m === "DELETE") {
        keys.delete(url.pathname.split("/").pop()!);
        return { status: 200, body: {} };
      }
      return { status: 404 };
    });
    const c = ctx({ key: "RESEND_API_KEY", oldValue: "re_old_xxxxxxxxxxxxxxxx", state: { keyId: "old-id" }, fetch });
    expect(await resendRotator.preflight(c)).toBeNull();
    const minted = await resendRotator.mint(c);
    expect(minted.value).toBe("re_new_yyyyyyyyyyyyyyyy");
    expect(minted.state).toEqual({ keyId: "new-id" });
    expect(keys.has("old-id")).toBe(true); // both live until revokeOld
    expect(await minted.revokeOld()).toBeUndefined();
    expect(keys.has("old-id")).toBe(false);
    expect(calls.some((x) => x.auth.includes("yyyy"))).toBe(true);
  });

  it("asks for a manual revoke when the old key's id was never recorded, and rollback deletes the new key", async () => {
    const deleted: string[] = [];
    const { fetch } = fakeFetch((m, url) => {
      if (m === "GET") return { status: 200, body: { data: [] } };
      if (m === "POST") return { status: 201, body: { id: "n1", token: "re_n1_zzzzzzzzzzzzzz" } };
      if (m === "DELETE") deleted.push(url.pathname);
      return { status: 200, body: {} };
    });
    const minted = await resendRotator.mint(ctx({ key: "RESEND_API_KEY", fetch }));
    expect(await minted.revokeOld()).toMatch(/delete the previous key/);
    await minted.rollback();
    expect(deleted).toEqual(["/api-keys/n1"]);
  });

  it("preflight fails for a sending-only key without an admin key", async () => {
    const { fetch } = fakeFetch(() => ({ status: 401, body: { message: "restricted" } }));
    expect(await resendRotator.preflight(ctx({ fetch }))).toMatch(/RESEND_ADMIN_API_KEY/);
  });
});

describe("cloudflare-token", () => {
  it("clones the old token's policies, deletes the old token only on revokeOld", async () => {
    const tokens = new Map<string, any>([["t-old", { id: "t-old", name: "dns edit", value: "cf_old_xxxxxxxxxxxxxx", policies: [{ id: "p", effect: "allow", resources: { "com.cloudflare.api.account.zone.*": "*" }, permission_groups: [{ id: "g1", name: "DNS Write" }] }] }]]);
    let created: any = null;
    const { fetch } = fakeFetch((m, url, auth, body) => {
      const me = [...tokens.values()].find((t) => t.value === auth);
      if (!me) return { status: 401, body: { errors: [{ message: "Invalid API Token" }] } };
      if (url.pathname.endsWith("/user/tokens/verify")) return { status: 200, body: { result: { id: me.id, status: "active" } } };
      const id = url.pathname.split("/").pop()!;
      if (m === "GET") return tokens.has(id) ? { status: 200, body: { result: tokens.get(id) } } : { status: 404 };
      if (m === "POST") {
        created = body;
        tokens.set("t-new", { id: "t-new", value: "cf_new_yyyyyyyyyyyyyy", ...body });
        return { status: 200, body: { result: { id: "t-new", value: "cf_new_yyyyyyyyyyyyyy" } } };
      }
      if (m === "DELETE") {
        tokens.delete(id);
        return { status: 200, body: { result: { id } } };
      }
      return { status: 404 };
    });
    const c = ctx({ key: "CLOUDFLARE_API_TOKEN", oldValue: "cf_old_xxxxxxxxxxxxxx", fetch });
    expect(await cloudflareTokenRotator.preflight(c)).toBeNull();
    const minted = await cloudflareTokenRotator.mint(c);
    expect(created.policies[0].permission_groups).toEqual([{ id: "g1" }]);
    expect(created.name).toBe("dns edit (rotated 2026-10-29)");
    expect(tokens.has("t-old")).toBe(true);
    await minted.revokeOld();
    expect(tokens.has("t-old")).toBe(false);
    expect(tokens.has("t-new")).toBe(true);
  });

  it("refuses a token it cannot verify", async () => {
    const { fetch } = fakeFetch(() => ({ status: 401, body: {} }));
    expect(await cloudflareTokenRotator.preflight(ctx({ fetch }))).toMatch(/not a live user API token/);
  });
});

describe("coinpay", () => {
  const legacy = "cp_live_legacyAAAAAAAAAAAAAAAA";
  function coinpay() {
    const state = { legacy, scoped: new Map<string, any>(), regenerated: 0, webhook: "whsec_old_xxxxxxxxxxxx" };
    const { fetch, calls } = fakeFetch((m, url, auth, body) => {
      const p = url.pathname;
      if (p === "/api/auth/login") return body.password === "pw" ? { status: 200, body: { success: true, token: "session-jwt" } } : { status: 401 };
      if (p === "/api/businesses" && m === "GET") {
        const ok = auth === state.legacy || [...state.scoped.values()].some((k) => k.raw === auth && !k.revoked_at) || auth === "session-jwt";
        return ok ? { status: 200, body: { success: true, businesses: [{ id: "b1", api_key: state.legacy, webhook_secret: state.webhook }] } } : { status: 401 };
      }
      if (auth !== "session-jwt") return { status: 401 };
      if (p === "/api/businesses/b1/api-keys" && m === "POST") {
        const id = `k${state.scoped.size + 1}`;
        state.scoped.set(id, { id, raw: `cp_live_scoped${id}BBBBBBBBBB`, scopes: body.scopes, prefix: `cp_live_scoped${id}`.slice(0, 16) });
        return { status: 201, body: { success: true, apiKey: state.scoped.get(id).raw, key: { id } } };
      }
      if (p === "/api/businesses/b1/api-keys" && m === "GET") return { status: 200, body: { keys: [...state.scoped.values()].map(({ raw: _r, ...k }) => k) } };
      if (p.startsWith("/api/businesses/b1/api-keys/") && m === "DELETE") {
        const k = state.scoped.get(p.split("/").pop()!);
        if (!k) return { status: 404 };
        k.revoked_at = "now";
        return { status: 200, body: { success: true } };
      }
      if (p === "/api/businesses/b1/api-key" && m === "POST") {
        state.legacy = `cp_live_regen${++state.regenerated}`;
        return { status: 200, body: { success: true, apiKey: state.legacy } };
      }
      if (p === "/api/businesses/b1/webhook-secret" && m === "POST") {
        state.webhook = "whsec_new_yyyyyyyyyyyy";
        return { status: 200, body: { success: true, secret: state.webhook } };
      }
      return { status: 404 };
    });
    return { state, fetch, calls };
  }
  const env = { COINPAY_ROTATE_URL: "https://coinpay.test", COINPAY_ROTATE_EMAIL: "o@x", COINPAY_ROTATE_PASSWORD: "pw" };

  it("legacy key: mints a wildcard scoped key, old key still works until revokeOld regenerates the legacy slot", async () => {
    const { state, fetch } = coinpay();
    const c = ctx({ key: "COINPAY_API_KEY", oldValue: legacy, fetch, env });
    expect(await coinpayApiKeyRotator.preflight(c)).toBeNull();
    const minted = await coinpayApiKeyRotator.mint(c);
    expect(minted.value).toBe("cp_live_scopedk1BBBBBBBBBB");
    expect(state.scoped.get("k1").scopes).toEqual(["*"]);
    expect(state.legacy).toBe(legacy);
    await minted.revokeOld();
    expect(state.legacy).not.toBe(legacy);
    expect(minted.state).toEqual({ businessId: "b1", keyId: "k1" });
  });

  it("scoped key: the next rotation keeps its scopes and deletes it; rollback revokes the new key", async () => {
    const { state, fetch } = coinpay();
    const first = await coinpayApiKeyRotator.mint(ctx({ key: "COINPAY_API_KEY", oldValue: legacy, fetch, env }));
    const second = await coinpayApiKeyRotator.mint(ctx({ key: "COINPAY_API_KEY", oldValue: first.value, fetch, env }));
    expect(state.scoped.get("k2").scopes).toEqual(["*"]);
    await second.revokeOld();
    expect(state.scoped.get("k1").revoked_at).toBe("now");
    await second.rollback();
    expect(state.scoped.get("k2").revoked_at).toBe("now");
  });

  it("refuses to run without a merchant session", async () => {
    expect(await coinpayApiKeyRotator.preflight(ctx({ env: {} }))).toMatch(/COINPAY_ROTATE_TOKEN/);
  });

  it("webhook secret: finds the business by its secret and regenerates it (no overlap)", async () => {
    const { state, fetch } = coinpay();
    expect(coinpayWebhookSecretRotator.overlap).toBe(false);
    const c = ctx({ key: "COINPAY_WEBHOOK_SECRET", oldValue: "whsec_old_xxxxxxxxxxxx", vaultValues: { COINPAY_API_KEY: legacy }, fetch, env });
    expect(await coinpayWebhookSecretRotator.preflight(c)).toBeNull();
    const minted = await coinpayWebhookSecretRotator.mint(c);
    expect(minted.value).toBe("whsec_new_yyyyyyyyyyyy");
    expect(state.webhook).toBe(minted.value);
    expect(await minted.rollback()).toMatch(/cannot restore/);
  });
});

describe("vapid", () => {
  it("makes a valid P-256 pair and writes the public half to every VAPID public companion", async () => {
    const pair = newVapidPair();
    expect(Buffer.from(pair.publicKey, "base64url")).toHaveLength(65);
    expect(Buffer.from(pair.privateKey, "base64url")).toHaveLength(32);
    const c = ctx({ key: "VAPID_PRIVATE_KEY", vaultValues: { VAPID_PRIVATE_KEY: "x", VAPID_PUBLIC_KEY: "y", NEXT_PUBLIC_VAPID_PUBLIC_KEY: "y" } });
    expect(await vapidRotator.preflight(c)).toBeNull();
    const minted = await vapidRotator.mint(c);
    expect(Object.keys(minted.companions!)).toEqual(["VAPID_PUBLIC_KEY", "NEXT_PUBLIC_VAPID_PUBLIC_KEY"]);
    expect(await vapidRotator.preflight(ctx({ vaultValues: { VAPID_PRIVATE_KEY: "x" } }))).toMatch(/no VAPID public key/);
  });
});

describe("postgres-role", () => {
  it("SCRAM verifier matches the RFC 7677 construction", () => {
    const salt = Buffer.from("0123456789abcdef");
    const v = scramVerifier("pencil", salt, 4096);
    const salted = pbkdf2Sync("pencil", salt, 4096, 32, "sha256");
    const stored = createHash("sha256").update(createHmac("sha256", salted).update("Client Key").digest()).digest("base64");
    expect(v).toBe(`SCRAM-SHA-256$4096:${salt.toString("base64")}$${stored}:${createHmac("sha256", salted).update("Server Key").digest("base64")}`);
  });

  it("alters its own role over stdin (never argv), rewrites URLs, rolls back to the old password", async () => {
    const runs: Array<{ args: string[]; input?: string; env?: Record<string, string> }> = [];
    const old = "oldpassword123456";
    const c = ctx({
      key: "POSTGRES_PASSWORD",
      oldValue: old,
      vaultValues: { POSTGRES_PASSWORD: old, DATABASE_URL: `postgres://app:${old}@db.local:5432/app` },
      run: (_cmd, args, opts) => {
        runs.push({ args, ...opts });
        return { status: 0, stdout: "", stderr: "" };
      }
    });
    expect(await postgresRoleRotator.preflight(c)).toBeNull();
    const minted = await postgresRoleRotator.mint(c);
    expect(runs[0]!.args.join(" ")).not.toContain(old);
    expect(runs[0]!.args.join(" ")).not.toContain(minted.value);
    expect(runs[0]!.input).toMatch(/^ALTER ROLE CURRENT_USER PASSWORD 'SCRAM-SHA-256\$/);
    expect(runs[0]!.input).not.toContain(minted.value);
    expect(runs[0]!.env!.PGPASSWORD).toBe(old);
    expect(minted.companions!.DATABASE_URL).toBe(`postgres://app:${minted.value}@db.local:5432/app`);
    await minted.rollback();
    expect(runs[1]!.env!.PGPASSWORD).toBe(minted.value);
  });

  it("refuses self-hosted Supabase passwords", async () => {
    expect(await postgresRoleRotator.preflight(ctx({ key: "SUPABASE_DB_PASSWORD" }))).toMatch(/Supabase/);
  });

  it("rewriteUrls only touches URLs holding the old password", () => {
    expect(rewriteUrls({ A: "postgres://u:old@h/d", B: "postgres://u:other@h/d", C: "plain" }, "old", "n w")).toEqual({ A: "postgres://u:n%20w@h/d" });
  });
});
