import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { hostname } from "node:os";
import { spawn } from "node:child_process";
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
  unwrapVaultKey,
  wrapVaultKey,
  type CredentialEndpoint
} from "@logicsrc/plugin-credential-sharing";
import { print, type OutputFormat } from "./format.js";

/**
 * `logicsrc login` + `logicsrc teams …` — the team credential-sharing surface.
 * Secrets are end-to-end encrypted: the server (commandboard-api /api/credshare)
 * only ever sees ciphertext and per-member wrapped vault keys.
 */

function authedClient(): { client: TeamClient; identity: ReturnType<typeof requireAuth> } {
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

// A vault is addressed as <project>/<env>, so one team can hold web/prod,
// web/staging and api/prod side by side. The split lives entirely in the CLI —
// the server still stores a single opaque vault name — so this join and
// splitVaultName() below are the only places that know about the convention.
// Neither half may contain a slash, which keeps the join unambiguous and makes
// splitVaultName a true inverse.
export function vaultName(project: string, env: string): string {
  const parts: ReadonlyArray<readonly [string, string]> = [
    ["project", project],
    ["env", env]
  ];
  for (const [label, value] of parts) {
    if (!value || !value.trim()) {
      throw new Error(`Missing ${label}. Usage: logicsrc teams push <team> <project> <env>`);
    }
    if (value.includes("/")) {
      throw new Error(`The ${label} "${value}" cannot contain "/" — it separates project from env in a vault name.`);
    }
  }
  return `${project}/${env}`;
}

/** Inverse of vaultName; null for names that predate the convention. */
export function splitVaultName(name: string): { project: string; env: string } | null {
  const slash = name.indexOf("/");
  if (slash <= 0 || slash === name.length - 1) return null;
  const env = name.slice(slash + 1);
  if (env.includes("/")) return null;
  return { project: name.slice(0, slash), env };
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
  console.error("Logged out (local token cleared; revoke the key at /settings). Identity key retained — delete ~/.logicsrc/identity.json to remove it.");
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
  console.error(`Joined ${result.team?.slug ?? "team"}. Ask a member to grant you a vault, then: logicsrc teams pull <team> <vault>`);
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

function teamEndpoint(slug: string, vault: string): CredentialEndpoint {
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
