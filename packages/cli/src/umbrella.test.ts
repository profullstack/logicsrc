import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { meetsOpenmcpNode, openmcpNodeMessage, registerOpenMcpCommands } from "./openmcp.js";
import { openspecBin, registerOpenSpecDevPassthrough } from "./openspec-dev.js";
import { logicsrcMcpBin, registerMcpCommands } from "./mcp.js";

/** A program shaped like the real one: positional options on, no process.exit. */
function program(): Command {
  const p = new Command();
  p.name("logicsrc").enablePositionalOptions().exitOverride();
  return p;
}

describe("logicsrc openmcp", () => {
  it("hands every argument, flags included, to openmcp's own main", async () => {
    const seen: string[][] = [];
    const p = program();
    registerOpenMcpCommands(p, async () => async (argv) => {
      seen.push(argv);
      return 0;
    });
    await p.parseAsync(["node", "logicsrc", "openmcp", "relays", "--online", "--catalog", "https://x.example", "--json"]);
    expect(seen).toEqual([["relays", "--online", "--catalog", "https://x.example", "--json"]]);
    expect(process.exitCode).toBe(0);
  });

  it("asks for help when given nothing, and passes the exit code back", async () => {
    const seen: string[][] = [];
    const p = program();
    registerOpenMcpCommands(p, async () => async (argv) => {
      seen.push(argv);
      return 3;
    });
    await p.parseAsync(["node", "logicsrc", "openmcp"]);
    expect(seen).toEqual([["help"]]);
    expect(process.exitCode).toBe(3);
    process.exitCode = 0;
  });

  it("knows the catalog's Node floor and offers the standalone installer below it", () => {
    expect(meetsOpenmcpNode("v24.0.0")).toBe(true);
    expect(meetsOpenmcpNode("v22.18.0")).toBe(false);
    expect(openmcpNodeMessage("v22.18.0")).toContain("curl -fsSL https://openmcp.logicsrc.com/install.sh | sh");
  });
});

describe("logicsrc openspec", () => {
  function group(run: (args: string[]) => Promise<number>): { p: Command; own: string[] } {
    const p = program();
    const own: string[] = [];
    const openspec = p.command("openspec");
    openspec.command("import").argument("[root]").action((root: string | undefined) => void own.push(`import ${root ?? ""}`.trim()));
    registerOpenSpecDevPassthrough(openspec, run);
    return { p, own };
  }

  it("keeps its own words", async () => {
    const seen: string[][] = [];
    const { p, own } = group(async (args) => (seen.push(args), 0));
    await p.parseAsync(["node", "logicsrc", "openspec", "import", "specs"]);
    expect(own).toEqual(["import specs"]);
    expect(seen).toEqual([]);
  });

  it("sends any other word to OpenSpec.dev's CLI with its flags intact", async () => {
    const seen: string[][] = [];
    const { p } = group(async (args) => (seen.push(args), 0));
    await p.parseAsync(["node", "logicsrc", "openspec", "validate", "--all", "--strict"]);
    await p.parseAsync(["node", "logicsrc", "openspec", "init"]);
    expect(seen).toEqual([["validate", "--all", "--strict"], ["init"]]);
  });

  it("finds the bin beside dist/ from the package's only export", () => {
    expect(openspecBin(() => "/node_modules/@fission-ai/openspec/dist/index.js")).toBe("/node_modules/@fission-ai/openspec/bin/openspec.js");
  });
});

describe("logicsrc mcp", () => {
  it("runs the server entry, which is also its bin", async () => {
    const seen: string[][] = [];
    const p = program();
    registerMcpCommands(p, async (args) => (seen.push(args), 0));
    await p.parseAsync(["node", "logicsrc", "mcp"]);
    expect(seen).toEqual([[]]);
    expect(logicsrcMcpBin(() => "/x/dist/index.js")).toBe("/x/dist/index.js");
  });
});
