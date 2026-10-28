import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, hostname, userInfo } from "node:os";
import { basename, join, resolve } from "node:path";
import type { Command } from "commander";
import { promptNewSecret, promptSecret } from "@logicsrc/opencreds";
import {
  KEYRING_TYPES,
  KeyringStore,
  agePublicFromIdentity,
  authorizedKeysLines,
  createKeyring,
  detectType,
  fileMode,
  looksPrivate,
  openEntry,
  publicEntry,
  restoreToDisk,
  sealEntry,
  unlockKeyring,
  type KeyringEntry,
  type KeyringType
} from "./keyring.js";
import { accountKeyringRemote, describeKeyringSync, syncKeyring, type KeyringRemote } from "./keyring-sync.js";
import { print, printColumns, type OutputFormat } from "./format.js";

/**
 * `logicsrc keyring …` — SSH keys and other key pairs, end-to-end encrypted.
 * (`logicsrc keys` was already taken by API keys.)
 */

export const PASSPHRASE_ENV = "LOGICSRC_KEYRING_PASSPHRASE";

let storeOverride: KeyringStore | undefined;
let remoteOverride: (() => KeyringRemote | undefined) | undefined;
/** Tests point the commands at a temp keyring and a fake account. */
export function setKeyringTestHooks(hooks: { store?: KeyringStore; remote?: () => KeyringRemote | undefined }): void {
  storeOverride = hooks.store;
  remoteOverride = hooks.remote;
}
const store = (): KeyringStore => storeOverride ?? new KeyringStore();
const remoteFor = (): KeyringRemote | undefined => (remoteOverride ? remoteOverride() : accountKeyringRemote());

const tilde = (p: string): string => {
  const home = homedir();
  return p === home || p.startsWith(`${home}/`) ? `~${p.slice(home.length)}` : p;
};
const expandHome = (p: string): string => (p === "~" ? homedir() : p.startsWith("~/") ? join(homedir(), p.slice(2)) : p);

async function newPassphrase(): Promise<string> {
  const fromEnv = process.env[PASSPHRASE_ENV];
  if (fromEnv) return fromEnv;
  console.error("Choose a keyring passphrase. It never leaves this machine; without it (or the recovery key) the keys cannot be opened.");
  return promptNewSecret("Keyring passphrase: ", "Repeat: ");
}

async function unlock(s: KeyringStore, recoveryKey?: string): Promise<Uint8Array> {
  const meta = s.readMeta();
  if (!meta) throw new Error("No keyring yet. Make one: logicsrc keyring init (or add a key: logicsrc keyring add ~/.ssh/id_ed25519)");
  if (recoveryKey) return unlockKeyring(meta, { recoveryKey });
  const passphrase = process.env[PASSPHRASE_ENV] || (await promptSecret("Keyring passphrase: "));
  return unlockKeyring(meta, { passphrase });
}

async function initIfMissing(s: KeyringStore): Promise<Uint8Array | undefined> {
  if (s.exists()) return undefined;
  // A keyring may already exist in the account: take it rather than forking a second one.
  const remote = remoteFor();
  if (remote) {
    try {
      const { meta } = await remote.get();
      if (meta) {
        s.writeMeta(meta);
        s.writeSync({ cloud: true });
        console.error(`Using the keyring already in your account (${remote.label}).`);
        return undefined;
      }
    } catch (e) {
      console.error(`(Could not reach the account: ${(e as Error).message}. Making a local keyring.)`);
    }
  }
  const { meta, userKey, recoveryKey } = await createKeyring(await newPassphrase());
  s.writeMeta(meta);
  s.writeSync({ cloud: false });
  console.error(`Created the keyring at ${tilde(s.baseDir)}.`);
  console.error(`RECOVERY KEY (shown once, store it offline; it opens the keyring if the passphrase is lost):\n  ${recoveryKey}`);
  return userKey;
}

/** Push after a change when cloud is on (or --sync). Sync never fails the command. */
async function maybeSync(s: KeyringStore, force?: boolean, quiet = false): Promise<void> {
  if (!force && !s.readSync().cloud) return;
  const remote = remoteFor();
  if (!remote) {
    if (force) console.error("Not logged in, so nothing was synced. Run: logicsrc login, then logicsrc keyring sync");
    return;
  }
  try {
    const report = await syncKeyring(s, remote);
    if (!quiet) console.error(describeKeyringSync(report, remote.label));
  } catch (e) {
    console.error(`Keyring sync skipped: ${(e as Error).message}`);
  }
}

function row(e: KeyringEntry): Record<string, unknown> {
  return { name: e.name, type: e.type, fingerprint: e.fingerprint || "—", comment: e.comment || "—", file: e.filename, updated: e.updatedAt.slice(0, 10) };
}

function readKeyFile(file: string): { privateKey: string; publicKey: string; pubPath?: string } {
  const path = resolve(expandHome(file));
  if (!existsSync(path)) throw new Error(`No such file: ${file}`);
  const privateKey = readFileSync(path, "utf8");
  if (!looksPrivate(privateKey)) {
    throw new Error(`${file} does not look like a private key. Pass the private half (e.g. ~/.ssh/id_ed25519); its .pub is read alongside.`);
  }
  return { privateKey, publicKey: "", pubPath: path };
}

function derivePublic(privatePath: string, privateKey: string, explicitPub?: string): string {
  if (explicitPub) return readFileSync(resolve(expandHome(explicitPub)), "utf8").trim();
  if (existsSync(`${privatePath}.pub`)) return readFileSync(`${privatePath}.pub`, "utf8").trim();
  const age = agePublicFromIdentity(privateKey);
  if (age) return age;
  if (/OPENSSH PRIVATE KEY|RSA PRIVATE KEY|EC PRIVATE KEY/.test(privateKey)) {
    const out = spawnSync("ssh-keygen", ["-y", "-f", privatePath], { stdio: ["inherit", "pipe", "inherit"], encoding: "utf8" });
    if (out.status === 0 && out.stdout.trim()) return out.stdout.trim();
  }
  throw new Error(`No public key found for ${privatePath}. Pass one with --pub <file>.`);
}

export function registerKeyringCommands(program: Command): void {
  const kr = program
    .command("keyring")
    .alias("kr")
    .description(
      "SSH keys and other public/private key pairs, end-to-end encrypted on this machine; optional sync of the ciphertext to your logicsrc account."
    )
    .addHelpText(
      "after",
      `
Private keys are encrypted here (OpenCreds: PBKDF2-SHA256 600k + AES-256-GCM) before
they touch disk or the network. The account only ever stores ciphertext + public keys.

  logicsrc keyring add ~/.ssh/id_ed25519       import a key (+ its .pub)
  logicsrc keyring sync                        turn on cloud sync and push/pull
  logicsrc keyring restore id_ed25519          write it back to ~/.ssh (600/644)
  logicsrc keyring export --pub >> ~/.ssh/authorized_keys

Non-interactive: ${PASSPHRASE_ENV}=… (or pipe the passphrase on stdin).`
    );

  kr.command("init")
    .description("Create the keyring (asks for a passphrase, prints a one-time recovery key).")
    .option("--cloud", "Also turn on sync to your logicsrc account and push")
    .action(async (opts: { cloud?: boolean }) => {
      const s = store();
      if (s.exists()) {
        console.error(`A keyring already exists at ${tilde(s.baseDir)}.`);
      } else {
        await initIfMissing(s);
      }
      if (opts.cloud) await maybeSync(s, true);
    });

  kr.command("add")
    .description("Import a private key file and its .pub (e.g. ~/.ssh/id_ed25519).")
    .argument("<file>", "The private key file")
    .option("--name <name>", "Name in the keyring (default: the file name, e.g. id_ed25519)")
    .option("--pub <file>", "The public key file (default: <file>.pub)")
    .option("--type <type>", `One of ${KEYRING_TYPES.join(", ")} (default: detected)`)
    .option("--comment <text>", "Comment (default: the public key's comment)")
    .option("--force", "Replace an existing entry of the same name that holds a different key")
    .option("--sync", "Push to your account after adding, even if cloud sync is off")
    .action(async (file: string, opts: { name?: string; pub?: string; type?: string; comment?: string; force?: boolean; sync?: boolean }) => {
      const s = store();
      const { privateKey, pubPath } = readKeyFile(file);
      const publicKey = derivePublic(pubPath!, privateKey, opts.pub);
      if (opts.type && !KEYRING_TYPES.includes(opts.type as KeyringType)) throw new Error(`--type must be one of ${KEYRING_TYPES.join(", ")}`);
      const name = opts.name ?? basename(pubPath!);
      const fresh = await initIfMissing(s);
      const existing = s.find(name);
      const userKey = fresh ?? (await unlock(s));
      const entry = await sealEntry(
        userKey,
        { name, privateKey, publicKey, type: opts.type as KeyringType | undefined, filename: basename(pubPath!), comment: opts.comment },
        existing
      );
      if (existing && existing.fingerprint === entry.fingerprint && !opts.force) {
        console.error(`${name} is already in the keyring (${existing.fingerprint}).`);
      } else {
        if (existing && !opts.force) {
          throw new Error(`The keyring already has a different key named ${name} (${existing.fingerprint}). Use --name, or --force to replace it.`);
        }
        s.write(entry);
        console.error(`Added ${name} (${entry.type}, ${entry.fingerprint}) — encrypted at rest in ${tilde(s.baseDir)}.`);
      }
      await maybeSync(s, opts.sync);
    });

  kr.command("gen")
    .description("Generate a new key pair straight into the keyring (ssh-keygen).")
    .argument("<name>", "Name, and the file name it restores to (e.g. id_ed25519)")
    .option("--type <type>", "ed25519 (default), rsa or ecdsa", "ed25519")
    .option("--bits <n>", "RSA bits (default 4096)")
    .option("--comment <text>", "Comment (default: user@host)")
    .option("--sync", "Push to your account after generating")
    .action(async (name: string, opts: { type: string; bits?: string; comment?: string; sync?: boolean }) => {
      const s = store();
      if (!["ed25519", "rsa", "ecdsa"].includes(opts.type)) throw new Error("--type must be ed25519, rsa or ecdsa");
      if (s.find(name)) throw new Error(`The keyring already has ${name}. Pick another name or remove it first.`);
      const fresh = await initIfMissing(s);
      const userKey = fresh ?? (await unlock(s));
      const tmp = mkdtempSync(join(s.baseDir, ".gen-"));
      try {
        const path = join(tmp, "key");
        const comment = opts.comment ?? `${safeUser()}@${hostname()}`;
        const args = ["-q", "-t", opts.type, "-N", "", "-C", comment, "-f", path];
        if (opts.type === "rsa") args.push("-b", opts.bits ?? "4096");
        const out = spawnSync("ssh-keygen", args, { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
        if (out.status !== 0) throw new Error(`ssh-keygen failed: ${out.stderr || out.error?.message}`);
        const entry = await sealEntry(userKey, {
          name,
          privateKey: readFileSync(path, "utf8"),
          publicKey: readFileSync(`${path}.pub`, "utf8"),
          filename: name,
          comment
        });
        s.write(entry);
        console.error(`Generated ${name} (${entry.type}, ${entry.fingerprint}). Nothing was written to ~/.ssh; restore it with: logicsrc keyring restore ${name}`);
        console.log(entry.publicKey);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
      await maybeSync(s, opts.sync);
    });

  kr.command("list")
    .alias("ls")
    .description("List keys: name, type, fingerprint (no passphrase needed).")
    .option("--format <format>", "table, json or markdown", "table")
    .action(async (opts: { format: OutputFormat }) => {
      const s = store();
      // A machine with no keyring yet but a login: show what the account holds.
      await maybeSync(s, !s.exists() && Boolean(remoteFor()), true);
      const entries = s.entries();
      if (opts.format === "json") return print(entries.map(publicEntry), "json");
      if (!entries.length) return console.error("The keyring is empty. Add one: logicsrc keyring add ~/.ssh/id_ed25519");
      printColumns(entries.map(row));
    });

  kr.command("show")
    .description("Show one key's public half and fingerprint.")
    .argument("<name>")
    .option("--format <format>", "table or json", "table")
    .option("--print-private", "Also print the PRIVATE key to stdout (asks for the passphrase)")
    .option("--recovery-key <key>", "Unlock with the recovery key instead of the passphrase")
    .action(async (name: string, opts: { format: OutputFormat; printPrivate?: boolean; recoveryKey?: string }) => {
      const s = store();
      const e = s.get(name);
      if (opts.format === "json") print(publicEntry(e), "json");
      else {
        console.log(`name:        ${e.name}\ntype:        ${e.type}\nfingerprint: ${e.fingerprint}\ncomment:     ${e.comment || "—"}\nfile:        ${e.filename}\nupdated:     ${e.updatedAt}\npublic key:\n${e.publicKey}`);
      }
      if (opts.printPrivate) {
        const { privateKey } = await openEntry(await unlock(s, opts.recoveryKey), e);
        process.stdout.write(privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`);
      }
    });

  kr.command("restore")
    .description("Decrypt a key and write it under its default file name (private 600, public 644).")
    .argument("<name>")
    .option("--to <dir>", "Directory to write into", "~/.ssh")
    .option("--force", "Replace a different key already at that path (the old file is backed up first)")
    .option("--print-private", "Print the private key to stdout instead of writing files")
    .option("--recovery-key <key>", "Unlock with the recovery key instead of the passphrase")
    .action(async (name: string, opts: { to: string; force?: boolean; printPrivate?: boolean; recoveryKey?: string }) => {
      const s = store();
      if (!s.find(name)) await maybeSync(s, Boolean(remoteFor()), true);
      const e = s.get(name);
      const { privateKey } = await openEntry(await unlock(s, opts.recoveryKey), e);
      if (opts.printPrivate) {
        process.stdout.write(privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`);
        return;
      }
      const result = restoreToDisk(e, privateKey, { dir: expandHome(opts.to), force: opts.force });
      const modes = `${fileMode(result.privatePath)}${result.publicPath ? `/${fileMode(result.publicPath)}` : ""}`;
      console.error(`${tilde(result.privatePath)}${result.publicPath ? ` + .pub` : ""}: ${result.note} (mode ${modes}, ${e.fingerprint}).`);
    });

  kr.command("rm")
    .alias("remove")
    .description("Remove a key from the keyring (and from the account on the next sync).")
    .argument("<name>")
    .option("--sync", "Push the removal to your account now")
    .action(async (name: string, opts: { sync?: boolean }) => {
      const s = store();
      const e = s.get(name);
      const now = new Date().toISOString();
      s.write({ ...e, envelope: null, deletedAt: now, updatedAt: now });
      console.error(`Removed ${e.name} (${e.fingerprint}) from the keyring. Files already restored on disk are left alone.`);
      await maybeSync(s, opts.sync);
    });

  kr.command("export")
    .description("Print public keys as authorized_keys lines (public halves only).")
    .argument("[names...]", "Only these keys (default: every SSH key)")
    .option("--pub", "Public keys only (the only kind of export there is)", true)
    .action((names: string[]) => {
      const s = store();
      const entries = names.length ? names.map((n) => s.get(n)) : s.entries();
      for (const line of authorizedKeysLines(entries)) console.log(line);
    });

  kr.command("sync")
    .description("Turn on cloud sync and exchange ciphertext with your logicsrc account.")
    .option("--use-remote", "The account's keyring wins (this machine's is moved to a .bak dir)")
    .option("--use-local", "This machine's keyring replaces the account's")
    .option("--off", "Turn cloud sync off for this machine (the account copy is left as is)")
    .action(async (opts: { useRemote?: boolean; useLocal?: boolean; off?: boolean }) => {
      const s = store();
      if (opts.off) {
        s.writeSync({ ...s.readSync(), cloud: false });
        return console.error("Keyring cloud sync is off on this machine.");
      }
      const remote = remoteFor();
      if (!remote) throw new Error("Not logged in. Run: logicsrc login");
      const report = await syncKeyring(s, remote, opts.useRemote ? "use-remote" : opts.useLocal ? "use-local" : undefined);
      console.error(describeKeyringSync(report, remote.label));
    });

  kr.command("status")
    .description("Where the keyring lives, how many keys, whether cloud sync is on.")
    .action(() => {
      const s = store();
      const settings = s.readSync();
      print(
        {
          path: tilde(s.baseDir),
          exists: s.exists(),
          keys: s.entries().length,
          cloud: settings.cloud ? `on${remoteFor() ? "" : " (not logged in)"}` : "off",
          lastSyncAt: settings.lastSyncAt ?? "never"
        },
        "markdown"
      );
    });
}

function safeUser(): string {
  try {
    return userInfo().username;
  } catch {
    return process.env.USER ?? "user";
  }
}

// Re-exported for tests.
export { detectType };
