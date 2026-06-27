import type { CredentialProvider, CredentialProviderManifest } from "../types.js";
import { envProvider } from "./env.js";
import { dopplerProvider } from "./doppler.js";
import { railwayProvider } from "./railway.js";
import { githubSecretsProvider } from "./github-secrets.js";

export const credentialProviders: CredentialProvider[] = [envProvider, dopplerProvider, railwayProvider, githubSecretsProvider];

export const credentialProviderRegistry: Map<string, CredentialProvider> = new Map(
  credentialProviders.map((provider) => [provider.id, provider])
);

export function listCredentialProviderManifests(): CredentialProviderManifest[] {
  return credentialProviders.map(({ id, name, description, capabilities, authRequirements, status }) => ({
    id,
    name,
    description,
    capabilities,
    authRequirements,
    status
  }));
}

export { envProvider, dopplerProvider, railwayProvider, githubSecretsProvider };
export { parseEnv, applyEnv } from "./env.js";
