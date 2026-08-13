import { spawnSync } from "node:child_process";
import { homedir, userInfo } from "node:os";
import {
  createCredentialEngine,
  credentialProviderRegistry,
  decodeSshFile,
  defaultSshDirectory,
  isPassphraseless,
  sshDirectory,
  type CredentialDiffEntry,
  type CredentialEndpoint,
  type CredentialKey,
  type CredentialSyncRun,
  type SshFile
} from "@logicsrc/plugin-credential-sharing";
import { print, type OutputFormat } from "./format.js";
import { authedClient, selectOne, teamEndpoint, vaultName } from "./teams.js";

/**
 * `logicsrc secrets ssh …` — back up `~/.ssh` into an end-to-end-encrypted team
 * vault, restore it on another machine, or load the private keys straight into
 * a running ssh-agent without them ever touching that machine's disk.
 *
 * Key material is addressed by PERSON, not by project: the vault is
 * `ssh--<username>`, so `teams vaults` reads project `ssh`, env `<username>`
 * and one teammate's keys never land in another's restore. Sharing is still
 * possible, but only deliberately, through `teams grant`.
 */

export const SSH_PROJECT = "ssh";

/** The env half of the vault name: a username, slugified to the vault charset. */
export function sshVaultUser(requested?: string): string {
  const raw = (requested ?? safeUsername() ?? "").trim();
  const slug = raw.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) {
    throw new Error("Could not work out a username for the ssh vault. Pass one: logicsrc secrets ssh push <team> <username>");
  }
  return slug;
}

function safeUsername(): string | undefined {
  try {
    return userInfo().username;
  } catch {
    return process.env.USER ?? process.env.LOGNAME;
  }
}

/** `/home/anthony/.ssh` → `~/.ssh`, purely for readable output. */
function tilde(path: string): string {
  const home = homedir();
  return path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

export interface SshTargetOptions {
  dir?: string;
  include?: string[];
  force?: boolean;
  dryRun?: boolean;
  format: OutputFormat;
}

interface SshTarget {
  slug: string;
  user: string;
  vault: string;
  local: CredentialEndpoint;
  remote: CredentialEndpoint;
  dir: string;
}

async function resolveTarget(team: string | undefined, user: string | undefined, options: SshTargetOptions): Promise<SshTarget> {
  let slug = team;
  if (!slug) {
    const { client } = authedClient();
    const { teams } = await client.listTeams();
    slug = await selectOne("Team", teams.map((candidate) => candidate.slug));
  }
  const username = sshVaultUser(user);
  const vault = vaultName(SSH_PROJECT, username);
  const local: CredentialEndpoint = {
    provider: "ssh",
    path: options.dir ?? defaultSshDirectory(),
    metadata: options.include?.length ? { include: options.include } : undefined
  };
  return { slug, user: username, vault, local, remote: teamEndpoint(slug, vault), dir: sshDirectory(local) };
}

/**
 * Decode every envelope at an endpoint, so output can name real file paths and
 * `agent` can pick out the private keys. One read of the endpoint, reused by
 * the caller and by syncSsh — for a vault that is one decrypt pass, not two.
 */
async function describeEndpoint(endpoint: CredentialEndpoint): Promise<{ keys: CredentialKey[]; files: Map<string, SshFile> }> {
  const files = new Map<string, SshFile>();
  const provider = credentialProviderRegistry.get(endpoint.provider);
  if (!provider) throw new Error(`Unknown credential provider: ${endpoint.provider}`);
  const snapshot = await provider.inspect(endpoint);
  if (snapshot.keys.length === 0 || !provider.readValues) return { keys: snapshot.keys, files };
  const values = await provider.readValues(endpoint, snapshot.keys.map((key) => key.name));
  for (const [key, value] of Object.entries(values)) {
    try {
      files.set(key, decodeSshFile(key, value));
    } catch {
      // A non-envelope secret sharing the vault is reported by name alone.
    }
  }
  return { keys: snapshot.keys, files };
}

function row(key: string, file: SshFile | undefined, op: string, applied: boolean, error?: string): Record<string, unknown> {
  return {
    file: file?.path ?? key,
    kind: file?.kind ?? "unknown",
    mode: file ? file.mode.toString(8).padStart(4, "0") : "—",
    op,
    applied,
    ...(error ? { error } : {})
  };
}

interface SyncOutcome {
  run?: CredentialSyncRun;
  rows: Array<Record<string, unknown>>;
  applied: number;
  skipped: string[];
}

/**
 * Files that already exist on the far side with different contents. They are
 * held back unless --force: the whole point of a key backup is that restoring
 * it on a machine that already has its own keys does not quietly destroy them,
 * and that pushing from one machine does not quietly replace another machine's
 * backed-up key of the same name. New files are never held back.
 */
export function keysToHoldBack(entries: CredentialDiffEntry[], force: boolean): string[] {
  return force ? [] : entries.filter((entry) => entry.destructive).map((entry) => entry.key);
}

/** Plan and apply one direction of the sync, honouring the hold-back rule. */
async function syncSsh(
  from: CredentialEndpoint,
  to: CredentialEndpoint,
  described: Map<string, SshFile>,
  options: SshTargetOptions
): Promise<SyncOutcome> {
  const engine = createCredentialEngine();
  const diff = await engine.diffCredentialEndpoints(from, to);
  const skipped = keysToHoldBack(diff.entries, Boolean(options.force));
  const plan = await engine.createCredentialSyncPlan({ from, to, policy: { denyKeys: skipped } });

  if (plan.changes.length === 0) {
    return { rows: [], applied: 0, skipped };
  }

  if (options.dryRun) {
    return {
      rows: plan.changes.map((change) => row(change.key, described.get(change.key), change.op, false)),
      applied: 0,
      skipped
    };
  }

  const approval = engine.approveCredentialSync(plan.id);
  const run = await engine.runCredentialSync(plan.id, { dryRun: false, approval });
  return {
    run,
    rows: run.results.map((result) => row(result.key, described.get(result.key), result.op, result.applied, result.error)),
    applied: run.results.filter((result) => result.applied).length,
    skipped
  };
}

function reportSkipped(skipped: string[], described: Map<string, SshFile>, hint: string): void {
  if (skipped.length === 0) return;
  const names = skipped.map((key) => described.get(key)?.path ?? key);
  console.error(`Left ${skipped.length} file(s) alone because they already differ: ${names.join(", ")}`);
  console.error(`  Overwrite them with --force, ${hint}`);
}

export async function sshPushAction(team: string | undefined, user: string | undefined, options: SshTargetOptions): Promise<void> {
  const target = await resolveTarget(team, user, options);
  const { files: local } = await describeEndpoint(target.local);
  if (local.size === 0) {
    throw new Error(`No SSH keys or config found in ${tilde(target.dir)}. Nothing to push.`);
  }

  const bare = [...local.values()].filter((file) => file.kind === "private-key" && isPassphraseless(file.body));
  if (bare.length > 0) {
    console.error(`⚠️  ${bare.length} private key(s) have no passphrase: ${bare.map((file) => file.path).join(", ")}`);
    console.error("   They stay end-to-end encrypted in the vault, but anyone you grant it to gets a ready-to-use key.");
  }

  const outcome = await syncSsh(target.local, target.remote, local, options);
  const label = `${target.slug}/${target.vault}`;
  if (outcome.rows.length === 0) {
    console.error(`${label} is already up to date with ${tilde(target.dir)}.`);
  } else if (options.dryRun) {
    console.error(`Would push ${outcome.rows.length} file(s) from ${tilde(target.dir)} to ${label}.`);
  } else {
    console.error(`Pushed ${outcome.applied} file(s) from ${tilde(target.dir)} to ${label} (end-to-end encrypted).`);
  }
  reportSkipped(outcome.skipped, local, "or leave the vault holding the other machine's copy.");
  print(outcome.rows.length ? outcome.rows : [{ note: `${label} matches ${tilde(target.dir)}` }], options.format);
}

export async function sshPullAction(team: string | undefined, user: string | undefined, options: SshTargetOptions): Promise<void> {
  const target = await resolveTarget(team, user, options);
  const { files: remote } = await describeEndpoint(target.remote);
  if (remote.size === 0) {
    throw new Error(`${target.slug}/${target.vault} holds no SSH files yet. Back some up first: logicsrc secrets ssh push ${target.slug} ${target.user}`);
  }

  const outcome = await syncSsh(target.remote, target.local, remote, options);
  const label = `${target.slug}/${target.vault}`;
  if (outcome.rows.length === 0) {
    console.error(`${tilde(target.dir)} is already up to date with ${label}.`);
  } else if (options.dryRun) {
    console.error(`Would restore ${outcome.rows.length} file(s) from ${label} into ${tilde(target.dir)}.`);
  } else {
    console.error(`Restored ${outcome.applied} file(s) from ${label} into ${tilde(target.dir)}.`);
  }
  reportSkipped(outcome.skipped, remote, "which replaces the local copy.");
  print(outcome.rows.length ? outcome.rows : [{ note: `${tilde(target.dir)} matches ${label}` }], options.format);
}

/**
 * List what the vault holds. Values are decrypted locally to read each file's
 * path, kind and mode — never its body, which is not printed anywhere.
 */
export async function sshListAction(team: string | undefined, user: string | undefined, options: SshTargetOptions): Promise<void> {
  const target = await resolveTarget(team, user, options);
  const { keys, files } = await describeEndpoint(target.remote);
  if (keys.length === 0) {
    print([{ note: `${target.slug}/${target.vault} holds no SSH files yet. Back some up: logicsrc secrets ssh push ${target.slug} ${target.user}` }], options.format);
    return;
  }
  print(
    keys.map((key) => {
      const file = files.get(key.name);
      return {
        file: file?.path ?? key.name,
        kind: file?.kind ?? "unknown",
        mode: file ? file.mode.toString(8).padStart(4, "0") : "—",
        fingerprint: key.fingerprint ?? "—",
        updated: key.lastModifiedAt ?? "—"
      };
    }),
    options.format
  );
}

/**
 * Load the vault's private keys into the running ssh-agent over stdin, so a
 * throwaway machine can use them without ever writing a key to its disk.
 */
export async function sshAgentAction(
  team: string | undefined,
  user: string | undefined,
  options: SshTargetOptions & { lifetime?: string }
): Promise<void> {
  if (!process.env.SSH_AUTH_SOCK) {
    throw new Error('No ssh-agent is running (SSH_AUTH_SOCK is unset). Start one first: eval "$(ssh-agent -s)"');
  }
  const target = await resolveTarget(team, user, options);
  const { files } = await describeEndpoint(target.remote);
  const keys = [...files.values()].filter((file) => file.kind === "private-key");
  if (keys.length === 0) {
    throw new Error(`${target.slug}/${target.vault} holds no private keys to add.`);
  }

  const rows = keys.map((file) => {
    if (options.dryRun) return { file: file.path, loaded: false, note: "dry run" };
    const args = options.lifetime ? ["-t", options.lifetime, "-"] : ["-"];
    const result = spawnSync("ssh-add", args, { input: file.body, stdio: ["pipe", "inherit", "pipe"], encoding: "utf8" });
    if (result.error) {
      throw new Error(`Could not run ssh-add: ${result.error.message}`);
    }
    const stderr = (result.stderr ?? "").trim();
    return result.status === 0
      ? { file: file.path, loaded: true }
      : { file: file.path, loaded: false, error: stderr || `ssh-add exited ${result.status}` };
  });

  const loaded = rows.filter((entry) => entry.loaded).length;
  console.error(
    options.dryRun
      ? `Would add ${keys.length} key(s) from ${target.slug}/${target.vault} to the agent.`
      : `Added ${loaded}/${keys.length} key(s) from ${target.slug}/${target.vault} to the agent — nothing was written to disk.`
  );
  print(rows, options.format);
}
