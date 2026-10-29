import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";

/**
 * After a rotation is written to the vaults, the running sites still hold the
 * old value in their env files. This finds them by VALUE (not key name, so a
 * renamed copy is found too), rewrites them with a backup, restarts each site
 * with its own deploy.env, and health-checks it.
 *
 * Layout (dev2): <root>/<site>/{app.env,deploy.env,docker-compose.app.yml,
 * deploy-app.sh,.deploy-state}. A site may ship `rotate-restart.sh` to restart
 * itself differently. Values are never printed; reports name files and keys.
 */

export interface Replacement {
  oldValue: string;
  newValue: string;
}

export interface EnvHit {
  site: string;
  dir: string;
  file: string;
  keys: string[];
  /** A NEXT_PUBLIC_* value changed: the image has to be rebuilt, not just recreated. */
  needsBuild: boolean;
}

const ENV_FILE = /^(app|deploy|prober|worker|web|api)?\.?env$|^[a-z0-9_-]+\.env$/i;
const BACKUP = /bak|orig|\.old$|\.example$|\.sample$|\.tmp$/i;
/** Shorter values could collide with unrelated text. */
const MIN_MATCH = 12;

export function envFilesIn(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((n) => ENV_FILE.test(n) && !BACKUP.test(n)).map((n) => join(dir, n)).filter((f) => {
    try {
      return statSync(f).isFile();
    } catch {
      return false;
    }
  });
}

function splitLine(line: string): { key: string; value: string; quote: string } | null {
  const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
  if (!m) return null;
  let value = m[2]!;
  let quote = "";
  if ((value.startsWith('"') && value.endsWith('"') && value.length >= 2) || (value.startsWith("'") && value.endsWith("'") && value.length >= 2)) {
    quote = value[0]!;
    value = value.slice(1, -1);
  }
  return { key: m[1]!, value, quote };
}

/** The new value for a line, or null when the line does not hold an old value. Connection strings match on the embedded password. */
export function replaceInValue(value: string, reps: Replacement[]): string | null {
  for (const r of reps) {
    if (r.oldValue.length < MIN_MATCH) continue;
    if (value === r.oldValue) return r.newValue;
  }
  for (const r of reps) {
    if (r.oldValue.length < MIN_MATCH) continue;
    const enc = encodeURIComponent(r.oldValue);
    for (const old of new Set([r.oldValue, enc])) {
      const at = value.indexOf(`:${old}@`);
      if (at !== -1) return value.slice(0, at + 1) + (old === enc ? encodeURIComponent(r.newValue) : r.newValue) + value.slice(at + 1 + old.length);
    }
  }
  return null;
}

/** Every env file under root/<site>/ holding one of the old values. */
export function findConsumers(root: string, reps: Replacement[]): EnvHit[] {
  const hits: EnvHit[] = [];
  let sites: string[];
  try {
    sites = readdirSync(root);
  } catch {
    return [];
  }
  for (const site of sites.sort()) {
    const dir = join(root, site);
    for (const file of envFilesIn(dir)) {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      if (!reps.some((r) => r.oldValue.length >= MIN_MATCH && (text.includes(r.oldValue) || text.includes(encodeURIComponent(r.oldValue))))) continue;
      const keys: string[] = [];
      for (const line of text.split("\n")) {
        const kv = splitLine(line);
        if (kv && replaceInValue(kv.value, reps) !== null) keys.push(kv.key);
      }
      if (keys.length) hits.push({ site, dir, file, keys, needsBuild: keys.some((k) => /^NEXT_PUBLIC_|^VITE_|^EXPO_PUBLIC_/.test(k)) });
    }
  }
  return hits;
}

/** Other places a value can hide that we do not rewrite: crontab, scripts. A hit there blocks unattended rotation. */
export function strayCopies(paths: string[], reps: Replacement[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    let text = "";
    try {
      text = readFileSync(p, "utf8");
    } catch {
      continue;
    }
    if (reps.some((r) => r.oldValue.length >= MIN_MATCH && text.includes(r.oldValue))) out.push(p);
  }
  return out;
}

/** Rewrite one env file in place (same mode), after copying it to <file>.bak-rotate-<stamp>. */
export function rewriteEnvFile(file: string, reps: Replacement[], stamp: string): { backup: string; keys: string[] } {
  const text = readFileSync(file, "utf8");
  const keys: string[] = [];
  const out = text
    .split("\n")
    .map((line) => {
      const kv = splitLine(line);
      if (!kv) return line;
      const next = replaceInValue(kv.value, reps);
      if (next === null) return line;
      keys.push(kv.key);
      const eq = line.indexOf("=");
      return `${line.slice(0, eq + 1)}${kv.quote}${next}${kv.quote}`;
    })
    .join("\n");
  const mode = statSync(file).mode & 0o777;
  let backup = `${file}.bak-rotate-${stamp}`;
  for (let i = 2; existsSync(backup); i++) backup = `${file}.bak-rotate-${stamp}-${i}`;
  copyFileSync(file, backup);
  chmodSync(backup, 0o600);
  const tmp = `${file}.rotate-tmp`;
  writeFileSync(tmp, out, { mode });
  chmodSync(tmp, mode);
  renameSync(tmp, file);
  return { backup, keys };
}

export function restoreBackup(file: string, backup: string): void {
  const mode = statSync(file).mode & 0o777;
  copyFileSync(backup, file);
  chmodSync(file, mode);
}

export function readEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const kv = splitLine(line);
      if (kv) out[kv.key] = kv.value;
    }
  } catch {
    /* missing */
  }
  return out;
}

export interface RestartResult {
  site: string;
  ok: boolean;
  detail: string;
}

export interface SiteOps {
  /** Restart a site so it reads its env files again. */
  restart(dir: string, site: string, needsBuild: boolean): Promise<RestartResult>;
  /** Healthy = local port and public URL answer below 500. */
  health(dir: string, site: string): Promise<RestartResult>;
}

function sh(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ code: number | null; tail: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let tail = "";
    const keep = (b: Buffer) => {
      tail = (tail + b.toString()).slice(-600);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const t = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ code, tail });
    });
    child.on("error", (e) => {
      clearTimeout(t);
      resolve({ code: -1, tail: String(e.message) });
    });
  });
}

async function status(url: string): Promise<number> {
  try {
    const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    return r.status;
  } catch {
    return 0;
  }
}

/** dev2: recreate with the site's own deploy.env through deploy-gate (3 slots); rebuild via deploy-app.sh when a build-time value changed. */
export const dev2Ops: SiteOps = {
  async restart(dir, site, needsBuild) {
    const gate = [join(process.env.HOME ?? "", ".local/bin/deploy-gate"), "/usr/local/bin/deploy-gate"].find((g) => existsSync(g));
    if (existsSync(join(dir, "rotate-restart.sh"))) {
      const r = await sh(join(dir, "rotate-restart.sh"), [], dir, 900_000);
      return { site, ok: r.code === 0, detail: r.code === 0 ? "rotate-restart.sh" : `rotate-restart.sh exit ${r.code}: ${r.tail}` };
    }
    if (needsBuild) {
      const sha = readEnv(join(dir, ".deploy-state")).DEPLOYED_SHA;
      if (!sha || !existsSync(join(dir, "deploy-app.sh"))) return { site, ok: false, detail: "build-time value changed and there is no deploy-app.sh/.deploy-state to rebuild with" };
      const r = await sh(join(dir, "deploy-app.sh"), [sha], dir, 1_800_000);
      return { site, ok: r.code === 0, detail: r.code === 0 ? `rebuilt ${sha.slice(0, 8)}` : `deploy-app.sh exit ${r.code}: ${r.tail}` };
    }
    const compose = ["docker-compose.app.yml", "docker-compose.yml", "compose.yml"].find((f) => existsSync(join(dir, f)));
    if (!compose) return { site, ok: false, detail: "no compose file: restart it by hand" };
    // Never without the site's deploy.env: compose would drop APP_PORT and friends.
    if (!existsSync(join(dir, "deploy.env"))) return { site, ok: false, detail: "no deploy.env: refusing a bare docker compose up" };
    const args = ["compose", "-f", compose, "--env-file", "deploy.env", "up", "-d", "--no-build", "--force-recreate"];
    const r = gate ? await sh(gate, ["--name", site, "--", "docker", ...args], dir, 900_000) : await sh("docker", args, dir, 900_000);
    return { site, ok: r.code === 0, detail: r.code === 0 ? "recreated" : `compose exit ${r.code}: ${r.tail}` };
  },
  async health(dir, site) {
    const port = readEnv(join(dir, "deploy.env")).APP_PORT;
    const deadline = Date.now() + 180_000;
    let local = 0;
    if (port) {
      while (Date.now() < deadline) {
        local = await status(`http://127.0.0.1:${port}/`);
        if (local > 0 && local < 500) break;
        await new Promise((r) => setTimeout(r, 5000));
      }
      if (!(local > 0 && local < 500)) return { site, ok: false, detail: `127.0.0.1:${port} answered ${local || "nothing"}` };
    }
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(site)) {
      let pub = 0;
      while (Date.now() < deadline) {
        pub = await status(`https://${site}/`);
        if (pub > 0 && pub < 500) break;
        await new Promise((r) => setTimeout(r, 5000));
      }
      if (!(pub > 0 && pub < 500)) return { site, ok: false, detail: `https://${site}/ answered ${pub || "nothing"}` };
      return { site, ok: true, detail: `local ${local || "-"}, public ${pub}` };
    }
    return { site, ok: Boolean(port), detail: port ? `local ${local}` : "no APP_PORT and not a hostname: health unknown" };
  }
};

/** Run fn over items, at most `limit` at a time (the fleet rule is 3). */
export async function inBatches<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  return out;
}
