import { lookup } from "node:dns/promises";
import { decryptValue, fingerprintValue, teamProvider, unwrapVaultKey, type RemoteSecret } from "@logicsrc/plugin-credential-sharing";
import { print, printColumns, type OutputFormat } from "./format.js";
import { authedClient, splitVaultName, teamEndpoint, vaultName } from "./teams.js";

/**
 * `logicsrc teams clean` moves stale keys out of a vault into its archive vault
 * (`<project>--<env>-archive`). Nothing is ever deleted outright: a key leaves
 * the live vault only after its copy in the archive reads back with the same
 * fingerprint. Dry run unless --approve.
 *
 * `--dead` finds keys that point somewhere that no longer exists: a URL whose
 * host has no DNS record, or a Supabase JWT whose project ref is such a host.
 */

export const ARCHIVE_SUFFIX = "-archive";
/** Archive entries describing where an archived key came from: `__ARCHIVE__<NAME>`. */
export const ARCHIVE_ENTRY_PREFIX = "__ARCHIVE__";

const URL_HOST = /\b[a-z][a-z0-9+.-]*:\/\/(?:[^@/\s"']+@)?([a-z0-9.-]+\.[a-z]{2,})(?=[:/?#\s"']|$)/gi;
const JWT = /^eyJ[\w-]+\.([\w-]+)\.[\w-]*$/;

/** Hostnames of every URL in a value, lowercased, without duplicates. */
export function urlHosts(value: string): string[] {
  const hosts = new Set<string>();
  for (const m of value.matchAll(URL_HOST)) hosts.add(m[1]!.toLowerCase());
  return [...hosts];
}

/** Hosts a JWT is bound to: a Supabase key's `<ref>.supabase.co` and its `iss` host. */
export function jwtHosts(value: string): string[] {
  const m = JWT.exec(value.trim());
  if (!m) return [];
  let payload: { ref?: unknown; iss?: unknown };
  try {
    payload = JSON.parse(Buffer.from(m[1]!, "base64url").toString("utf8"));
  } catch {
    return [];
  }
  const hosts: string[] = [];
  if (typeof payload.ref === "string" && /^[a-z0-9]{8,40}$/.test(payload.ref)) hosts.push(`${payload.ref}.supabase.co`);
  if (typeof payload.iss === "string") hosts.push(...urlHosts(payload.iss));
  return hosts;
}

export function archiveVaultName(project: string, env: string): string {
  return vaultName(project, `${env}${ARCHIVE_SUFFIX}`);
}

/**
 * The name a key is stored under in the archive: its own name, unless the
 * archive already holds a different value there, then `<KEY>__<UTC stamp>`.
 * `null` means the archive already holds this exact value under the key.
 */
export function archiveSlot(key: string, fingerprint: string, archived: Map<string, string>, now: Date): string | null {
  const existing = archived.get(key);
  if (existing === undefined) return key;
  if (existing === fingerprint) return null;
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
  let name = `${key}__${stamp}`;
  for (let n = 2; archived.has(name); n++) name = `${key}__${stamp}_${n}`;
  return name;
}

export type HostCheck = (host: string) => Promise<boolean>;

/** True when the host resolves; only a definite "no such name" counts as dead. */
export const resolves: HostCheck = async (host) => {
  try {
    await lookup(host);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return !(code === "ENOTFOUND" || code === "ENODATA");
  }
};

/** Why each key is dead, from its value alone; keys that look fine are absent. */
export async function findDead(values: Map<string, string>, check: HostCheck = resolves): Promise<Map<string, string>> {
  const cache = new Map<string, Promise<boolean>>();
  const alive = (h: string) => {
    if (!cache.has(h)) cache.set(h, check(h));
    return cache.get(h)!;
  };
  const dead = new Map<string, string>();
  for (const [key, value] of values) {
    for (const host of urlHosts(value)) {
      if (!(await alive(host))) {
        dead.set(key, `url host ${host} does not resolve`);
        break;
      }
    }
    if (dead.has(key)) continue;
    for (const host of jwtHosts(value)) {
      if (!(await alive(host))) {
        dead.set(key, `token for ${host}, which does not resolve`);
        break;
      }
    }
  }
  return dead;
}

export interface CleanOptions {
  keys?: string[];
  dead: boolean;
  approve: boolean;
  reason?: string;
  format: OutputFormat;
}

interface CleanRow {
  key: string;
  reason: string;
  archivedAs: string;
  status: "would-archive" | "archived" | "already-archived" | "failed";
  error?: string;
}

export async function teamsCleanAction(slug: string, project: string, env: string, options: CleanOptions): Promise<void> {
  if (env.endsWith(ARCHIVE_SUFFIX)) throw new Error(`${vaultName(project, env)} is an archive vault; clean the live vault instead.`);
  if (!options.dead && !options.keys?.length) throw new Error("Say what to archive: --key NAME (repeatable) and/or --dead.");

  const { client, identity } = authedClient();
  const source = vaultName(project, env);
  const archive = archiveVaultName(project, env);
  const { vaults } = await client.listVaults(slug);
  const src = vaults.find((v) => v.name === source);
  if (!src) throw new Error(`Vault ${slug}/${source} not found.`);
  if (!src.hasAccess) throw new Error(`You cannot decrypt ${slug}/${source}.`);
  const dek = await unwrapVaultKey((await client.getMyGrant(src.id)).wrappedDek, identity.keys);
  const { secrets } = await client.listSecrets(src.id);
  const byName = new Map<string, RemoteSecret>(secrets.map((s) => [s.name, s]));
  const values = new Map<string, string>();
  for (const s of secrets) values.set(s.name, await decryptValue({ nonce: s.nonce, ciphertext: s.ciphertext }, dek));

  const picked = new Map<string, string>();
  for (const key of options.keys ?? []) {
    if (!byName.has(key)) throw new Error(`${key} is not in ${slug}/${source}.`);
    picked.set(key, options.reason ?? "named on the command line");
  }
  if (options.dead) for (const [key, why] of await findDead(values)) if (!picked.has(key)) picked.set(key, why);
  if (picked.size === 0) {
    console.error(`Nothing to archive in ${slug}/${source}.`);
    print({ team: slug, vault: source, archive, keys: [] }, options.format);
    return;
  }

  // What the archive holds already, so a second run never stores a value twice.
  const arc = vaults.find((v) => v.name === archive);
  const archived = new Map<string, string>();
  if (arc?.hasAccess) for (const s of (await client.listSecrets(arc.id)).secrets) archived.set(s.name, s.fingerprint);
  else if (arc) throw new Error(`${slug}/${archive} exists but you cannot decrypt it; ask a member for a grant first.`);

  const now = new Date();
  const rows: CleanRow[] = [];
  const upserts: Record<string, string> = {};
  for (const [key, reason] of picked) {
    const slot = archiveSlot(key, byName.get(key)!.fingerprint, archived, now);
    if (slot === null) {
      rows.push({ key, reason, archivedAs: key, status: "already-archived" });
      continue;
    }
    rows.push({ key, reason, archivedAs: slot, status: "would-archive" });
    upserts[slot] = values.get(key)!;
    upserts[`${ARCHIVE_ENTRY_PREFIX}${slot}`] = JSON.stringify({ from: source, key, reason, archivedAt: now.toISOString(), by: identity.email });
  }

  if (options.approve) {
    try {
      if (Object.keys(upserts).length) {
        await teamProvider.write!({ endpoint: teamEndpoint(slug, archive), upserts, deletes: [], dryRun: false });
      }
      // Read the archive back: a key leaves the live vault only once its copy is there, byte for byte.
      const after = (await client.listVaults(slug)).vaults.find((v) => v.name === archive);
      const stored = new Map((after ? (await client.listSecrets(after.id)).secrets : []).map((s) => [s.name, s.fingerprint]));
      const safe: string[] = [];
      for (const row of rows) {
        if (stored.get(row.archivedAs) === fingerprintValue(values.get(row.key)!)) {
          safe.push(row.key);
          if (row.status === "would-archive") row.status = "archived";
        } else {
          row.status = "failed";
          row.error = "copy not found in the archive; left in place";
        }
      }
      if (safe.length) await client.putSecrets(src.id, [], safe);
    } catch (err) {
      for (const row of rows) if (row.status === "would-archive") Object.assign(row, { status: "failed", error: (err as Error).message });
    }
  }

  if (options.format === "table") {
    printColumns(rows.map((r) => ({ key: r.key, status: r.status, "archived as": r.archivedAs, reason: r.error ?? r.reason })));
    const at = splitVaultName(archive);
    if (!options.approve) console.error(`\nDry run. Move them to ${slug}/${archive} with --approve.`);
    else console.error(`\nArchived in ${slug}/${archive}. Get them back with: logicsrc teams pull ${slug} ${at?.project} ${at?.env} --env archive.env`);
  } else {
    print({ team: slug, vault: source, archive, keys: rows }, options.format);
  }
  if (rows.some((r) => r.status === "failed")) process.exitCode = 1;
}
