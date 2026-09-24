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
export const VAULT_GUIDE = `
There are two vaults. Pick the one you need:

  Team secrets    .env keys shared with your team (DATABASE_URL, STRIPE_SECRET_KEY, …)
                  -> logicsrc teams …     (this is where the company secrets are)
  Personal vault  your own logins, cards, SSH keys, notes
                  -> logicsrc vault …

Team secrets, the everyday commands:
  logicsrc login                                           once per machine
  logicsrc teams list                                      the teams you are in
  logicsrc teams secrets <team>                            every secret name + its category
  logicsrc teams secrets <team> --category db              only database secrets
  logicsrc teams secrets <team> -s stripe                  names containing "stripe"
  logicsrc teams export <team> --category db -o db.csv     decrypt them into a CSV
  logicsrc teams pull <team> <project> <env>               write one vault into ./.env
  logicsrc teams categories                                db, social, server, api, cloud, …

Personal vault:
  logicsrc vault init                                      create it (once)
  eval "$(logicsrc vault unlock)"                          unlock for this shell
  logicsrc vault add login --name GitHub --username me --password -
  logicsrc vault list --category social                    never shows values
  logicsrc vault get GitHub --field login.password --reveal
  logicsrc vault export --format csv --category db --out db.csv --yes
  logicsrc vault import bitwarden.csv

Help for any command: logicsrc vault <command> --help   (or: logicsrc vault help <command>)
`;

export function registerOpenCredsCommands(program: Command): void {
  const vault = program
    .command("vault")
    .description(
      "Your personal encrypted vault (logins, cards, keys, notes). " +
        "Team .env secrets are under `logicsrc teams` — examples below.",
    )
    // Most people typing `logicsrc vault` want the TEAM secrets, which live
    // under `teams`. Say so first, with commands they can paste.
    .addHelpText("after", VAULT_GUIDE);

  registerCredsCommands(vault);
}
