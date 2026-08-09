import type { Command } from "commander";
import { registerContextCommands } from "@logicsrc/opencontext/commands";

/**
 * `logicsrc context …`
 *
 * The commands themselves live in `@logicsrc/opencontext` and are shared
 * verbatim with the standalone `opencontext` binary, so the two can never
 * drift. That matters because the specification treats CLI behaviour — flags,
 * output shapes, and exit codes — as a conformance surface, and a subcommand
 * that quietly diverged would make `logicsrc context validate` and
 * `opencontext validate` two different contracts.
 */
export function registerOpenContextCommands(program: Command): void {
  const context = program
    .command("context")
    .description(
      "OpenContext: durable, portable, permissioned context for humans and AI agents. " +
        "Also available as the standalone `opencontext` command."
    );

  registerContextCommands(context);
}
