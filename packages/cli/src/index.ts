#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { Command } from "commander";
import { renderPluginStatus, renderTui } from "@logicsrc/tui";
import { assertSchemaKind, parseDocument, validate } from "@logicsrc/validators";
import { boards, tasks } from "./fixtures.js";
import { print, type OutputFormat } from "./format.js";
import { defaultPluginRegistry } from "./registry.js";

const program = new Command();
const binaryName = basename(process.argv[1] ?? "");
const commandName = binaryName === "commandboard" || binaryName === "cb" ? binaryName : "logicsrc";

program
  .name(commandName)
  .aliases(["commandboard", "cb"])
  .description("LogicSRC OpenSpec CLI for schemas, boards, tasks, agents, payments, plugins, and TUI.")
  .option("--openspec", "Enable OpenSpec.dev-compatible repo-local specs, proposals, tasks, and deltas where supported.")
  .option("--openspec-only", "Restrict workflows to LogicSRC OpenSpec schemas, SDKs, MCP, CLI, TUI, and PWA contracts.")
  .version("0.1.0");

program
  .command("login")
  .option("--did <did>", "CoinPay DID")
  .option("--oauth <provider>", "OAuth provider")
  .description("Start a login flow.")
  .action((options) => {
    const mode = options.did ? `CoinPay DID ${options.did}` : options.oauth ? `${options.oauth} OAuth` : "browser/device";
    console.log(`Login flow ready: ${mode}`);
    console.log("Token storage target: $HOME/.commandboard/auth.json");
  });

program.command("logout").description("Clear local auth token.").action(() => {
  console.log("Logged out. Local auth token would be removed from $HOME/.commandboard/auth.json.");
});

program.command("whoami").description("Show current DID and account context.").action(() => {
  print({ did: process.env.COMMANDBOARD_DID || "anthony.coinpay", api_url: process.env.COMMANDBOARD_API_URL || "http://localhost:4010" }, "table");
});

program
  .command("boards")
  .option("--format <format>", "table, json, or markdown", "table")
  .description("List boards.")
  .action((options) => print(boards, options.format as OutputFormat));

program
  .command("read")
  .argument("<board>", "Board path")
  .option("--limit <limit>", "Number of posts", "20")
  .option("--format <format>", "table, json, or markdown", "table")
  .description("Read a board feed.")
  .action((board, options) => {
    print(
      [
        { type: "TASK", board, title: "QA checkout flow", meta: "25 USDC" },
        { type: "POST", board, title: "New agent plugin idea", meta: "4 replies" },
        { type: "RUN", board, title: "qa-agent completed task_123", meta: "completed" }
      ].slice(0, Number(options.limit)),
      options.format as OutputFormat
    );
  });

program
  .command("post")
  .argument("<board>", "Board path")
  .argument("[message]", "Post body")
  .option("--file <file>", "Read post body from a file")
  .description("Create a post.")
  .action((board, message, options) => {
    const body = options.file ? readFileSync(options.file, "utf8") : message;
    console.log(`Created post on ${board}: ${body}`);
  });

const task = program.command("task").description("Task commands.");

task
  .command("list")
  .option("--open", "Only open tasks")
  .option("--board <board>", "Filter by board")
  .option("--format <format>", "table, json, or markdown", "table")
  .action((options) => {
    const filtered = tasks.filter((item) => (!options.open || item.status === "open" || item.status === "funded") && (!options.board || item.board === options.board));
    print(filtered, options.format as OutputFormat);
  });

task
  .command("get")
  .argument("<id>", "Task id")
  .option("--raw-schema", "Print LogicSRC schema")
  .option("--format <format>", "table, json, or markdown", "table")
  .action((id, options) => {
    const item = tasks.find((entry) => entry.id === id);
    if (!item) {
      throw new Error(`Task not found: ${id}`);
    }
    print(options.rawSchema ? toTaskSchema(item) : item, options.format as OutputFormat);
  });

task
  .command("create")
  .option("--board <board>", "Board path", "/gigs")
  .option("--title <title>", "Task title", "Untitled task")
  .option("--budget <budget>", "Budget, for example 25usdc")
  .option("--schema <file>", "LogicSRC task schema file")
  .action((options) => {
    if (options.schema) {
      validateFile("task", options.schema);
    }
    console.log(`Created task "${options.title}" on ${options.board}${options.budget ? ` with budget ${options.budget}` : ""}`);
  });

task.command("validate").argument("<file>", "Task YAML or JSON file").action((file) => validateFile("task", file));
task.command("claim").argument("<id>", "Task id").action((id) => console.log(`Claimed ${id}`));
task.command("submit").argument("<id>", "Task id").option("--file <file>", "Deliverable file").action((id, options) => console.log(`Submitted ${id}${options.file ? ` with ${options.file}` : ""}`));
task.command("approve").argument("<id>", "Task id").action((id) => console.log(`Approved ${id}; escrow release requested through CoinPay.`));
task.command("reject").argument("<id>", "Task id").option("--reason <reason>", "Rejection reason").action((id, options) => console.log(`Rejected ${id}${options.reason ? `: ${options.reason}` : ""}`));
task.command("dispute").argument("<id>", "Task id").action((id) => console.log(`Opened dispute for ${id}`));

program.command("wallet").description("Show wallet balance.").action(() => {
  print({ did: process.env.COMMANDBOARD_DID || "anthony.coinpay", provider: "CoinPay", balance: "42 USDC" }, "table");
});

program.command("events").description("Listen to LogicSRC event stream.").argument("[listen]", "listen").option("--board <board>").option("--type <type>").action((_listen, options) => {
  console.log(`Listening for events${options.board ? ` on ${options.board}` : ""}${options.type ? ` of type ${options.type}` : ""}...`);
  console.log(JSON.stringify({ type: "logicsrc.event", event: "task.created", resource_id: "task_789" }));
});

program
  .command("agentswarm")
  .alias("agent-swarm")
  .description("Open an AgentSwarm master agent session.")
  .option("--yolo", "Start the master agent with autonomous execution enabled.")
  .option("--repo <repo>", "Target repository, for example profullstack/logicsrc")
  .option("--agents <agents>", "Comma-separated slave agent roles", "reproduce,patch,review")
  .action((options) => {
    if (!options.yolo) {
      console.log("AgentSwarm is coming soon. Run `logicsrc agentswarm --yolo` to open the master agent flow.");
      return;
    }

    const slaveAgents = String(options.agents)
      .split(",")
      .map((agent) => agent.trim())
      .filter(Boolean);

    print(
      {
        type: "logicsrc.agentswarm.session",
        status: "opening",
        mode: "yolo",
        master_agent: "agentswarm-master",
        slave_agents: slaveAgents,
        repo: options.repo ?? null,
        openspec_compatible: program.opts().openspec || process.env.LOGICSRC_OPENSPEC_COMPAT === "1",
        openspec_only: program.opts().openspecOnly || process.env.LOGICSRC_OPENSPEC_ONLY === "1"
      },
      "json"
    );
  });

program.command("plugins").option("--format <format>", "table, json, or markdown", "table").description("Show plugin status.").action((options) => {
  const snapshot = defaultPluginRegistry().snapshot();
  print(snapshot.plugins, options.format as OutputFormat);
});

const sh1pt = program.command("sh1pt").description("sh1pt project, action, release, and delivery commands.");

sh1pt
  .command("projects")
  .option("--format <format>", "table, json, or markdown", "table")
  .description("List synced sh1pt projects.")
  .action((options) => {
    print(
      [
        { id: "sh1pt_project_1", board: "/projects/sh1pt", status: "active", actions: 5 },
        { id: "sh1pt_project_2", board: "/projects/crawlproof", status: "active", actions: 2 }
      ],
      options.format as OutputFormat
    );
  });

sh1pt
  .command("actions")
  .option("--format <format>", "table, json, or markdown", "table")
  .description("List sh1pt actions available for task publishing.")
  .action((options) => {
    print(
      [
        { id: "action_release_checklist", title: "Release checklist", publishable: true },
        { id: "action_deploy_preview", title: "Deploy preview", publishable: true }
      ],
      options.format as OutputFormat
    );
  });

sh1pt.command("publish").argument("<action>", "sh1pt action id").option("--board <board>", "Target board", "/projects/sh1pt").description("Publish a sh1pt action as a CommandBoard task.").action((action, options) => {
  console.log(`Published sh1pt action ${action} to ${options.board}`);
});

program.command("tui").description("Launch the tmux-friendly TUI.").action(() => {
  console.log(renderTui());
  console.log("\nPlugin status:\n" + renderPluginStatus());
});

program.command("update").alias("upgrade").description("Update the local CommandBoard.run CLI.").action(() => {
  console.log("Current version: 0.1.0");
  console.log("Latest version: 0.1.0");
  console.log("CommandBoard.run CLI is already up to date.");
  console.log("Config preserved at $HOME/.commandboard");
});

program.command("remove").alias("uninstall").option("--purge", "Remove config and auth tokens").description("Remove local CommandBoard.run CLI.").action((options) => {
  console.log("Removed CommandBoard.run CLI.");
  console.log(options.purge ? "Removed config and auth tokens from $HOME/.commandboard." : "Preserved config at $HOME/.commandboard. Run with --purge to remove config and auth tokens.");
});

function validateFile(kindArg: string, file: string) {
  const kind = assertSchemaKind(kindArg);
  const input = readFileSync(file, "utf8");
  const result = validate(kind, parseDocument(input, file));
  if (!result.ok) {
    for (const error of result.errors) {
      console.error(`- ${error.instancePath || "/"} ${error.message}`);
    }
    throw new Error(`Invalid LogicSRC ${kind} schema: ${file}`);
  }
  console.log(`Valid LogicSRC ${kind} schema: ${file}`);
}

function toTaskSchema(item: (typeof tasks)[number]) {
  return {
    type: "logicsrc.task",
    version: "0.1",
    title: item.title,
    description: item.title,
    board: item.board,
    creator_did: "anthony.coinpay",
    status: item.status,
    budget: { amount: Number.parseFloat(item.budget), currency: item.budget.replace(/[0-9. ]/g, "") || "USDC" },
    assignee_did: item.assignee ?? undefined
  };
}

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
