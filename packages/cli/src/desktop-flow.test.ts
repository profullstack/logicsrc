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

const { teamsRotateKeysAction, teamsRotateFromQueue } = await import("./rotate-keys.js");
import { createPrompt, parseAgentResult, desktopHost } from "./desktop-rotator.js";
import type { DesktopExec } from "./desktop-rotator.js";
import { DESKTOP_RECIPES } from "./desktop-recipes.js";
import { catalogSpec, isAutomatic } from "./rotation-catalog.js";

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


const OLD_OAI = "sk-proj-OLDOLDOLDOLDOLDOLDOLDabcd";
const NEW_OAI = "sk-proj-NEWNEWNEWNEWNEWNEWNEWwxyz";

interface FakeDesk {
  exec: DesktopExec;
  prompts: string[];
  commands: string[];
  files: Map<string, string>;
  shredded: string[];
}

/** A fake bonita: w3bs-desktop status, a claude -p that "drives" the browser, cat and shred. */
function fakeDesk(o: { status?: string; statusCode?: number; create?: string; captured?: string; selfTest?: "ok" | "wrong"; revoke?: string } = {}): FakeDesk {
  const files = new Map<string, string>();
  const prompts: string[] = [];
  const commands: string[] = [];
  const shredded: string[] = [];
  const exec: DesktopExec = async (host, command, opts = {}) => {
    expect(host).toBe("bonita");
    commands.push(command);
    if (command.includes("w3bs-desktop status")) return { status: o.statusCode ?? 0, stdout: o.status ?? "Agent access: ENABLED\nInput lease: free\n", stderr: "" };
    if (command.includes("claude -p")) {
      const prompt = opts.input ?? "";
      prompts.push(prompt);
      const file = /> (~\/\.cache\/rot\/[a-z0-9-]+)/.exec(prompt)?.[1];
      if (prompt.includes("capture self-test")) {
        const nonce = /value="([0-9a-f]+)"/.exec(prompt)![1]!;
        files.set(file!, o.selfTest === "wrong" ? "zzz" : nonce);
        return { status: 0, stdout: "saved 36 bytes\nROTATION_RESULT: ok\n", stderr: "" };
      }
      if (prompt.startsWith("Task: rotate")) {
        const code = o.create ?? "ok";
        if (code === "ok") files.set(file!, o.captured ?? NEW_OAI);
        return { status: 0, stdout: `working...\nROTATION_RESULT: ${code}\n`, stderr: "" };
      }
      if (prompt.startsWith("Task: revoke")) return { status: 0, stdout: `ROTATION_RESULT: ${o.revoke ?? "ok"}\n`, stderr: "" };
      if (prompt.startsWith("Task: report")) return { status: 0, stdout: "ROTATION_RESULT: ok key ci-agents, last used 2026-10-28\n", stderr: "" };
    }
    const cat = /^cat (\S+)$/.exec(command);
    if (cat) return files.has(cat[1]!) ? { status: 0, stdout: `${files.get(cat[1]!)}\n`, stderr: "" } : { status: 1, stdout: "", stderr: "no such file" };
    const shred = /^shred -u (\S+)/.exec(command);
    if (shred) {
      shredded.push(shred[1]!);
      files.delete(shred[1]!);
      return { status: 0, stdout: "", stderr: "" };
    }
    throw new Error(`unexpected command: ${command}`);
  };
  return { exec, prompts, commands, files, shredded };
}

function noValueAnywhere(desk: FakeDesk, ...values: string[]) {
  for (const v of values) {
    for (const p of desk.prompts) expect(p).not.toContain(v);
    for (const c of desk.commands) expect(c).not.toContain(v);
  }
}

describe("desktop rotator", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    writeFileSync(join(root, "a.com", "app.env"), `OPENAI_API_KEY=${OLD_OAI}\n`, { mode: 0o600 });
    writeFileSync(join(root, "b.com", "app.env"), "X=1\n");
  });

  it("catalog: dashboard-only keys are desktop, report-only ones are not automatic", () => {
    expect(catalogSpec("OPENAI_API_KEY")).toMatchObject({ method: "desktop", recipe: "openai" });
    expect(catalogSpec("ELEVENLABS_API_KEY")).toMatchObject({ method: "desktop", recipe: "elevenlabs" });
    expect(catalogSpec("BRAVE_SEARCH_API_KEY")).toMatchObject({ method: "desktop", recipe: "brave-search" });
    expect(catalogSpec("BRAVE_API_KEY")).toMatchObject({ method: "desktop", recipe: "brave-search" });
    expect(catalogSpec("CIVITAI_API_KEY")).toMatchObject({ method: "desktop", recipe: "civitai" });
    expect(catalogSpec("CLOUDFLARE_GLOBAL_API_KEY")).toMatchObject({ method: "desktop", recipe: "cloudflare-global-api-key" });
    expect(catalogSpec("CLOUDFLARE_API_TOKEN")).toMatchObject({ method: "provider" });
    expect(isAutomatic(catalogSpec("OPENAI_API_KEY"))).toBe(true);
    expect(isAutomatic(catalogSpec("ANTHROPIC_API_KEY"))).toBe(false);
    expect(isAutomatic(catalogSpec("CLAUDE_CODE_OAUTH_TOKEN"))).toBe(false);
    expect(catalogSpec("ANTHROPIC_API_KEY")!.steps!.length).toBeGreaterThan(1);
  });

  it("prompts use the agent browser, the old key's tail, and a capture that never echoes", () => {
    const p = createPrompt(DESKTOP_RECIPES.openai!, { oldTail: "abcd", name: "logicsrc openai_api_key 2026-10-29", file: "~/.cache/rot/x" });
    expect(p).toMatch(/agent browser/);
    expect(p).toMatch(/Never use or focus Firefox/);
    expect(p).toMatch(/ends in abcd/);
    expect(p).toMatch(/browser_evaluate_script/);
    expect(p).toMatch(/wl-paste -n > ~\/\.cache\/rot\/x/);
    expect(p).toMatch(/ROTATION_RESULT: busy/);
    expect(parseAgentResult("x\nROTATION_RESULT: ok\nROTATION_RESULT: needs-login openai.com").code).toBe("needs-login");
    expect(() => desktopHost("bonita; rm -rf /", {})).toThrow(/ssh host/);
    expect(desktopHost(undefined, { LOGICSRC_DESKTOP_HOST: "bonita" })).toBe("bonita");
  });

  it("without a desktop host, a desktop key is todo with steps", async () => {
    await makeTeam({ "a--prod": { OPENAI_API_KEY: OLD_OAI } });
    const [r] = await teamsRotateKeysAction("t", {}, { ...quiet, approve: true }, { env: {}, strayText: () => [] });
    expect(r!.status).toBe("todo");
    expect(r!.error).toMatch(/--desktop/);
    expect(r!.steps!.length).toBeGreaterThan(3);
  });

  it("layer disabled: a clear error to enable it in the tray, nothing created", async () => {
    await makeTeam({ "a--prod": { OPENAI_API_KEY: OLD_OAI } });
    const desk = fakeDesk({ status: "Agent access: DISABLED\n" });
    const [r] = await teamsRotateKeysAction("t", {}, { ...quiet, approve: true, desktop: "bonita" }, { env: {}, desktopExec: desk.exec, strayText: () => [] });
    expect(r!.status).toBe("todo");
    expect(r!.error).toMatch(/DISABLED: enable it from the W3BS tray/);
    expect(desk.prompts).toEqual([]);
  });

  it("dry run checks the layer but never starts an agent", async () => {
    await makeTeam({ "a--prod": { OPENAI_API_KEY: OLD_OAI } });
    const desk = fakeDesk();
    const [r] = await teamsRotateKeysAction("t", {}, { ...quiet, approve: false, desktop: "bonita", propagate: root }, { env: {}, desktopExec: desk.exec, ops: ops(), strayText: () => [] });
    expect(r!.status).toBe("would-rotate");
    expect(r!.sites!.map((s) => s.site)).toEqual(["a.com"]);
    expect(desk.prompts).toEqual([]);
  });

  it("two-phase: create on the desktop, vaults + consumers, revoke the old key only after health, shred the file", async () => {
    const team = await makeTeam({ "a--prod": { OPENAI_API_KEY: OLD_OAI }, "b--prod": { OAI_COPY_API_KEY: OLD_OAI } });
    const desk = fakeDesk();
    const o = ops();
    const order: string[] = [];
    const exec: DesktopExec = async (h, c, opts) => {
      if (c.includes("claude -p")) order.push((opts?.input ?? "").split(" ")[1]!);
      if (c.startsWith("shred")) order.push("shred");
      return desk.exec(h, c, opts);
    };
    const wrapped: SiteOps = { restart: async (d, s, b) => (order.push(`restart ${s}`), o.restart(d, s, b)), health: (d, s) => o.health(d, s) };
    const results = await teamsRotateKeysAction("t", { keys: ["OPENAI_API_KEY"] }, { ...quiet, approve: true, desktop: "bonita", propagate: root }, { env: {}, desktopExec: exec, ops: wrapped, strayText: () => [] });
    const r = results[0]!;
    expect(r.status).toBe("rotated");
    expect(r.method).toBe("desktop");
    expect(await team.read("a--prod", "OPENAI_API_KEY")).toBe(NEW_OAI);
    expect(await team.read("b--prod", "OAI_COPY_API_KEY")).toBe(NEW_OAI);
    expect(readFileSync(join(root, "a.com", "app.env"), "utf8")).toBe(`OPENAI_API_KEY=${NEW_OAI}\n`);
    expect(order).toEqual(["rotate", "restart a.com", "revoke", "shred"]);
    const revoke = desk.prompts.find((p) => p.startsWith("Task: revoke"))!;
    expect(revoke).toMatch(/ends in abcd/);
    expect(revoke).toMatch(/NEVER delete the key ending in wxyz/);
    expect(desk.files.size).toBe(0);
    noValueAnywhere(desk, OLD_OAI, NEW_OAI);
    expect(JSON.stringify(r)).not.toContain(NEW_OAI);
    expect(JSON.stringify(r)).not.toContain(OLD_OAI);
    expect(JSON.parse((await team.read("a--prod", "__ROTATE__OPENAI_API_KEY"))!).state).toMatchObject({ desktopTail: "wxyz" });
  });

  it("rollback: an unhealthy consumer deletes the NEW key on the desktop and restores the old value", async () => {
    const team = await makeTeam({ "a--prod": { OPENAI_API_KEY: OLD_OAI } });
    const desk = fakeDesk();
    const [r] = await teamsRotateKeysAction("t", {}, { ...quiet, approve: true, desktop: "bonita", propagate: root }, { env: {}, desktopExec: desk.exec, ops: ops(["a.com"]), strayText: () => [] });
    expect(r!.status).toBe("rolled-back");
    expect(await team.read("a--prod", "OPENAI_API_KEY")).toBe(OLD_OAI);
    const revoke = desk.prompts.find((p) => p.startsWith("Task: revoke"))!;
    expect(revoke).toMatch(/ends in wxyz/);
    expect(revoke).toMatch(/NEVER delete the key ending in abcd/);
    expect(desk.files.size).toBe(0);
    process.exitCode = 0;
  });

  it("needs-login and busy wait; the other keys go on", async () => {
    const team = await makeTeam({ "a--prod": { OPENAI_API_KEY: OLD_OAI, CRON_SECRET: OLD } });
    const desk = fakeDesk({ create: "needs-login platform.openai.com" });
    const results = await teamsRotateKeysAction("t", {}, { ...quiet, approve: true, desktop: "bonita" }, { env: {}, desktopExec: desk.exec, strayText: () => [] });
    const by = Object.fromEntries(results.map((x) => [x.key, x]));
    expect(by.OPENAI_API_KEY!.status).toBe("needs-login");
    expect(by.CRON_SECRET!.status).toBe("rotated");
    expect(await team.read("a--prod", "OPENAI_API_KEY")).toBe(OLD_OAI);
    expect(desk.files.size).toBe(0);
    const busy = fakeDesk({ status: "Agent access: ENABLED\nInput lease: held by human\n" });
    const [b] = await teamsRotateKeysAction("t", { keys: ["OPENAI_API_KEY"] }, { ...quiet, approve: true, desktop: "bonita" }, { env: {}, desktopExec: busy.exec, strayText: () => [] });
    expect(b!.status).toBe("busy");
    expect(b!.error).toMatch(/in use/);
    const refuses = fakeDesk({ create: "busy" });
    const [c] = await teamsRotateKeysAction("t", { keys: ["OPENAI_API_KEY"] }, { ...quiet, approve: true, desktop: "bonita" }, { env: {}, desktopExec: refuses.exec, strayText: () => [] });
    expect(c!.status).toBe("busy");
    expect(process.exitCode ?? 0).toBe(0);
  });

  it("a capture that is not a key of that kind is refused and shredded", async () => {
    const team = await makeTeam({ "a--prod": { OPENAI_API_KEY: OLD_OAI } });
    const desk = fakeDesk({ captured: "hello world" });
    const [r] = await teamsRotateKeysAction("t", {}, { ...quiet, approve: true, desktop: "bonita" }, { env: {}, desktopExec: desk.exec, strayText: () => [] });
    expect(r!.status).toBe("failed");
    expect(r!.error).toMatch(/does not look like/);
    expect(r!.error).not.toContain("hello");
    expect(desk.shredded.length).toBe(1);
    expect(await team.read("a--prod", "OPENAI_API_KEY")).toBe(OLD_OAI);
    process.exitCode = 0;
  });

  it("roll (Cloudflare Global API Key): refused without --allow-roll; with it, a capture self-test runs first", async () => {
    const CF_OLD = "0123456789abcdef0123456789abcdef01234";
    const CF_NEW = "fedcba9876543210fedcba9876543210fedcb";
    const team = await makeTeam({ "a--prod": { CLOUDFLARE_GLOBAL_API_KEY: CF_OLD } });
    const d1 = fakeDesk();
    const [r1] = await teamsRotateKeysAction("t", {}, { ...quiet, approve: true, desktop: "bonita" }, { env: {}, desktopExec: d1.exec, strayText: () => [] });
    expect(r1!.status).toBe("todo");
    expect(r1!.error).toMatch(/--allow-roll/);
    expect(d1.prompts).toEqual([]);

    const bad = fakeDesk({ selfTest: "wrong", captured: CF_NEW });
    const [r2] = await teamsRotateKeysAction("t", {}, { ...quiet, approve: true, desktop: "bonita", allowRoll: true }, { env: {}, desktopExec: bad.exec, strayText: () => [] });
    expect(r2!.status).toBe("failed");
    expect(r2!.error).toMatch(/self-test/);
    expect(bad.prompts.some((p) => p.startsWith("Task: rotate"))).toBe(false);

    const good = fakeDesk({ captured: CF_NEW });
    const [r3] = await teamsRotateKeysAction("t", {}, { ...quiet, approve: true, desktop: "bonita", allowRoll: true }, { env: {}, desktopExec: good.exec, strayText: () => [] });
    expect(r3!.status).toBe("rotated");
    expect(good.prompts[0]).toMatch(/capture self-test/);
    expect(good.prompts[1]).toMatch(/^Task: rotate/);
    expect(good.prompts.some((p) => p.startsWith("Task: revoke"))).toBe(false);
    expect(await team.read("a--prod", "CLOUDFLARE_GLOBAL_API_KEY")).toBe(CF_NEW);
    process.exitCode = 0;
  });

  it("report-only (Anthropic): the agent looks, nothing is created or revoked", async () => {
    const team = await makeTeam({ "a--prod": { ANTHROPIC_API_KEY: "sk-ant-api03-xxxxxxxxxxxxxxxxxxxx1234" } });
    const desk = fakeDesk();
    const [r] = await teamsRotateKeysAction("t", {}, { ...quiet, approve: true, desktop: "bonita" }, { env: {}, desktopExec: desk.exec, strayText: () => [] });
    expect(r!.status).toBe("todo");
    expect(r!.note).toMatch(/last used/);
    expect(desk.prompts).toHaveLength(1);
    expect(desk.prompts[0]).toMatch(/^Task: report/);
    expect(desk.prompts[0]).toMatch(/ending in 1234/);
    expect(team.puts).toEqual([]);
  });

  it("--from-queue: claims each queued run, runs it, reports results without values; approve needs both sides", async () => {
    const team = await makeTeam({ "a--prod": { CRON_SECRET: OLD } });
    const calls: string[] = [];
    const reported: any[] = [];
    Object.assign(server.client, {
      listRotationRuns: async () => ({ runs: [
        { id: "r2", keys: ["CRON_SECRET"], project: null, env: null, approve: true, options: {}, status: "queued", createdAt: 2, summary: null },
        { id: "r1", keys: ["CRON_SECRET"], project: "a", env: "prod", approve: false, options: {}, status: "queued", createdAt: 1, summary: null }
      ] }),
      claimRotationRun: async (_s: string, id: string) => (calls.push(`claim ${id}`), { run: {} }),
      reportRotationRun: async (_s: string, id: string, body: any) => (calls.push(`report ${id}`), reported.push(body), { run: { summary: "ok" } })
    });
    const reports = await teamsRotateFromQueue("t", { ...quiet, approve: false }, { env: {}, strayText: () => [] });
    expect(calls).toEqual(["claim r1", "report r1", "claim r2", "report r2"]);
    expect(reports.map((r) => r.ran)).toEqual(["dry run", "dry run"]);
    expect(reported[1].error).toMatch(/no --approve/);
    expect(await team.read("a--prod", "CRON_SECRET")).toBe(OLD);
    const live = await teamsRotateFromQueue("t", { ...quiet, approve: true, maxRuns: 2 }, { env: {}, strayText: () => [] });
    expect(live[1]!.ran).toBe("approved");
    expect(await team.read("a--prod", "CRON_SECRET")).not.toBe(OLD);
    expect(JSON.stringify(reported)).not.toContain(OLD);
  });
});
