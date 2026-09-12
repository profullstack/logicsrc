import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Command } from "commander";

/**
 * `logicsrc openspec <anything OpenSpec.dev understands>`
 *
 * `logicsrc openspec` owns three words of its own (`import`, `export`,
 * `change`: the LogicSRC-shaped view of a repo's OpenSpec artifacts). Every
 * other word is OpenSpec.dev's, and goes to OpenSpec.dev's real CLI
 * (`@fission-ai/openspec`, the `openspec` binary) with the arguments exactly
 * as typed: `logicsrc openspec init`, `list`, `validate`, `archive`, `show`.
 * So a repo in compatibility mode needs one command installed, not two, and
 * the OpenSpec.dev half is the upstream tool itself rather than a
 * reimplementation of it that would drift.
 *
 * Spawned rather than imported: the package exports a library entry only, and
 * its bin does the argv parsing, colour and prompts. Its bin is not on the
 * exports map, so it is found from the package root instead of resolved by
 * name.
 */
export const OPENSPEC_PACKAGE = "@fission-ai/openspec";

/** Where OpenSpec.dev's bin lives, found from its package root. */
export function openspecBin(resolveEntry: (id: string) => string = createRequire(import.meta.url).resolve): string {
  // The only export is dist/index.js; bin/openspec.js sits beside dist/.
  const entry = resolveEntry(OPENSPEC_PACKAGE);
  return join(dirname(dirname(entry)), "bin", "openspec.js");
}

export function runOpenspec(args: string[], bin: string = openspecBin()): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, ...args], { stdio: "inherit" });
    child.on("error", (error) => {
      console.error(`Could not start OpenSpec.dev's CLI at ${bin}: ${error.message}`);
      resolve(1);
    });
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

/**
 * Attach the pass-through as the group's default subcommand, so any word
 * commander does not know (`init`, `list`, `validate`, ...) lands here with
 * its arguments intact, while `import`, `export` and `change` keep working.
 */
export function registerOpenSpecDevPassthrough(openspec: Command, run: (args: string[]) => Promise<number> = runOpenspec): void {
  openspec.passThroughOptions();
  openspec
    .command("dev", { isDefault: true, hidden: true })
    .argument("[args...]", "Arguments for OpenSpec.dev's openspec command, exactly as it takes them")
    .allowUnknownOption()
    .passThroughOptions()
    .helpOption(false)
    .description("Any other word: OpenSpec.dev's own CLI (init, list, validate, archive, show, ...).")
    .action(async (args: string[]) => {
      process.exitCode = await run(args.length ? args : ["--help"]);
    });
}
