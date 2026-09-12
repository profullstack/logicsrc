import type { Command } from "commander";

/**
 * `logicsrc openmcp …`
 *
 * OpenMCP is the one LogicSRC command that lives outside this monorepo
 * (github.com/logicsrc/openmcp, published as `@logicsrc/openmcp`), so unlike
 * `vault`, `prd` and `context` it cannot register commander commands here.
 * Instead every argument after `openmcp` is handed, untouched, to the same
 * `main(argv)` the standalone `openmcp` binary runs, so `logicsrc openmcp
 * relays` and `openmcp relays` are one contract and can never drift.
 *
 * The import is deferred to the action because the catalog keeps its records
 * in `node:sqlite`, which is Node 24, while the rest of this CLI runs on 18.
 * A box on an older Node keeps every other command and gets a plain sentence
 * from this one instead of a stack trace about a built-in it has never heard
 * of.
 */
export const OPENMCP_PACKAGE = "@logicsrc/openmcp";
export const OPENMCP_MIN_NODE = 24;

export function openmcpNodeMessage(version: string = process.version): string {
  return [
    `logicsrc openmcp needs Node ${OPENMCP_MIN_NODE} or newer, and this is ${version}.`,
    "  mise use -g node@lts                                       # then re-run",
    "  curl -fsSL https://openmcp.logicsrc.com/install.sh | sh   # or the standalone command, which brings its own Node 24",
  ].join("\n");
}

/** Is this Node new enough for the catalog? */
export function meetsOpenmcpNode(version: string = process.version): boolean {
  return Number.parseInt(version.replace(/^v/, ""), 10) >= OPENMCP_MIN_NODE;
}

type OpenmcpMain = (argv: string[]) => Promise<number>;

/** Loaded on first use, and swapped out in tests. */
export async function loadOpenmcpMain(): Promise<OpenmcpMain> {
  const mod = (await import(`${OPENMCP_PACKAGE}/cli`)) as { main: OpenmcpMain };
  return mod.main;
}

export function registerOpenMcpCommands(program: Command, load: () => Promise<OpenmcpMain> = loadOpenmcpMain): void {
  program
    .command("openmcp")
    .description(
      "OpenMCP: the open catalog of MCP relays. relays, find, call, add, probe, serve, and the rest of the " +
        "standalone `openmcp` command, handed through as typed. `logicsrc openmcp help` lists them.",
    )
    .argument("[args...]", "Arguments for openmcp, exactly as the standalone command takes them")
    .allowUnknownOption()
    .passThroughOptions()
    .helpOption(false)
    .action(async (args: string[]) => {
      if (!meetsOpenmcpNode()) {
        console.error(openmcpNodeMessage());
        process.exitCode = 1;
        return;
      }
      const main = await load();
      process.exitCode = await main(args.length ? args : ["help"]);
    });
}
