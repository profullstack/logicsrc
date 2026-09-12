import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import type { Command } from "commander";

/**
 * `logicsrc mcp`
 *
 * The LogicSRC MCP server (`@profullstack/logicsrc-mcp`, the standalone
 * `logicsrc-mcp` binary): schemas, prompts, validators, OpenOntology and
 * OpenPRD over stdio, for an agent client's config. It is the last LogicSRC
 * command that was only reachable under its own name; now every one of them
 * is a word after `logicsrc`.
 *
 * Spawned as a child on stdio rather than imported, because the server owns
 * the process's stdin and stdout for the lifetime of the session, and that is
 * not something a subcommand should do inside the CLI process that also
 * prints help and errors.
 */
export const LOGICSRC_MCP_PACKAGE = "@profullstack/logicsrc-mcp";

/** The server's entry, which is also its bin. */
export function logicsrcMcpBin(resolveEntry: (id: string) => string = createRequire(import.meta.url).resolve): string {
  return resolveEntry(LOGICSRC_MCP_PACKAGE);
}

export function runLogicsrcMcp(args: string[], bin: string = logicsrcMcpBin()): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, ...args], { stdio: "inherit" });
    child.on("error", (error) => {
      console.error(`Could not start the LogicSRC MCP server at ${bin}: ${error.message}`);
      resolve(1);
    });
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

export function registerMcpCommands(program: Command, run: (args: string[]) => Promise<number> = runLogicsrcMcp): void {
  program
    .command("mcp")
    .description(
      "Run the LogicSRC MCP server over stdio: schemas, prompts, validators, OpenOntology and OpenPRD for an " +
        "agent client. The same server as the standalone `logicsrc-mcp` command.",
    )
    .argument("[args...]", "Arguments for logicsrc-mcp, exactly as the standalone command takes them")
    .allowUnknownOption()
    .passThroughOptions()
    .action(async (args: string[]) => {
      process.exitCode = await run(args);
    });
}
