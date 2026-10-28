import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DEFAULT_API_URL, type ApiKeyToolsOptions } from "./apikeys.js";

/**
 * Keyring tools: the caller's `logicsrc keyring` (SSH keys and other key
 * pairs) as stored in the account at app.logicsrc.com/api/keyring.
 *
 * These tools NEVER return a plaintext private key and cannot: the account
 * holds only ciphertext sealed on the user's machine, and the passphrase that
 * opens it is never given to an agent. Listing and showing return public
 * halves and fingerprints. Adding takes an entry that is ALREADY sealed by the
 * CLI (ciphertext envelope); anything that looks like private key material is
 * refused here and again by the server. Restoring a key onto a machine is a
 * terminal step for the person, and `keyring_restore_instructions` says how.
 */

const PRIVATE_MATERIAL = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
  /-----BEGIN PGP PRIVATE KEY BLOCK-----/,
  /AGE-SECRET-KEY-1/,
  /PuTTY-User-Key-File-/,
  /b3BlbnNzaC1rZXktdjE/
];
const looksPrivate = (text: string) => PRIVATE_MATERIAL.some((re) => re.test(text));

class ToolError extends Error {}

function client(options: ApiKeyToolsOptions) {
  const env = options.env ?? process.env;
  const doFetch = options.fetch ?? fetch;
  return async function call(method: string, path: string, body?: unknown): Promise<unknown> {
    const token = env.LOGICSRC_API_KEY?.trim();
    if (!token) throw new ToolError("LOGICSRC_API_KEY is not set. Give this MCP server a person's LogicSRC API key (logicsrc keys create <name> --kind user).");
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
    // Defence in depth: never pass anything that looks like a private key back to the agent.
    if (looksPrivate(text)) throw new ToolError("The response contained private key material and was withheld.");
    return parsed;
  };
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

const entrySchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  type: z.enum(["ssh-ed25519", "ssh-rsa", "ssh-ecdsa", "gpg", "age", "generic"]),
  filename: z.string().min(1).max(255),
  publicKey: z.string().max(16384),
  fingerprint: z.string().max(128),
  comment: z.string().max(1024).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  envelope: z.object({ id: z.string(), type: z.number(), ciphertext: z.string(), iv: z.string(), v: z.number().optional() }),
  deletedAt: z.null().optional()
});

export function registerKeyring(server: McpServer, options: ApiKeyToolsOptions = {}): void {
  const call = client(options);

  server.registerTool(
    "list_keyring_keys",
    {
      title: "List Keyring Keys",
      description: "Lists the caller's LogicSRC keyring (SSH keys and other key pairs): name, type, file name it restores to, public key, fingerprint, comment. Public halves only; private keys are ciphertext the server cannot open and are never returned. Needs LOGICSRC_API_KEY (a person's key).",
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async () => guarded(async () => ((await call("GET", "/api/keyring")) as { entries: unknown[] }).entries)
  );

  server.registerTool(
    "show_keyring_key",
    {
      title: "Show Keyring Key",
      description: "Shows one keyring key's public half and fingerprint, by name or id. Never the private key.",
      inputSchema: { name: z.string().min(1).describe("Key name (e.g. id_ed25519) or id.") },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ name }) => guarded(async () => ((await call("GET", `/api/keyring/entries/${encodeURIComponent(name)}`)) as { entry: unknown }).entry)
  );

  server.registerTool(
    "export_authorized_keys",
    {
      title: "Export authorized_keys",
      description: "Returns the keyring's SSH public keys as authorized_keys lines, for granting access to a server. Public keys only.",
      inputSchema: { names: z.array(z.string()).optional().describe("Only these key names (default: every SSH key).") },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ names }) =>
      guarded(async () => {
        const { entries } = (await call("GET", "/api/keyring")) as { entries: Array<{ name: string; type: string; publicKey: string }> };
        return entries
          .filter((e) => e.type.startsWith("ssh-") && (!names?.length || names.includes(e.name)))
          .map((e) => e.publicKey.trim())
          .join("\n");
      })
  );

  server.registerTool(
    "add_keyring_key_ciphertext",
    {
      title: "Add Sealed Key To Keyring",
      description: "Stores a keyring entry that was ALREADY encrypted on the user's machine (an OpenCreds envelope from `logicsrc keyring`, found in ~/.config/logicsrc/keyring/entries/<id>.json). Refuses anything containing a plaintext private key. To import a key file, the person runs `logicsrc keyring add ~/.ssh/id_ed25519 --sync` instead; never ask them for a private key or passphrase.",
      inputSchema: { entry: entrySchema.describe("The sealed entry JSON.") },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true }
    },
    async ({ entry }) =>
      guarded(async () => {
        if (looksPrivate(JSON.stringify(entry)) || looksPrivate(Buffer.from(entry.envelope.ciphertext, "base64").toString("latin1"))) {
          throw new ToolError("Refused: this entry contains a plaintext private key. Seal it with `logicsrc keyring add <file>` first.");
        }
        return call("PUT", `/api/keyring/entries/${encodeURIComponent(entry.id)}`, { entry });
      })
  );

  server.registerTool(
    "remove_keyring_key",
    {
      title: "Remove Keyring Key",
      description: "Removes a key from the account keyring (a tombstone that reaches the user's other machines on their next `logicsrc keyring sync`). Files already restored on disk are not touched.",
      inputSchema: { name: z.string().min(1).describe("Key name or id.") },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async ({ name }) => guarded(() => call("DELETE", `/api/keyring/entries/${encodeURIComponent(name)}`))
  );

  server.registerTool(
    "keyring_restore_instructions",
    {
      title: "Keyring Restore Instructions",
      description: "How the person restores a keyring key onto a machine. Restoring needs their keyring passphrase, which an agent must never hold, so this returns the commands for them to run.",
      inputSchema: { name: z.string().min(1).describe("Key name, e.g. id_ed25519."), dir: z.string().optional().describe("Target directory (default ~/.ssh).") },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ name, dir }) =>
      guarded(async () => {
        const { entry } = (await call("GET", `/api/keyring/entries/${encodeURIComponent(name)}`)) as { entry: { name: string; filename: string; fingerprint: string } };
        const to = dir ?? "~/.ssh";
        return [
          `Key ${entry.name} (${entry.fingerprint}) restores to ${to}/${entry.filename} (600) and ${entry.filename}.pub (644).`,
          "On the target machine, the person runs:",
          "  curl -fsSL https://logicsrc.com/install.sh | sh   # if logicsrc is not installed",
          "  logicsrc login",
          "  logicsrc keyring sync",
          `  logicsrc keyring restore ${entry.name}${dir ? ` --to ${dir}` : ""}`,
          `  ssh-keygen -lf ${to}/${entry.filename}   # should print ${entry.fingerprint}`,
          "An existing different key at that path is refused unless --force, which backs it up first."
        ].join("\n");
      })
  );
}
