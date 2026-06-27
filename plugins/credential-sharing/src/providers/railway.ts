import { keysFromValues } from "../fingerprint.js";
import { httpJson, requireEnv } from "./http.js";
import type { CredentialEndpoint, CredentialProvider, CredentialValueBag, CredentialWriteResult } from "../types.js";

const RAILWAY_API = "https://backboard.railway.app/graphql/v2";

function auth(): string {
  const token = requireEnv("RAILWAY_TOKEN", "Create a Railway account/project token and export it as RAILWAY_TOKEN.");
  return `Bearer ${token}`;
}

/** Railway addresses variables by project/environment(/service). project=projectId, config=environmentId, service=serviceId. */
function scope(endpoint: CredentialEndpoint): { projectId: string; environmentId: string; serviceId?: string } {
  if (!endpoint.project || !endpoint.config) {
    throw new Error('Railway endpoint needs project (projectId) and config (environmentId), e.g. --to-project <projectId> --to-config <environmentId>.');
  }
  return { projectId: endpoint.project, environmentId: endpoint.config, serviceId: endpoint.service };
}

async function gql<T>(query: string, variables: Record<string, unknown>, expect: string): Promise<T> {
  const data = await httpJson<{ data?: T; errors?: Array<{ message: string }> }>(RAILWAY_API, {
    method: "POST",
    headers: { Authorization: auth(), "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    expect
  });
  if (data.errors?.length) {
    throw new Error(`${expect} failed: ${data.errors.map((e) => e.message).join("; ")}`);
  }
  return data.data as T;
}

async function fetchVariables(endpoint: CredentialEndpoint): Promise<CredentialValueBag> {
  const { projectId, environmentId, serviceId } = scope(endpoint);
  const data = await gql<{ variables: Record<string, string> }>(
    `query Variables($projectId: String!, $environmentId: String!, $serviceId: String) {
       variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
     }`,
    { projectId, environmentId, serviceId },
    "Railway list variables"
  );
  return data.variables ?? {};
}

export const railwayProvider: CredentialProvider = {
  id: "railway",
  name: "Railway",
  description: "Sync service variables.",
  capabilities: { readValues: true, readNames: true, write: true, delete: true, rollback: true, audit: false },
  authRequirements: ["RAILWAY_TOKEN"],
  status: "available",

  async inspect(endpoint) {
    const values = await fetchVariables(endpoint);
    return { provider: "railway", endpoint, valuesReadable: true, keys: keysFromValues(values), inspectedAt: new Date().toISOString() };
  },

  async readValues(endpoint, keys) {
    const values = await fetchVariables(endpoint);
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
    const { projectId, environmentId, serviceId } = scope(endpoint);
    for (const [name, value] of Object.entries(upserts)) {
      await gql(
        `mutation Upsert($input: VariableUpsertInput!) { variableUpsert(input: $input) }`,
        { input: { projectId, environmentId, serviceId, name, value } },
        `Railway upsert ${name}`
      );
    }
    for (const name of deletes) {
      await gql(
        `mutation Delete($input: VariableDeleteInput!) { variableDelete(input: $input) }`,
        { input: { projectId, environmentId, serviceId, name } },
        `Railway delete ${name}`
      );
    }
    return results;
  }
};
