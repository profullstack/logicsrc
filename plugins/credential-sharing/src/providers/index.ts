import type { CredentialProvider, CredentialProviderManifest } from "../types.js";
import { envProvider } from "./env.js";
import { dopplerProvider } from "./doppler.js";
import { railwayProvider } from "./railway.js";
import { githubSecretsProvider } from "./github-secrets.js";
import { sh1ptProvider } from "./sh1pt.js";
import { teamProvider } from "./team.js";

export const credentialProviders: CredentialProvider[] = [envProvider, dopplerProvider, railwayProvider, githubSecretsProvider, sh1ptProvider, teamProvider];

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

export { envProvider, dopplerProvider, railwayProvider, githubSecretsProvider, sh1ptProvider, teamProvider };
export { parseEnv, applyEnv } from "./env.js";
