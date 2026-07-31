import {
  TeamClient,
  TeamApiError,
  requireAuth,
  resolveApiUrl,
  planVaultRekey,
  type RekeyMember
} from "@logicsrc/plugin-credential-sharing";
import { print, type OutputFormat } from "./format.js";
import { vaultName } from "./teams.js";

/**
 * `logicsrc credentials rotate` — re-key a team vault.
 *
 * Rotation replaces the vault's data-encryption key and re-encrypts every
 * secret under it. Secret VALUES do not change, so nothing that consumes them
 * breaks; what changes is that every wrapped key issued before now is dead.
 * That is what makes it the right move after someone leaves a team, or on a
 * schedule as plain hygiene.
 *
 * All crypto happens here, on the member's machine. The server receives the
 * finished state (ciphertext plus sealed keys) and commits it in one
 * transaction.
 */

export interface RotateOptions {
  /** "active" (default) drops non-active members; "all" keeps everyone. */
  scope: "active" | "all";
  /** Rotation only writes with --approve, matching `credentials sync`. */
  approve: boolean;
  format: OutputFormat;
}

interface VaultTarget {
  id: string;
  name: string;
}

function authedClient(): { client: TeamClient; identity: ReturnType<typeof requireAuth> } {
  const identity = requireAuth();
  return { client: new TeamClient({ apiUrl: resolveApiUrl(identity), token: identity.apiToken }), identity };
}

/**
 * Which vaults this invocation covers: one when a project/env pair is given,
 * otherwise every vault in the team the caller can actually open.
 */
async function resolveTargets(
  client: TeamClient,
  slug: string,
  project?: string,
  env?: string
): Promise<VaultTarget[]> {
  const { vaults } = await client.listVaults(slug);
  if (project || env) {
    if (!project || !env) {
      throw new Error("Give both a project and an env, or neither to rotate the whole team: logicsrc creds rotate <team> [project] [env]");
    }
    const name = vaultName(project, env);
    const found = vaults.find((v) => v.name === name);
    if (!found) {
      const known = vaults.map((v) => v.name).join(", ");
      throw new Error(`Vault "${name}" not found in team "${slug}".${known ? ` Existing vaults: ${known}.` : ""}`);
    }
    return [{ id: found.id, name: found.name }];
  }
  // Vaults the caller holds no grant on cannot be re-keyed by them; skip rather
  // than fail the whole sweep.
  const accessible = vaults.filter((v) => v.hasAccess);
  if (accessible.length === 0) {
    throw new Error(`No vaults in "${slug}" that you have access to. Ask a member to grant you, or name a vault explicitly.`);
  }
  return accessible.map((v) => ({ id: v.id, name: v.name }));
}

async function rotateOne(
  client: TeamClient,
  identity: ReturnType<typeof requireAuth>,
  vault: VaultTarget,
  options: RotateOptions
): Promise<Record<string, unknown>> {
  let myWrappedDek: string;
  try {
    myWrappedDek = (await client.getMyGrant(vault.id)).wrappedDek;
  } catch (error) {
    if (error instanceof TeamApiError && error.status === 403) {
      throw new Error(`You don't have access to "${vault.name}", so you can't re-key it. Ask an existing member.`);
    }
    throw error;
  }

  const [{ secrets }, { grants }] = await Promise.all([client.listSecrets(vault.id), client.listGrants(vault.id)]);

  const members: RekeyMember[] = grants.map((g) => ({
    email: g.email,
    publicKey: g.publicKey,
    status: g.status,
    hasAccess: g.hasAccess
  }));

  const plan = await planVaultRekey({
    myWrappedDek,
    identity: identity.keys,
    secrets: secrets.map((s) => ({ name: s.name, nonce: s.nonce, ciphertext: s.ciphertext, fingerprint: s.fingerprint })),
    members,
    scope: options.scope
  });

  const summary: Record<string, unknown> = {
    vault: vault.name,
    secrets: plan.secrets.length,
    keeps: plan.grants.map((g) => g.email),
    revokes: plan.revoked,
    skipped: plan.skipped,
    applied: false
  };

  if (!options.approve) {
    return summary;
  }

  const result = await client.rekeyVault(vault.id, {
    grants: plan.grants,
    secrets: plan.secrets,
    revoke: plan.revoked
  });
  summary.applied = true;
  summary.rekeyed = result.rekeyed;
  return summary;
}

export async function credentialsRotateAction(
  slug: string,
  project: string | undefined,
  env: string | undefined,
  options: RotateOptions
): Promise<void> {
  const { client, identity } = authedClient();
  const targets = await resolveTargets(client, slug, project, env);

  const results: Array<Record<string, unknown>> = [];
  for (const vault of targets) {
    results.push(await rotateOne(client, identity, vault, options));
  }

  if (!options.approve) {
    const totalRevokes = results.reduce((n, r) => n + (r.revokes as string[]).length, 0);
    console.error(
      `Dry run: ${results.length} vault(s) would be re-keyed${totalRevokes ? `, revoking ${totalRevokes} grant(s)` : ""}. Values are unchanged by a re-key. Re-run with --approve to apply.`
    );
  } else {
    console.error(`Re-keyed ${results.length} vault(s). Every previously issued vault key is now dead.`);
  }

  print(results, options.format);
}
