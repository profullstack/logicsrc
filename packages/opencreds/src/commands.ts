/**
 * The OpenCreds CLI, registered onto a commander parent.
 *
 * These commands ship twice — as `logicsrc creds …` and as the standalone
 * `opencreds` binary — from this one implementation, because the specification
 * treats CLI behaviour (flags, output shapes, exit codes) as a conformance
 * surface and a subcommand that quietly diverged would make the two different
 * contracts.
 */

import { mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Command } from "commander";

import { auditEvent } from "./audit.js";
import { emitFixtures, formatReport, runConformance } from "./conformance.js";
import {
  DATABASE_EXTENSION,
  buildManifest,
  exportDatabase,
  exportPlaintextDatabase,
  mergePayload,
  openDatabase,
  parseDatabase,
  readHeader,
} from "./database.js";
import { CSV_LOSSY_FIELDS, IMPORT_SOURCES, parseCsvImport, toBitwardenCsv } from "./importers.js";
import {
  createItem,
  decryptItems,
  encryptItem,
  isItemType,
  maskItem,
  readField,
  recordPasswordChange,
  updateItem,
} from "./items.js";
import { confirm, promptNewSecret, promptSecret, resolveSecretFlag } from "./prompt.js";
import { createVaultStore, opencredsHome } from "./store.js";
import { SESSION_ENV, clearSession, encodeSession, persistSession, readSession } from "./session.js";
import {
  ITEM_TYPE,
  ITEM_TYPE_NAMES,
  OPENCREDS_VERSION,
  type DatabasePayload,
  type Item,
  type ItemTypeName,
  type MergeStrategy,
} from "./types.js";
import { createVault, resetRecoveryKey, rewrapUserKey, unlockVault, unlockWithRecoveryKey } from "./vault-key.js";
import { formatDiagnostics, hasErrors, validateDocument } from "./validate.js";

/** Exit codes are part of the contract; see docs/opencreds/cli.md. */
export const EXIT = {
  OK: 0,
  USAGE: 1,
  VALIDATION: 2,
  CRYPTO: 3,
  REFUSED: 4,
} as const;

class CliError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
  }
}

function fail(message: string, code: number): never {
  throw new CliError(message, code);
}

/** Run a command body, mapping a thrown CliError onto its exit code. */
async function run(body: () => Promise<void>): Promise<void> {
  try {
    await body();
  } catch (err) {
    const code = err instanceof CliError ? err.code : EXIT.USAGE;
    process.stderr.write(`${(err as Error).message}\n`);
    process.exitCode = code;
  }
}

interface GlobalOptions {
  home?: string;
}

function storeFor(command: Command) {
  const opts = command.optsWithGlobals<GlobalOptions>();
  return createVaultStore(opts.home ?? opencredsHome());
}

function requireMeta(store: ReturnType<typeof createVaultStore>) {
  const meta = store.readMeta();
  if (!meta) fail(`No vault at ${store.baseDir} — run \`opencreds init\` first`, EXIT.USAGE);
  return meta;
}

/**
 * The user key for this invocation.
 *
 * A live session is used when there is one; otherwise the master password is
 * asked for. Nothing else unlocks a vault.
 */
async function unlock(store: ReturnType<typeof createVaultStore>): Promise<Uint8Array> {
  const meta = requireMeta(store);
  const session = readSession(store.baseDir);
  if (session) return session;
  const password = await promptSecret("Master password: ");
  try {
    return await unlockVault(meta, password);
  } catch (err) {
    store.appendAudit(
      auditEvent({ action: "vault.unlock_failed", namespace: meta.namespace, profile: meta.profile, outcome: "failed" }),
    );
    fail((err as Error).message, EXIT.CRYPTO);
  }
}

async function loadPayload(store: ReturnType<typeof createVaultStore>, userKey: Uint8Array): Promise<DatabasePayload> {
  const meta = requireMeta(store);
  const { items, failed } = await decryptItems(userKey, store.listEnvelopes(), meta.namespace);
  if (failed.length > 0) {
    // Report and continue: a single corrupt row must not hide the rest of a vault.
    for (const failure of failed) {
      process.stderr.write(`warning: could not decrypt ${failure.id} — ${failure.error}\n`);
    }
  }
  return { folders: store.readFolders(), items };
}

async function saveItem(
  store: ReturnType<typeof createVaultStore>,
  userKey: Uint8Array,
  item: Item,
): Promise<void> {
  const meta = requireMeta(store);
  store.writeEnvelope(await encryptItem(userKey, item, meta.namespace));
}

/** Find an item by exact id, then by exact name, then by unique prefix. */
function resolveItem(items: Item[], needle: string): Item {
  const byId = items.find((item) => item.id === needle);
  if (byId) return byId;
  const byName = items.filter((item) => item.name === needle);
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) fail(`"${needle}" matches ${byName.length} items; use an id`, EXIT.USAGE);
  const byPrefix = items.filter((item) => item.id.startsWith(needle));
  if (byPrefix.length === 1) return byPrefix[0]!;
  if (byPrefix.length > 1) fail(`"${needle}" matches ${byPrefix.length} items; use a longer id`, EXIT.USAGE);
  return fail(`No item matches "${needle}"`, EXIT.USAGE);
}

/** Type flags, kebab-cased from the field-group names. */
const TYPE_FLAGS: Record<ItemTypeName, Array<[flag: string, field: string, secret?: boolean]>> = {
  login: [
    ["--username <value>", "username"],
    ["--password <value>", "password", true],
    ["--totp <value>", "totp", true],
  ],
  card: [
    ["--cardholder-name <value>", "cardholderName"],
    ["--brand <value>", "brand"],
    ["--number <value>", "number", true],
    ["--exp-month <value>", "expMonth"],
    ["--exp-year <value>", "expYear"],
    ["--code <value>", "code", true],
  ],
  identity: [
    ["--title <value>", "title"],
    ["--first-name <value>", "firstName"],
    ["--middle-name <value>", "middleName"],
    ["--last-name <value>", "lastName"],
    ["--company <value>", "company"],
    ["--email <value>", "email"],
    ["--phone <value>", "phone"],
    ["--address1 <value>", "address1"],
    ["--address2 <value>", "address2"],
    ["--city <value>", "city"],
    ["--state <value>", "state"],
    ["--postal-code <value>", "postalCode"],
    ["--country <value>", "country"],
    ["--ssn <value>", "ssn", true],
    ["--passport-number <value>", "passportNumber", true],
    ["--license-number <value>", "licenseNumber", true],
  ],
  note: [],
  key: [
    ["--key-type <value>", "keyType"],
    ["--algorithm <value>", "algorithm"],
    ["--public-key <value>", "publicKey"],
    ["--private-key <value>", "privateKey", true],
    ["--passphrase <value>", "passphrase", true],
    ["--fingerprint <value>", "fingerprint"],
    ["--value <value>", "value", true],
    ["--path <value>", "path"],
    ["--mode <value>", "mode"],
  ],
  account: [
    ["--provider <value>", "provider"],
    ["--account-id <value>", "accountId"],
    ["--handle <value>", "handle"],
    ["--email <value>", "email"],
    ["--access-token <value>", "accessToken", true],
    ["--refresh-token <value>", "refreshToken", true],
    ["--token-type <value>", "tokenType"],
    ["--environment <value>", "environment"],
  ],
};

function optionKey(flag: string): string {
  const long = flag.split(" ")[0]!.replace(/^--/, "");
  return long.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Build the field group from the parsed flags, resolving any `-` from stdin. */
async function groupFromOptions(type: ItemTypeName, opts: Record<string, unknown>): Promise<Record<string, unknown>> {
  const group: Record<string, unknown> = {};
  for (const [flag, field] of TYPE_FLAGS[type]) {
    const raw = opts[optionKey(flag)];
    if (raw === undefined) continue;
    const value = await resolveSecretFlag(String(raw));
    if (value !== undefined) group[field] = value;
  }
  if (type === "login" && typeof opts.url === "string") {
    group.uris = [{ uri: opts.url, match: (opts.match as string) ?? "domain" }];
  }
  if (type === "account" && Array.isArray(opts.scope)) {
    group.scopes = opts.scope as string[];
  }
  if (type === "key" && typeof opts.file === "string") {
    // Reading a key from a file is the common path; it avoids a multi-line
    // secret in an argument vector entirely.
    const body = readFileSync(opts.file, "utf8");
    group.privateKey ??= body;
    group.path ??= opts.file;
  }
  return group;
}

function applyTypeFlags(command: Command, type: ItemTypeName): Command {
  for (const [flag] of TYPE_FLAGS[type]) {
    command.option(flag, undefined);
  }
  if (type === "login") {
    command.option("--url <value>", "matching URI");
    command.option("--match <rule>", "URI match rule", "domain");
  }
  if (type === "account") {
    command.option("--scope <value...>", "OAuth scope (repeatable)");
  }
  if (type === "key") {
    command.option("--file <path>", "read the private key from a file");
  }
  return command;
}

function printItemLine(item: Item): string {
  const type = item.type.padEnd(8);
  const id = item.id.slice(0, 8);
  return `${id}  ${type}  ${item.name}`;
}

/** Register every OpenCreds command onto `parent`. */
export function registerCredsCommands(parent: Command): void {
  parent.option("--home <dir>", "vault directory (default $OPENCREDS_HOME)");

  // ---------------------------------------------------------------- vault ---

  parent
    .command("init")
    .description("create a vault")
    .option("--namespace <name>", "domain-separation namespace", "opencreds")
    .option("--iterations <n>", "PBKDF2 iterations", (v: string) => Number.parseInt(v, 10))
    .option("--password-stdin", "read the master password from stdin instead of prompting twice")
    .option("--force", "replace an existing vault")
    .action(async function (
      this: Command,
      opts: { namespace: string; iterations?: number; force?: boolean; passwordStdin?: boolean },
    ) {
      await run(async () => {
        const store = storeFor(this);
        if (store.exists() && !opts.force) {
          fail(`A vault already exists at ${store.baseDir}; pass --force to replace it`, EXIT.REFUSED);
        }
        // Scripted provisioning reads one line and skips the confirmation; a
        // person gets asked twice, because a typo'd master password is an
        // empty vault they cannot open.
        const password = opts.passwordStdin
          ? ((await resolveSecretFlag("-")) as string)
          : await promptNewSecret("Master password: ", "Repeat master password: ");
        if (password.length === 0) fail("A master password is required", EXIT.USAGE);
        const { meta, recoveryKey } = await createVault(password, {
          namespace: opts.namespace,
          ...(opts.iterations ? { params: { kdf: "pbkdf2-sha256" as const, iterations: opts.iterations } } : {}),
        });
        store.writeMeta(meta);
        store.appendAudit(auditEvent({ action: "vault.create", namespace: meta.namespace, profile: meta.profile }));

        process.stdout.write(`Vault created at ${store.baseDir}\n\n`);
        process.stdout.write(`  Recovery key   ${recoveryKey}\n\n`);
        process.stdout.write(
          "Write this down now. It is the only way back into the vault without the\n" +
            "master password, it is not stored anywhere, and it will not be shown again.\n",
        );
      });
    });

  parent
    .command("unlock")
    .description("start a session")
    .option("--persist", "write the session to a 0600 file instead of printing a token")
    .option("--password-stdin", "read the master password from stdin")
    .option("--timeout <minutes>", "session lifetime when persisted", (v: string) => Number.parseInt(v, 10), 15)
    .action(async function (this: Command, opts: { persist?: boolean; timeout: number; passwordStdin?: boolean }) {
      await run(async () => {
        const store = storeFor(this);
        const meta = requireMeta(store);
        const password = opts.passwordStdin
          ? ((await resolveSecretFlag("-")) as string)
          : await promptSecret("Master password: ");
        let userKey: Uint8Array;
        try {
          userKey = await unlockVault(meta, password);
        } catch (err) {
          store.appendAudit(auditEvent({ action: "vault.unlock_failed", outcome: "failed" }));
          fail((err as Error).message, EXIT.CRYPTO);
        }
        store.appendAudit(auditEvent({ action: "vault.unlock", namespace: meta.namespace, profile: meta.profile }));

        if (opts.persist) {
          const path = persistSession(userKey, opts.timeout, store.baseDir);
          process.stdout.write(`Session written to ${path}, expiring in ${opts.timeout} minutes.\n`);
          process.stdout.write(
            "That file holds the key to this vault. Anything that can read it can read\n" +
              "every item. Run `opencreds lock` when you are done.\n",
          );
          return;
        }

        process.stdout.write(`export ${SESSION_ENV}="${encodeSession(userKey)}"\n`);
      });
    });

  parent
    .command("lock")
    .description("end a persisted session")
    .action(async function (this: Command) {
      await run(async () => {
        const store = storeFor(this);
        const removed = clearSession(store.baseDir);
        process.stdout.write(
          removed
            ? "Session cleared.\n"
            : `No persisted session. If you exported ${SESSION_ENV}, unset it.\n`,
        );
      });
    });

  parent
    .command("status")
    .description("vault presence, lock state and item counts (works locked)")
    .option("--json", "machine-readable output")
    .action(async function (this: Command, opts: { json?: boolean }) {
      await run(async () => {
        const store = storeFor(this);
        const meta = store.readMeta();
        const envelopes = store.listEnvelopes();
        const counts: Partial<Record<ItemTypeName, number>> = {};
        for (const envelope of envelopes) {
          const name = ITEM_TYPE_NAMES.find((n) => ITEM_TYPE[n] === envelope.type);
          if (name) counts[name] = (counts[name] ?? 0) + 1;
        }
        const unlocked = Boolean(readSession(store.baseDir));

        const report = {
          vault: store.baseDir,
          present: Boolean(meta),
          unlocked,
          opencreds: OPENCREDS_VERSION,
          namespace: meta?.namespace,
          profile: meta?.profile,
          kdf: meta ? `${meta.kdf}/${meta.kdfIterations}` : undefined,
          itemCount: envelopes.length,
          types: counts,
        };

        if (opts.json) {
          process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
          return;
        }
        if (!meta) {
          process.stdout.write(`No vault at ${store.baseDir}\n`);
          return;
        }
        process.stdout.write(`  Vault       ${store.baseDir}\n`);
        process.stdout.write(`  State       ${unlocked ? "unlocked" : "locked"}\n`);
        process.stdout.write(`  Namespace   ${meta.namespace} (${meta.profile} profile)\n`);
        process.stdout.write(`  KDF         ${meta.kdf}, ${meta.kdfIterations} iterations\n`);
        process.stdout.write(`  Items       ${envelopes.length}\n`);
        for (const name of ITEM_TYPE_NAMES) {
          if (counts[name]) process.stdout.write(`    ${name.padEnd(10)}${counts[name]}\n`);
        }
      });
    });

  parent
    .command("recover")
    .description("unlock with the recovery key and set a new master password")
    .action(async function (this: Command) {
      await run(async () => {
        const store = storeFor(this);
        const meta = requireMeta(store);
        const recoveryKey = await promptSecret("Recovery key: ");
        let userKey: Uint8Array;
        try {
          userKey = await unlockWithRecoveryKey(meta, recoveryKey);
        } catch (err) {
          fail((err as Error).message, EXIT.CRYPTO);
        }
        const password = await promptNewSecret("New master password: ", "Repeat: ");
        const rewrapped = await rewrapUserKey(meta, userKey, password);
        const reset = await resetRecoveryKey(rewrapped, userKey);
        store.writeMeta(reset.meta);
        store.appendAudit(auditEvent({ action: "vault.recovery_reset", namespace: meta.namespace }));
        process.stdout.write(`Master password changed. Not one item was re-encrypted.\n\n`);
        process.stdout.write(`  New recovery key   ${reset.recoveryKey}\n\n`);
        process.stdout.write("The old recovery key no longer works.\n");
      });
    });

  // ---------------------------------------------------------------- items ---

  const add = parent.command("add").description("add an item");
  for (const type of ITEM_TYPE_NAMES) {
    const sub = add
      .command(type)
      .description(`add a ${type}`)
      .requiredOption("--name <value>", "display name")
      .option("--notes <value>", "notes")
      .option("--folder <name>", "folder name")
      .option("--favorite", "mark as a favorite")
      .option("--json", "print the created item as masked JSON");
    applyTypeFlags(sub, type);
    sub.action(async function (this: Command, opts: Record<string, unknown>) {
      await run(async () => {
        const store = storeFor(this);
        const userKey = await unlock(store);
        const group = await groupFromOptions(type, opts);

        let folderId: string | null = null;
        if (typeof opts.folder === "string" && opts.folder !== "") {
          const folders = store.readFolders();
          let folder = folders.find((f) => f.name === opts.folder);
          if (!folder) {
            folder = { id: globalThis.crypto.randomUUID(), name: opts.folder };
            store.writeFolders([...folders, folder]);
          }
          folderId = folder.id;
        }

        const item = createItem(type, {
          name: String(opts.name),
          notes: typeof opts.notes === "string" ? opts.notes : "",
          favorite: Boolean(opts.favorite),
          folderId,
          [type]: group,
        } as Partial<Item>);

        await saveItem(store, userKey, item);
        store.appendAudit(auditEvent({ action: "item.create", itemId: item.id, itemType: type }));

        if (opts.json) {
          process.stdout.write(`${JSON.stringify(maskItem(item), null, 2)}\n`);
          return;
        }
        process.stdout.write(`Added ${type} ${item.id}\n`);
      });
    });
  }

  parent
    .command("list")
    .description("list items; never prints secret values")
    .option("--type <type>", "filter by item type")
    .option("--folder <name>", "filter by folder")
    .option("--search <text>", "match against the item name")
    .option("--json", "machine-readable output, masked identically")
    .action(async function (this: Command, opts: { type?: string; folder?: string; search?: string; json?: boolean }) {
      await run(async () => {
        const store = storeFor(this);
        const userKey = await unlock(store);
        const { items, folders } = await loadPayload(store, userKey);

        if (opts.type && !isItemType(opts.type)) {
          fail(`Unknown type "${opts.type}"; expected one of ${ITEM_TYPE_NAMES.join(", ")}`, EXIT.USAGE);
        }
        const folderId = opts.folder ? folders.find((f) => f.name === opts.folder)?.id : undefined;
        if (opts.folder && !folderId) fail(`No folder named "${opts.folder}"`, EXIT.USAGE);

        const needle = opts.search?.toLowerCase();
        const filtered = items
          .filter((item) => (opts.type ? item.type === opts.type : true))
          .filter((item) => (folderId ? item.folderId === folderId : true))
          .filter((item) => (needle ? item.name.toLowerCase().includes(needle) : true))
          .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

        if (opts.json) {
          process.stdout.write(`${JSON.stringify(filtered.map((item) => maskItem(item)), null, 2)}\n`);
          return;
        }
        if (filtered.length === 0) {
          process.stdout.write("No matching items.\n");
          return;
        }
        for (const item of filtered) process.stdout.write(`${printItemLine(item)}\n`);
      });
    });

  parent
    .command("get")
    .argument("<needle>", "item id or name")
    .description("show one item, with every secret masked")
    .option("--field <path>", "a single dotted field path, e.g. login.password")
    .option("--reveal", "print the value of --field in the clear")
    .option("--json", "machine-readable output, masked identically")
    .action(async function (this: Command, needle: string, opts: { field?: string; reveal?: boolean; json?: boolean }) {
      await run(async () => {
        const store = storeFor(this);
        const userKey = await unlock(store);
        const { items } = await loadPayload(store, userKey);
        const item = resolveItem(items, needle);

        if (opts.reveal) {
          // Revealing is always a deliberate act naming a single value. There
          // is no flag that prints a whole item in the clear, because there is
          // no workflow that needs one.
          if (!opts.field) fail("--reveal needs --field naming a single value", EXIT.USAGE);
          const value = readField(item, opts.field);
          if (value === undefined) fail(`No field "${opts.field}" on this item`, EXIT.USAGE);
          process.stdout.write(`${value}\n`);
          return;
        }

        const masked = maskItem(item);
        if (opts.field) {
          const value = readField(masked, opts.field);
          if (value === undefined) fail(`No field "${opts.field}" on this item`, EXIT.USAGE);
          process.stdout.write(`${value}\n`);
          return;
        }
        process.stdout.write(`${JSON.stringify(masked, null, 2)}\n`);
      });
    });

  const edit = parent.command("edit").description("edit an item");
  for (const type of ITEM_TYPE_NAMES) {
    const sub = edit
      .command(type)
      .argument("<needle>", "item id or name")
      .description(`edit a ${type}`)
      .option("--name <value>", "display name")
      .option("--notes <value>", "notes")
      .option("--favorite <bool>", "true or false");
    applyTypeFlags(sub, type);
    sub.action(async function (this: Command, needle: string, opts: Record<string, unknown>) {
      await run(async () => {
        const store = storeFor(this);
        const userKey = await unlock(store);
        const { items } = await loadPayload(store, userKey);
        const item = resolveItem(items, needle);
        if (item.type !== type) fail(`${item.id} is a ${item.type}, not a ${type}`, EXIT.USAGE);

        const group = await groupFromOptions(type, opts);
        const patch: Partial<Item> = {};
        if (typeof opts.name === "string") patch.name = opts.name;
        if (typeof opts.notes === "string") patch.notes = opts.notes;
        if (opts.favorite !== undefined) patch.favorite = String(opts.favorite) === "true";

        // A password change is recorded in the item's own history before the
        // new value overwrites the old one — otherwise the value being replaced
        // is the one that gets lost.
        let next = item;
        if (type === "login" && typeof group.password === "string" && group.password !== item.login?.password) {
          next = recordPasswordChange(next, group.password);
          delete group.password;
        }
        next = updateItem(next, { ...patch, [type]: group } as Partial<Item>);

        await saveItem(store, userKey, next);
        store.appendAudit(auditEvent({ action: "item.update", itemId: next.id, itemType: type }));
        process.stdout.write(`Updated ${next.id}\n`);
      });
    });
  }

  parent
    .command("rm")
    .argument("<needle>", "item id or name")
    .description("delete an item")
    .option("--purge", "delete irrecoverably rather than moving to the trash")
    .action(async function (this: Command, needle: string, opts: { purge?: boolean }) {
      await run(async () => {
        const store = storeFor(this);
        const userKey = await unlock(store);
        const { items } = await loadPayload(store, userKey);
        const item = resolveItem(items, needle);

        if (opts.purge) {
          store.deleteEnvelope(item.id);
          store.appendAudit(auditEvent({ action: "item.purge", itemId: item.id, itemType: item.type }));
          process.stdout.write(`Purged ${item.id}\n`);
          return;
        }

        const envelope = store.readEnvelope(item.id);
        if (!envelope) fail(`No stored item ${item.id}`, EXIT.USAGE);
        const now = new Date();
        store.writeEnvelope({
          ...envelope,
          deletedAt: now.toISOString(),
          purgeAfter: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
        });
        store.appendAudit(auditEvent({ action: "item.delete", itemId: item.id, itemType: item.type }));
        process.stdout.write(`Moved ${item.id} to the trash; recoverable for 30 days\n`);
      });
    });

  parent
    .command("restore")
    .argument("<id>", "item id")
    .description("restore an item from the trash")
    .action(async function (this: Command, id: string) {
      await run(async () => {
        const store = storeFor(this);
        await unlock(store);
        const envelope = store.readEnvelope(id);
        if (!envelope) fail(`No item ${id}`, EXIT.USAGE);
        store.writeEnvelope({ ...envelope, deletedAt: null, purgeAfter: null });
        store.appendAudit(auditEvent({ action: "item.restore", itemId: id }));
        process.stdout.write(`Restored ${id}\n`);
      });
    });

  // ------------------------------------------------------------- database ---

  parent
    .command("export")
    .description("export the vault as an OpenCreds database")
    .option("--out <file>", "output file", `vault${DATABASE_EXTENSION}`)
    .option("--passphrase-stdin", "read the export passphrase from stdin")
    .option("--plaintext", "write every secret in the clear (requires --yes)")
    .option("--format <format>", "opencreds or bitwarden-csv", "opencreds")
    .option("--yes", "confirm a plaintext export")
    .action(async function (
      this: Command,
      opts: { out: string; passphraseStdin?: boolean; plaintext?: boolean; format: string; yes?: boolean },
    ) {
      await run(async () => {
        const store = storeFor(this);
        const meta = requireMeta(store);
        const userKey = await unlock(store);
        const payload = await loadPayload(store, userKey);

        const wantsPlaintext = Boolean(opts.plaintext) || opts.format === "bitwarden-csv";

        if (wantsPlaintext) {
          process.stdout.write(
            `About to write ${payload.items.length} items to ${opts.out} with every secret in the clear.\n` +
              "This file cannot be un-leaked, and every password in it should be treated\n" +
              "as exposed if it is.\n",
          );
          if (!opts.yes && !(await confirm("Continue?"))) {
            fail("Refused: a plaintext export needs --yes", EXIT.REFUSED);
          }
        }

        if (opts.format === "bitwarden-csv") {
          const { csv, dropped } = toBitwardenCsv(payload.items, payload.folders);
          writeFileSync(opts.out, csv, { encoding: "utf8", mode: 0o600 });
          try {
            chmodSync(opts.out, 0o600);
          } catch {
            /* no modes on this platform */
          }
          store.appendAudit(
            auditEvent({ action: "database.export_plaintext", itemCount: payload.items.length }),
          );
          process.stdout.write(`Wrote ${opts.out}\n`);
          const droppedEntries = Object.entries(dropped);
          if (droppedEntries.length > 0) {
            process.stdout.write("\nNo CSV has a column for these, so they were not written:\n");
            for (const [what, count] of droppedEntries) process.stdout.write(`  ${String(count).padStart(4)}  ${what}\n`);
            process.stdout.write(`\nThe fields a CSV always loses: ${CSV_LOSSY_FIELDS.join(", ")}.\n`);
          }
          return;
        }

        if (opts.plaintext) {
          const db = await exportPlaintextDatabase(payload, {
            namespace: meta.namespace,
            acknowledged: true,
          });
          writeFileSync(opts.out, `${JSON.stringify(db, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
          try {
            chmodSync(opts.out, 0o600);
          } catch {
            /* no modes on this platform */
          }
          store.appendAudit(auditEvent({ action: "database.export_plaintext", itemCount: payload.items.length }));
          process.stdout.write(`Wrote ${opts.out} — unprotected, ${payload.items.length} items.\n`);
          return;
        }

        const passphrase = opts.passphraseStdin
          ? ((await resolveSecretFlag("-")) as string)
          : await promptNewSecret("Export passphrase: ", "Repeat: ");
        const db = await exportDatabase(payload, { namespace: meta.namespace, passphrase });
        writeFileSync(opts.out, `${JSON.stringify(db, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
        store.appendAudit(auditEvent({ action: "database.export", itemCount: payload.items.length }));
        process.stdout.write(
          `Wrote ${opts.out} — encrypted, ${payload.items.length} items, ${payload.folders.length} folders.\n`,
        );
      });
    });

  parent
    .command("import")
    .argument("<file>", "an OpenCreds database, or a CSV export from another product")
    .description("import into the vault")
    .option("--dry-run", "report what would happen and write nothing")
    .option("--merge <strategy>", "skip, replace or duplicate", "skip")
    .option("--source <name>", `force a CSV source (${Object.keys(IMPORT_SOURCES).join(", ")})`)
    .option("--passphrase-stdin", "read the database passphrase from stdin")
    .option("--allow-unregistered-namespace", "open a database whose namespace is not registered")
    .action(async function (
      this: Command,
      file: string,
      opts: {
        dryRun?: boolean;
        merge: string;
        source?: string;
        passphraseStdin?: boolean;
        allowUnregisteredNamespace?: boolean;
      },
    ) {
      await run(async () => {
        const store = storeFor(this);
        const meta = requireMeta(store);
        const userKey = await unlock(store);

        const strategy = opts.merge as MergeStrategy;
        if (!["skip", "replace", "duplicate"].includes(strategy)) {
          fail(`Unknown merge strategy "${opts.merge}"`, EXIT.USAGE);
        }

        let text: string;
        try {
          text = readFileSync(file, "utf8");
        } catch {
          fail(`Could not read ${file}`, EXIT.USAGE);
        }

        let incoming: DatabasePayload;
        let sourceLabel: string;
        let skipped: Array<{ row: number; reason: string }> = [];

        const isJson = text.trimStart().startsWith("{");
        if (isJson) {
          const db = parseDatabase(text);
          const header = readHeader(db);
          process.stdout.write(
            `  Source      ${file} (opencreds ${header.opencreds}, ` +
              `${header.protected ? "encrypted" : "PLAINTEXT"}, namespace ${header.namespace})\n`,
          );
          if (header.generator) {
            process.stdout.write(`  Exported    ${header.exportedAt} by ${header.generator.name} ${header.generator.version}\n`);
          }

          const passphrase = header.protected
            ? opts.passphraseStdin
              ? ((await resolveSecretFlag("-")) as string)
              : await promptSecret("Database passphrase: ")
            : undefined;

          try {
            incoming = await openDatabase(db, {
              ...(passphrase !== undefined ? { passphrase } : {}),
              allowUnregisteredNamespace: opts.allowUnregisteredNamespace,
            });
          } catch (err) {
            // A manifest mismatch writes nothing, regardless of flags.
            fail((err as Error).message, EXIT.CRYPTO);
          }
          process.stdout.write(`  Manifest    verified — ${incoming.items.length} items, ${incoming.folders.length} folders\n\n`);
          sourceLabel = "opencreds";
        } else {
          const parsed = parseCsvImport(text, opts.source ? { source: opts.source } : {});
          if (!parsed.source) {
            fail(
              parsed.skipped[0]?.reason === "Unrecognised export format"
                ? `Could not identify the export format of ${file}; pass --source`
                : `Nothing to import from ${file}`,
              EXIT.VALIDATION,
            );
          }
          incoming = { folders: parsed.folders, items: parsed.items };
          skipped = parsed.skipped;
          sourceLabel = IMPORT_SOURCES[parsed.source]!.label;
          process.stdout.write(`  Source      ${file} (${sourceLabel} CSV)\n\n`);
        }

        const existing = await loadPayload(store, userKey);
        const merged = mergePayload(existing, incoming, strategy);

        const counts: Partial<Record<ItemTypeName, number>> = {};
        for (const item of incoming.items) counts[item.type] = (counts[item.type] ?? 0) + 1;
        for (const name of ITEM_TYPE_NAMES) {
          if (counts[name]) process.stdout.write(`  ${name.padEnd(10)}${String(counts[name]).padStart(4)}\n`);
        }

        process.stdout.write(
          `\n  Folders     ${merged.outcome.foldersAdded} new, ${merged.outcome.foldersMerged} merged\n`,
        );
        process.stdout.write(
          `  Outcome     ${merged.outcome.added} added, ${merged.outcome.replaced} replaced, ` +
            `${merged.outcome.duplicated} duplicated, ${merged.outcome.skipped} skipped (${strategy})\n`,
        );
        if (skipped.length > 0) {
          process.stdout.write(`  Skipped     ${skipped.length} rows\n`);
          for (const row of skipped.slice(0, 20)) {
            process.stdout.write(`    row ${row.row}: ${row.reason}\n`);
          }
          if (skipped.length > 20) process.stdout.write(`    … and ${skipped.length - 20} more\n`);
        }

        if (opts.dryRun) {
          process.stdout.write("\n  Nothing written. Re-run without --dry-run to import.\n");
          return;
        }

        store.writeFolders(merged.folders);
        for (const item of merged.items) {
          store.writeEnvelope(await encryptItem(userKey, item, meta.namespace));
        }
        store.appendAudit(auditEvent({ action: "database.import", itemCount: incoming.items.length }));
        process.stdout.write(`\n  Imported into ${store.baseDir}\n`);
      });
    });

  // ------------------------------------------------------------ validate ----

  parent
    .command("validate")
    .argument("[file]", "a database or item document; omit with --stdin")
    .description("check that a document conforms")
    .option("--stdin", "read the document from stdin")
    .option("--json", "machine-readable diagnostics")
    .action(async function (this: Command, file: string | undefined, opts: { stdin?: boolean; json?: boolean }) {
      await run(async () => {
        let text: string;
        if (opts.stdin || !file) {
          text = await resolveSecretFlag("-") as string;
        } else {
          try {
            text = readFileSync(file, "utf8");
          } catch {
            fail(`Could not read ${file}`, EXIT.USAGE);
          }
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch (err) {
          fail(`Not valid JSON: ${(err as Error).message}`, EXIT.VALIDATION);
        }

        const { kind, diagnostics } = validateDocument(parsed);
        const failed = hasErrors(diagnostics);

        if (opts.json) {
          process.stdout.write(`${JSON.stringify({ kind, conformant: !failed, diagnostics }, null, 2)}\n`);
        } else {
          // A warning is not a failure, so a document that only warns still
          // gets told it conforms — otherwise a plaintext database, whose
          // warning is the whole point of it, looks broken.
          if (!failed) process.stdout.write(`OK — a conforming OpenCreds ${kind}\n`);
          if (diagnostics.length > 0) process.stdout.write(`${formatDiagnostics(diagnostics)}\n`);
        }
        if (failed) process.exitCode = EXIT.VALIDATION;
      });
    });

  parent
    .command("conformance")
    .description("run the OpenCreds conformance suite against this implementation")
    .option("--json", "emit the conformance report as JSON")
    .option("--emit-fixtures <dir>", "write the generated fixture set to a directory")
    .action(async function (this: Command, opts: { json?: boolean; emitFixtures?: string }) {
      await run(async () => {
        if (opts.emitFixtures) {
          const fixtures = await emitFixtures();
          for (const [name, content] of Object.entries(fixtures)) {
            const target = join(opts.emitFixtures, name);
            mkdirSync(dirname(target), { recursive: true });
            writeFileSync(
              target,
              typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`,
              "utf8",
            );
          }
          process.stdout.write(`Wrote ${Object.keys(fixtures).length} fixtures to ${opts.emitFixtures}\n`);
          return;
        }

        const report = await runConformance();
        process.stdout.write(
          opts.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatReport(report)}\n`,
        );
        // A failed MUST is a validation failure, not a crash.
        if (!report.conformant) process.exitCode = EXIT.VALIDATION;
      });
    });

  parent
    .command("manifest")
    .argument("<file>", "a plaintext database")
    .description("recompute the manifest of a plaintext database")
    .action(async function (this: Command, file: string) {
      await run(async () => {
        const db = parseDatabase(readFileSync(file, "utf8"));
        if (db.protected) fail("Only a plaintext database can be re-manifested here", EXIT.USAGE);
        const manifest = await buildManifest({ folders: db.folders ?? [], items: db.items ?? [] });
        process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
      });
    });
}
