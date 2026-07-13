import { createInterface } from "node:readline/promises";
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

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function resolveVaultId(client: TeamClient, slug: string, vault: string): Promise<string> {
  const { vaults } = await client.listVaults(slug);
  const found = vaults.find((v) => v.name === vault);
  if (!found) throw new Error(`Vault "${vault}" not found in team "${slug}". Create it by pushing to it.`);
  return found.id;
}

export async function loginAction(options: { email?: string; code?: string }): Promise<void> {
  const identity = await loadOrCreateIdentity();
  const email = options.email ?? (await prompt("Email: "));
  if (!email) throw new Error("An email is required: logicsrc login --email you@example.com");
  const client = new TeamClient({ apiUrl: identity.apiUrl || defaultApiUrl() });

  const requested = await client.requestLoginCode(email);
  let code = options.code;
  if (requested.devCode) {
    // No email transport configured server-side (local dev) — the code is returned.
    console.error(`(dev) login code: ${requested.devCode}`);
    code = code ?? requested.devCode;
  }
  if (!code) code = await prompt(`Enter the 6-digit code sent to ${email}: `);

  const verified = await client.verifyLoginCode(email, code);
  client.setToken(verified.token);
  await client.uploadPublicKey(identity.keys.publicKey);
  await updateIdentity({ email: verified.user.email, userId: verified.user.id, apiToken: verified.token, apiUrl: identity.apiUrl || defaultApiUrl() });

  console.error(`Logged in as ${verified.user.email}. Identity key registered.`);
  print({ email: verified.user.email, userId: verified.user.id, apiUrl: identity.apiUrl || defaultApiUrl() }, "table");
}

export async function logoutAction(): Promise<void> {
  const identity = readIdentity();
  if (identity?.apiToken) {
    try {
      const client = new TeamClient({ apiUrl: identity.apiUrl || defaultApiUrl(), token: identity.apiToken });
      await client.logout();
    } catch {
      // best effort — token may already be gone
    }
  }
  await updateIdentity({ apiToken: undefined, email: undefined, userId: undefined });
  console.error("Logged out. Local identity key retained (delete ~/.logicsrc/identity.json to remove it).");
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
