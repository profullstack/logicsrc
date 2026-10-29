import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptValue,
  encryptValue,
  fingerprintValue,
  generateIdentityKeyPair,
  generateVaultKey,
  wrapVaultKey
} from "@logicsrc/plugin-credential-sharing";
import type { SiteOps } from "./propagate.js";

/** An in-memory team server: vaults of sealed values, exactly what the real API returns. */
const server = vi.hoisted(() => ({ client: null as any, identity: null as any }));
vi.mock("./teams.js", async (orig) => ({ ...(await orig<typeof import("./teams.js")>()), authedClient: () => ({ client: server.client, identity: server.identity }) }));

const { teamsRotateKeysAction } = await import("./rotate-keys.js");

interface Row {
  name: string;
  nonce: string;
  ciphertext: string;
  fingerprint: string;
  updatedAt: string;
}

async function makeTeam(vaults: Record<string, Record<string, string>>) {
  const keys = await generateIdentityKeyPair();
  const dek = await generateVaultKey();
  const wrapped = await wrapVaultKey(dek, keys.publicKey);
  const store = new Map<string, Row[]>();
  for (const [name, values] of Object.entries(vaults)) {
    const rows: Row[] = [];
    for (const [k, v] of Object.entries(values)) rows.push({ name: k, ...(await encryptValue(v, dek)), fingerprint: fingerprintValue(v), updatedAt: "2026-01-01T00:00:00Z" });
    store.set(name, rows);
  }
  const puts: string[][] = [];
  server.identity = { keys, apiToken: "t" };
  server.client = {
    listVaults: async () => ({ vaults: [...store.keys()].map((n) => ({ id: n, name: n, hasAccess: true })) }),
    listSecrets: async (id: string) => ({ secrets: store.get(id)!.map((r) => ({ ...r })) }),
    getMyGrant: async () => ({ wrappedDek: wrapped }),
    putSecrets: async (id: string, upserts: Row[]) => {
      const rows = store.get(id)!;
      for (const u of upserts) {
        const i = rows.findIndex((r) => r.name === u.name);
        const row = { ...u, updatedAt: "2026-10-29T00:00:00Z" };
        if (i === -1) rows.push(row);
        else rows[i] = row;
      }
      puts.push(upserts.map((u) => `${id}:${u.name}`));
      return { ok: true, applied: upserts.map((u) => u.name) };
    }
  };
  const read = async (vault: string, key: string) => {
    const r = store.get(vault)!.find((x) => x.name === key);
    return r ? decryptValue(r, dek) : undefined;
  };
  return { read, puts };
}

const OLD = "0123456789abcdef0123456789abcdef";
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "logicsrc-flow-"));
  for (const s of ["a.com", "b.com"]) mkdirSync(join(root, s));
  writeFileSync(join(root, "a.com", "app.env"), `CRON_SECRET=${OLD}\nOTHER=1\n`, { mode: 0o600 });
  writeFileSync(join(root, "b.com", "app.env"), `CALLER_TOKEN=${OLD}\n`, { mode: 0o600 });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function ops(fail: string[] = []): SiteOps & { restarts: string[] } {
  const restarts: string[] = [];
  return {
    restarts,
    async restart(_dir, site) {
      restarts.push(site);
      return { site, ok: true, detail: "recreated" };
    },
    async health(_dir, site) {
      const bad = fail.includes(site) && restarts.includes(site);
      return { site, ok: !bad, detail: bad ? "503" : "200" };
    }
  };
}

const quiet = { format: "json" as const };

describe("rotate-keys two-phase flow", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("random: writes every vault and every consumer file, restarts both sites, health-checks", async () => {
    const team = await makeTeam({ "a--prod": { CRON_SECRET: OLD }, "a--local": { CRON_SECRET: OLD } });
    const o = ops();
    const [r] = await teamsRotateKeysAction("t", { keys: ["CRON_SECRET"] }, { ...quiet, approve: true, propagate: root }, { ops: o, strayText: () => [] });
    expect(r!.status).toBe("rotated");
    const now = (await team.read("a--prod", "CRON_SECRET"))!;
    expect(now).not.toBe(OLD);
    expect(await team.read("a--local", "CRON_SECRET")).toBe(now);
    expect(readFileSync(join(root, "a.com", "app.env"), "utf8")).toBe(`CRON_SECRET=${now}\nOTHER=1\n`);
    expect(readFileSync(join(root, "b.com", "app.env"), "utf8")).toBe(`CALLER_TOKEN=${now}\n`);
    expect(readdirSync(join(root, "a.com")).some((n) => n.startsWith("app.env.bak-rotate-"))).toBe(true);
    expect(o.restarts.sort()).toEqual(["a.com", "b.com"]);
    expect(JSON.stringify(r)).not.toContain(now);
    expect(JSON.stringify(r)).not.toContain(OLD);
  });

  it("rolls back vaults and files when a consumer fails health after the switch", async () => {
    const team = await makeTeam({ "a--prod": { CRON_SECRET: OLD } });
    const o = ops(["b.com"]);
    const [r] = await teamsRotateKeysAction("t", { keys: ["CRON_SECRET"] }, { ...quiet, approve: true, propagate: root }, { ops: o, strayText: () => [] });
    expect(r!.status).toBe("rolled-back");
    expect(await team.read("a--prod", "CRON_SECRET")).toBe(OLD);
    expect(readFileSync(join(root, "a.com", "app.env"), "utf8")).toContain(`CRON_SECRET=${OLD}`);
    expect(readFileSync(join(root, "b.com", "app.env"), "utf8")).toBe(`CALLER_TOKEN=${OLD}\n`);
    process.exitCode = 0;
  });

  it("dry run writes nothing, but reports the consumers it found", async () => {
    const team = await makeTeam({ "a--prod": { CRON_SECRET: OLD, SSH_ID_ED25519: "-----BEGIN OPENSSH PRIVATE KEY-----xxxxxxxx" } });
    const o = ops();
    const results = await teamsRotateKeysAction("t", {}, { ...quiet, approve: false, propagate: root }, { ops: o, strayText: () => [] });
    const cron = results.find((r) => r.key === "CRON_SECRET")!;
    expect(cron.status).toBe("would-rotate");
    expect(cron.sites!.map((s) => s.site).sort()).toEqual(["a.com", "b.com"]);
    expect(results.find((r) => r.key === "SSH_ID_ED25519")!.status).toBe("would-rotate");
    expect(team.puts).toEqual([]);
    expect(o.restarts).toEqual([]);
    expect(readFileSync(join(root, "a.com", "app.env"), "utf8")).toContain(OLD);
  });

  it("scheduled dry run applies the same checks as a live run", async () => {
    await makeTeam({ "a--prod": { CRON_SECRET: OLD, PIT_ADMIN_TOKEN: "f".repeat(40) } });
    const results = await teamsRotateKeysAction("t", {}, { ...quiet, approve: false, scheduled: true, propagate: root }, { ops: ops(), strayText: () => [] });
    expect(results.find((r) => r.key === "CRON_SECRET")!.status).toBe("would-rotate");
    expect(results.find((r) => r.key === "PIT_ADMIN_TOKEN")!.status).toBe("skipped");
  });

  it("scheduled mode skips values with no consumer, values in the crontab, disruptive and manual ones", async () => {
    await makeTeam({
      "a--prod": { CRON_SECRET: OLD, SESSION_SECRET: "s".repeat(40), STRIPE_SECRET_KEY: "sk_live_xxxxxxxxxxxxxxxx", PIT_ADMIN_TOKEN: "f".repeat(40) }
    });
    const results = await teamsRotateKeysAction("t", {}, { ...quiet, approve: true, scheduled: true, propagate: root }, { ops: ops(), strayText: () => [`0 * * * * curl -H 'x: ${OLD}'`] });
    const by = Object.fromEntries(results.map((r) => [r.key, r]));
    expect(by.CRON_SECRET!.status).toBe("skipped");
    expect(by.CRON_SECRET!.error).toMatch(/crontab/);
    expect(by.SESSION_SECRET!.error).toMatch(/disruptive/);
    expect(by.STRIPE_SECRET_KEY!.status).toBe("todo");
    expect(by.STRIPE_SECRET_KEY!.never).toBe(true);
    expect(by.PIT_ADMIN_TOKEN!.error).toMatch(/no consumer/);
  });

  it("never touches an excluded site, and caps consumers in unattended mode", async () => {
    const team = await makeTeam({ "a--prod": { CRON_SECRET: OLD } });
    const [r] = await teamsRotateKeysAction("t", { keys: ["CRON_SECRET"] }, { ...quiet, approve: true, propagate: root, excludeSites: ["b.com"] }, { ops: ops(), strayText: () => [] });
    expect(r!.status).toBe("skipped");
    expect(r!.error).toMatch(/excluded site holds it: b\.com/);
    const [s] = await teamsRotateKeysAction("t", { keys: ["CRON_SECRET"] }, { ...quiet, approve: true, scheduled: true, propagate: root, maxSites: 1 }, { ops: ops(), strayText: () => [] });
    expect(s!.error).toMatch(/too many consumers/);
    expect(await team.read("a--prod", "CRON_SECRET")).toBe(OLD);
  });

  it("skips when a consumer is already unhealthy, so the rotation is never blamed", async () => {
    const team = await makeTeam({ "a--prod": { CRON_SECRET: OLD } });
    const sick: SiteOps = { restart: async (_d, site) => ({ site, ok: true, detail: "" }), health: async (_d, site) => ({ site, ok: site !== "a.com", detail: "502" }) };
    const [r] = await teamsRotateKeysAction("t", { keys: ["CRON_SECRET"] }, { ...quiet, approve: true, propagate: root }, { ops: sick, strayText: () => [] });
    expect(r!.status).toBe("skipped");
    expect(await team.read("a--prod", "CRON_SECRET")).toBe(OLD);
  });

  it("provider: mints via the rotator, revokes the old key only after health, saves the new id", async () => {
    const team = await makeTeam({ "a--prod": { RESEND_API_KEY: "re_old_xxxxxxxxxxxxxxxx" } });
    writeFileSync(join(root, "a.com", "app.env"), "RESEND_API_KEY=re_old_xxxxxxxxxxxxxxxx\n");
    writeFileSync(join(root, "b.com", "app.env"), "X=1\n");
    const order: string[] = [];
    const fetch = (async (url: any, init: any = {}) => {
      const m = init.method ?? "GET";
      order.push(`${m} ${new URL(String(url)).pathname}`);
      if (m === "POST") return new Response(JSON.stringify({ id: "new-id", token: "re_new_yyyyyyyyyyyyyyyy" }), { status: 201 });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as typeof globalThis.fetch;
    const o = ops();
    const wrapped: SiteOps = { restart: async (d, s, b) => (order.push(`restart ${s}`), o.restart(d, s, b)), health: (d, s) => o.health(d, s) };
    const [r] = await teamsRotateKeysAction("t", { keys: ["RESEND_API_KEY"] }, { ...quiet, approve: true, propagate: root }, { ops: wrapped, fetch, strayText: () => [], env: {} });
    expect(r!.status).toBe("rotated");
    expect(await team.read("a--prod", "RESEND_API_KEY")).toBe("re_new_yyyyyyyyyyyyyyyy");
    expect(order.indexOf("restart a.com")).toBeGreaterThan(order.indexOf("POST /api-keys"));
    expect(r!.note).toMatch(/delete the previous key/); // first rotation: old id unknown
    expect(JSON.parse((await team.read("a--prod", "__ROTATE__RESEND_API_KEY"))!).state).toEqual({ keyId: "new-id" });
  });

  it("provider rollback deletes the new credential and restores the old value", async () => {
    const team = await makeTeam({ "a--prod": { RESEND_API_KEY: "re_old_xxxxxxxxxxxxxxxx" } });
    writeFileSync(join(root, "a.com", "app.env"), "RESEND_API_KEY=re_old_xxxxxxxxxxxxxxxx\n");
    const deletes: string[] = [];
    const fetch = (async (url: any, init: any = {}) => {
      const m = init.method ?? "GET";
      if (m === "DELETE") deletes.push(new URL(String(url)).pathname);
      if (m === "POST") return new Response(JSON.stringify({ id: "new-id", token: "re_new_yyyyyyyyyyyyyyyy" }), { status: 201 });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as typeof globalThis.fetch;
    const [r] = await teamsRotateKeysAction("t", { keys: ["RESEND_API_KEY"] }, { ...quiet, approve: true, propagate: root }, { ops: ops(["a.com"]), fetch, strayText: () => [], env: {} });
    expect(r!.status).toBe("rolled-back");
    expect(deletes).toEqual(["/api-keys/new-id"]);
    expect(await team.read("a--prod", "RESEND_API_KEY")).toBe("re_old_xxxxxxxxxxxxxxxx");
    expect(readFileSync(join(root, "a.com", "app.env"), "utf8")).toBe("RESEND_API_KEY=re_old_xxxxxxxxxxxxxxxx\n");
    process.exitCode = 0;
  });
});
