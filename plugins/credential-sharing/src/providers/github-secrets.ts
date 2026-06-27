import { keysFromNames } from "../fingerprint.js";
import { httpJson, requireEnv } from "./http.js";
import type { CredentialEndpoint, CredentialProvider, CredentialWriteResult } from "../types.js";

const GITHUB_API = "https://api.github.com";

function headers(): Record<string, string> {
  const token = requireEnv("GITHUB_TOKEN", "Export a GitHub token with secrets:write scope as GITHUB_TOKEN.");
  return {
    Authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28"
  };
}

/**
 * Resolve the Actions-secrets base path for an endpoint.
 *   repo (default): project=owner, service=repo
 *   org:            scope="org", project=org
 *   environment:    scope="environment", project=owner, service=repo, config=environment
 */
function basePath(endpoint: CredentialEndpoint): string {
  const scope = endpoint.scope ?? "repo";
  if (scope === "org") {
    if (!endpoint.project) throw new Error('GitHub org secrets need project=<org>.');
    return `/orgs/${endpoint.project}/actions/secrets`;
  }
  if (!endpoint.project || !endpoint.service) {
    throw new Error('GitHub repo secrets need project=<owner> and service=<repo>.');
  }
  if (scope === "environment") {
    if (!endpoint.config) throw new Error('GitHub environment secrets need config=<environment>.');
    return `/repos/${endpoint.project}/${endpoint.service}/environments/${endpoint.config}/secrets`;
  }
  return `/repos/${endpoint.project}/${endpoint.service}/actions/secrets`;
}

interface SecretsList {
  secrets: Array<{ name: string; updated_at?: string }>;
}

interface PublicKey {
  key_id: string;
  key: string;
}

async function sealValue(value: string, publicKeyB64: string): Promise<string> {
  const sodiumModule = (await import("libsodium-wrappers")) as unknown as { default?: SodiumLike } & SodiumLike;
  const sodium: SodiumLike = sodiumModule.default ?? sodiumModule;
  await sodium.ready;
  const key = sodium.from_base64(publicKeyB64, sodium.base64_variants.ORIGINAL);
  const sealed = sodium.crypto_box_seal(sodium.from_string(value), key);
  return sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);
}

interface SodiumLike {
  ready: Promise<void>;
  base64_variants: { ORIGINAL: number };
  from_base64(input: string, variant: number): Uint8Array;
  to_base64(input: Uint8Array, variant: number): string;
  from_string(input: string): Uint8Array;
  crypto_box_seal(message: Uint8Array, publicKey: Uint8Array): Uint8Array;
}

export const githubSecretsProvider: CredentialProvider = {
  id: "github-secrets",
  name: "GitHub Secrets",
  description: "Sync repository, organization, and environment secrets.",
  // GitHub never returns secret values — names only. So values are not readable
  // and a github-secrets endpoint cannot be a sync source or a rollback target.
  capabilities: { readValues: false, readNames: true, write: true, delete: true, rollback: false, audit: false },
  authRequirements: ["GITHUB_TOKEN"],
  status: "available",

  async inspect(endpoint) {
    const list = await httpJson<SecretsList>(`${GITHUB_API}${basePath(endpoint)}?per_page=100`, {
      headers: headers(),
      expect: "GitHub list secrets"
    });
    const keys = keysFromNames((list.secrets ?? []).map((s) => s.name));
    for (const secret of list.secrets ?? []) {
      const key = keys.find((k) => k.name === secret.name);
      if (key) key.lastModifiedAt = secret.updated_at;
    }
    return { provider: "github-secrets", endpoint, valuesReadable: false, keys, inspectedAt: new Date().toISOString() };
  },

  async write({ endpoint, upserts, deletes, dryRun }) {
    const results: CredentialWriteResult[] = [
      ...Object.keys(upserts).map((key) => ({ key, applied: !dryRun })),
      ...deletes.map((key) => ({ key, applied: !dryRun }))
    ];
    if (dryRun) {
      return results;
    }
    const base = basePath(endpoint);
    const visibility = endpoint.scope === "org" ? { visibility: "all" as const } : {};
    let publicKey: PublicKey | undefined;
    if (Object.keys(upserts).length > 0) {
      publicKey = await httpJson<PublicKey>(`${GITHUB_API}${base}/public-key`, { headers: headers(), expect: "GitHub public key" });
    }
    for (const [name, value] of Object.entries(upserts)) {
      const encrypted_value = await sealValue(value, (publicKey as PublicKey).key);
      await httpJson(`${GITHUB_API}${base}/${name}`, {
        method: "PUT",
        headers: { ...headers(), "content-type": "application/json" },
        body: JSON.stringify({ encrypted_value, key_id: (publicKey as PublicKey).key_id, ...visibility }),
        expect: `GitHub put secret ${name}`
      });
    }
    for (const name of deletes) {
      await httpJson(`${GITHUB_API}${base}/${name}`, { method: "DELETE", headers: headers(), expect: `GitHub delete secret ${name}` });
    }
    return results;
  }
};
