import { chmodSync, writeFileSync } from "node:fs";
import type { Command } from "commander";
import { TeamClient, requireAuth, resolveApiUrl, type RemoteApiKey } from "@logicsrc/plugin-credential-sharing";
import { print, type OutputFormat } from "./format.js";

/**
 * `logicsrc keys create|list|revoke` — API keys, from the terminal.
 *
 * The usual one is a MACHINE key for a deploy box or CI: one team, the vaults
 * you name, read-only unless --read-write, optionally expiring. On the box:
 *
 *   LOGICSRC_API_KEY=lsk_… logicsrc teams pull <team> <project> <env>
 *
 * The first command run with it creates and registers the box's own identity
 * key; then a member grants it a vault with `logicsrc teams grant … --key <name>`.
 */

function keysClient(): TeamClient {
  const identity = requireAuth();
  return new TeamClient({ apiUrl: resolveApiUrl(identity), token: identity.apiToken });
}

const when = (ms: number | null): string => (ms ? new Date(ms).toISOString().slice(0, 10) : "never");

export function keyRow(k: RemoteApiKey): Record<string, unknown> {
  return {
    name: k.name,
    prefix: `${k.prefix}…`,
    kind: k.kind,
    team: k.team ?? "—",
    vaults: k.kind === "machine" ? (k.vaults?.join(",") || "all") : "—",
    access: k.kind === "machine" ? (k.readOnly ? "read-only" : "read-write") : "as you",
    expires: k.expired ? `${when(k.expiresAt)} (expired)` : when(k.expiresAt),
    identity: k.kind === "machine" ? (k.publicKey ? "registered" : "not used yet") : "—",
    lastUsed: when(k.lastUsedAt),
    id: k.id
  };
}

/** Find one of the caller's keys by id, exact name, or prefix. */
export function findKey(keys: RemoteApiKey[], ref: string): RemoteApiKey {
  const byId = keys.find((k) => k.id === ref);
  if (byId) return byId;
  const byName = keys.filter((k) => k.name === ref);
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) {
    throw new Error(`${byName.length} keys are named "${ref}" (${byName.map((k) => `${k.prefix}… ${k.id}`).join(", ")}). Use the id.`);
  }
  const bare = ref.replace(/…$/, "");
  const byPrefix = keys.filter((k) => bare.length >= 6 && k.prefix.startsWith(bare));
  if (byPrefix.length === 1) return byPrefix[0]!;
  throw new Error(`No API key "${ref}" on your account. See them: logicsrc keys list`);
}

export interface KeysCreateOptions {
  kind?: string;
  team?: string;
  vault?: string[];
  readOnly?: boolean;
  readWrite?: boolean;
  expires?: string;
  out?: string;
  format: OutputFormat;
}

export async function keysCreateAction(name: string, options: KeysCreateOptions): Promise<void> {
  const kind = (options.kind ?? "machine") as "user" | "machine";
  if (kind !== "user" && kind !== "machine") throw new Error('--kind must be "machine" or "user".');
  if (options.readOnly && options.readWrite) throw new Error("Pick one of --read-only and --read-write.");
  if (kind === "machine" && !options.team) {
    throw new Error("A machine key needs --team <slug> (and usually --vault <project>--<env>). For a key that acts as you, pass --kind user.");
  }
  if (kind === "user" && (options.team || options.vault?.length || options.readWrite || options.readOnly)) {
    throw new Error("--team, --vault, --read-only and --read-write only apply to machine keys; a user key acts as you.");
  }
  const client = keysClient();
  const { key, secret } = await client.createApiKey({
    name,
    kind,
    ...(kind === "machine"
      ? { team: options.team, vaults: options.vault ?? [], readOnly: !options.readWrite }
      : {}),
    ...(options.expires ? { expiresAt: options.expires } : {})
  });

  // The secret goes ONE place: a 0600 file with --out, else stdout on its own
  // line (so `> file` captures exactly it). Everything else goes to stderr.
  if (options.out) {
    writeFileSync(options.out, `${secret}\n`, { mode: 0o600 });
    try { chmodSync(options.out, 0o600); } catch { /* no modes on this platform */ }
  } else {
    process.stdout.write(`${secret}\n`);
  }
  const where = options.out ? `written to ${options.out} (0600)` : "printed above";
  console.error(`Created ${key.kind} key "${key.name}" (${key.prefix}…), ${where}. It is shown once; the server keeps only a hash.`);
  if (key.kind === "machine") {
    const scope = key.vaults?.length ? key.vaults.join(", ") : `every vault in ${key.team}`;
    console.error(`Scope: team ${key.team}, ${scope}, ${key.readOnly ? "read-only" : "read-write"}, expires ${when(key.expiresAt)}.`);
    console.error("Next:");
    console.error(`  1. on the box, once:    LOGICSRC_API_KEY=<key> logicsrc whoami      (creates and registers its identity)`);
    console.error(`  2. here, per vault:     logicsrc teams grant ${key.team} <project> <env> --key ${key.name}`);
    console.error(`  3. on the box:          LOGICSRC_API_KEY=<key> logicsrc teams pull ${key.team} <project> <env> --env .env`);
  }
  if (options.format !== "table") print(keyRow(key), options.format);
}

export async function keysListAction(format: OutputFormat): Promise<void> {
  const { keys } = await keysClient().listApiKeys();
  print(keys.length ? keys.map(keyRow) : [{ note: "No API keys. Make a machine key: logicsrc keys create <name> --team <slug> --vault <project>--<env>" }], format);
}

export async function keysRevokeAction(ref: string, format: OutputFormat): Promise<void> {
  const client = keysClient();
  const { keys } = await client.listApiKeys();
  const key = findKey(keys, ref);
  await client.revokeApiKey(key.id);
  console.error(`Revoked "${key.name}" (${key.prefix}…). Anything using it now gets a 401, and its vault grants are gone.`);
  print({ revoked: key.name, id: key.id }, format);
}

const collect = (value: string, previous: string[] = []): string[] => [...previous, ...value.split(",").map((v) => v.trim()).filter(Boolean)];

export function registerKeysCommands(program: Command): void {
  const keys = program
    .command("keys")
    .description("API keys: machine keys for deploy boxes and CI (create, list, revoke).")
    .addHelpText(
      "after",
      `
A machine key reads (or, with --read-write, writes) only the vaults you scope it to,
with its own identity key. Headless use on the box:

  logicsrc keys create dev2-deploy --team acme --vault web--prod --expires 90d --out deploy.key
  LOGICSRC_API_KEY=$(cat deploy.key) logicsrc whoami                 # once: registers the box's key
  logicsrc teams grant acme web prod --key dev2-deploy               # from a member's machine
  LOGICSRC_API_KEY=$(cat deploy.key) logicsrc teams pull acme web prod --env .env

Or store it on the box with: logicsrc login --api-key <key>`
    );

  keys
    .command("create")
    .argument("<name>", "A name for the key (e.g. dev2-deploy)")
    .option("--team <slug>", "Team the machine key is scoped to (required for a machine key)")
    .option("--vault <name>", "Vault the key may read, as <project>--<env>; repeat or comma-separate. Default: every vault in the team", collect)
    .option("--read-only", "Pull only, never push (the default for a machine key)")
    .option("--read-write", "Also allow pushing to the vaults it is granted")
    .option("--expires <when>", "30d, 12h, 1y, or a date (2027-01-01). Default: never")
    .option("--kind <kind>", "machine (default) or user (acts as you, like logicsrc login)", "machine")
    .option("--out <file>", "Write the secret to this file (0600) instead of stdout")
    .option("--format <format>", "table, json, or markdown", "table")
    .description("Create an API key. The secret is shown once.")
    .action((name, options) => keysCreateAction(name, { ...options, format: options.format as OutputFormat }));

  keys
    .command("list")
    .alias("ls")
    .option("--format <format>", "table, json, or markdown", "table")
    .description("List your API keys (never their secrets).")
    .action((options) => keysListAction(options.format as OutputFormat));

  keys
    .command("revoke")
    .argument("<key>", "Key name, id, or prefix")
    .option("--format <format>", "table, json, or markdown", "table")
    .description("Revoke an API key now; its vault grants go with it.")
    .action((ref, options) => keysRevokeAction(ref, options.format as OutputFormat));
}
