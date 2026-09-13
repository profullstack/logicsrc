import type { Command } from "commander";
import { registerOpenFleetCommands, type Deps } from "@logicsrc/openfleet/commands";

/**
 * `logicsrc fleet …`
 *
 * The commands themselves live in `@logicsrc/openfleet`, the same package that
 * holds the record, the ledger and the Claude Code hooks, so the sysop tool
 * and the engine side read the same files through the same code. The spec
 * treats the five verbs (open, cap, tree, stop, log) and their refusals as a
 * conformance surface; keeping them in one place is how they stay one contract.
 *
 * `deps` is injectable so the umbrella tests drive the group with a fake
 * clock, environment, roster and process runner, and never touch
 * `~/.openfleet` or a real engine.
 */
export function registerFleetCommands(program: Command, deps: Partial<Deps> = {}): void {
  const fleet = program
    .command("fleet")
    .description(
      "OpenFleet: agents under a human. open, cap, tree, stop and log over $OPENFLEET_HOME, " +
        "plus the Claude Code hooks (`hooks install`) that make every session a recorded member.",
    );

  registerOpenFleetCommands(fleet, deps);
}
