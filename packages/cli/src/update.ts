import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const GH_REPO = "profullstack/logicsrc";
export const INSTALL_URL = "https://logicsrc.com/install.sh";

/** Written by install.sh so the CLI can tell which commit it was built from. */
export type InstallManifest = {
  ref: string;
  commit: string | null;
  version: string | null;
  installed_at: string | null;
};

export type RemoteState = { version: string | null; commit: string | null };

export type UpdateStatus = {
  upToDate: boolean;
  /** Why we reached that verdict — shown to the user so it's never a bare claim. */
  reason: string;
  currentVersion: string;
  latestVersion: string | null;
  currentCommit: string | null;
  latestCommit: string | null;
};

/** Install root the installer uses (not the config dir, which is ~/.config/logicsrc). */
export function installHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.LOGICSRC_HOME || join(env.HOME || homedir(), ".logicsrc-cli");
}

/** Git ref this install tracks; install.sh defaults to master. */
export function trackedRef(manifest: InstallManifest | null, env: NodeJS.ProcessEnv = process.env): string {
  return env.LOGICSRC_REF || manifest?.ref || "master";
}

/**
 * The version of the CLI actually running, read from its own package.json
 * rather than hardcoded — a literal here goes stale the moment anyone bumps
 * the package and lies to every user who runs `logicsrc update`.
 */
export function localVersion(moduleUrl: string = import.meta.url): string {
  // dist/update.js and src/update.ts are both one level under the package root.
  const pkgPath = join(dirname(dirname(fileURLToPath(moduleUrl))), "package.json");
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}

/** Parses $LOGICSRC_HOME/install.json; malformed or absent manifests are just "unknown". */
export function parseManifest(raw: string): InstallManifest | null {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const m = parsed as Record<string, unknown>;
  return {
    ref: typeof m.ref === "string" && m.ref ? m.ref : "master",
    commit: typeof m.commit === "string" && m.commit ? m.commit : null,
    version: typeof m.version === "string" && m.version ? m.version : null,
    installed_at: typeof m.installed_at === "string" && m.installed_at ? m.installed_at : null
  };
}

export function readManifest(home: string = installHome()): InstallManifest | null {
  try {
    return parseManifest(readFileSync(join(home, "install.json"), "utf8"));
  } catch {
    return null;
  }
}

/** Semver-ish compare. Returns -1 if a < b, 0 if equal, 1 if a > b. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v.replace(/^v/, "").split("-")[0]!.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * Decides whether an update is available.
 *
 * The installer ships a tarball of a branch, not a tagged release, so the
 * version alone can't answer this: master moves constantly while
 * packages/cli/package.json sits on the same number for months. The commit is
 * the real signal, and the version is only a fallback for installs predating
 * the manifest.
 */
export function updateStatus(local: { version: string; commit: string | null }, remote: RemoteState): UpdateStatus {
  const base = {
    currentVersion: local.version,
    latestVersion: remote.version,
    currentCommit: local.commit,
    latestCommit: remote.commit
  };

  if (remote.version && compareVersions(remote.version, local.version) > 0) {
    return { ...base, upToDate: false, reason: `a newer release is published (${local.version} → ${remote.version})` };
  }
  if (local.commit && remote.commit) {
    const same = local.commit.startsWith(remote.commit) || remote.commit.startsWith(local.commit);
    return same
      ? { ...base, upToDate: true, reason: "installed from the current commit" }
      : { ...base, upToDate: false, reason: `the tracked branch has moved on (${short(local.commit)} → ${short(remote.commit)})` };
  }
  if (!remote.version && !remote.commit) {
    return { ...base, upToDate: true, reason: "could not reach GitHub — assuming no update rather than guessing" };
  }
  if (!local.commit) {
    return {
      ...base,
      upToDate: false,
      reason: "this install predates update tracking, so its commit is unknown — reinstalling is the only way to be sure"
    };
  }
  return { ...base, upToDate: true, reason: "already on the latest published version" };
}

export function short(commit: string): string {
  return commit.slice(0, 7);
}

/** Latest commit sha for a ref. The .sha media type returns it as bare text. */
export async function fetchRemoteCommit(ref: string, repo = GH_REPO): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}`, {
      headers: { accept: "application/vnd.github.sha", "user-agent": "logicsrc-cli" },
      signal: AbortSignal.timeout(10_000)
    });
    if (!res.ok) return null;
    const sha = (await res.text()).trim();
    return /^[0-9a-f]{7,40}$/i.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

/** CLI version declared on the tracked ref. */
export async function fetchRemoteVersion(ref: string, repo = GH_REPO): Promise<string | null> {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(ref)}/packages/cli/package.json`,
      { headers: { "user-agent": "logicsrc-cli" }, signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return null;
    const pkg = JSON.parse(await res.text()) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : null;
  } catch {
    return null;
  }
}

export async function fetchRemoteState(ref: string, repo = GH_REPO): Promise<RemoteState> {
  const [version, commit] = await Promise.all([fetchRemoteVersion(ref, repo), fetchRemoteCommit(ref, repo)]);
  return { version, commit };
}
