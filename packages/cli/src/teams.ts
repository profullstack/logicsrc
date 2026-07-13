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
  const client = new TeamClient({ apiUrl: identity.apiUrl || defaultApiUrl(), token: identity.apiToken });
  return { client, identity };
}

const b64url = (buf: Buffer): string => buf.toString("base64url");

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

async function resolveVaultId(client: TeamClient, slug: string, vault: string): Promise<string> {
  const { vaults } = await client.listVaults(slug);
  const found = vaults.find((v) => v.name === vault);
  if (!found) throw new Error(`Vault "${vault}" not found in team "${slug}". Create it by pushing to it.`);
  return found.id;
}

export async function loginAction(options: { apiUrl?: string; token?: string }): Promise<void> {
  const identity = await loadOrCreateIdentity();
  const apiUrl = (options.apiUrl || identity.apiUrl || defaultApiUrl()).replace(/\/+$/, "");

  // Loopback browser OAuth-PKCE (like `moshcode login`), or a --token for CI.
  let token = options.token;
  let email: string | null = null;
  let userId: string | undefined;
  if (token) {
    const client = new TeamClient({ apiUrl, token });
    const me = await client.me();
    email = me.user.email;
    userId = me.user.id;
  } else {
    const result = await loopbackLogin(apiUrl);
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
    print({ loggedIn: false, apiUrl: defaultApiUrl(), hint: "Run: logicsrc login --email you@example.com" }, format);
    return;
  }
  const { client } = authedClient();
  const me = await client.me();
  print({ loggedIn: true, email: me.user.email, apiUrl: identity.apiUrl, publicKey: me.user.publicKey, teams: me.teams.map((t) => t.slug) }, format);
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
    vaults.length ? vaults.map((v) => ({ vault: v.name, secrets: v.secretCount, youHaveAccess: v.hasAccess })) : [{ note: "No vaults yet. Push to create one: logicsrc teams push <team> <vault>" }],
    format
  );
}

export async function teamsGrantAction(slug: string, vault: string, email: string, format: OutputFormat): Promise<void> {
  const { client, identity } = authedClient();
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
  console.error(`Granted ${email} access to ${slug}/${vault}. They can now: logicsrc teams pull ${slug} ${vault}`);
  print({ granted: email, team: slug, vault }, format);
}

function teamEndpoint(slug: string, vault: string): CredentialEndpoint {
  return { provider: "team", project: slug, config: vault };
}

export async function teamsPushAction(slug: string, vault: string, options: { env: string; format: OutputFormat }): Promise<void> {
  requireAuth();
  const engine = createCredentialEngine();
  const from: CredentialEndpoint = { provider: "env", path: options.env };
  const plan = await engine.createCredentialSyncPlan({ from, to: teamEndpoint(slug, vault) });
  if (plan.changes.length === 0) {
    console.error(`${slug}/${vault} is already up to date with ${options.env}.`);
    print({ team: slug, vault, changes: 0 }, options.format);
    return;
  }
  const approval = engine.approveCredentialSync(plan.id);
  const run = await engine.runCredentialSync(plan.id, { dryRun: false, approval });
  const applied = run.results.filter((r) => r.applied).length;
  console.error(`Pushed ${applied} secret(s) from ${options.env} to ${slug}/${vault} (end-to-end encrypted).`);
  print({ team: slug, vault, applied, keys: run.results.map((r) => ({ key: r.key, op: r.op, applied: r.applied })) }, options.format);
}

export async function teamsPullAction(slug: string, vault: string, options: { env: string; format: OutputFormat }): Promise<void> {
  requireAuth();
  const engine = createCredentialEngine();
  const to: CredentialEndpoint = { provider: "env", path: options.env };
  const plan = await engine.createCredentialSyncPlan({ from: teamEndpoint(slug, vault), to });
  if (plan.changes.length === 0) {
    console.error(`${options.env} is already up to date with ${slug}/${vault}.`);
    print({ team: slug, vault, changes: 0 }, options.format);
    return;
  }
  const approval = engine.approveCredentialSync(plan.id);
  const run = await engine.runCredentialSync(plan.id, { dryRun: false, approval });
  const applied = run.results.filter((r) => r.applied).length;
  console.error(`Pulled ${applied} secret(s) from ${slug}/${vault} into ${options.env}.`);
  print({ team: slug, vault, applied, keys: run.results.map((r) => ({ key: r.key, op: r.op, applied: r.applied })) }, options.format);
}
