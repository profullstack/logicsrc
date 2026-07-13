import { fingerprintValue } from "../fingerprint.js";
import { TeamClient, TeamApiError, type RemoteSecret } from "../client.js";
import { requireAuth, defaultApiUrl } from "../identity.js";
import { generateVaultKey, wrapVaultKey, unwrapVaultKey, encryptValue, decryptValue } from "../crypto.js";
import type { LocalIdentity } from "../identity.js";
import type {
  CredentialEndpoint,
  CredentialProvider,
  CredentialSnapshot,
  CredentialValueBag,
  CredentialWriteResult
} from "../types.js";

/**
 * The `team` credential provider — an end-to-end-encrypted team vault addressed
 * as `team:<team-slug>/<vault-name>` (endpoint.project = slug, endpoint.config =
 * vault). Secret values are encrypted/decrypted on THIS machine with the vault
 * DEK; the server only ever sees ciphertext and the DEK sealed to member keys.
 *
 * Auth + identity come from the local `~/.logicsrc/identity.json` (via
 * `logicsrc login`), mirroring how `env` reads files and `github-secrets` reads
 * GITHUB_TOKEN — the provider is pure I/O over ambient credentials.
 */

interface TeamContext {
  client: TeamClient;
  identity: LocalIdentity & { apiToken: string; email: string };
}

function context(): TeamContext {
  const identity = requireAuth();
  return { client: new TeamClient({ apiUrl: identity.apiUrl || defaultApiUrl(), token: identity.apiToken }), identity };
}

function slugAndVault(endpoint: CredentialEndpoint): { slug: string; vault: string } {
  const slug = endpoint.project;
  const vault = endpoint.config;
  if (!slug || !vault) {
    throw new Error('A team endpoint needs a team and vault: team:<team-slug>/<vault-name> (e.g. team:acme/prod).');
  }
  return { slug, vault };
}

async function resolveVaultId(ctx: TeamContext, slug: string, vault: string, create: boolean): Promise<string | undefined> {
  const { vaults } = await ctx.client.listVaults(slug);
  const found = vaults.find((v) => v.name === vault);
  if (found) return found.id;
  if (!create) return undefined;
  const created = await ctx.client.createVault(slug, vault);
  return created.vault.id;
}

/** Fetch (or, for a brand-new vault, mint) the vault DEK, decrypting nothing yet. */
async function acquireDek(ctx: TeamContext, slug: string, vault: string, vaultId: string, allowMint: boolean): Promise<string> {
  try {
    const { wrappedDek } = await ctx.client.getMyGrant(vaultId);
    return unwrapVaultKey(wrappedDek, ctx.identity.keys);
  } catch (error) {
    if (!(error instanceof TeamApiError) || error.status !== 403) throw error;
    // No grant yet. If nobody holds the DEK, this is a fresh vault we can own.
    const { grants } = await ctx.client.listGrants(vaultId);
    const someoneHasAccess = grants.some((g) => g.hasAccess);
    if (someoneHasAccess || !allowMint) {
      throw new Error(
        `You don't have access to team:${slug}/${vault} yet. Ask a member to run:\n  logicsrc teams grant ${slug} ${vault} ${ctx.identity.email}`
      );
    }
    const dek = await generateVaultKey();
    const wrapped = await wrapVaultKey(dek, ctx.identity.keys.publicKey);
    await ctx.client.putGrant(vaultId, ctx.identity.email, wrapped);
    return dek;
  }
}

export const teamProvider: CredentialProvider = {
  id: "team",
  name: "LogicSRC Team Vault",
  description: "End-to-end-encrypted team credential vault. Share secrets with teammates by email — the server never sees plaintext.",
  status: "available",
  authRequirements: ["logicsrc login (identity at ~/.logicsrc/identity.json)"],
  capabilities: { readValues: true, readNames: true, write: true, delete: true, rollback: true, audit: true },

  async inspect(endpoint: CredentialEndpoint): Promise<CredentialSnapshot> {
    const ctx = context();
    const { slug, vault } = slugAndVault(endpoint);
    const vaultId = await resolveVaultId(ctx, slug, vault, false);
    if (!vaultId) {
      return { provider: "team", endpoint, valuesReadable: true, keys: [], inspectedAt: new Date().toISOString() };
    }
    const { secrets } = await ctx.client.listSecrets(vaultId);
    // Whether we can actually decrypt (i.e. hold a grant) determines valuesReadable.
    let valuesReadable = true;
    try {
      await ctx.client.getMyGrant(vaultId);
    } catch {
      valuesReadable = false;
    }
    return {
      provider: "team",
      endpoint,
      valuesReadable,
      keys: secrets
        .map((s: RemoteSecret) => ({ name: s.name, present: true, fingerprint: s.fingerprint, lastModifiedAt: s.updatedAt }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      inspectedAt: new Date().toISOString()
    };
  },

  async readValues(endpoint: CredentialEndpoint, keys: string[]): Promise<CredentialValueBag> {
    const ctx = context();
    const { slug, vault } = slugAndVault(endpoint);
    const vaultId = await resolveVaultId(ctx, slug, vault, false);
    if (!vaultId) return {};
    const dek = await acquireDek(ctx, slug, vault, vaultId, false);
    const { secrets } = await ctx.client.listSecrets(vaultId);
    const wanted = new Set(keys);
    const bag: CredentialValueBag = {};
    for (const secret of secrets) {
      if (!wanted.has(secret.name)) continue;
      bag[secret.name] = await decryptValue({ nonce: secret.nonce, ciphertext: secret.ciphertext }, dek);
    }
    return bag;
  },

  async write(input): Promise<CredentialWriteResult[]> {
    const ctx = context();
    const { slug, vault } = slugAndVault(input.endpoint);
    const upsertNames = Object.keys(input.upserts);
    const results: CredentialWriteResult[] = [];

    if (input.dryRun) {
      for (const name of upsertNames) results.push({ key: name, applied: false });
      for (const name of input.deletes) results.push({ key: name, applied: false });
      return results;
    }

    const vaultId = await resolveVaultId(ctx, slug, vault, true);
    if (!vaultId) throw new Error(`Could not resolve or create vault team:${slug}/${vault}.`);

    if (upsertNames.length === 0 && input.deletes.length === 0) return results;

    const dek = upsertNames.length > 0 ? await acquireDek(ctx, slug, vault, vaultId, true) : undefined;
    const encrypted: Array<{ name: string; nonce: string; ciphertext: string; fingerprint: string }> = [];
    for (const name of upsertNames) {
      const sealed = await encryptValue(input.upserts[name], dek!);
      encrypted.push({ name, nonce: sealed.nonce, ciphertext: sealed.ciphertext, fingerprint: fingerprintValue(input.upserts[name]) });
    }

    const { applied } = await ctx.client.putSecrets(vaultId, encrypted, input.deletes);
    const appliedSet = new Set(applied);
    for (const name of upsertNames) results.push({ key: name, applied: appliedSet.has(name) });
    for (const name of input.deletes) results.push({ key: name, applied: appliedSet.has(name) });
    return results;
  },

  async rollback(input): Promise<CredentialWriteResult[]> {
    // Restoring a pre-image is just re-encrypting prior values under the DEK.
    return this.write!({ endpoint: input.endpoint, upserts: input.preImage, deletes: [], dryRun: input.dryRun });
  }
};
