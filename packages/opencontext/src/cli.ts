#!/usr/bin/env node
/**
 * The standalone `opencontext` binary.
 *
 * The same commands are available as `logicsrc context <command>`; both call
 * `registerContextCommands`, so there is exactly one implementation of the CLI
 * contract.
 */

import { Command } from "commander";
import { registerContextCommands } from "./commands.js";
import { SPEC_VERSION } from "./manifest.js";

// A closed pipe (`opencontext list | head`) is a normal way to use a CLI, not
// an error worth a stack trace.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

const program = new Command();

program
  .name("opencontext")
  .description(
    "Durable, portable, permissioned context for humans and AI agents.\n\n" +
      "No account, no telemetry, no network unless a context source asks for one."
  )
  .version(SPEC_VERSION, "-v, --version", "print the supported specification version");

registerContextCommands(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error((error as Error).message ?? String(error));
  process.exit(1);
});
