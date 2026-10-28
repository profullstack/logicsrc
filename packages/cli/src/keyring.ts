import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  createItem,
  createVault,
  decryptItem,
  encryptItem,
  unlockVault,
  unlockWithRecoveryKey,
  type Envelope,
  type Item,
  type KeyKind,
  type VaultMeta
} from "@logicsrc/opencreds";

/**
 * The LogicSRC keyring: SSH keys and other public/private key pairs, kept
 * end-to-end encrypted, optionally synced to the logicsrc account.
 *
 * No new cryptography. A keyring is an OpenCreds `user`-profile vault (the
 * `logicsrc vault` scheme): a random user key wrapped under a passphrase via
 * PBKDF2-SHA256 (600k) + HKDF, plus a one-time recovery key. Each private key
 * is an OpenCreds `key` item encrypted with AES-256-GCM under that user key,
 * with the item id bound as AAD. The server, when there is one, receives the
 * wrapped meta and the envelopes: it can read neither.
 *
 * What is NOT secret, and so is kept in the clear beside each envelope so that
 * `list`, `show`, `export --pub` and the web page work without a passphrase:
 * the name, type, filename, public key, fingerprint and comment.
 *
 * Layout under ~/.config/logicsrc/keyring (or LOGICSRC_KEYRING_HOME):
 *   meta.json            OpenCreds VaultMeta (key material, all of it wrapped)
 *   entries/<id>.json    KeyringEntry: public half + envelope (or a tombstone)
 *   sync.json            { cloud: boolean, lastSyncAt }
 */

export const KEYRING_TYPES = ["ssh-ed25519", "ssh-rsa", "ssh-ecdsa", "gpg", "age", "generic"] as const;
export type KeyringType = (typeof KEYRING_TYPES)[number];

export interface KeyringEntry {
  id: string;
  name: string;
  type: KeyringType;
  /** The file it restores to, by default name: id_ed25519. Never invented. */
  filename: string;
  publicKey: string;
  fingerprint: string;
  comment: string;
  createdAt: string;
  updatedAt: string;
  /** Ciphertext of an OpenCreds `key` item. null on a tombstone. */
  envelope: Envelope | null;
  deletedAt?: string | null;
}

/** What `list`/`show`/the API expose: never the envelope's insides. */
export type PublicEntry = Omit<KeyringEntry, "envelope">;

export function keyringHome(): string {
  const override = process.env.LOGICSRC_KEYRING_HOME;
  if (override && override.trim()) return override;
  const config = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(config, "logicsrc", "keyring");
}

// ---------------------------------------------------------------- parsing ----

const PRIVATE_MARKERS = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
  /-----BEGIN PGP PRIVATE KEY BLOCK-----/,
  /AGE-SECRET-KEY-1[0-9A-Z]+/,
  /PuTTY-User-Key-File-/
];

/** True when the text carries private key material in any format we know. */
export function looksPrivate(text: string): boolean {
  return PRIVATE_MARKERS.some((re) => re.test(text));
}

/** `ssh-ed25519 AAAA… comment` → type, blob, comment. */
export function parseSshPublicKey(line: string): { algo: string; blob: Buffer; comment: string } | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const [algo, b64, ...rest] = parts as [string, string, ...string[]];
  if (!/^(ssh-|ecdsa-sha2-|sk-)/.test(algo)) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  const blob = Buffer.from(b64, "base64");
  // The blob starts with its own algorithm name; a mismatch is a corrupt line.
  if (blob.length < 4) return null;
  const n = blob.readUInt32BE(0);
  if (blob.subarray(4, 4 + n).toString("utf8") !== algo) return null;
  return { algo, blob, comment: rest.join(" ") };
}

/**
 * The fingerprint people compare. For SSH it is exactly what `ssh-keygen -lf`
 * prints (SHA256 of the key blob, unpadded base64). For anything else it is
 * the SHA256 of the trimmed public text, in the same notation.
 */
export function fingerprintOf(publicKey: string): string {
  const ssh = parseSshPublicKey(publicKey);
  const digest = createHash("sha256").update(ssh ? ssh.blob : Buffer.from(publicKey.trim(), "utf8")).digest("base64");
  return `SHA256:${digest.replace(/=+$/, "")}`;
}

export function sshTypeOf(algo: string): KeyringType {
  if (algo === "ssh-ed25519" || algo === "sk-ssh-ed25519@openssh.com") return "ssh-ed25519";
  if (algo === "ssh-rsa") return "ssh-rsa";
  if (algo.startsWith("ecdsa-sha2-") || algo.startsWith("sk-ecdsa-")) return "ssh-ecdsa";
  return "generic";
}

/** Work out a key's type from what it looks like. */
export function detectType(privateKey: string, publicKey: string): KeyringType {
  const ssh = parseSshPublicKey(publicKey);
  if (ssh) return sshTypeOf(ssh.algo);
  if (/BEGIN PGP PRIVATE KEY BLOCK/.test(privateKey) || /BEGIN PGP PUBLIC KEY BLOCK/.test(publicKey)) return "gpg";
  if (/AGE-SECRET-KEY-1/.test(privateKey) || /^age1[0-9a-z]+$/.test(publicKey.trim())) return "age";
  return "generic";
}

function opencredsKeyKind(type: KeyringType): KeyKind {
  if (type.startsWith("ssh-")) return "ssh";
  if (type === "gpg") return "pgp";
  return "symmetric";
}

/** An age identity file names its recipient in a `# public key: age1…` comment. */
export function agePublicFromIdentity(privateKey: string): string | undefined {
  return /#\s*public key:\s*(age1[0-9a-z]+)/.exec(privateKey)?.[1];
}

export function validateName(name: string): string {
  const clean = name.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._@-]{0,127}$/.test(clean)) {
    throw new Error(`Invalid key name ${JSON.stringify(name)}: use letters, digits, . _ @ - (max 128).`);
  }
  return clean;
}

// ------------------------------------------------------------------ store ----

function writePrivate(path: string, contents: string): void {
  writeFileSync(path, contents, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    /* no modes on this filesystem */
  }
}

export interface SyncSettings {
  cloud: boolean;
  lastSyncAt?: string;
}

export class KeyringStore {
  readonly entriesDir: string;
  constructor(readonly baseDir: string = keyringHome()) {
    this.entriesDir = join(baseDir, "entries");
  }

  exists(): boolean {
    return existsSync(join(this.baseDir, "meta.json"));
  }

  private ensure(): void {
    mkdirSync(this.entriesDir, { recursive: true, mode: 0o700 });
    try {
      chmodSync(this.baseDir, 0o700);
    } catch {
      /* ignore */
    }
  }

  readMeta(): VaultMeta | undefined {
    const path = join(this.baseDir, "meta.json");
    return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as VaultMeta) : undefined;
  }

  writeMeta(meta: VaultMeta): void {
    this.ensure();
    writePrivate(join(this.baseDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  }

  /** Every entry including tombstones. */
  allEntries(): KeyringEntry[] {
    if (!existsSync(this.entriesDir)) return [];
    return readdirSync(this.entriesDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(this.entriesDir, f), "utf8")) as KeyringEntry);
  }

  /** Live entries, sorted by name. */
  entries(): KeyringEntry[] {
    return this.allEntries()
      .filter((e) => !e.deletedAt && e.envelope)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  find(ref: string): KeyringEntry | undefined {
    const live = this.entries();
    return live.find((e) => e.name === ref) ?? live.find((e) => e.id === ref) ?? live.find((e) => e.fingerprint === ref);
  }

  get(ref: string): KeyringEntry {
    const found = this.find(ref);
    if (!found) throw new Error(`No key "${ref}" in the keyring. See them: logicsrc keyring list`);
    return found;
  }

  write(entry: KeyringEntry): void {
    this.ensure();
    if (!/^[A-Za-z0-9-]{1,64}$/.test(entry.id)) throw new Error(`Bad entry id ${entry.id}`);
    writePrivate(join(this.entriesDir, `${entry.id}.json`), JSON.stringify(entry, null, 2) + "\n");
  }

  remove(id: string): void {
    rmSync(join(this.entriesDir, `${id}.json`), { force: true });
  }

  readSync(): SyncSettings {
    const path = join(this.baseDir, "sync.json");
    return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as SyncSettings) : { cloud: false };
  }

  writeSync(settings: SyncSettings): void {
    this.ensure();
    writePrivate(join(this.baseDir, "sync.json"), JSON.stringify(settings, null, 2) + "\n");
  }

  /** Move the whole keyring aside (before adopting the account's copy). */
  backup(): string {
    let n = 1;
    let target: string;
    do target = `${this.baseDir}.bak-${String(n++).padStart(3, "0")}`;
    while (existsSync(target));
    renameSync(this.baseDir, target);
    return target;
  }
}

// ----------------------------------------------------------------- crypto ----

/** Create a keyring's meta + user key from a passphrase (OpenCreds createVault). */
export async function createKeyring(passphrase: string): Promise<{ meta: VaultMeta; userKey: Uint8Array; recoveryKey: string }> {
  return createVault(passphrase);
}

export async function unlockKeyring(meta: VaultMeta, secret: { passphrase?: string; recoveryKey?: string }): Promise<Uint8Array> {
  if (secret.recoveryKey) return unlockWithRecoveryKey(meta, secret.recoveryKey);
  if (!secret.passphrase) throw new Error("The keyring passphrase is required.");
  try {
    return await unlockVault(meta, secret.passphrase);
  } catch {
    throw new Error("Wrong keyring passphrase.");
  }
}

export interface NewKeyInput {
  name: string;
  privateKey: string;
  publicKey: string;
  type?: KeyringType;
  filename?: string;
  comment?: string;
  /** The passphrase that protects the private key file itself, if any. Stored inside the ciphertext. */
  keyPassphrase?: string;
}

/** Seal a key pair: the private half becomes an OpenCreds envelope, the public half stays readable. */
export async function sealEntry(userKey: Uint8Array, input: NewKeyInput, existing?: KeyringEntry): Promise<KeyringEntry> {
  const name = validateName(input.name);
  const publicKey = input.publicKey.trim();
  if (looksPrivate(publicKey)) throw new Error("The public key text contains private key material. Refusing.");
  if (!input.privateKey.trim()) throw new Error("The private key is empty.");
  const type = input.type ?? detectType(input.privateKey, publicKey);
  const filename = basename(input.filename ?? name);
  const comment = input.comment ?? parseSshPublicKey(publicKey)?.comment ?? "";
  const fingerprint = publicKey ? fingerprintOf(publicKey) : "";
  const now = new Date().toISOString();

  const item: Item = createItem("key", {
    name,
    key: {
      keyType: opencredsKeyKind(type),
      algorithm: type,
      publicKey,
      privateKey: input.privateKey,
      passphrase: input.keyPassphrase ?? "",
      fingerprint,
      value: "",
      path: `~/.ssh/${filename}`,
      mode: "0600",
      expiresAt: ""
    }
  });
  item.id = existing?.id ?? randomUUID();
  const envelope = await encryptItem(userKey, item);
  return {
    id: item.id,
    name,
    type,
    filename,
    publicKey,
    fingerprint,
    comment,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    envelope,
    deletedAt: null
  };
}

/** Open an entry's envelope. Only ever called locally, with the unlocked user key. */
export async function openEntry(userKey: Uint8Array, entry: KeyringEntry): Promise<{ privateKey: string; keyPassphrase: string }> {
  if (!entry.envelope) throw new Error(`${entry.name} has been deleted.`);
  const item = await decryptItem(userKey, entry.envelope);
  return { privateKey: String(item.key?.privateKey ?? ""), keyPassphrase: String(item.key?.passphrase ?? "") };
}

export function publicEntry(entry: KeyringEntry): PublicEntry {
  const { envelope: _e, ...rest } = entry;
  return rest;
}

// ---------------------------------------------------------------- restore ----

export interface RestorePlan {
  privatePath: string;
  publicPath: string;
}

export interface RestoreResult {
  privatePath: string;
  publicPath?: string;
  wrote: boolean;
  backups: string[];
  note: string;
}

function backupPath(path: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let candidate = `${path}.bak-${stamp}`;
  let n = 1;
  while (existsSync(candidate)) candidate = `${path}.bak-${stamp}-${n++}`;
  return candidate;
}

function sameText(path: string, text: string): boolean {
  try {
    return readFileSync(path, "utf8").trim() === text.trim();
  } catch {
    return false;
  }
}

/**
 * Write a key pair to disk under its default filename.
 *
 * - private 0600, public 0644, directory 0700 when it is created here
 * - an identical file already there: nothing is written
 * - a DIFFERENT file already there: refused, unless `force`, and then the old
 *   file is copied to `<file>.bak-<time>` before it is replaced
 */
export function restoreToDisk(
  entry: PublicEntry,
  privateKey: string,
  options: { dir: string; force?: boolean }
): RestoreResult {
  const dir = resolve(options.dir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const privatePath = join(dir, entry.filename);
  const publicPath = entry.publicKey ? `${privatePath}.pub` : undefined;
  const privateText = privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`;
  const publicText = entry.publicKey ? `${entry.publicKey.trim()}\n` : "";

  const privSame = existsSync(privatePath) && sameText(privatePath, privateText);
  const pubSame = !publicPath || (existsSync(publicPath) && sameText(publicPath, publicText));
  const privConflict = existsSync(privatePath) && !privSame;
  const pubConflict = Boolean(publicPath && existsSync(publicPath) && !pubSame);

  if ((privConflict || pubConflict) && !options.force) {
    const which = [privConflict ? privatePath : "", pubConflict ? publicPath : ""].filter(Boolean).join(" and ");
    throw new Error(
      `${which} already exists and holds a different key. Nothing was written. ` +
        `Re-run with --force to replace it (the current file is backed up first), or restore elsewhere with --to <dir>.`
    );
  }

  const backups: string[] = [];
  let wrote = false;
  if (!privSame) {
    if (existsSync(privatePath)) {
      const bak = backupPath(privatePath);
      copyFileSync(privatePath, bak);
      chmodSync(bak, 0o600);
      backups.push(bak);
    }
    writePrivate(privatePath, privateText);
    wrote = true;
  } else {
    chmodSync(privatePath, 0o600);
  }
  if (publicPath && !pubSame) {
    if (existsSync(publicPath)) {
      const bak = backupPath(publicPath);
      copyFileSync(publicPath, bak);
      backups.push(bak);
    }
    writeFileSync(publicPath, publicText, { encoding: "utf8", mode: 0o644 });
    wrote = true;
  }
  if (publicPath) chmodSync(publicPath, 0o644);

  return {
    privatePath,
    publicPath,
    wrote,
    backups,
    note: wrote ? (backups.length ? `replaced (old copies: ${backups.join(", ")})` : "written") : "already there, identical"
  };
}

export function fileMode(path: string): string {
  return (statSync(path).mode & 0o777).toString(8).padStart(4, "0");
}

/** authorized_keys lines for the given entries (public halves only). */
export function authorizedKeysLines(entries: PublicEntry[]): string[] {
  return entries.filter((e) => parseSshPublicKey(e.publicKey)).map((e) => e.publicKey.trim());
}
