import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Server } from "node:http";

/**
 * The post-incident flow end to end against the real credentials-app routes on
 * an in-memory database:
 *
 *   rotate-identity  new keypair, every grant re-sealed, proof of the old key
 *   rekey            new vault key, values unchanged, members + machine keys re-sealed
 *   race             a value written under the retired key is re-sealed by the verify pass
 *   pins             a teammate's changed key is refused until accepted
 *   login            a different local key is refused instead of replacing the registered one
 */

const here = dirname(fileURLToPath(import.meta.url));
const pwa = (rel: string) => pathToFileURL(join(here, "..", "..", "..", "apps", "pwa", "src", rel)).href;

type Db = { execute(stmt: string | { sql: string; args: unknown[] }): Promise<{ rows: Array<Record<string, unknown>> }> };
let db: Db;
let server: Server;
let base = "";
let annToken = "";
let bobToken = "";
const scratch = mkdtempSync(join(process.env.LOGICSRC_TEST_TMP || tmpdir(), "logicsrc-hardening-"));
const annHome = join(scratch, "ann");
const bobHome = join(scratch, "bob");
const otherHome = join(scratch, "ann-other-machine");
const saved = { ...process.env };

const as = (home: string) => {
  process.env.LOGICSRC_HOME = home;
  delete process.env.LOGICSRC_API_KEY;
};
const identityOf = (home: string) => JSON.parse(readFileSync(join(home, "identity.json"), "utf8"));
const envFile = (name: string, body: string) => {
  const p = join(scratch, name);
  writeFileSync(p, body);
  return p;
};

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";
  delete process.env.LOGICSRC_IDENTITY_FILE;
  ({ db } = (await import(pwa("db.mjs"))) as { db: Db });
  for (const file of ["001_auth.sql", "002_credshare.sql", "005_machine_keys.sql", "007_hardening.sql"]) {
    const sql = readFileSync(fileURLToPath(pwa(join("migrations", file))), "utf8");
    for (const statement of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await db.execute(statement);
  }
  for (const [id, email] of [["u_ann", "ann@example.com"], ["u_bob", "bob@example.com"]]) {
    await db.execute({ sql: "INSERT INTO users (id, email, created_at) VALUES (?,?,?)", args: [id, email, Date.now()] });
  }
  const expressModule = "express";
  const { default: express } = (await import(expressModule)) as { default: any };
  const { credshareRouter } = await import(pwa("routes/credshare.mjs"));
  const { apiKeysRouter } = await import(pwa("routes/apikeys.mjs"));
  const { createApiKey } = await import(pwa("lib/apikey.mjs"));
  const app = express();
  app.use(express.json());
  app.use(credshareRouter);
  app.use(apiKeysRouter);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.LOGICSRC_API = base;
  annToken = (await createApiKey("u_ann", "ann-laptop")).plaintext;
  bobToken = (await createApiKey("u_bob", "bob-laptop")).plaintext;
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
  rmSync(scratch, { recursive: true, force: true });
});

describe("identity rotation, re-key and key pinning", () => {
  it("sets up: ann and bob log in, ann pushes two vaults and grants bob one", async () => {
    const { loginAction, teamsPushAction, teamsGrantAction } = await import("./teams.js");
    const { TeamClient } = await import("@logicsrc/plugin-credential-sharing");
    as(bobHome);
    await loginAction({ token: bobToken });
    as(annHome);
    await loginAction({ token: annToken });
    const ann = new TeamClient({ apiUrl: base, token: annToken });
    await ann.createTeam("acme");
    const invite = await ann.invite("acme", "bob@example.com");
    await new TeamClient({ apiUrl: base, token: bobToken }).acceptInvite(invite.token!);
    await teamsPushAction("acme", "web", "prod", { env: envFile("web.env", "A=1\nB=two\n"), format: "json" });
    await teamsPushAction("acme", "api", "prod", { env: envFile("api.env", "C=3\n"), format: "json" });
    await teamsGrantAction("acme", "web", "prod", "bob@example.com", "json");
    const pins = JSON.parse(readFileSync(join(annHome, "known-keys.json"), "utf8"));
    expect(Object.keys(pins.keys).some((k) => k.endsWith("|bob@example.com"))).toBe(true);
    expect(statSync(join(annHome, "known-keys.json")).mode & 0o777).toBe(0o600);
  });

  it("a login on another machine cannot replace ann's registered key", async () => {
    const { loginAction } = await import("./teams.js");
    const before = identityOf(annHome).keys.publicKey;
    as(otherHome);
    await expect(loginAction({ token: annToken })).rejects.toThrow(/not the registered one/);
    const r = await db.execute({ sql: "SELECT public_key FROM credshare_keys WHERE user_id = ?", args: ["u_ann"] });
    expect(r.rows[0]?.public_key).toBe(before);
  });

  it("rotate-identity swaps ann's key and every grant, and she can still pull", async () => {
    const { teamsRotateIdentityAction } = await import("./hardening.js");
    const { teamsPullAction } = await import("./teams.js");
    as(annHome);
    const before = identityOf(annHome).keys.publicKey;
    await teamsRotateIdentityAction({ format: "json" });
    const after = identityOf(annHome).keys.publicKey;
    expect(after).not.toBe(before);
    expect(statSync(join(annHome, "identity.json")).mode & 0o777).toBe(0o600);
    const r = await db.execute({ sql: "SELECT public_key FROM credshare_keys WHERE user_id = ?", args: ["u_ann"] });
    expect(r.rows[0]?.public_key).toBe(after);
    const out = join(scratch, "web-after-rotate.env");
    await teamsPullAction("acme", "web", "prod", { env: out, format: "json" });
    expect(readFileSync(out, "utf8")).toMatch(/B=two/);
  });

  it("bob's CLI refuses to seal to ann's changed key until he accepts it", async () => {
    const { teamsGrantAction } = await import("./teams.js");
    as(bobHome);
    // bob pins ann's (old) key the first time he sees it...
    const { checkAndPinKey } = await import("@logicsrc/plugin-credential-sharing");
    checkAndPinKey(base, "ann@example.com", "B".repeat(43) + "=");
    // ...so the rotated key is a change.
    await expect(teamsGrantAction("acme", "web", "prod", "ann@example.com", "json")).rejects.toThrow(/CHANGED/);
    await teamsGrantAction("acme", "web", "prod", "ann@example.com", "json", { acceptKeyChange: ["ann@example.com"] });
  });

  it("rekey --all changes every vault key, keeps the values, and keeps bob", async () => {
    const { teamsRekeyAction } = await import("./hardening.js");
    const { teamsPullAction } = await import("./teams.js");
    as(annHome);
    const grantsBefore = await db.execute({ sql: "SELECT vault_id, user_id, wrapped_dek FROM credshare_vault_grants ORDER BY vault_id, user_id", args: [] });
    await teamsRekeyAction("acme", undefined, undefined, { all: true, format: "json" });
    const grantsAfter = await db.execute({ sql: "SELECT vault_id, user_id, wrapped_dek FROM credshare_vault_grants ORDER BY vault_id, user_id", args: [] });
    expect(grantsAfter.rows.length).toBe(grantsBefore.rows.length);
    for (let i = 0; i < grantsAfter.rows.length; i++) expect(grantsAfter.rows[i]!.wrapped_dek).not.toBe(grantsBefore.rows[i]!.wrapped_dek);
    const versions = await db.execute({ sql: "SELECT key_version FROM credshare_vaults", args: [] });
    expect(versions.rows.every((r) => Number(r.key_version) === 2)).toBe(true);
    as(bobHome);
    const out = join(scratch, "bob-web.env");
    await teamsPullAction("acme", "web", "prod", { env: out, format: "json" });
    expect(readFileSync(out, "utf8")).toMatch(/A=1/);
  });

  it("a value written under the retired key during a re-key is re-sealed, not lost", async () => {
    const { teamsRekeyAction, verifyAndRepair } = await import("./hardening.js");
    const { teamsPullAction } = await import("./teams.js");
    const { TeamClient, unwrapVaultKey, encryptValue, fingerprintValue } = await import("@logicsrc/plugin-credential-sharing");
    as(annHome);
    const ann = identityOf(annHome);
    const client = new TeamClient({ apiUrl: base, token: annToken });
    const { vaults } = await client.listVaults("acme");
    const web = vaults.find((v) => v.name === "web--prod")!;
    // An old client: read the key now, write after the re-key, sending no key version.
    const staleDek = await unwrapVaultKey((await client.getMyGrant(web.id)).wrappedDek, ann.keys);
    await teamsRekeyAction("acme", "web", "prod", { format: "json" });
    const sealed = await encryptValue("late-value", staleDek);
    await client.putSecrets(web.id, [{ name: "LATE", ...sealed, fingerprint: fingerprintValue("late-value") }], []);
    // The verify pass a re-key run ends with re-seals it under the current key.
    const fixed = await verifyAndRepair(client, ann.keys, { vaultId: web.id, vault: web.name, oldDeks: [staleDek] });
    expect(fixed.repaired).toBe(1);
    expect(fixed.unreadable).toEqual([]);
    const out = join(scratch, "web-late.env");
    await teamsPullAction("acme", "web", "prod", { env: out, format: "json" });
    expect(readFileSync(out, "utf8")).toMatch(/LATE=late-value/);
  });

  it("the audit trail records the reads with the acting user", async () => {
    const { TeamClient } = await import("@logicsrc/plugin-credential-sharing");
    const { audit } = await new TeamClient({ apiUrl: base, token: annToken }).teamAudit("acme", { action: "vault:read" });
    expect(audit.some((a) => a.actor === "bob@example.com" && a.vault === "web--prod")).toBe(true);
    const rot = await new TeamClient({ apiUrl: base, token: annToken }).teamAudit("acme", { action: "identity:rotate" });
    expect(rot.audit.length).toBeGreaterThan(0);
  });
});
