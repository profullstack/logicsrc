import { spawn } from "node:child_process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DEFAULT_API_URL, type ApiKeyToolsOptions } from "./apikeys.js";

/**
 * Key rotation tools, mirroring `logicsrc teams rotation | rotation-set | rotate-keys`.
 *
 * Rotating needs the vault keys, which only the person's machine holds (the
 * server sees ciphertext only), so these tools run the local `logicsrc` CLI
 * (LOGICSRC_BIN, default `logicsrc`) with --format json and return its JSON.
 * The CLI never prints a value, and rotate_keys is a DRY RUN unless
 * `approve: true`. With `queue: true` rotate_keys instead queues a run on
 * app.logicsrc.com (LOGICSRC_API_KEY) for a runner (`rotate-keys --from-queue`).
 * `source: "server"` on rotation_plan reads the server's catalog plan over
 * HTTPS instead of the CLI (no local identity needed; encrypted per-key
 * entries are then only flagged, not read).
 */

export interface RotationToolsOptions extends ApiKeyToolsOptions {
  /** Runs the CLI (tests pass a fake). */
  runCli?: (args: string[], env: NodeJS.ProcessEnv) => Promise<{ code: number | null; stdout: string; stderr: string }>;
}

class ToolError extends Error {}

const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/;
const KEY = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const HOST = /^[A-Za-z0-9._@-]{1,100}$/;

function defaultRunCli(args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(env.LOGICSRC_BIN || "logicsrc", args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => resolve({ code: null, stdout, stderr: e.message }));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const textResult = (text: string, isError = false) => ({ content: [{ type: "text" as const, text }], ...(isError ? { isError: true } : {}) });

async function guarded(fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    return textResult(typeof out === "string" ? out : JSON.stringify(out, null, 2));
  } catch (error) {
    return textResult(error instanceof Error ? error.message : String(error), true);
  }
}

const check = (re: RegExp, what: string) => (v: string | undefined) => {
  if (v !== undefined && !re.test(v)) throw new ToolError(`bad ${what}: ${JSON.stringify(v).slice(0, 60)}`);
  return v;
};
const team = check(NAME, "team");
const proj = check(NAME, "project");
const envName = check(NAME, "env");
const host = check(HOST, "desktop host");
function keys(list: string[] | undefined): string[] {
  for (const k of list ?? []) check(KEY, "key")(k);
  return list ?? [];
}

export function registerRotation(server: McpServer, options: RotationToolsOptions = {}): void {
  const env = options.env ?? process.env;
  const runCli = options.runCli ?? defaultRunCli;
  const doFetch = options.fetch ?? fetch;

  async function cli(args: string[]): Promise<unknown> {
    const r = await runCli(args, env);
    if (r.code === null) throw new ToolError(`could not run the logicsrc CLI (${r.stderr.trim().slice(0, 200)}). Install it: curl -fsSL https://logicsrc.com/install.sh | sh`);
    const out = r.stdout.trim();
    let parsed: unknown;
    try {
      parsed = out ? JSON.parse(out) : null;
    } catch {
      parsed = undefined;
    }
    // stderr carries the CLI's notes (dry-run hints, locked vaults); never values.
    const notes = r.stderr.trim().split("\n").filter(Boolean).slice(-20);
    if (r.code !== 0 && parsed === undefined) throw new ToolError(`logicsrc ${args.slice(0, 2).join(" ")} failed (exit ${r.code}): ${notes.join(" | ").slice(0, 600)}`);
    return { exitCode: r.code, result: parsed ?? out, notes };
  }

  async function api(method: string, path: string, body?: unknown): Promise<unknown> {
    const token = env.LOGICSRC_API_KEY?.trim();
    if (!token) throw new ToolError("LOGICSRC_API_KEY is not set: give this MCP server a person's LogicSRC API key (logicsrc keys create <name> --kind user).");
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
  }

  const scope = {
    team: z.string().describe("Team slug, e.g. profullstack"),
    project: z.string().optional().describe("Only this project"),
    env: z.string().optional().describe("Only this environment (prod, staging, ...)"),
    keys: z.array(z.string()).optional().describe("Only these key names")
  };
  const positional = (a: { team: string; project?: string; env?: string }) => [team(a.team)!, ...(a.project ? [proj(a.project)!] : []), ...(a.project && a.env ? [envName(a.env)!] : [])];
  const keyArgs = (k: string[]) => (k.length ? ["--key", k.join(",")] : []);

  server.registerTool(
    "rotation_plan",
    {
      title: "Key Rotation Plan",
      description:
        "How each secret in a LogicSRC team is rotated: method (random, provider, desktop, ssh-keygen, command, manual), whether it is automatic, owner, steps, url, consumers, which vaults hold the value, last rotated. Never returns values. Default source: the local logicsrc CLI (reads encrypted per-key instructions); source 'server' asks app.logicsrc.com (catalog only, needs LOGICSRC_API_KEY).",
      inputSchema: { ...scope, source: z.enum(["cli", "server"]).optional() },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (a) =>
      guarded(async () => {
        const k = keys(a.keys);
        if (a.source === "server") {
          const qs = new URLSearchParams(Object.entries({ project: proj(a.project), env: envName(a.env), key: k.join(",") || undefined }).filter((e): e is [string, string] => Boolean(e[1]))).toString();
          return api("GET", `/api/credshare/teams/${encodeURIComponent(team(a.team)!)}/rotation${qs ? `?${qs}` : ""}`);
        }
        return cli(["teams", "rotation", ...positional(a), ...keyArgs(k), "--format", "json"]);
      })
  );

  server.registerTool(
    "rotation_set",
    {
      title: "Set Key Rotation Instructions",
      description:
        "Store rotation instructions for one key as its encrypted __ROTATE__<KEY> entry (logicsrc teams rotation-set). spec is the JSON spec: {method, url?, steps?, consumers?, note?, provider?, recipe?, format?, length?, command?}. A wallet, signing or banned-provider key can never be made automatic.",
      inputSchema: {
        team: z.string(),
        project: z.string(),
        env: z.string(),
        key: z.string(),
        spec: z.record(z.string(), z.unknown()).describe("The rotation spec, e.g. {\"method\":\"desktop\",\"recipe\":\"openai\"}")
      },
      annotations: { destructiveHint: false, openWorldHint: true }
    },
    async (a) =>
      guarded(async () => {
        check(KEY, "key")(a.key);
        return cli(["teams", "rotation-set", team(a.team)!, proj(a.project)!, envName(a.env)!, a.key, "--json", JSON.stringify(a.spec), "--output", "json"]);
      })
  );

  server.registerTool(
    "rotate_keys",
    {
      title: "Rotate Keys",
      description:
        "Rotate secret values (logicsrc teams rotate-keys). DRY RUN unless approve is true. propagate rewrites, restarts and health-checks consumer sites (rolls back on failure). desktop names a W3BS Agentic Desktop Layer ssh host for dashboard-only keys (OpenAI, ElevenLabs, Brave, Civitai; Cloudflare Global API Key also needs allowRoll). queue: true queues the run on app.logicsrc.com for a runner (logicsrc teams rotate-keys --from-queue) instead of running it here. Results name keys, vaults, sites and statuses, never values.",
      inputSchema: {
        ...scope,
        approve: z.boolean().optional().describe("Write new values. Default false (dry run)."),
        propagate: z.boolean().optional(),
        desktop: z.string().optional().describe("ssh host of a W3BS desktop, e.g. bonita"),
        allowRoll: z.boolean().optional(),
        max: z.number().int().positive().optional().describe("Stop after n live rotations"),
        queue: z.boolean().optional().describe("Queue on app.logicsrc.com instead of running locally")
      },
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (a) =>
      guarded(async () => {
        const k = keys(a.keys);
        host(a.desktop);
        if (a.queue) {
          if (!k.length) throw new ToolError("queue needs keys: pick the keys to rotate (rotation_plan lists them).");
          return api("POST", `/api/credshare/teams/${encodeURIComponent(team(a.team)!)}/rotation/runs`, {
            keys: k,
            project: proj(a.project),
            env: envName(a.env),
            approve: Boolean(a.approve),
            propagate: Boolean(a.propagate),
            allowRoll: Boolean(a.allowRoll),
            ...(a.desktop ? { desktop: a.desktop } : {})
          });
        }
        return cli([
          "teams",
          "rotate-keys",
          ...positional(a),
          ...keyArgs(k),
          ...(a.approve ? ["--approve"] : []),
          ...(a.propagate ? ["--propagate"] : []),
          ...(a.desktop ? ["--desktop", a.desktop] : []),
          ...(a.allowRoll ? ["--allow-roll"] : []),
          ...(a.max ? ["--max", String(a.max)] : []),
          "--format",
          "json"
        ]);
      })
  );

  server.registerTool(
    "rotation_runs",
    {
      title: "Key Rotation Runs",
      description: "Rotation runs queued on app.logicsrc.com and their per-key outcomes (never values). Needs LOGICSRC_API_KEY.",
      inputSchema: { team: z.string(), status: z.enum(["queued", "running", "done", "failed", "cancelled"]).optional() },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (a) => guarded(() => api("GET", `/api/credshare/teams/${encodeURIComponent(team(a.team)!)}/rotation/runs${a.status ? `?status=${a.status}` : ""}`))
  );
}
