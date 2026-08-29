#!/usr/bin/env node
/**
 * The standalone `opencreds` binary.
 *
 * Exactly the commands `logicsrc creds …` registers, from the same module, so
 * the two cannot drift — which matters because the specification treats the CLI
 * as a conformance surface.
 */

import { Command } from "commander";
import { registerCredsCommands } from "./commands.js";
import { OPENCREDS_VERSION } from "./types.js";

const program = new Command();

program
  .name("opencreds")
  .description(
    "OpenCreds: one credential record for logins, cards, identities, notes, keys and " +
      "accounts, an end-to-end-encrypted vault, and a portable database that moves " +
      "between products without a plaintext CSV. https://logicsrc.com/opencreds",
  )
  .version(`opencreds ${OPENCREDS_VERSION} (@logicsrc/opencreds 0.1.0)`);

registerCredsCommands(program);

program.parseAsync(process.argv).catch((err: Error) => {
  process.stderr.write(`${err.message}\n`);
  process.exitCode = 1;
});
