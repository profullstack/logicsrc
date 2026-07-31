/**
 * sh1pt credential provider — the distribution-credential vault.
 *
 * Unlike every other adapter here, sh1pt is driven through its CLI rather than
 * a REST call. That is not a shortcut: sh1pt publishes `sh1pt secret set|get|
 * list|rm` as the interface to its cloud vault and documents no HTTP API for
 * it, so the CLI *is* the contract. Auth comes from `sh1pt login`, which writes
 * ~/.sh1pt/credentials; this adapter never handles a sh1pt token itself.
 *
 * The vault holds delivery credentials that Doppler/Railway/GitHub generally do
 * not — App Store Connect keys, Play service accounts, npm and Docker tokens,
 * Cloudflare tokens — which is exactly why it is worth syncing into.
 *
 * Values are written on STDIN, never as argv. `sh1pt secret set <key>` prompts
 * for the value when it is omitted, and a secret passed as a command-line
 * argument is world-readable in `ps` for the life of the process.
 */
import { execFile } from "node:child_process";
import { keysFromNames } from "../fingerprint.js";
import type { CredentialEndpoint, CredentialProvider, CredentialWriteResult } from "../types.js";

/** The binary to invoke. Overridable so CI can point at a pinned build. */
function sh1ptBin(): string {
  return process.env.SH1PT_BIN || "sh1pt";
}

/**
 * Secret names sh1pt will accept. We validate before shelling out: execFile
 * does not use a shell, so this is not injection defence, it is a clear error
 * instead of a confusing CLI usage failure on a malformed key.
 */
const SECRET_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

function assertSecretName(name: string): void {
  if (!SECRET_NAME.test(name)) {
    throw new Error(
      `"${name}" is not a valid sh1pt secret name. Use letters, digits, underscore, dot or dash, starting with a letter or underscore.`
    );
  }
}

interface RunResult {
  stdout: string;
  stderr: string;
}

/**
 * Run the sh1pt CLI. `stdin` is written to the child when provided, which is
 * how secret values are handed over without ever appearing in the process
 * table. Scoping flags come from the endpoint: `project` maps to sh1pt's
 * project, `config` to its environment.
 */
function runSh1pt(args: string[], endpoint: CredentialEndpoint, stdin?: string): Promise<RunResult> {
  const scoped = [...args];
  if (endpoint.project) scoped.push("--project", endpoint.project);
  if (endpoint.config) scoped.push("--env", endpoint.config);

  return new Promise((resolve, reject) => {
    const child = execFile(
      sh1ptBin(),
      scoped,
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === "ENOENT") {
            reject(
              new Error(
                `The sh1pt CLI was not found on PATH. Install it and run "sh1pt login", or set SH1PT_BIN to its path.`
              )
            );
            return;
          }
          // stderr carries sh1pt's own message (not logged in, unknown project, …).
          reject(new Error(`sh1pt ${scoped[0]} ${scoped[1] ?? ""} failed: ${(stderr || error.message).trim().slice(0, 300)}`));
          return;
        }
        resolve({ stdout, stderr });
      }
    );
    // Always close stdin, even with nothing to send. Leaving it open hangs any
    // sh1pt subcommand that waits on input (a confirmation prompt, say) until
    // the process is killed.
    child.stdin?.end(stdin ?? "");
  });
}

/**
 * `sh1pt secret list` prints key names, one per line, and never values. We
 * tolerate a decorated list (bullets, blank lines) but refuse anything with
 * whitespace inside it, which would mean the output format changed under us.
 */
export function parseSecretList(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => line.replace(/^[\s*\-•]+/, "").trim())
    .filter((line) => line.length > 0 && SECRET_NAME.test(line));
}

export const sh1ptProvider: CredentialProvider = {
  id: "sh1pt",
  name: "sh1pt",
  description: "Distribution credential vault (App Store, Play, npm, Docker, Cloudflare) via the sh1pt CLI.",
  // readValues is false by design, not by omission: `sh1pt secret get` requires
  // interactive confirmation, so it cannot be scripted. That also makes this a
  // write-only target -- no rollback pre-image can be captured, same as
  // github-secrets.
  capabilities: { readValues: false, readNames: true, write: true, delete: true, rollback: false, audit: false },
  authRequirements: ["sh1pt login"],
  status: "available",

  async inspect(endpoint) {
    const { stdout } = await runSh1pt(["secret", "list"], endpoint);
    return {
      provider: "sh1pt",
      endpoint,
      valuesReadable: false,
      keys: keysFromNames(parseSecretList(stdout)),
      inspectedAt: new Date().toISOString()
    };
  },

  async write({ endpoint, upserts, deletes, dryRun }) {
    for (const key of [...Object.keys(upserts), ...deletes]) {
      assertSecretName(key);
    }

    const results: CredentialWriteResult[] = [];
    if (dryRun) {
      return [
        ...Object.keys(upserts).map((key) => ({ key, applied: false })),
        ...deletes.map((key) => ({ key, applied: false }))
      ];
    }

    // One invocation per key: the CLI has no bulk form, and a partial failure
    // should report per-key rather than abort the whole run.
    for (const [key, value] of Object.entries(upserts)) {
      try {
        await runSh1pt(["secret", "set", key], endpoint, `${value}\n`);
        results.push({ key, applied: true });
      } catch (error) {
        results.push({ key, applied: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    for (const key of deletes) {
      try {
        await runSh1pt(["secret", "rm", key], endpoint);
        results.push({ key, applied: true });
      } catch (error) {
        results.push({ key, applied: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  }
};
