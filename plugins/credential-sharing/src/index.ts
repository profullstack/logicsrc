import type { PluginDefinition } from "@logicsrc/plugin-core";
import { credentialSharingManifest } from "./manifest.js";
import { CredentialEngine, type CredentialEngineOptions } from "./engine.js";
import { listCredentialProviderManifests } from "./providers/index.js";

export const credentialSharingPlugin: PluginDefinition = {
  manifest: credentialSharingManifest,
  configDefaults: {
    enabled: true,
    default_policy: "approval_required_for_destructive",
    credential_home: "${LOGICSRC_CREDENTIAL_HOME}"
  },
  routes: [
    { method: "GET", path: "/api/credentials/providers", capability: "credentials.providers.list" },
    { method: "GET", path: "/api/credentials/inspect", capability: "credentials.inspect" },
    { method: "POST", path: "/api/credentials/diff", capability: "credentials.diff" },
    { method: "POST", path: "/api/credentials/plans", capability: "credentials.plan" },
    { method: "POST", path: "/api/credentials/plans/:id/approve", capability: "credentials.approve" },
    { method: "POST", path: "/api/credentials/plans/:id/sync", capability: "credentials.sync" },
    { method: "POST", path: "/api/credentials/runs/:id/rollback", capability: "credentials.rollback" },
    { method: "GET", path: "/api/credentials/runs/:id/audit", capability: "credentials.audit.read" }
  ],
  permissions: [
    "credentials:inspect",
    "credentials:diff",
    "credentials:plan",
    "credentials:approve",
    "credentials:sync",
    "credentials:rollback",
    "credentials:audit:read"
  ],
  tuiPanels: [{ id: "credential-sharing", title: "Credential Sharing" }]
};

/** Factory mirroring the LogicSRC Credential Sharing SDK spec. */
export function createCredentialEngine(options: CredentialEngineOptions = {}): CredentialEngine {
  return new CredentialEngine(options);
}

/** Provider listing without constructing an engine (used by the CLI `providers` command). */
export function listCredentialProviders() {
  return listCredentialProviderManifests();
}

export { credentialSharingManifest };
export { CredentialEngine, DEFAULT_CREDENTIAL_POLICY, endpointLabel } from "./engine.js";
export type { CredentialEngineOptions } from "./engine.js";
export {
  credentialProviders,
  credentialProviderRegistry,
  listCredentialProviderManifests,
  envProvider,
  dopplerProvider,
  railwayProvider,
  githubSecretsProvider,
  teamProvider,
  parseEnv,
  applyEnv
} from "./providers/index.js";
export {
  TeamClient,
  TeamApiError,
  type TeamClientOptions,
  type RemoteUser,
  type RemoteTeam,
  type RemoteMember,
  type RemoteVault,
  type RemoteSecret,
  type RemoteGrantRow
} from "./client.js";
export {
  generateIdentityKeyPair,
  generateVaultKey,
  wrapVaultKey,
  unwrapVaultKey,
  encryptValue,
  decryptValue,
  publicKeyForSecret,
  type IdentityKeyPair,
  type SealedValue
} from "./crypto.js";
export {
  loadOrCreateIdentity,
  readIdentity,
  saveIdentity,
  updateIdentity,
  requireAuth,
  verifyIdentityIntegrity,
  identityPath,
  logicsrcHome,
  defaultApiUrl,
  type LocalIdentity
} from "./identity.js";
export {
  createFileCredentialStore,
  createMemoryCredentialStore,
  defaultCredentialHome,
  type CredentialStore
} from "./store.js";
export { fingerprintValue, fingerprintsEqual } from "./fingerprint.js";
export * from "./types.js";
