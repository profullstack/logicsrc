import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * API-key tools for the MCP server: list, create and revoke LogicSRC API keys
 * by calling the credentials app's /api/keys over HTTPS.
 *
 * Auth is a Bearer token from LOGICSRC_API_KEY (and LOGICSRC_API for a server
 * other than https://app.logicsrc.com). It must be a PERSON's key (`logicsrc
 * keys create <name> --kind user`, or the one `logicsrc login` stored): the
 * server refuses to let a machine key mint, list or revoke keys, and these
 * tools pass that refusal through rather than working around it.
 *
 * Secrets: `create_api_key` returns the new key's secret exactly once, in its
 * result. Nothing here stores it.
 */

export const DEFAULT_API_URL = "https://app.logicsrc.com";

export interface ApiKeyToolsOptions {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
}

class ToolError extends Error {}

function client(options: ApiKeyToolsOptions) {
  const env = options.env ?? process.env;
  const doFetch = options.fetch ?? fetch;
  return async function call(method: string, path: string, body?: unknown): Promise<unknown> {
    const token = env.LOGICSRC_API_KEY?.trim();
    if (!token) {
      throw new ToolError(
        "LOGICSRC_API_KEY is not set. Give this MCP server a person's LogicSRC API key (logicsrc keys create <name> --kind user) in its environment."
      );
    }
    const base = (env.LOGICSRC_API || env.LOGICSRC_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
    const headers: Record<string, string> = { accept: "application/json", authorization: `Bearer ${token}` };
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await doFetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let parsed: unknown;
    try { parsed = text ? JSON.parse(text) : undefined; } catch { parsed = undefined; }
    if (!res.ok) {
      const message = parsed && typeof parsed === "object" && "error" in parsed ? String((parsed as { error: unknown }).error) : `${res.status} ${res.statusText}`;
      throw new ToolError(`${method} ${path} failed (${res.status}): ${message}`);
    }
    return parsed;
  };
}

function textResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], ...(isError ? { isError: true } : {}) };
}

async function guarded(fn: () => Promise<unknown>) {
  try {
    return textResult(JSON.stringify(await fn(), null, 2));
  } catch (error) {
    return textResult(error instanceof Error ? error.message : String(error), true);
  }
}

export function registerApiKeys(server: McpServer, options: ApiKeyToolsOptions = {}): void {
  const call = client(options);

  server.registerTool(
    "list_api_keys",
    {
      title: "List LogicSRC API Keys",
      description: "Lists the caller's LogicSRC API keys (person and machine keys): name, prefix, team and vault scope, read-only, expiry, whether a machine key has registered its identity. Never returns secrets. Needs LOGICSRC_API_KEY (a person's key).",
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async () => guarded(() => call("GET", "/api/keys"))
  );

  server.registerTool(
    "create_api_key",
    {
      title: "Create LogicSRC API Key",
      description: "Creates a LogicSRC API key. A machine key (the default) is scoped to one team and optionally some vaults (<project>--<env>), read-only unless readOnly is false, and may expire. The secret is in this result only; hand it to the deploy box and do not repeat it. Needs LOGICSRC_API_KEY (a person's key).",
      inputSchema: {
        name: z.string().min(1).max(40).describe("A name for the key, e.g. dev2-deploy."),
        kind: z.enum(["machine", "user"]).optional().describe("machine (default) or user (acts as the person)."),
        team: z.string().optional().describe("Team slug; required for a machine key."),
        vaults: z.array(z.string()).optional().describe("Vault names the key may read, e.g. [\"web--prod\"]. Omit for every vault in the team."),
        readOnly: z.boolean().optional().describe("Machine keys: true (default) pulls only."),
        expires: z.string().optional().describe("30d, 12h, 1y, or a date such as 2027-01-01. Omit for no expiry.")
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true }
    },
    async ({ name, kind, team, vaults, readOnly, expires }) =>
      guarded(async () => {
        const k = kind ?? "machine";
        if (k === "machine" && !team) throw new ToolError("A machine key needs a team.");
        return call("POST", "/api/keys", {
          name,
          kind: k,
          ...(k === "machine" ? { team, vaults: vaults ?? [], readOnly: readOnly ?? true } : {}),
          ...(expires ? { expiresAt: expires } : {})
        });
      })
  );

  server.registerTool(
    "revoke_api_key",
    {
      title: "Revoke LogicSRC API Key",
      description: "Revokes one of the caller's LogicSRC API keys by id (from list_api_keys). Anything using it gets a 401 from then on, and its vault grants are deleted. Needs LOGICSRC_API_KEY (a person's key).",
      inputSchema: { id: z.string().min(1).describe("The key id from list_api_keys.") },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async ({ id }) => guarded(() => call("DELETE", `/api/keys/${encodeURIComponent(id)}`))
  );
}
