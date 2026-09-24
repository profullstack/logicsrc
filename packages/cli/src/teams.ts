import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { hostname } from "node:os";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { chmodSync, writeFileSync } from "node:fs";
import { OTHER_CATEGORY, SECRET_CATEGORIES, categorizeSecret, csvLine, parseCategories } from "@logicsrc/opencreds";
import {
  TeamClient,
  TeamApiError,
  loadOrCreateIdentity,
  readIdentity,
  updateIdentity,
  requireAuth,
  defaultApiUrl,
  resolveApiUrl,
  createCredentialEngine,
  identityPath,
  unwrapVaultKey,
  wrapVaultKey,
  decryptValue,
  type CredentialEndpoint,
  type RemoteVault
} from "@logicsrc/plugin-credential-sharing";
import { print, printColumns, type OutputFormat } from "./format.js";
import { linkedDirectory, requireSecretsLink, writeSecretsLink } from "./secrets-link.js";

/**
 * `logicsrc login` + `logicsrc teams …` — the team credential-sharing surface.
 * Secrets are end-to-end encrypted: the server (commandboard-api /api/credshare)
 * only ever sees ciphertext and per-member wrapped vault keys.
 */

export function authedClient(): { client: TeamClient; identity: ReturnType<typeof requireAuth> } {
  const identity = requireAuth();
  const client = new TeamClient({ apiUrl: resolveApiUrl(identity), token: identity.apiToken });
  return { client, identity };
}

const b64url = (buf: Buffer): string => buf.toString("base64url");

/**
 * Can a browser on THIS machine reach a loopback server on THIS machine?
 * Over SSH (or in a container/CI) it can't — the human's browser is elsewhere,
 * so its 127.0.0.1 is a different machine and the callback never arrives.
 */
function hasLocalBrowser(): boolean {
  if (process.env.SSH_CONNECTION || process.env.SSH_TTY || process.env.SSH_CLIENT) return false;
  if (process.env.CI) return false;
  if (process.platform === "darwin" || process.platform === "win32") return true;
  return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : ["xdg-open", [url]];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* print fallback below */
  }
}

const DONE_PAGE = (msg: string) =>
  `<!doctype html><meta charset=utf-8><body style="background:#f6f7f4;color:#101418;font-family:system-ui,sans-serif;text-align:center;padding:16vh 24px"><h1 style="color:#0a7d59">${msg}</h1><p>Return to your terminal — you can close this tab.</p></body>`;

/** Browser OAuth-PKCE loopback login against the LogicSRC app → an lsk_ token. */
function loopbackLogin(apiUrl: string, timeoutMs = 180000): Promise<{ token: string; email: string | null; userId?: string }> {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(16));
  const base = apiUrl.replace(/\/+$/, "");

  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      try {
        const code = url.searchParams.get("code");
        if (url.searchParams.get("error")) throw new Error(`authorization denied (${url.searchParams.get("error")})`);
        if (!code || url.searchParams.get("state") !== state) throw new Error("bad authorization response (state mismatch)");
        const tokRes = await fetch(`${base}/cli/token`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code, code_verifier: verifier })
        });
        if (!tokRes.ok) throw new Error(`token exchange failed (${tokRes.status})`);
        const tok = (await tokRes.json()) as { access_token: string; user?: { email?: string; id?: string } };
        res.writeHead(200, { "content-type": "text/html" }).end(DONE_PAGE("You're in."));
        server.close();
        resolve({ token: tok.access_token, email: tok.user?.email ?? null, userId: tok.user?.id });
      } catch (error) {
        res.writeHead(400, { "content-type": "text/html" }).end(DONE_PAGE("Login failed — check the terminal."));
        server.close();
        reject(error);
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      const authUrl = `${base}/cli/authorize?` + new URLSearchParams({
        redirect_uri: `http://127.0.0.1:${port}/callback`,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        name: `logicsrc cli @ ${hostname()}`
      });
      console.error("\n🔑 Opening your browser to authorize the LogicSRC CLI…");
      console.error(`   If it doesn't open, visit:\n   ${authUrl}\n`);
      openBrowser(authUrl);
    });

    const timer = setTimeout(() => { server.close(); reject(new Error("login timed out — run `logicsrc login` again")); }, timeoutMs);
    server.on("close", () => clearTimeout(timer));
  });
}

interface LoginResult { token: string; email: string | null; userId?: string }

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Device-authorization login — for machines with no browser of their own.
 * We print a short code; the human approves it from any browser, anywhere.
 */
async function deviceLogin(apiUrl: string, timeoutMs = 600000): Promise<LoginResult> {
  const base = apiUrl.replace(/\/+$/, "");
  const startRes = await fetch(`${base}/cli/device/code`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: `logicsrc cli @ ${hostname()}` })
  });
  if (startRes.status === 404) throw new DeviceFlowUnsupported();
  if (!startRes.ok) throw new Error(`could not start device login (${startRes.status})`);
  const start = (await startRes.json()) as {
    device_code: string; user_code: string; verification_uri: string;
    verification_uri_complete?: string; expires_in?: number; interval?: number;
  };

  console.error("\n🔑 Authorize the LogicSRC CLI from any browser:");
  console.error(`   1. open ${start.verification_uri}`);
  console.error(`   2. enter the code: ${start.user_code}\n`);
  if (hasLocalBrowser() && start.verification_uri_complete) openBrowser(start.verification_uri_complete);

  let interval = Math.max(1, start.interval ?? 5);
  const deadline = Date.now() + Math.min(timeoutMs, (start.expires_in ?? 600) * 1000);
  process.stderr.write("   waiting for approval…");
  try {
    while (Date.now() < deadline) {
      await sleep(interval * 1000);
      const res = await fetch(`${base}/cli/device/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ device_code: start.device_code })
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string; interval?: number; access_token?: string; user?: { email?: string; id?: string };
      };
      if (res.ok && body.access_token) {
        return { token: body.access_token, email: body.user?.email ?? null, userId: body.user?.id };
      }
      if (body.error === "authorization_pending") { process.stderr.write("."); continue; }
      if (body.error === "slow_down") { interval = Math.max(interval + 2, body.interval ?? interval); continue; }
      if (body.error === "access_denied") throw new Error("authorization was denied in the browser");
      if (body.error === "expired_token") throw new Error("the code expired — run `logicsrc login` again");
      throw new Error(`device login failed (${body.error || res.status})`);
    }
  } finally {
    process.stderr.write("\n");
  }
  throw new Error("login timed out — run `logicsrc login` again");
}

/** Thrown when the server predates the device flow, so we can fall back. */
class DeviceFlowUnsupported extends Error {
  constructor() { super("device flow not supported by this server"); }
}

// A vault is addressed as <project> <env>, so one team can hold web/prod,
// web/staging and api/prod side by side. The split lives entirely in the CLI —
// the server stores a single opaque vault name — so this join and
// splitVaultName() below are the only places that know about the convention.
//
// The separator is "--", NOT "/". The server slugifies vault names through
// /^[a-z0-9][a-z0-9-]{0,62}$/ and rejects anything else, so a "/" join is
// refused outright with "Vault name must be lowercase letters, numbers, and
// dashes." A double dash is inside the allowed character set and still splits
// unambiguously, because neither half may contain one.
export const VAULT_SEP = "--";

// Mirrors the server's slugify(). Enforced here so a bad name fails locally
// with a useful message instead of a 422 after the file has been read.
const VAULT_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function vaultName(project: string, env: string): string {
  const parts: ReadonlyArray<readonly [string, string]> = [
    ["project", project],
    ["env", env]
  ];
  for (const [label, value] of parts) {
    if (!value || !value.trim()) {
      throw new Error(`Missing ${label}. Usage: logicsrc teams push <team> <project> <env>`);
    }
    if (value.includes(VAULT_SEP)) {
      throw new Error(`The ${label} "${value}" cannot contain "${VAULT_SEP}" — it separates project from env in a vault name.`);
    }
  }
  const name = `${project}${VAULT_SEP}${env}`;
  if (!VAULT_NAME.test(name)) {
    throw new Error(
      `"${name}" is not a valid vault name. Project and env must be lowercase letters, numbers and dashes, and together at most 63 characters.`
    );
  }
  return name;
}

/** Inverse of vaultName; null for names that predate the convention. */
export function splitVaultName(name: string): { project: string; env: string } | null {
  const at = name.indexOf(VAULT_SEP);
  if (at <= 0) return null;
  const env = name.slice(at + VAULT_SEP.length);
  if (!env || env.includes(VAULT_SEP)) return null;
  return { project: name.slice(0, at), env };
}

async function resolveVaultId(client: TeamClient, slug: string, vault: string): Promise<string> {
  const { vaults } = await client.listVaults(slug);
  const found = vaults.find((v) => v.name === vault);
  if (found) return found.id;
  // Vault names were a single word before they became <project>/<env>, so a
  // team can still hold legacy rows. Name them instead of silently retargeting
  // — picking a different vault than the one asked for would mean pushing
  // secrets somewhere the caller didn't say.
  const known = vaults.map((v) => v.name);
  const hint = known.length ? ` Existing vaults: ${known.join(", ")}.` : "";
  throw new Error(`Vault "${vault}" not found in team "${slug}". Create it by pushing to it.${hint}`);
}

export async function loginAction(options: { apiUrl?: string; token?: string; device?: boolean; web?: boolean }): Promise<void> {
  const identity = await loadOrCreateIdentity();
  const apiUrl = resolveApiUrl(identity, options.apiUrl);

  // --token for CI; otherwise a browser flow: loopback OAuth-PKCE when this
  // machine has its own browser, device-code when it doesn't (SSH, containers).
  let token = options.token;
  let email: string | null = null;
  let userId: string | undefined;
  if (token) {
    const client = new TeamClient({ apiUrl, token });
    const me = await client.me();
    email = me.user.email;
    userId = me.user.id;
  } else {
    const useDevice = options.device ?? (options.web ? false : !hasLocalBrowser());
    let result: LoginResult;
    if (useDevice) {
      try {
        result = await deviceLogin(apiUrl);
      } catch (error) {
        if (!(error instanceof DeviceFlowUnsupported)) throw error;
        console.error("⚠️  This server has no device flow — falling back to the loopback flow.");
        console.error("   If your browser is on another machine, forward the callback port over SSH.");
        result = await loopbackLogin(apiUrl);
      }
    } else {
      result = await loopbackLogin(apiUrl);
    }
    token = result.token;
    email = result.email;
    userId = result.userId;
  }

  const client = new TeamClient({ apiUrl, token: token! });
  await client.uploadPublicKey(identity.keys.publicKey);
  await updateIdentity({ email: email ?? undefined, userId, apiToken: token, apiUrl });

  console.error(`Logged in${email ? ` as ${email}` : ""}. Identity key registered on ${apiUrl}.`);
  print({ email, apiUrl }, "table");
}

export async function logoutAction(): Promise<void> {
  await updateIdentity({ apiToken: undefined, email: undefined, userId: undefined });
  console.error(`Logged out (local token cleared; revoke the key at /settings). Identity key retained — delete ${identityPath()} to remove it.`);
}

export async function whoamiAction(format: OutputFormat): Promise<void> {
  const identity = readIdentity();
  if (!identity?.apiToken) {
    print({ loggedIn: false, apiUrl: defaultApiUrl(), hint: "Run: logicsrc login" }, format);
    return;
  }
  const { client } = authedClient();
  const me = await client.me();
  print({ loggedIn: true, email: me.user.email, apiUrl: resolveApiUrl(identity), publicKey: me.user.publicKey, teams: me.teams.map((t) => t.slug) }, format);
}

export async function teamsCreateAction(slug: string, options: { name?: string; format: OutputFormat }): Promise<void> {
  const { client } = authedClient();
  const { team } = await client.createTeam(slug, options.name);
  console.error(`Created team ${team.slug}. Invite teammates: logicsrc teams invite ${team.slug} them@example.com`);
  print(team, options.format);
}

export async function teamsListAction(format: OutputFormat): Promise<void> {
  const { client } = authedClient();
  const { teams } = await client.listTeams();
  print(teams.length ? teams.map((t) => ({ slug: t.slug, name: t.name })) : [{ note: "No teams yet. Create one: logicsrc teams create <slug>" }], format);
}

export async function teamsInviteAction(slug: string, email: string, options: { role?: string; format: OutputFormat }): Promise<void> {
  const { client } = authedClient();
  const role = options.role as "owner" | "admin" | "member" | undefined;
  const result = await client.invite(slug, email, role);
  if (result.emailSent) {
    console.error(`Invited ${email} to ${slug}. An email is on the way.`);
    print({ invited: email, team: slug, role: result.invite.role, emailSent: true }, options.format);
  } else {
    console.error(`Invited ${email} to ${slug}. No email transport configured — share this accept command with them:`);
    console.error(`  logicsrc login --email ${email} && logicsrc teams accept ${result.token}`);
    print({ invited: email, team: slug, role: result.invite.role, token: result.token }, options.format);
  }
}

export async function teamsAcceptAction(token: string, format: OutputFormat): Promise<void> {
  const { client } = authedClient();
  const result = await client.acceptInvite(token);
  console.error(`Joined ${result.team?.slug ?? "team"}. Ask a member to grant you a vault, then: logicsrc teams pull <team> <project> <env>`);
  print({ joined: result.team?.slug ?? null }, format);
}

export async function teamsMembersAction(slug: string, format: OutputFormat): Promise<void> {
  const { client } = authedClient();
  const { members } = await client.listMembers(slug);
  print(
    members.map((m) => ({ email: m.email, role: m.role, status: m.status, hasKey: m.hasPublicKey })),
    format
  );
}

export async function teamsVaultsAction(slug: string, format: OutputFormat): Promise<void> {
  const { client } = authedClient();
  const { vaults } = await client.listVaults(slug);
  print(
    vaults.length
      ? vaults.map((v) => {
          const parts = splitVaultName(v.name);
          return {
            vault: v.name,
            project: parts?.project ?? v.name,
            env: parts?.env ?? "—",
            secrets: v.secretCount,
            youHaveAccess: v.hasAccess
          };
        })
      : [{ note: "No vaults yet. Push to create one: logicsrc teams push <team> <project> <env>" }],
    format
  );
}

export async function teamsGrantAction(slug: string, project: string, env: string, email: string, format: OutputFormat): Promise<void> {
  const { client, identity } = authedClient();
  const vault = vaultName(project, env);
  const vaultId = await resolveVaultId(client, slug, vault);

  // Unwrap the vault DEK with our own key, then re-wrap it to the target member.
  let myWrapped: string;
  try {
    myWrapped = (await client.getMyGrant(vaultId)).wrappedDek;
  } catch (error) {
    if (error instanceof TeamApiError && error.status === 403) {
      throw new Error(`You don't have access to ${slug}/${vault} yourself, so you can't grant it. Ask an existing member.`);
    }
    throw error;
  }
  const dek = await unwrapVaultKey(myWrapped, identity.keys);

  const target = await client.lookupUser(email);
  if (!target.userId) throw new Error(`${email} has not logged in yet. Ask them to run: logicsrc login --email ${email}`);
  if (!target.publicKey) throw new Error(`${email} has not registered a key yet. Ask them to run: logicsrc login --email ${email}`);

  await client.putGrant(vaultId, email, await wrapVaultKey(dek, target.publicKey));
  console.error(`Granted ${email} access to ${slug}/${vault}. They can now: logicsrc teams pull ${slug} ${project} ${env}`);
  print({ granted: email, team: slug, project, env, vault }, format);
}

export function teamEndpoint(slug: string, vault: string): CredentialEndpoint {
  return { provider: "team", project: slug, config: vault };
}

// Note the two different "env"s: `envName` is the environment half of the vault
// address (prod, staging), while `options.env` is the local .env file path.
export async function teamsPushAction(slug: string, project: string, envName: string, options: { env: string; format: OutputFormat }): Promise<void> {
  requireAuth();
  const vault = vaultName(project, envName);
  const engine = createCredentialEngine();
  const from: CredentialEndpoint = { provider: "env", path: options.env };
  const plan = await engine.createCredentialSyncPlan({ from, to: teamEndpoint(slug, vault) });
  if (plan.changes.length === 0) {
    console.error(`${slug}/${vault} is already up to date with ${options.env}.`);
    print({ team: slug, project, env: envName, vault, changes: 0 }, options.format);
    return;
  }
  const approval = engine.approveCredentialSync(plan.id);
  const run = await engine.runCredentialSync(plan.id, { dryRun: false, approval });
  const applied = run.results.filter((r) => r.applied).length;
  console.error(`Pushed ${applied} secret(s) from ${options.env} to ${slug}/${vault} (end-to-end encrypted).`);
  print({ team: slug, project, env: envName, vault, applied, keys: run.results.map((r) => ({ key: r.key, op: r.op, applied: r.applied })) }, options.format);
}

export async function teamsPullAction(slug: string, project: string, envName: string, options: { env: string; format: OutputFormat }): Promise<void> {
  requireAuth();
  const vault = vaultName(project, envName);
  const engine = createCredentialEngine();
  const to: CredentialEndpoint = { provider: "env", path: options.env };
  const plan = await engine.createCredentialSyncPlan({ from: teamEndpoint(slug, vault), to });
  if (plan.changes.length === 0) {
    console.error(`${options.env} is already up to date with ${slug}/${vault}.`);
    print({ team: slug, project, env: envName, vault, changes: 0 }, options.format);
    return;
  }
  const approval = engine.approveCredentialSync(plan.id);
  const run = await engine.runCredentialSync(plan.id, { dryRun: false, approval });
  const applied = run.results.filter((r) => r.applied).length;
  console.error(`Pulled ${applied} secret(s) from ${slug}/${vault} into ${options.env}.`);
  print({ team: slug, project, env: envName, vault, applied, keys: run.results.map((r) => ({ key: r.key, op: r.op, applied: r.applied })) }, options.format);
}

export async function selectOne(label: string, values: string[]): Promise<string> {
  const choices = [...new Set(values)].sort();
  if (choices.length === 0) throw new Error(`No ${label.toLowerCase()} options are available.`);
  if (choices.length === 1) {
    console.error(`Using ${label.toLowerCase()}: ${choices[0]}`);
    return choices[0]!;
  }
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    throw new Error(`Cannot select a ${label.toLowerCase()} without an interactive terminal. Pass team, project, and env explicitly.`);
  }

  console.error(`\nSelect ${label.toLowerCase()}:`);
  choices.forEach((choice, index) => console.error(`  ${index + 1}) ${choice}`));
  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  try {
    while (true) {
      const answer = (await prompt.question("> ")).trim();
      const index = Number(answer) - 1;
      if (Number.isInteger(index) && index >= 0 && index < choices.length) return choices[index]!;
      console.error(`Enter a number from 1 to ${choices.length}.`);
    }
  } finally {
    prompt.close();
  }
}

/** Link this working directory to one team project/environment vault. */
export async function secretsTeamsLinkAction(
  requestedTeam: string | undefined,
  requestedProject: string | undefined,
  requestedEnv: string | undefined,
  options: { cwd?: string; format: OutputFormat }
): Promise<void> {
  const { client } = authedClient();
  const { teams } = await client.listTeams();
  const teamSlugs = teams.map((candidate) => candidate.slug);
  const team = requestedTeam ?? await selectOne("Team", teamSlugs);
  if (!teamSlugs.includes(team)) throw new Error(`You are not an active member of team "${team}".`);

  const { vaults } = await client.listVaults(team);
  const targets = vaults.flatMap((vault) => {
    const parts = splitVaultName(vault.name);
    return parts ? [{ ...parts, hasAccess: vault.hasAccess }] : [];
  });
  const accessibleTargets = targets.filter((target) => target.hasAccess);
  const project = requestedProject ?? await selectOne("Project", accessibleTargets.map((target) => target.project));
  const projectTargets = targets.filter((target) => target.project === project);
  if (requestedProject && projectTargets.length === 0 && !requestedEnv) {
    throw new Error(`Project "${project}" has no environments to select. Pass an env explicitly to link a new target.`);
  }
  const env = requestedEnv ?? await selectOne("Environment", projectTargets.filter((target) => target.hasAccess).map((target) => target.env));
  vaultName(project, env); // use the same target validation as teams push/pull

  const existing = projectTargets.find((target) => target.env === env);
  if (existing && !existing.hasAccess) {
    throw new Error(`You do not have access to ${team}/${project}/${env}, so it cannot be linked.`);
  }

  const cwd = linkedDirectory(options.cwd);
  const link = writeSecretsLink({ team, project, env }, cwd);
  console.error(`Linked ${cwd} to ${team}/${project}/${env}.`);
  print(link, options.format);
}

/** Push requires a directory link; there is deliberately no target override. */
export async function secretsUpAction(options: { cwd?: string; env: string; format: OutputFormat }): Promise<void> {
  const link = requireSecretsLink(options.cwd);
  await teamsPushAction(link.team, link.project, link.env, { env: options.env, format: options.format });
}

/** Pull the linked default environment, or another env in the linked project. */
export async function secretsDownAction(envName: string | undefined, options: { cwd?: string; env: string; format: OutputFormat }): Promise<void> {
  const link = requireSecretsLink(options.cwd);
  await teamsPullAction(link.team, link.project, envName ?? link.env, { env: options.env, format: options.format });
}

/**
 * The vault browser.
 *
 * Read-only and never handles plaintext: it shows which vaults exist, what
 * their secrets are called, who can decrypt them and what has changed, but
 * never a value. See vault-tui.ts for why.
 */
export async function teamsTuiAction(options: { theme?: string } = {}): Promise<void> {
  const { client, identity } = authedClient();
  const { runVaultTui } = await import("./vault-tui-run.js");
  await runVaultTui({ client, identity: identity.email, theme: options.theme });
}

// ------------------------------------------------------------ categories ---
//
// `teams secrets` and `teams export` answer "show me every database password"
// or "give me all the social keys as a spreadsheet". The category comes from
// the key NAME (see @logicsrc/opencreds categories.ts), so listing never has to
// decrypt anything and a list and an export of the same filter always agree.

export interface SecretFilter {
  project?: string;
  env?: string;
  category?: string | string[];
  search?: string;
}

interface SecretRow {
  team: string;
  project: string;
  env: string;
  vault: string;
  category: string;
  key: string;
  updatedAt: string;
}

/** Map with at most `limit` promises in flight; a team can hold hundreds of vaults. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** The vaults a filter addresses: all of them, one project's, or one project/env. */
function selectVaults(vaults: RemoteVault[], filter: SecretFilter): Array<RemoteVault & { project: string; env: string }> {
  return vaults
    .map((v) => {
      const parts = splitVaultName(v.name);
      return { ...v, project: parts?.project ?? v.name, env: parts?.env ?? "" };
    })
    .filter((v) => (filter.project ? v.project === filter.project : true))
    .filter((v) => (filter.env ? v.env === filter.env : true))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function matcher(filter: SecretFilter): (row: { key: string; category: string }) => boolean {
  const categories = parseCategories(filter.category);
  const needle = filter.search?.toLowerCase();
  return (row) =>
    (!categories || categories.has(row.category)) && (!needle || row.key.toLowerCase().includes(needle));
}

/** Every secret NAME the filter matches, with its category. Decrypts nothing. */
async function collectSecretRows(client: TeamClient, slug: string, filter: SecretFilter): Promise<SecretRow[]> {
  const keep = matcher(filter);
  const { vaults } = await client.listVaults(slug);
  const selected = selectVaults(vaults, filter);
  if (selected.length === 0) throw new Error(noVaultsMessage(slug, filter));
  const perVault = await mapLimit(selected, 8, async (v) => {
    const { secrets } = await client.listSecrets(v.id);
    return secrets.map((s) => ({
      team: slug, project: v.project, env: v.env, vault: v.name,
      category: categorizeSecret(s.name), key: s.name, updatedAt: s.updatedAt
    }));
  });
  return perVault.flat().filter(keep);
}

function noVaultsMessage(slug: string, filter: SecretFilter): string {
  const where = [filter.project, filter.env].filter(Boolean).join("/");
  return where
    ? `No vault matches ${slug}/${where}. See what exists: logicsrc teams vaults ${slug}`
    : `Team "${slug}" has no vaults yet. Push one: logicsrc teams push ${slug} <project> <env>`;
}

function namesCsv(rows: SecretRow[]): string {
  const lines = [csvLine(["team", "project", "env", "category", "key", "updated_at"])];
  for (const r of rows) lines.push(csvLine([r.team, r.project, r.env, r.category, r.key, r.updatedAt]));
  return `${lines.join("\n")}\n`;
}

/** `logicsrc teams categories [team]` — the filter words, with counts when a team is given. */
export async function teamsCategoriesAction(slug: string | undefined, options: { format: OutputFormat }): Promise<void> {
  let counts: Map<string, number> | undefined;
  if (slug) {
    const { client } = authedClient();
    counts = new Map();
    for (const row of await collectSecretRows(client, slug, {})) counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  }
  const rows = [...SECRET_CATEGORIES, OTHER_CATEGORY].map((c) => ({
    category: c.id,
    ...(counts ? { secrets: counts.get(c.id) ?? 0 } : {}),
    description: c.description,
    aliases: c.aliases.join(", "),
    examples: c.examples.join(", ")
  }));
  if (options.format === "table") {
    printColumns(rows.map(({ examples: _examples, ...row }) => row));
    console.error("\nFilter with: logicsrc teams secrets <team> --category db   (or: teams export <team> --category db)");
    return;
  }
  print(rows, options.format);
}

/** `logicsrc teams secrets <team> [project] [env]` — names and categories, never values. */
export async function teamsSecretsAction(
  slug: string,
  filter: SecretFilter,
  options: { format: OutputFormat | "csv" }
): Promise<void> {
  const { client } = authedClient();
  const rows = await collectSecretRows(client, slug, filter);
  if (options.format === "csv") {
    process.stdout.write(namesCsv(rows));
    return;
  }
  if (rows.length === 0) {
    console.error("No secrets match. Categories: logicsrc teams categories");
    return;
  }
  const vaults = new Set(rows.map((r) => r.vault)).size;
  console.error(`${rows.length} secret(s) in ${vaults} vault(s). Values stay encrypted; export them with: logicsrc teams export ${slug} …`);
  const brief = rows.map((r) => ({ project: r.project, env: r.env, category: r.category, key: r.key }));
  if (options.format === "table") printColumns(brief);
  else print(options.format === "json" ? rows : brief, options.format);
}

async function confirmPlaintext(message: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) return false;
  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return /^y(es)?$/i.test((await prompt.question(`${message} [y/N] `)).trim());
  } finally {
    prompt.close();
  }
}

/**
 * `logicsrc teams export <team> [project] [env] --out creds.csv`
 *
 * Decrypts on this machine and writes one CSV row per secret:
 * team,project,env,category,key,value,updated_at. Vaults you hold no grant for
 * are skipped and named, rather than failing the whole export.
 */
export async function teamsExportAction(
  slug: string,
  filter: SecretFilter,
  options: { out: string; yes?: boolean }
): Promise<void> {
  const { client, identity } = authedClient();
  const keep = matcher(filter);
  const { vaults } = await client.listVaults(slug);
  const selected = selectVaults(vaults, filter);
  if (selected.length === 0) throw new Error(noVaultsMessage(slug, filter));

  const toStdout = options.out === "-";
  const target = toStdout ? "stdout" : options.out;
  if (!options.yes) {
    console.error(`About to write decrypted secrets from ${selected.length} vault(s) to ${target} in the clear.`);
    console.error("Anyone who can read that file can use every secret in it.");
    if (!(await confirmPlaintext("Continue?"))) {
      throw new Error("Refused: exporting plaintext secrets needs confirmation. Re-run with --yes to skip the prompt.");
    }
  }

  const skipped: string[] = [];
  const perVault = await mapLimit(selected, 6, async (v) => {
    if (!v.hasAccess) {
      skipped.push(v.name);
      return [];
    }
    const { secrets } = await client.listSecrets(v.id);
    const wanted = secrets
      .map((s) => ({ secret: s, category: categorizeSecret(s.name), key: s.name }))
      .filter(keep);
    if (wanted.length === 0) return [];
    let dek: string;
    try {
      dek = await unwrapVaultKey((await client.getMyGrant(v.id)).wrappedDek, identity.keys);
    } catch {
      skipped.push(v.name);
      return [];
    }
    return Promise.all(
      wanted.map(async ({ secret, category }) =>
        csvLine([slug, v.project, v.env, category, secret.name,
          await decryptValue({ nonce: secret.nonce, ciphertext: secret.ciphertext }, dek), secret.updatedAt])
      )
    );
  });

  const lines = perVault.flat();
  const csv = `${[csvLine(["team", "project", "env", "category", "key", "value", "updated_at"]), ...lines].join("\n")}\n`;
  if (toStdout) {
    process.stdout.write(csv);
  } else {
    writeFileSync(options.out, csv, { encoding: "utf8", mode: 0o600 });
    try { chmodSync(options.out, 0o600); } catch { /* no modes on this platform */ }
  }
  console.error(`Exported ${lines.length} secret(s) to ${target}.${toStdout ? "" : " Delete it when you are done: shred -u " + options.out}`);
  if (skipped.length) {
    console.error(`Skipped ${skipped.length} vault(s) you cannot decrypt: ${skipped.sort().join(", ")}`);
  }
}
