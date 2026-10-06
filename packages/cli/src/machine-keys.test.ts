import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Server } from "node:http";

/**
 * The headless path end to end, against the real credentials-app routes
 * (apps/pwa) on an in-memory database:
 *
 *   person: login, push a vault, `keys create --team --vault --out`
 *   box:    LOGICSRC_API_KEY=… (first command registers the box's own key)
 *   person: `teams grant … --key`
 *   box:    `teams pull` decrypts the same .env; a push is refused (read-only)
 *
 * and the property the feature exists for: the box never replaces the
 * person's identity key, which is what `login --token` on a fresh box did.
 */

const here = dirname(fileURLToPath(import.meta.url));
const pwa = (rel: string) => pathToFileURL(join(here, "..", "..", "..", "apps", "pwa", "src", rel)).href;

// Loaded at runtime: plain .mjs outside this package, so tsc never follows them.
type Db = { execute(stmt: string | { sql: string; args: unknown[] }): Promise<{ rows: Array<Record<string, unknown>> }> };
let db: Db;
let server: Server;
let base = "";
let annToken = "";
const scratch = mkdtempSync(join(process.env.LOGICSRC_TEST_TMP || tmpdir(), "logicsrc-machine-keys-"));
const personHome = join(scratch, "person");
const boxHome = join(scratch, "box");
const saved = { ...process.env };

function asPerson() {
  process.env.LOGICSRC_HOME = personHome;
  delete process.env.LOGICSRC_API_KEY;
}
function asBox(secret: string) {
  process.env.LOGICSRC_HOME = boxHome;
  process.env.LOGICSRC_API_KEY = secret;
}
async function personPublicKey(): Promise<string> {
  const r = await db.execute({ sql: "SELECT public_key FROM credshare_keys WHERE user_id = ?", args: ["u_ann"] });
  return String(r.rows[0]?.public_key ?? "");
}

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";
  process.env.LOGICSRC_IDENTITY_FILE = "";
  delete process.env.LOGICSRC_IDENTITY_FILE;
  ({ db } = (await import(pwa("db.mjs"))) as { db: Db });
  for (const file of ["001_auth.sql", "002_credshare.sql", "005_machine_keys.sql"]) {
    const sql = readFileSync(fileURLToPath(pwa(join("migrations", file))), "utf8");
    for (const statement of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await db.execute(statement);
  }
  await db.execute({ sql: "INSERT INTO users (id, email, created_at) VALUES (?,?,?)", args: ["u_ann", "ann@example.com", Date.now()] });

  // A variable specifier keeps tsc from demanding @types/express for a test-only import.
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
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
  rmSync(scratch, { recursive: true, force: true });
});

describe("machine API keys, headless", () => {
  let secret = "";
  const source = join(scratch, "source.env");
  const pulled = join(scratch, "pulled.env");
  const keyFile = join(scratch, "deploy.key");

  it("a person logs in, pushes a vault and makes a scoped, read-only machine key", async () => {
    const { loginAction, teamsPushAction } = await import("./teams.js");
    const { keysCreateAction } = await import("./keys.js");
    const { TeamClient } = await import("@logicsrc/plugin-credential-sharing");
    asPerson();
    await loginAction({ token: annToken });
    await new TeamClient({ apiUrl: base, token: annToken }).createTeam("acme");
    writeFileSync(source, "DATABASE_URL=postgres://db/app\nSTRIPE_KEY=sk_live_123\n");
    await teamsPushAction("acme", "web", "prod", { env: source, format: "json" });

    await keysCreateAction("dev2-deploy", { team: "acme", vault: ["web--prod"], out: keyFile, format: "json" });
    secret = readFileSync(keyFile, "utf8").trim();
    expect(secret).toMatch(/^lsk_/);
    expect(statSync(keyFile).mode & 0o777).toBe(0o600);
  });

  it("refuses to grant a key that has not registered its identity yet", async () => {
    const { teamsGrantAction } = await import("./teams.js");
    asPerson();
    await expect(teamsGrantAction("acme", "web", "prod", undefined, "json", { key: "dev2-deploy" })).rejects.toThrow(
      /run any command with the key once first/i
    );
  });

  it("the box's first command registers its OWN identity, leaving the person's key alone", async () => {
    const { prepareApiKeyAuth } = await import("./teams.js");
    const before = await personPublicKey();
    asBox(secret);
    await prepareApiKeyAuth();
    const file = join(boxHome, "keys", `${secret.slice(0, 12)}.json`);
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const stored = JSON.parse(readFileSync(file, "utf8"));
    expect(stored.keyKind).toBe("machine");
    expect(stored.team).toBe("acme");
    expect(stored.apiToken).toBeUndefined(); // env-var use never writes the secret to disk
    expect(existsSync(join(boxHome, "identity.json"))).toBe(false);
    expect(await personPublicKey()).toBe(before);

    const keyRow = await db.execute({ sql: "SELECT public_key FROM api_keys WHERE prefix = ?", args: [secret.slice(0, 12)] });
    expect(keyRow.rows[0]?.public_key).toBe(stored.keys.publicKey);
  });

  it("before a grant, the box is told exactly what to run", async () => {
    const { teamsPullAction } = await import("./teams.js");
    asBox(secret);
    await expect(teamsPullAction("acme", "web", "prod", { env: pulled, format: "json" })).rejects.toThrow(
      /logicsrc teams grant acme web prod --key dev2-deploy/
    );
  });

  it("after `teams grant --key`, the box pulls the same values with only the API key", async () => {
    const { teamsGrantAction, teamsPullAction, prepareApiKeyAuth } = await import("./teams.js");
    asPerson();
    await teamsGrantAction("acme", "web", "prod", undefined, "json", { key: "dev2-deploy" });

    asBox(secret);
    await prepareApiKeyAuth(); // already set up: a file read, no re-registration
    await teamsPullAction("acme", "web", "prod", { env: pulled, format: "json" });
    const keys = (text: string) => text.split("\n").filter(Boolean).map((l) => l.split("=")[0]).sort();
    expect(keys(readFileSync(pulled, "utf8"))).toEqual(keys(readFileSync(source, "utf8")));
    expect(readFileSync(pulled, "utf8")).toContain("STRIPE_KEY=sk_live_123");
  });

  it("a read-only machine key cannot push", async () => {
    const { teamsPushAction } = await import("./teams.js");
    asBox(secret);
    writeFileSync(source, "DATABASE_URL=postgres://db/app\nSTRIPE_KEY=sk_live_456\n");
    await expect(teamsPushAction("acme", "web", "prod", { env: source, format: "json" })).rejects.toThrow(/read-only/i);
  });

  it("whoami with the key describes the key, and keys cannot be minted with it", async () => {
    const { TeamClient } = await import("@logicsrc/plugin-credential-sharing");
    const box = new TeamClient({ apiUrl: base, token: secret });
    const me = await box.me();
    expect(me.key).toMatchObject({ kind: "machine", name: "dev2-deploy", team: "acme", vaults: ["web--prod"], readOnly: true });
    expect(me.teams.map((t) => t.slug)).toEqual(["acme"]);
    await expect(box.createApiKey({ name: "escalate", kind: "user" })).rejects.toThrow(/machine API key cannot manage/);
  });

  it("revoking the key cuts the box off", async () => {
    const { keysRevokeAction } = await import("./keys.js");
    const { teamsPullAction } = await import("./teams.js");
    asPerson();
    await keysRevokeAction("dev2-deploy", "json");
    asBox(secret);
    await expect(teamsPullAction("acme", "web", "prod", { env: pulled, format: "json" })).rejects.toThrow(/revoked or expired/);
  });
});
