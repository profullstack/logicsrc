// Key rotation: the plan per key and the run queue, for the Rotation page, the
// API and the MCP tools.
//
// The server never sees a value (E2E rule). The plan is computed from what it
// does see: key names, value fingerprints and update times, matched against the
// same built-in catalog the CLI uses (@logicsrc/cli's rotation-catalog). A key's
// own `__ROTATE__<KEY>` entry is encrypted, so the page can only say that one
// exists; the CLI, which can decrypt it, is the authority on what it says.
import { all } from "../db.mjs";
import { planRotations, isoTime } from "@logicsrc/cli/dist/rotation-catalog.js";
import { DESKTOP_RECIPES } from "@logicsrc/cli/dist/desktop-recipes.js";

const ROTATE_PREFIX = "__ROTATE__";

/** Vault names split the way the CLI does: <project>--<env>. */
export function splitVaultName(name) {
  const i = String(name).lastIndexOf("--");
  return i > 0 ? { project: name.slice(0, i), env: name.slice(i + 2) } : { project: name, env: "" };
}

/**
 * The rotation plan for a team: one row per distinct (key, value), like
 * `logicsrc teams rotation`. `vaultFilter(name)` limits it to vaults the caller
 * may see (a machine key's scope).
 */
export async function rotationPlan(teamId, { project, env, keys, vaultFilter = () => true } = {}) {
  const rows = (await all(
    `SELECT v.name AS vault, s.name AS key, s.fingerprint, s.updated_at
       FROM credshare_secrets s JOIN credshare_vaults v ON v.id = s.vault_id
      WHERE v.team_id = ?`,
    [teamId]
  )).filter((r) => vaultFilter(r.vault));
  const entries = new Set(rows.filter((r) => r.key.startsWith(ROTATE_PREFIX)).map((r) => `${r.vault}\u0000${r.key.slice(ROTATE_PREFIX.length)}`));
  // Every vault:key per fingerprint across the team (a value pasted under other names counts).
  const byFp = new Map();
  for (const r of rows) {
    if (r.key.startsWith(ROTATE_PREFIX)) continue;
    byFp.set(r.fingerprint, [...(byFp.get(r.fingerprint) ?? []), `${r.vault}:${r.key}`]);
  }
  const inFilter = (vault) => {
    const p = splitVaultName(vault);
    return (!project || p.project === project) && (!env || p.env === env);
  };
  const wanted = keys?.length ? new Set(keys.map((k) => String(k).toUpperCase())) : null;
  const plan = planRotations(
    rows.filter((r) => inFilter(r.vault)).map((r) => ({ vault: r.vault, key: r.key, fingerprint: r.fingerprint, updatedAt: Number(r.updated_at) })),
    new Map()
  ).filter((p) => !wanted || wanted.has(p.key.toUpperCase()));
  return plan.map((p) => {
    const spec = p.spec ?? {};
    const recipe = spec.method === "desktop" ? DESKTOP_RECIPES[spec.recipe] : null;
    const everywhere = byFp.get(p.fingerprint) ?? [];
    return {
      key: p.key,
      method: p.method,
      ...(spec.provider ? { provider: spec.provider } : {}),
      ...(recipe ? { recipe: recipe.id, desktopMode: recipe.mode } : {}),
      automatic: p.automatic,
      owner: spec.owner ?? null,
      family: spec.family ?? null,
      url: spec.url ?? null,
      steps: spec.steps ?? [],
      consumers: spec.consumers ?? [],
      disruptive: spec.disruptive ?? null,
      never: Boolean(spec.never),
      note: spec.note ?? null,
      vaults: p.vaults,
      vaultCount: everywhere.length || p.vaults.length,
      alsoIn: everywhere.filter((vk) => !p.vaults.some((v) => vk === `${v}:${p.key}`)),
      lastRotated: isoTime(p.oldestUpdate),
      // The key's own encrypted instructions override the catalog; only the CLI can read them.
      hasEntry: p.vaults.some((v) => entries.has(`${v}\u0000${p.key}`))
    };
  });
}

// ---- runs ------------------------------------------------------------------------------

const KEY_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const HOST = /^[A-Za-z0-9._@-]{1,100}$/;
const RESULT_STATUSES = new Set(["rotated", "would-rotate", "todo", "failed", "rolled-back", "skipped", "covered", "needs-login", "busy"]);

export class RotationRunError extends Error {}

/** Validate a queue request. Throws RotationRunError with a message for the caller. */
export function parseRunRequest(body = {}) {
  const keys = [...new Set((Array.isArray(body.keys) ? body.keys : String(body.keys ?? "").split(/[\s,]+/)).map((k) => String(k).trim()).filter(Boolean))];
  if (!keys.length) throw new RotationRunError("Pick at least one key to rotate.");
  if (keys.length > 200) throw new RotationRunError("At most 200 keys per run.");
  const bad = keys.find((k) => !KEY_NAME.test(k));
  if (bad) throw new RotationRunError(`Not a key name: ${bad.slice(0, 60)}`);
  const desktop = body.desktop ? String(body.desktop).trim() : "";
  if (desktop && !HOST.test(desktop)) throw new RotationRunError("desktop must be an ssh host alias");
  const name = (v) => (v ? String(v).trim() : "") || null;
  const project = name(body.project);
  const env = name(body.env);
  for (const v of [project, env]) if (v && !/^[a-z0-9][a-z0-9-]{0,62}$/.test(v)) throw new RotationRunError(`Bad project/env name: ${v.slice(0, 60)}`);
  const truthy = (v) => v === true || v === "1" || v === "on" || v === "true";
  return {
    keys,
    project,
    env,
    approve: truthy(body.approve),
    options: {
      ...(desktop ? { desktop } : {}),
      ...(truthy(body.propagate) ? { propagate: true } : {}),
      ...(truthy(body.allowRoll) ? { allowRoll: true } : {})
    }
  };
}

/**
 * Keep only the fields a runner may report, so a buggy or hostile runner cannot
 * park arbitrary text (or a value) in the database: statuses, names, short notes.
 */
export function sanitizeResults(results) {
  if (!Array.isArray(results)) return [];
  const str = (v, n = 300) => (typeof v === "string" ? v.slice(0, n) : undefined);
  const names = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 100).map((x) => x.slice(0, 200)) : undefined);
  return results.slice(0, 500).map((r) => ({
    key: str(r?.key, 128) ?? "?",
    method: str(r?.method, 64),
    status: RESULT_STATUSES.has(r?.status) ? r.status : "failed",
    vaults: names(r?.vaults),
    written: names(r?.written),
    sites: Array.isArray(r?.sites) ? r.sites.slice(0, 50).map((s) => ({ site: str(s?.site, 120), ok: typeof s?.ok === "boolean" ? s.ok : undefined, health: str(s?.health, 120) })) : undefined,
    note: str(r?.note),
    error: str(r?.error)
  }));
}

export function runRow(r) {
  const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
  return {
    id: r.id,
    keys: parse(r.keys, []),
    project: r.project ?? null,
    env: r.env ?? null,
    approve: Boolean(Number(r.approve)),
    options: parse(r.options, {}),
    status: r.status,
    requestedBy: r.requested_by_email ?? r.requested_by,
    claimedBy: r.claimed_by ?? null,
    claimedAt: r.claimed_at ? Number(r.claimed_at) : null,
    finishedAt: r.finished_at ? Number(r.finished_at) : null,
    createdAt: Number(r.created_at),
    summary: r.summary ?? null,
    results: parse(r.results, null)
  };
}

/** "3 rotated, 1 todo" from a result list. */
export function summarize(results) {
  const counts = {};
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(", ") || "nothing";
}
