import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  decodeSshFile,
  decryptValue,
  encodeSshFile,
  encryptValue,
  fingerprintValue,
  secretNameForPath,
  unwrapVaultKey,
  type RemoteSecret,
  type TeamClient
} from "@logicsrc/plugin-credential-sharing";
import { print, printColumns, type OutputFormat } from "./format.js";
import { authedClient, splitVaultName, vaultName } from "./teams.js";
import {
  EMPTY_FINGERPRINT,
  generateRandomSecret,
  isRotationEntry,
  parseRotationSpec,
  planRotations,
  rotationEntryName,
  type PlannedRotation,
  type RotationSpec
} from "./rotation-catalog.js";

/**
 * `logicsrc teams rotation`      what rotating each secret takes (never values)
 * `logicsrc teams rotation-set`  store per-entry rotation instructions
 * `logicsrc teams rotate-keys`   rotate secret VALUES (dry run unless --approve)
 *
 * A value is identified by its fingerprint, so one rotation is written to every
 * vault holding the same value, whatever the key is called there: a key pasted
 * into fourteen vaults is rotated once, not left stale in thirteen.
 */

export interface RotationFilter {
  project?: string;
  env?: string;
  keys?: string[];
}

interface VaultState {
  id: string;
  name: string;
  project: string;
  env: string;
  secrets: RemoteSecret[];
  dek?: string;
}

interface Loaded {
  client: TeamClient;
  /** Every vault in the team this identity can open. */
  vaults: VaultState[];
  /** Vaults we cannot decrypt: values there cannot be rotated by us. */
  locked: string[];
  dek(v: VaultState): Promise<string>;
}

async function loadTeam(slug: string): Promise<Loaded> {
  const { client, identity } = authedClient();
  const { vaults } = await client.listVaults(slug);
  const locked: string[] = [];
  const states: VaultState[] = [];
  for (const v of vaults) {
    if (!v.hasAccess) {
      locked.push(v.name);
      continue;
    }
    const parts = splitVaultName(v.name);
    const { secrets } = await client.listSecrets(v.id);
    states.push({ id: v.id, name: v.name, project: parts?.project ?? v.name, env: parts?.env ?? "", secrets });
  }
  return {
    client,
    vaults: states,
    locked,
    async dek(v) {
      v.dek ??= await unwrapVaultKey((await client.getMyGrant(v.id)).wrappedDek, identity.keys);
      return v.dek;
    }
  };
}

function inFilter(v: VaultState, filter: RotationFilter): boolean {
  return (!filter.project || v.project === filter.project) && (!filter.env || v.env === filter.env);
}

async function readValue(team: Loaded, v: VaultState, name: string): Promise<string> {
  const s = v.secrets.find((x) => x.name === name);
  if (!s) throw new Error(`${name} is not in ${v.name}`);
  return decryptValue({ nonce: s.nonce, ciphertext: s.ciphertext }, await team.dek(v));
}

/** Per-entry specs from `__ROTATE__<KEY>` entries, keyed by vault + key. */
async function readEntrySpecs(team: Loaded): Promise<{ specs: Map<string, RotationSpec>; invalid: string[] }> {
  const specs = new Map<string, RotationSpec>();
  const invalid: string[] = [];
  for (const v of team.vaults) {
    for (const s of v.secrets.filter((x) => isRotationEntry(x.name))) {
      const key = s.name.slice(rotationEntryName("").length);
      try {
        specs.set(`${v.name}\u0000${key}`, parseRotationSpec(await readValue(team, v, s.name)));
      } catch (err) {
        invalid.push(`${v.name}/${s.name}: ${(err as Error).message}`);
      }
    }
  }
  return { specs, invalid };
}

async function buildPlan(slug: string, filter: RotationFilter): Promise<{ team: Loaded; plan: PlannedRotation[]; invalid: string[] }> {
  const team = await loadTeam(slug);
  const { specs, invalid } = await readEntrySpecs(team);
  const rows = team.vaults
    .filter((v) => inFilter(v, filter))
    .flatMap((v) => v.secrets.map((s) => ({ vault: v.name, key: s.name, fingerprint: s.fingerprint, updatedAt: s.updatedAt })));
  if (rows.length === 0) throw new Error(`No secrets match ${[slug, filter.project, filter.env].filter(Boolean).join("/")}.`);
  const wanted = filter.keys?.length ? new Set(filter.keys.map((k) => k.toUpperCase())) : null;
  const plan = planRotations(rows, specs).filter((p) => !wanted || wanted.has(p.key.toUpperCase()));
  return { team, plan, invalid };
}

/** Every (vault, key) in the team holding this exact value, inside the filter or not. */
function siblings(team: Loaded, fingerprint: string): Array<{ vault: VaultState; key: string }> {
  if (fingerprint === EMPTY_FINGERPRINT) return [];
  return team.vaults.flatMap((v) =>
    v.secrets.filter((s) => s.fingerprint === fingerprint && !isRotationEntry(s.name)).map((s) => ({ vault: v, key: s.name }))
  );
}

// ---- plan ------------------------------------------------------------------

export async function teamsRotationAction(slug: string, filter: RotationFilter, options: { format: OutputFormat }): Promise<void> {
  const { team, plan, invalid } = await buildPlan(slug, filter);
  for (const p of plan) {
    const elsewhere = siblings(team, p.fingerprint).filter((s) => !p.vaults.includes(s.vault.name) || s.key !== p.key);
    (p as PlannedRotation & { alsoIn?: string[] }).alsoIn = elsewhere.map((s) => `${s.vault.name}:${s.key}`);
  }
  if (options.format === "table") {
    printColumns(
      plan.map((p) => ({
        key: p.key,
        method: p.method,
        auto: p.automatic ? "yes" : "no",
        source: p.source,
        vaults: p.vaults.length + ((p as { alsoIn?: string[] }).alsoIn?.length ?? 0),
        since: String(p.oldestUpdate).slice(0, 10),
        note: p.spec?.note ?? (p.source === "none" ? "no instructions: logicsrc teams rotation-set" : "")
      }))
    );
    const auto = plan.filter((p) => p.automatic).length;
    console.error(`\n${plan.length} value(s): ${auto} automatic, ${plan.length - auto} need a person or agent. Steps per key: --format json.`);
    console.error(`Rotate: logicsrc teams rotate-keys ${slug}${filter.project ? ` ${filter.project}` : ""}${filter.env ? ` ${filter.env}` : ""} [--key NAME] --approve`);
  } else {
    print(plan.map(({ fingerprint: _fp, ...p }) => p), options.format);
  }
  if (invalid.length) console.error(`Unreadable rotation entries (ignored): ${invalid.join("; ")}`);
  if (team.locked.length) console.error(`Vaults you cannot decrypt (not covered): ${team.locked.join(", ")}`);
}

// ---- set -------------------------------------------------------------------

export interface RotationSetOptions {
  method?: string;
  json?: string;
  format?: string;
  length?: string;
  command?: string;
  url?: string;
  step?: string[];
  consumer?: string[];
  note?: string;
  outputFormat: OutputFormat;
}

export function specFromOptions(options: RotationSetOptions): RotationSpec {
  if (options.json) return parseRotationSpec(options.json);
  if (!options.method) throw new Error("Give --method (random, ssh-keygen, command, manual) or --json '<spec>'.");
  return parseRotationSpec(
    JSON.stringify({
      method: options.method,
      format: options.format,
      length: options.length ? Number(options.length) : undefined,
      command: options.command,
      url: options.url,
      steps: options.step,
      consumers: options.consumer,
      note: options.note
    })
  );
}

export async function teamsRotationSetAction(slug: string, project: string, env: string, key: string, options: RotationSetOptions): Promise<void> {
  const spec = specFromOptions(options);
  const team = await loadTeam(slug);
  const name = vaultName(project, env);
  const v = team.vaults.find((x) => x.name === name);
  if (!v) throw new Error(`Vault ${slug}/${name} not found, or you have no access.`);
  if (!v.secrets.some((s) => s.name === key)) console.error(`Note: ${key} is not in ${name} yet; the instructions are stored anyway.`);
  const entry = rotationEntryName(key);
  const value = JSON.stringify(spec);
  const sealed = await encryptValue(value, await team.dek(v));
  await team.client.putSecrets(v.id, [{ name: entry, ...sealed, fingerprint: fingerprintValue(value) }], []);
  console.error(`Stored rotation instructions for ${key} in ${slug}/${name} (${entry}).`);
  print({ team: slug, vault: name, key, entry, spec }, options.outputFormat);
}

// ---- rotate ----------------------------------------------------------------

export interface RotateKeysOptions {
  approve: boolean;
  setFromStdin?: boolean;
  format: OutputFormat;
}

interface KeyPair {
  privateKey: string;
  publicKey: string;
}

/** A fresh passphrase-less ed25519 key via ssh-keygen; the temp dir is removed either way. */
export function newEd25519(comment: string): KeyPair {
  const dir = mkdtempSync(join(tmpdir(), "logicsrc-rotate-"));
  try {
    const file = join(dir, "key");
    const run = spawnSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", comment, "-f", file], { stdio: ["ignore", "ignore", "pipe"] });
    if (run.status !== 0) throw new Error(`ssh-keygen failed: ${run.stderr?.toString().trim() || run.error?.message || run.status}`);
    return { privateKey: readFileSync(file, "utf8"), publicKey: readFileSync(`${file}.pub`, "utf8").trim() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runCommand(command: string, key: string): string {
  const run = spawnSync("sh", ["-c", command], {
    env: { ...process.env, LOGICSRC_ROTATE_KEY: key },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
    maxBuffer: 1 << 20
  });
  if (run.status !== 0) throw new Error(`rotation command failed (${run.status ?? run.signal}): ${run.stderr?.toString().trim().slice(0, 300)}`);
  const value = run.stdout.toString().trim();
  if (!value) throw new Error("rotation command printed nothing");
  return value;
}

interface Replacement {
  /** New value per target secret name (ssh envelopes keep their own path). */
  valueFor(key: string, oldValue: string): string;
  publicKey?: string;
}

async function makeReplacement(p: PlannedRotation, oldValue: string, stdinValue?: string): Promise<Replacement> {
  if (stdinValue !== undefined) return { valueFor: () => stdinValue };
  const spec = p.spec!;
  switch (spec.method) {
    case "random": {
      const value = generateRandomSecret(spec, oldValue);
      return { valueFor: () => value };
    }
    case "command": {
      const value = runCommand(spec.command!, p.key);
      return { valueFor: () => value };
    }
    case "ssh-keygen": {
      const pair = newEd25519(`logicsrc-rotated-${p.key.toLowerCase()}-${new Date().toISOString().slice(0, 10)}`);
      return {
        publicKey: pair.publicKey,
        valueFor(key, old) {
          // ssh-provider envelopes keep path and mode; raw values become the key text.
          try {
            const file = decodeSshFile(key, old);
            return encodeSshFile({ ...file, body: pair.privateKey });
          } catch {
            return pair.privateKey;
          }
        }
      };
    }
    default:
      throw new Error(`${p.key} is ${spec.method}: not automatic`);
  }
}

export interface RotationResult {
  key: string;
  method: string;
  status: "rotated" | "would-rotate" | "todo" | "failed" | "covered";
  /** Every vault:key holding the old value. */
  vaults?: string[];
  written: string[];
  publicKey?: string;
  steps?: string[];
  url?: string;
  consumers?: string[];
  error?: string;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

export async function teamsRotateKeysAction(slug: string, filter: RotationFilter, options: RotateKeysOptions): Promise<void> {
  const { team, plan, invalid } = await buildPlan(slug, filter);
  if (plan.length === 0) throw new Error("Nothing to rotate: no matching keys. See: logicsrc teams rotation " + slug);

  let stdinValue: string | undefined;
  if (options.setFromStdin) {
    if (plan.length !== 1) throw new Error("--set-from-stdin needs exactly one value: narrow it with --key (and project/env).");
    stdinValue = await readStdin();
    if (!stdinValue) throw new Error("stdin was empty");
  }

  const results: RotationResult[] = [];
  // One value stored under two names is one rotation, not two.
  const handled = new Map<string, string>();
  for (const p of plan) {
    const earlier = handled.get(p.fingerprint);
    if (earlier && (p.automatic || stdinValue !== undefined)) {
      results.push({ key: p.key, method: p.method, status: "covered", written: [], error: `same value as ${earlier}` });
      continue;
    }
    handled.set(p.fingerprint, p.key);
    const base = { key: p.key, method: stdinValue !== undefined ? "set" : p.method, steps: p.spec?.steps, url: p.spec?.url, consumers: p.spec?.consumers };
    const targets = siblings(team, p.fingerprint);
    const where = targets.map((t) => `${t.vault.name}:${t.key}`);
    if (stdinValue === undefined && !p.automatic) {
      results.push({ ...base, status: "todo", vaults: where, written: [], steps: p.spec?.steps ?? ["No instructions: add some with logicsrc teams rotation-set."] });
      continue;
    }
    if (!options.approve) {
      results.push({ ...base, status: "would-rotate", vaults: where, written: [] });
      continue;
    }
    try {
      const first = targets[0]!;
      const oldValue = await readValue(team, first.vault, first.key);
      const replacement = await makeReplacement(p, oldValue, stdinValue);
      const written: string[] = [];
      for (const vault of [...new Set(targets.map((t) => t.vault))]) {
        const upserts = [];
        for (const t of targets.filter((x) => x.vault === vault)) {
          const old = t === first ? oldValue : await readValue(team, vault, t.key);
          const value = replacement.valueFor(t.key, old);
          upserts.push({ name: t.key, ...(await encryptValue(value, await team.dek(vault))), fingerprint: fingerprintValue(value) });
          // The ssh provider keeps the public half beside the private key.
          if (replacement.publicKey) {
            let pubName: string | undefined;
            try {
              pubName = secretNameForPath(`${decodeSshFile(t.key, old).path}.pub`);
            } catch {
              pubName = undefined;
            }
            const pub = pubName && vault.secrets.find((s) => s.name === pubName);
            if (pub) {
              const pubFile = decodeSshFile(pub.name, await readValue(team, vault, pub.name));
              const pubValue = encodeSshFile({ ...pubFile, body: `${replacement.publicKey}\n` });
              upserts.push({ name: pub.name, ...(await encryptValue(pubValue, await team.dek(vault))), fingerprint: fingerprintValue(pubValue) });
            }
          }
        }
        const { applied } = await team.client.putSecrets(vault.id, upserts, []);
        for (const name of applied) written.push(`${vault.name}:${name}`);
      }
      results.push({ ...base, status: "rotated", vaults: where, written, publicKey: replacement.publicKey });
    } catch (err) {
      results.push({ ...base, status: "failed", written: [], error: (err as Error).message });
    }
  }

  if (options.format === "table") {
    printColumns(results.map((r) => ({ key: r.key, method: r.method, status: r.status, vaults: (r.status === "rotated" ? r.written : r.vaults ?? []).length, next: r.status === "todo" ? (r.url ?? "see --format json") : r.error ?? "" })));
    for (const r of results.filter((x) => x.publicKey)) console.error(`\n${r.key} new public key (install it, remove the old one):\n${r.publicKey}`);
    const todo = results.filter((r) => r.status === "todo").length;
    if (!options.approve) console.error(`\nDry run. Apply with --approve.${todo ? ` ${todo} key(s) need a person or agent: --format json lists the steps.` : ""}`);
    else console.error(`\nRestart or redeploy whatever reads the rotated values, then revoke the old ones where they were issued.`);
  } else {
    print(results, options.format);
  }
  if (invalid.length) console.error(`Unreadable rotation entries (ignored): ${invalid.join("; ")}`);
  if (team.locked.length) console.error(`Not covered (no access): ${team.locked.join(", ")}. Copies of these values there stay OLD.`);
  if (results.some((r) => r.status === "failed")) process.exitCode = 1;
}
