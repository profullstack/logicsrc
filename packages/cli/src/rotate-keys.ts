import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
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
import { ROTATORS, defaultRun, rewriteUrls, type Minted, type ProviderRotator, type RotatorContext } from "./rotators.js";
import { dev2Ops, findConsumers, inBatches, restoreBackup, rewriteEnvFile, type SiteOps } from "./propagate.js";

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
        family: p.spec?.family ?? "",
        owner: p.spec?.owner ?? "",
        source: p.source,
        vaults: p.vaults.length + ((p as { alsoIn?: string[] }).alsoIn?.length ?? 0),
        since: String(p.oldestUpdate).slice(0, 10),
        note: p.spec?.note ?? (p.source === "none" ? "no instructions: logicsrc teams rotation-set" : "")
      }))
    );
    const auto = plan.filter((p) => p.automatic).length;
    const unknown = plan.filter((p) => p.method === "unknown").length;
    const never = plan.filter((p) => p.spec?.never).length;
    console.error(`\n${plan.length} value(s): ${auto} automatic, ${plan.length - auto - unknown} manual (${never} never automated), ${unknown} without instructions. Steps per key: --format json.`);
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
  /** Rewrite + restart + health-check consumer sites under this root (dev2: ~/www). */
  propagate?: string;
  /** Unattended mode: only methods that are automatic, non-disruptive, and two-phase (or a plain random secret with known consumers). */
  scheduled?: boolean;
  /** Stop after this many live rotations. */
  max?: number;
  /** Write the JSON results (never values) to this file as well. */
  report?: string;
  /** Sites never rewritten or restarted: a value they hold is skipped. */
  excludeSites?: string[];
  /** Unattended mode: skip values read by more sites than this (default 5). */
  maxSites?: number;
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

export interface ConsumerReport {
  site: string;
  file: string;
  keys: string[];
  backup?: string;
  restart?: string;
  health?: string;
  ok?: boolean;
}

export interface RotationResult {
  key: string;
  method: string;
  status: "rotated" | "would-rotate" | "todo" | "failed" | "rolled-back" | "skipped" | "covered";
  /** Every vault:key holding the old value. */
  vaults?: string[];
  written: string[];
  publicKey?: string;
  steps?: string[];
  url?: string;
  consumers?: string[];
  /** Sites found holding the value (with --propagate) and what happened to each. */
  sites?: ConsumerReport[];
  family?: string;
  owner?: string;
  never?: boolean;
  disruptive?: string;
  note?: string;
  error?: string;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

/** Why the unattended job leaves this one to a person, or null when it may rotate it. */
export function scheduledBlock(p: PlannedRotation): string | null {
  const spec = p.spec;
  if (!spec || !p.automatic) return "needs a person";
  if (spec.never) return "never automated";
  if (spec.disruptive) return `disruptive: ${spec.disruptive}`;
  if (spec.method === "random") return null;
  if (spec.method === "provider") {
    const r = ROTATORS[spec.provider ?? ""];
    if (!r) return `unknown rotator ${spec.provider}`;
    return r.overlap ? null : `${r.title} has no overlap window`;
  }
  return `${spec.method} needs a person (public key install / command review)`;
}

const STRAY_PLACES = (): string[] => {
  const home = homedir();
  const dirs = [join(home, ".local/bin"), join(home, "scripts/bin")];
  const files: string[] = [];
  for (const d of dirs) {
    try {
      for (const n of readdirSync(d)) files.push(join(d, n));
    } catch {
      /* missing */
    }
  }
  return files;
};

/** The crontab and small scripts under ~/.local/bin and ~/scripts/bin: places a secret hides outside env files. */
function defaultStrayText(): string[] {
  const out = [crontabText()];
  for (const f of STRAY_PLACES()) {
    try {
      if (statSync(f).isFile() && statSync(f).size < 1 << 20) out.push(readFileSync(f, "utf8"));
    } catch {
      /* unreadable */
    }
  }
  return out;
}

function crontabText(): string {
  const r = spawnSync("crontab", ["-l"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout : "";
}

export interface RotateDeps {
  ops?: SiteOps;
  fetch?: typeof fetch;
  now?: Date;
  env?: Record<string, string | undefined>;
  /** Extra text to search for stray copies (tests). */
  strayText?: () => string[];
}

interface VaultWrite {
  vault: VaultState;
  name: string;
  oldValue: string;
  newValue: string;
}

async function writeValues(team: Loaded, writes: VaultWrite[], which: "newValue" | "oldValue"): Promise<string[]> {
  const written: string[] = [];
  for (const vault of [...new Set(writes.map((w) => w.vault))]) {
    const upserts = [];
    for (const w of writes.filter((x) => x.vault === vault)) {
      const value = w[which];
      upserts.push({ name: w.name, ...(await encryptValue(value, await team.dek(vault))), fingerprint: fingerprintValue(value) });
    }
    const { applied } = await team.client.putSecrets(vault.id, upserts, []);
    for (const name of applied) written.push(`${vault.name}:${name}`);
  }
  return written;
}

async function vaultValues(team: Loaded, v: VaultState): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const s of v.secrets) {
    if (isRotationEntry(s.name) || s.fingerprint === EMPTY_FINGERPRINT) continue;
    out[s.name] = await readValue(team, v, s.name);
  }
  return out;
}

/**
 * Rotate one value with a new one we can make ourselves (random, provider):
 * mint -> vaults -> consumers -> health -> revoke, with a full rollback when
 * any step after mint fails.
 */
async function rotateTwoPhase(
  team: Loaded,
  p: PlannedRotation,
  targets: Array<{ vault: VaultState; key: string }>,
  base: RotationResult,
  options: RotateKeysOptions,
  deps: Required<Pick<RotateDeps, "ops" | "fetch" | "now" | "env">> & { strayText: () => string[] }
): Promise<RotationResult> {
  const spec = p.spec!;
  const first = targets[0]!;
  const oldValue = await readValue(team, first.vault, first.key);
  const firstValues = await vaultValues(team, first.vault);
  const stamp = deps.now.toISOString().slice(0, 10).replace(/-/g, "");

  // Who reads it today. Found by value, so renamed copies count too.
  const probe = [{ oldValue, newValue: oldValue }];
  const hits = options.propagate ? findConsumers(options.propagate, probe) : [];
  const sites: ConsumerReport[] = hits.map((h) => ({ site: h.site, file: h.file, keys: h.keys }));
  const strays = deps.strayText().some((t) => oldValue.length >= 12 && t.includes(oldValue));
  const excluded = hits.filter((h) => options.excludeSites?.includes(h.site));
  if (excluded.length) return { ...base, status: "skipped", sites, error: `excluded site holds it: ${[...new Set(excluded.map((h) => h.site))].join(", ")}` };
  if (options.scheduled) {
    const n = new Set(hits.map((h) => h.site)).size;
    if (n > (options.maxSites ?? 5)) return { ...base, status: "skipped", sites, error: `too many consumers for unattended rotation: ${n} sites (run it by hand with --propagate)` };
    if (!options.propagate) return { ...base, status: "skipped", sites, error: "unattended rotation needs --propagate" };
    if (!hits.length) return { ...base, status: "skipped", sites, error: "no consumer found on this box: rotate by hand where it is used" };
    if (strays) return { ...base, status: "skipped", sites, error: "also in the crontab or a script under ~/.local/bin or ~/scripts/bin: update those by hand" };
  }
  if (spec.method === "provider") {
    const r = ROTATORS[spec.provider ?? ""];
    if (!r) return { ...base, status: "todo", sites, error: `unknown rotator ${spec.provider}` };
    const why = await r.preflight({ key: p.key, oldValue, vaultValues: firstValues, state: spec.state ?? {}, env: deps.env, fetch: deps.fetch, run: defaultRun, now: deps.now });
    if (why) return { ...base, status: "todo", sites, error: why };
  }
  if (!options.approve) return { ...base, status: "would-rotate", sites };
  // A site that is already down would make the rotation look guilty.
  const siteDirs = [...new Map(hits.map((h) => [h.dir, h])).values()];
  const before = await inBatches(siteDirs, 3, (h) => deps.ops.health(h.dir, h.site));
  const sick = before.filter((b) => !b.ok);
  if (sick.length) return { ...base, status: "skipped", sites, error: `unhealthy before rotation: ${sick.map((s) => `${s.site} (${s.detail})`).join(", ")}` };

  let rotator: ProviderRotator | undefined;
  let minted: Minted;
  if (spec.method === "provider") {
    rotator = ROTATORS[spec.provider ?? ""];
    if (!rotator) return { ...base, status: "todo", error: `unknown rotator ${spec.provider}` };
    const ctx: RotatorContext = { key: p.key, oldValue, vaultValues: firstValues, state: spec.state ?? {}, env: deps.env, fetch: deps.fetch, run: defaultRun, now: deps.now };
    minted = await rotator.mint(ctx);
  } else {
    const replacement = await makeReplacement(p, oldValue);
    const value = replacement.valueFor(first.key, oldValue);
    minted = { value, revokeOld: async () => undefined, rollback: async () => undefined };
  }

  // Vault writes: the value itself everywhere, plus companions (public halves, connection strings) where they live.
  const writes: VaultWrite[] = [];
  const companionReps: Array<{ oldValue: string; newValue: string }> = [];
  for (const vault of [...new Set(targets.map((t) => t.vault))]) {
    const values = vault === first.vault ? firstValues : await vaultValues(team, vault);
    for (const t of targets.filter((x) => x.vault === vault)) writes.push({ vault, name: t.key, oldValue: values[t.key] ?? oldValue, newValue: minted.value });
    const extra: Record<string, string> = { ...rewriteUrls(values, oldValue, minted.value) };
    for (const [name, v] of Object.entries(minted.companions ?? {})) if (name in values && !rewriteUrls({ [name]: values[name]! }, oldValue, minted.value)[name]) extra[name] = v;
    for (const [name, v] of Object.entries(extra)) {
      if (writes.some((w) => w.vault === vault && w.name === name)) continue;
      writes.push({ vault, name, oldValue: values[name]!, newValue: v });
      if (values[name] !== v && values[name]!.length >= 12 && !values[name]!.includes(oldValue)) companionReps.push({ oldValue: values[name]!, newValue: v });
    }
  }

  const undo = async (why: string, rewritten: Array<{ file: string; backup: string; dir: string; site: string }>): Promise<RotationResult> => {
    const notes: string[] = [why];
    try {
      await writeValues(team, writes, "oldValue");
    } catch (err) {
      notes.push(`VAULTS NOT RESTORED: ${(err as Error).message}`);
    }
    for (const r of rewritten) restoreBackup(r.file, r.backup);
    const restarted = await inBatches([...new Map(rewritten.map((r) => [r.dir, r])).values()], 3, (r) => deps.ops.restart(r.dir, r.site, false));
    for (const r of restarted.filter((x) => !x.ok)) notes.push(`${r.site} did not come back on the old value: ${r.detail}`);
    const rb = await minted.rollback().catch((e: Error) => e.message);
    if (rb) notes.push(rb);
    return { ...base, status: "rolled-back", sites, error: notes.join("; ") };
  };

  let written: string[];
  try {
    written = await writeValues(team, writes, "newValue");
  } catch (err) {
    return undo(`vault write failed: ${(err as Error).message}`, []);
  }

  // Consumers: rewrite env files (with backups), restart 3 at a time, health-check.
  const reps = [{ oldValue, newValue: minted.value }, ...companionReps];
  const rewritten: Array<{ file: string; backup: string; dir: string; site: string }> = [];
  if (options.propagate) {
    const now = findConsumers(options.propagate, reps);
    for (const h of now) {
      const { backup } = rewriteEnvFile(h.file, reps, stamp);
      rewritten.push({ file: h.file, backup, dir: h.dir, site: h.site });
      const rep = sites.find((s) => s.file === h.file);
      if (rep) rep.backup = backup;
      else sites.push({ site: h.site, file: h.file, keys: h.keys, backup });
    }
    const dirs = [...new Map(now.map((h) => [h.dir, { ...h, needsBuild: now.some((x) => x.dir === h.dir && x.needsBuild) }])).values()];
    const results = await inBatches(dirs, 3, async (h) => {
      const r = await deps.ops.restart(h.dir, h.site, h.needsBuild);
      const hl = r.ok ? await deps.ops.health(h.dir, h.site) : { site: h.site, ok: false, detail: "not restarted" };
      for (const s of sites.filter((x) => x.site === h.site)) Object.assign(s, { restart: r.detail, health: hl.detail, ok: r.ok && hl.ok });
      return r.ok && hl.ok;
    });
    if (results.some((ok) => !ok)) return undo("a consumer failed after the switch; rolled back", rewritten);
  }

  const revokeNote = await minted.revokeOld().catch((e: Error) => `revoking the old credential failed (it is still live): ${e.message}`);
  // Remember provider ids for next time (the old key's id is what revokeOld needs).
  if (minted.state && Object.keys(minted.state).length) {
    const entry = rotationEntryName(first.key);
    const value = JSON.stringify({ ...spec, state: minted.state });
    await team.client.putSecrets(first.vault.id, [{ name: entry, ...(await encryptValue(value, await team.dek(first.vault))), fingerprint: fingerprintValue(value) }], []);
  }
  return { ...base, status: "rotated", written, sites, ...(revokeNote ? { note: revokeNote } : {}) };
}

export async function teamsRotateKeysAction(slug: string, filter: RotationFilter, options: RotateKeysOptions, depsIn: RotateDeps = {}): Promise<RotationResult[]> {
  const { team, plan, invalid } = await buildPlan(slug, filter);
  if (plan.length === 0) throw new Error("Nothing to rotate: no matching keys. See: logicsrc teams rotation " + slug);
  const deps = {
    ops: depsIn.ops ?? dev2Ops,
    fetch: depsIn.fetch ?? fetch,
    now: depsIn.now ?? new Date(),
    env: depsIn.env ?? process.env,
    strayText: depsIn.strayText ?? defaultStrayText
  };

  let stdinValue: string | undefined;
  if (options.setFromStdin) {
    if (plan.length !== 1) throw new Error("--set-from-stdin needs exactly one value: narrow it with --key (and project/env).");
    stdinValue = await readStdin();
    if (!stdinValue) throw new Error("stdin was empty");
  }

  const results: RotationResult[] = [];
  // One value stored under two names is one rotation, not two.
  const handled = new Map<string, string>();
  let live = 0;
  for (const p of plan) {
    const earlier = handled.get(p.fingerprint);
    if (earlier && (p.automatic || stdinValue !== undefined)) {
      results.push({ key: p.key, method: p.method, status: "covered", written: [], error: `same value as ${earlier}` });
      continue;
    }
    handled.set(p.fingerprint, p.key);
    const spec = p.spec;
    const base: RotationResult = {
      key: p.key,
      method: stdinValue !== undefined ? "set" : spec?.method === "provider" ? `provider:${spec.provider}` : p.method,
      status: "todo",
      written: [],
      steps: spec?.steps,
      url: spec?.url,
      consumers: spec?.consumers,
      family: spec?.family,
      owner: spec?.owner ?? (spec?.method === "manual" ? "agent" : undefined),
      never: spec?.never,
      disruptive: spec?.disruptive,
      note: spec?.note
    };
    const targets = siblings(team, p.fingerprint);
    base.vaults = targets.map((t) => `${t.vault.name}:${t.key}`);
    if (stdinValue === undefined && !p.automatic) {
      results.push({ ...base, status: "todo", steps: spec?.steps ?? ["No instructions: add some with logicsrc teams rotation-set."] });
      continue;
    }
    if (options.scheduled && stdinValue === undefined) {
      const why = scheduledBlock(p);
      if (why) {
        results.push({ ...base, status: "skipped", error: why });
        continue;
      }
    }
    // A plain dry run only plans; with --propagate or --scheduled it also runs the read-only checks.
    if (!options.approve && !options.propagate && !options.scheduled) {
      results.push({ ...base, status: "would-rotate" });
      continue;
    }
    if (options.approve && options.max !== undefined && live >= options.max) {
      results.push({ ...base, status: "skipped", error: `--max ${options.max} reached` });
      continue;
    }
    try {
      if (stdinValue === undefined && (spec?.method === "random" || spec?.method === "provider")) {
        const r = await rotateTwoPhase(team, p, targets, base, options, deps);
        if (r.status === "rotated" || r.status === "rolled-back") live++;
        results.push(r);
        continue;
      }
      // ssh-keygen, command and --set-from-stdin: vault write only, consumers by hand.
      if (!options.approve) {
        results.push({ ...base, status: "would-rotate" });
        continue;
      }
      live++;
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
      results.push({ ...base, status: "rotated", written, publicKey: replacement.publicKey });
    } catch (err) {
      results.push({ ...base, status: "failed", written: [], error: (err as Error).message });
    }
  }

  if (options.report) {
    writeFileSync(options.report, JSON.stringify({ team: slug, at: deps.now.toISOString(), approve: options.approve, scheduled: Boolean(options.scheduled), results, locked: team.locked }, null, 2), { mode: 0o600 });
    chmodSync(options.report, 0o600);
  }
  if (options.format === "table") {
    printColumns(
      results.map((r) => ({
        key: r.key,
        method: r.method,
        status: r.status,
        vaults: (r.status === "rotated" ? r.written : r.vaults ?? []).length,
        sites: r.sites?.length ?? "",
        next: r.status === "todo" ? (r.error ?? r.url ?? "see --format json") : r.error ?? r.note ?? ""
      }))
    );
    for (const r of results.filter((x) => x.publicKey)) console.error(`\n${r.key} new public key (install it, remove the old one):\n${r.publicKey}`);
    const todo = results.filter((r) => r.status === "todo").length;
    if (!options.approve) console.error(`\nDry run. Apply with --approve.${todo ? ` ${todo} key(s) need a person or agent: --format json lists the steps.` : ""}`);
    else if (!options.propagate) console.error(`\nRestart or redeploy whatever reads the rotated values (or pass --propagate ~/www), then revoke the old ones where they were issued.`);
  } else {
    print(results, options.format);
  }
  if (invalid.length) console.error(`Unreadable rotation entries (ignored): ${invalid.join("; ")}`);
  if (team.locked.length) console.error(`Not covered (no access): ${team.locked.join(", ")}. Copies of these values there stay OLD.`);
  if (results.some((r) => r.status === "failed" || r.status === "rolled-back")) process.exitCode = 1;
  return results;
}
