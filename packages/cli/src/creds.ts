import type { Command } from "commander";
import { registerCredsCommands } from "@logicsrc/opencreds/commands";

/**
 * `logicsrc vault …`
 *
 * The commands themselves live in `@logicsrc/opencreds` and are shared verbatim
 * with the standalone `opencreds` binary, so the two can never drift. That
 * matters because the specification treats CLI behaviour — flags, output shapes
 * and exit codes — as a conformance surface, and a subcommand that quietly
 * diverged would make `logicsrc vault validate` and `opencreds validate` two
 * different contracts.
 *
 * Named `vault` rather than `creds` because `creds` is already an alias of
 * `logicsrc credentials`, and the two are genuinely different things:
 * `credentials` moves a key/value pair *between providers*, while `vault`
 * *stores a record* — a login, a card, an identity, a note, a key or an
 * account — encrypted end to end and portable as one file rather than a
 * plaintext CSV. They meet at the `key` item: a synced .env entry, stored.
 */
export function registerOpenCredsCommands(program: Command): void {
  const vault = program
    .command("vault")
    .description(
      "OpenCreds: an end-to-end-encrypted vault for logins, cards, identities, notes, keys " +
        "and accounts, portable as one file. Also available as the standalone `opencreds` command.",
    );

  registerCredsCommands(vault);
}
