import { spawnSync } from "node:child_process";
import type { Command } from "commander";
import { registerErrandCommands as registerRunner, type Deps, type LogicsrcExec } from "@logicsrc/openerrand/commands";

/**
 * `logicsrc errand …`
 *
 * The runner lives in `@logicsrc/openerrand`, the reference implementation of
 * OpenErrand; this file only mounts it. A team vault named by an errand
 * (`teams:<team>/<project>/<env>`) is read and written through this same CLI's
 * `teams pull` / `teams push`, re-entered as a child process so the runner
 * never needs the CLI's session code and the plaintext lives for one call.
 *
 * `deps` is injectable so the umbrella test drives the group without a
 * terminal, a browser or a vault.
 */
export function registerErrandCommands(program: Command, deps: Partial<Deps> = {}): void {
  const errand = program
    .command("errand")
    .description(
      "OpenErrand: run an errand file on a website with no API, in headless Chrome, stopping at every step " +
        "that belongs to a person (declarations, identity proofing, codes, letters, captchas).",
    );

  const self: LogicsrcExec = (args, options) => {
    const entry = process.argv[1];
    const result = entry
      ? spawnSync(process.execPath, [entry, ...args], { encoding: "utf8", stdio: [options?.inheritStdin ? "inherit" : "ignore", "pipe", "pipe"] })
      : spawnSync("logicsrc", args, { encoding: "utf8", stdio: [options?.inheritStdin ? "inherit" : "ignore", "pipe", "pipe"] });
    if (result.error) return { status: 1, stdout: "", stderr: result.error.message };
    return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  };

  registerRunner(errand, { logicsrc: self, ...deps });
}
