import { keysFromValues } from "../fingerprint.js";
import { httpJson, requireEnv } from "./http.js";
import type { CredentialEndpoint, CredentialProvider, CredentialValueBag, CredentialWriteResult } from "../types.js";

const DOPPLER_API = "https://api.doppler.com/v3";

function auth(): string {
  const token = requireEnv("DOPPLER_TOKEN", "Create a Doppler service token and export it as DOPPLER_TOKEN.");
  return `Bearer ${token}`;
}

function scopeQuery(endpoint: CredentialEndpoint): string {
  const params = new URLSearchParams();
  if (endpoint.project) params.set("project", endpoint.project);
  if (endpoint.config) params.set("config", endpoint.config);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

interface DopplerSecretsResponse {
  secrets: Record<string, { raw?: string; computed?: string }>;
}

async function fetchSecrets(endpoint: CredentialEndpoint): Promise<CredentialValueBag> {
  const data = await httpJson<DopplerSecretsResponse>(`${DOPPLER_API}/configs/config/secrets${scopeQuery(endpoint)}`, {
    headers: { Authorization: auth(), accept: "application/json" },
    expect: "Doppler list secrets"
  });
  const out: CredentialValueBag = {};
  for (const [name, value] of Object.entries(data.secrets ?? {})) {
    out[name] = value.raw ?? value.computed ?? "";
  }
  return out;
}

export const dopplerProvider: CredentialProvider = {
  id: "doppler",
  name: "Doppler",
  description: "Sync project/config scoped secrets.",
  capabilities: { readValues: true, readNames: true, write: true, delete: true, rollback: true, audit: false },
  authRequirements: ["DOPPLER_TOKEN"],
  status: "available",

  async inspect(endpoint) {
    const values = await fetchSecrets(endpoint);
    return { provider: "doppler", endpoint, valuesReadable: true, keys: keysFromValues(values), inspectedAt: new Date().toISOString() };
  },

  async readValues(endpoint, keys) {
    const values = await fetchSecrets(endpoint);
    return Object.fromEntries(keys.filter((k) => k in values).map((k) => [k, values[k]]));
  },

  async write({ endpoint, upserts, deletes, dryRun }) {
    const results: CredentialWriteResult[] = [
      ...Object.keys(upserts).map((key) => ({ key, applied: !dryRun })),
      ...deletes.map((key) => ({ key, applied: !dryRun }))
    ];
    if (dryRun) {
      return results;
    }
    // Doppler deletes a secret when its value is set to null.
    const secrets: Record<string, string | null> = { ...upserts };
    for (const key of deletes) {
      secrets[key] = null;
    }
    await httpJson(`${DOPPLER_API}/configs/config/secrets`, {
      method: "POST",
      headers: { Authorization: auth(), "content-type": "application/json" },
      body: JSON.stringify({ project: endpoint.project, config: endpoint.config, secrets }),
      expect: "Doppler update secrets"
    });
    return results;
  }
};
