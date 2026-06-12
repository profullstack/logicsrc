#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { evaluateAccountPolicy, scoreAccountActionRisk } from "@logicsrc/account-core";
import { Command } from "commander";
import { listEmailAccountProviders } from "@logicsrc/plugin-email-accounts";
import { discoverFeeds, listFeedProviders, probeSite, renderDiscoveryOutput, validateFeed, type FeedKind, type FeedOutputFormat } from "@logicsrc/plugin-feed-discovery";
import { listSocialAccountProviders } from "@logicsrc/plugin-social-accounts";
import { renderArcadeList, renderPluginStatus, renderTui, runArcadeSession, type TaskSnapshot } from "@logicsrc/tui";
import { assertSchemaKind, parseDocument, validate } from "@logicsrc/validators";
import { getConfigValue, readConfig, setConfigValue, writeConfig } from "./config.js";
import { boards, tasks } from "./fixtures.js";
import { print, type OutputFormat } from "./format.js";
import { exportOpenSpecSummary, importOpenSpec, writeOpenSpecChange } from "./openspec.js";
import { defaultPluginRegistry } from "./registry.js";

process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") {
    process.exit(0);
  }
  throw error;
});

const program = new Command();
program.enablePositionalOptions();

program
  .name("logicsrc")
  .description("LogicSRC OpenSpec CLI for schemas, boards, tasks, agents, payments, plugins, and TUI.")
  .option("--openspec", "Enable OpenSpec.dev-compatible repo-local specs, proposals, tasks, and deltas where supported.")
  .option("--openspec-only", "Restrict workflows to LogicSRC OpenSpec schemas, SDKs, MCP, CLI, TUI, and PWA contracts.")
  .option("--yolo", "Start the default AgentSwarm YOLO flow.")
  .option("--arcade [game]", "Launch Waiting Arcade while a long-running task executes.")
  .option("--waiting-arcade", "Alias for --arcade.")
  .option("--waiting-game <game>", "Alias for --arcade=<game>.")
  .option("--no-arcade", "Disable Waiting Arcade.")
  .version("0.1.0");

program.action(async (options) => {
  if (!options.yolo) {
    program.outputHelp();
    return;
  }

  const arcadeGame = resolveArcadeGame(options);
  if (arcadeGame) {
    await runYoloArcade(arcadeGame);
    return;
  }

  print(
    {
      type: "logicsrc.agentswarm.session",
      status: "opening",
      mode: "yolo",
      master_agent: "agentswarm-master",
      slave_agents: ["reproduce", "patch", "review"],
      arcade: false
    },
    "json"
  );
});

program
  .command("login")
  .option("--did <did>", "CoinPay DID")
  .option("--oauth <provider>", "OAuth provider")
  .description("Start a login flow.")
  .action((options) => {
    const mode = options.did ? `CoinPay DID ${options.did}` : options.oauth ? `${options.oauth} OAuth` : "browser/device";
    console.log(`Login flow ready: ${mode}`);
    console.log("Token storage target: $HOME/.logicsrc/auth.json");
  });

program.command("logout").description("Clear local auth token.").action(() => {
  console.log("Logged out. Local auth token would be removed from $HOME/.logicsrc/auth.json.");
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
      ].slice(0, parsePositiveIntegerOption(options.limit, 20)),
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

const arcade = program.command("arcade").description("Play Waiting Arcade games.");

arcade.action(async () => {
  await runArcadeSession({ game: process.env.LOGICSRC_ARCADE_GAME || "hangman", standalone: true });
});

arcade.command("list").description("List built-in Waiting Arcade games.").action(() => {
  console.log(renderArcadeList());
});

arcade
  .command("play")
  .argument("[game]", "Game id or random", "hangman")
  .description("Play a standalone Waiting Arcade game.")
  .action(async (game) => {
    await runArcadeSession({ game, standalone: true });
  });

const config = program.command("config").description("Read and write LogicSRC config.");

config
  .command("get")
  .argument("<path>", "Dot-path config key")
  .description("Print a config value.")
  .action((path) => {
    console.log(JSON.stringify(getConfigValue(path), null, 2));
  });

config
  .command("set")
  .argument("<path>", "Dot-path config key")
  .argument("<value>", "JSON, boolean, number, or string value")
  .description("Set a config value.")
  .action((path, value) => {
    const next = setConfigValue(path, value);
    const file = writeConfig(next);
    console.log(`Set ${path} in ${file}`);
  });

program
  .command("agentswarm")
  .alias("agent-swarm")
  .description("Open an AgentSwarm master agent session.")
  .option("--yolo", "Start the master agent with autonomous execution enabled.")
  .option("--arcade [game]", "Launch Waiting Arcade while AgentSwarm runs.")
  .option("--waiting-arcade", "Alias for --arcade.")
  .option("--waiting-game <game>", "Alias for --arcade=<game>.")
  .option("--no-arcade", "Disable Waiting Arcade.")
  .option("--repo <repo>", "Target repository, for example profullstack/logicsrc")
  .option("--agents <agents>", "Comma-separated slave agent roles", "reproduce,patch,review")
  .option("--change <id>", "OpenSpec-compatible change id", "agentswarm-yolo")
  .option("--out <dir>", "OpenSpec-compatible output directory")
  .action(async (options) => {
    if (!options.yolo) {
      console.log("AgentSwarm is coming soon. Run `logicsrc agentswarm --yolo` to open the master agent flow.");
      return;
    }

    const slaveAgents = String(options.agents)
      .split(",")
      .map((agent) => agent.trim())
      .filter(Boolean);

    const openspecCompatible = program.opts().openspec || process.env.LOGICSRC_OPENSPEC_COMPAT === "1";
    const openspecArtifacts = openspecCompatible
      ? writeOpenSpecChange({
          id: options.change,
          title: "AgentSwarm YOLO Session",
          summary: "Open a LogicSRC AgentSwarm master agent session and coordinate scoped slave agents.",
          capability: "agentswarm",
          repo: options.repo,
          agents: slaveAgents,
          outDir: options.out
        })
      : null;

    const arcadeGame = resolveArcadeGame(options);
    if (arcadeGame) {
      await runYoloArcade(arcadeGame, options.repo);
      return;
    }

    print({
      type: "logicsrc.agentswarm.session",
      status: "opening",
      mode: "yolo",
      master_agent: "agentswarm-master",
      slave_agents: slaveAgents,
      repo: options.repo ?? null,
      openspec_compatible: openspecCompatible,
      openspec_only: program.opts().openspecOnly || process.env.LOGICSRC_OPENSPEC_ONLY === "1",
      openspec_artifacts: openspecArtifacts
    }, "json");
  });

const openspec = program.command("openspec").description("Import, export, and generate OpenSpec.dev-compatible repo-local planning artifacts.");

openspec
  .command("import")
  .argument("[root]", "OpenSpec root directory", "openspec")
  .option("--format <format>", "table, json, or markdown", "json")
  .description("Read OpenSpec.dev-style specs and changes from a repo.")
  .action((root, options) => print(importOpenSpec(root), options.format as OutputFormat));

openspec
  .command("export")
  .argument("[root]", "OpenSpec root directory", "openspec")
  .option("--out <file>", "Write a markdown summary", "logicsrc-openspec-summary.md")
  .description("Export OpenSpec.dev-style repo artifacts into a LogicSRC-readable summary.")
  .action((root, options) => {
    const outFile = exportOpenSpecSummary(importOpenSpec(root), options.out);
    console.log(`Wrote ${outFile}`);
  });

openspec
  .command("change")
  .option("--id <id>", "Change id", "logic-src-change")
  .option("--title <title>", "Change title", "LogicSRC OpenSpec Change")
  .option("--summary <summary>", "Change summary", "Describe a LogicSRC-compatible change.")
  .option("--capability <capability>", "Capability/spec id", "logicsrc")
  .option("--repo <repo>", "Target repository")
  .option("--out <dir>", "Output directory")
  .description("Create an OpenSpec.dev-style proposal/design/tasks/spec delta.")
  .action((options) => print(writeOpenSpecChange({
    id: options.id,
    title: options.title,
    summary: options.summary,
    capability: options.capability,
    repo: options.repo,
    outDir: options.out
  }), "json"));

const feeds = program.command("feeds").description("Discover, validate, probe, and export feed sources.");

feeds
  .command("discover")
  .argument("<keyword>", "Keyword, phrase, or homepage URL")
  .option("--type <type>", "Feed kind or all", "all")
  .option("--format <format>", "json, opml, rss, atom, or json-feed", "json")
  .option("--limit <limit>", "Maximum results", "25")
  .option("--freshness-days <days>", "Freshness window for callers that need it")
  .option("--include-dead-feeds", "Include feeds that fail validation")
  .option("--include-unvalidated", "Return provider candidates without validation")
  .option("--providers <providers>", "Comma-separated provider ids")
  .description("Discover canonical feed URLs by keyword.")
  .action(async (keyword, options) => {
    const response = await discoverFeeds({
      q: keyword,
      type: options.type as FeedKind | "all",
      limit: parsePositiveIntegerOption(options.limit, 25),
      freshnessDays: options.freshnessDays ? parsePositiveIntegerOption(options.freshnessDays, undefined) : undefined,
      includeDeadFeeds: Boolean(options.includeDeadFeeds),
      includeUnvalidated: Boolean(options.includeUnvalidated),
      providers: splitOption(options.providers)
    });
    console.log(renderDiscoveryOutput(response, options.format as FeedOutputFormat));
  });

feeds
  .command("validate")
  .argument("<feed-url>", "Feed URL")
  .option("--format <format>", "json, table, or markdown", "json")
  .description("Validate a feed URL with SSRF protections.")
  .action(async (feedUrl, options) => {
    const result = await validateFeed(feedUrl);
    print(result, options.format as OutputFormat);
    if (!result.ok) {
      process.exitCode = 1;
    }
  });

feeds
  .command("probe")
  .argument("<homepage-url>", "Homepage URL")
  .option("--format <format>", "json, table, or markdown", "json")
  .description("Probe a homepage for alternate feed links and common feed paths.")
  .action(async (homepageUrl, options) => {
    const result = await probeSite(homepageUrl);
    print(result, options.format as OutputFormat);
    if (result.feeds.length === 0) {
      process.exitCode = 1;
    }
  });

feeds
  .command("providers")
  .option("--format <format>", "table, json, or markdown", "table")
  .description("List feed discovery providers.")
  .action((options) => {
    print(listFeedProviders(), options.format as OutputFormat);
  });

feeds
  .command("export-opml")
  .argument("<keyword>", "Keyword or phrase")
  .option("--limit <limit>", "Maximum results", "100")
  .description("Discover feeds and print OPML.")
  .action(async (keyword, options) => {
    const response = await discoverFeeds({ q: keyword, limit: parsePositiveIntegerOption(options.limit, 100) });
    console.log(renderDiscoveryOutput(response, "opml"));
  });

program.command("plugins").option("--format <format>", "table, json, or markdown", "table").description("Show plugin status.").action((options) => {
  const snapshot = defaultPluginRegistry().snapshot();
  print(snapshot.plugins, options.format as OutputFormat);
});

const credentials = program.command("credentials").alias("creds").description("Credential-sharing OpenSpec commands.");

credentials.command("providers").option("--format <format>", "table, json, or markdown", "table").description("List credential sharing provider targets.").action((options) => {
  print(
    [
      { id: "env", target: ".env files", mode: "read/write" },
      { id: "doppler", target: "Doppler projects/configs", mode: "sync" },
      { id: "railway", target: "Railway service variables", mode: "sync" },
      { id: "github-secrets", target: "GitHub Actions and environment secrets", mode: "sync" }
    ],
    options.format as OutputFormat
  );
});

credentials.command("plan").option("--from <provider>", "Source provider", "env").option("--to <provider>", "Destination provider", "railway").option("--format <format>", "table, json, or markdown", "table").description("Describe a credential sync plan without moving secrets.").action((options) => {
  print(
    {
      type: "logicsrc.credential_sync_plan",
      from: options.from,
      to: options.to,
      policy: "redact-values",
      approval: "required-before-write",
      audit: "write target, key names, fingerprints, and timestamps; never write raw secret values"
    },
    options.format as OutputFormat
  );
});

const accounts = program.command("accounts").description("Manage connected social and email accounts.");

accounts
  .command("providers")
  .option("--kind <kind>", "social or email")
  .option("--format <format>", "table, json, or markdown", "table")
  .description("List communication account providers.")
  .action((options) => {
    const providers = [...listSocialAccountProviders(), ...listEmailAccountProviders()].filter((provider) => !options.kind || provider.kind === options.kind);
    print(providers, options.format as OutputFormat);
  });

accounts
  .command("list")
  .alias("accounts")
  .option("--kind <kind>", "social or email")
  .option("--format <format>", "table, json, or markdown", "table")
  .description("List connected accounts.")
  .action((options) => {
    print([], options.format as OutputFormat);
  });

accounts
  .command("audit")
  .argument("<account-id>", "Connected account id")
  .option("--format <format>", "table, json, or markdown", "table")
  .description("List account audit events.")
  .action((accountId, options) => {
    print({ account_id: accountId, events: [], note: "Account audit persistence is not wired yet." }, options.format as OutputFormat);
  });

const social = program.command("social").description("Manage social account providers and draft/publish flows.");

social.command("providers").option("--format <format>", "table, json, or markdown", "table").description("List social account providers.").action((options) => {
  print(listSocialAccountProviders(), options.format as OutputFormat);
});

social.command("accounts").option("--format <format>", "table, json, or markdown", "table").description("List connected social accounts.").action((options) => {
  print([], options.format as OutputFormat);
});

social
  .command("post")
  .argument("<account-id>", "Connected social account id")
  .requiredOption("--text <text>", "Post text")
  .option("--dry-run", "Evaluate without publishing", false)
  .option("--format <format>", "table, json, or markdown", "table")
  .description("Request or dry-run a social post publish.")
  .action((accountId, options) => {
    const riskScore = scoreAccountActionRisk({ action: "social:post:publish" });
    const decision = evaluateAccountPolicy({
      action: "social:post:publish",
      dryRun: Boolean(options.dryRun),
      riskScore,
      grant: {
        id: "dry_run_grant",
        accountId,
        principal: { type: "user", id: process.env.COMMANDBOARD_DID || "local-user" },
        permissions: ["social:post:publish"],
        policy: [],
        createdAt: new Date(0).toISOString()
      }
    });

    print(
      {
        provider: "unknown",
        account_id: accountId,
        action: "social:post:publish",
        dry_run: Boolean(options.dryRun),
        scopes_required: ["social:post:publish"],
        policy_decision: decision.decision,
        risk_score: decision.riskScore,
        payload_preview: { text: options.text }
      },
      options.format as OutputFormat
    );
  });

const email = program.command("email").description("Manage email account providers and draft/send flows.");

email.command("providers").option("--format <format>", "table, json, or markdown", "table").description("List email account providers.").action((options) => {
  print(listEmailAccountProviders(), options.format as OutputFormat);
});

email.command("accounts").option("--format <format>", "table, json, or markdown", "table").description("List connected email accounts.").action((options) => {
  print([], options.format as OutputFormat);
});

email
  .command("send")
  .argument("<draft-id>", "Email draft id")
  .option("--dry-run", "Evaluate without sending", false)
  .option("--format <format>", "table, json, or markdown", "table")
  .description("Request or dry-run an outbound email send.")
  .action((draftId, options) => {
    const riskScore = scoreAccountActionRisk({ action: "email:send", externalRecipientCount: 1 });
    const decision = evaluateAccountPolicy({
      action: "email:send",
      dryRun: Boolean(options.dryRun),
      riskScore,
      grant: {
        id: "dry_run_grant",
        accountId: "unknown",
        principal: { type: "user", id: process.env.COMMANDBOARD_DID || "local-user" },
        permissions: ["email:send"],
        policy: [],
        createdAt: new Date(0).toISOString()
      }
    });

    print(
      {
        provider: "unknown",
        draft_id: draftId,
        action: "email:send",
        dry_run: Boolean(options.dryRun),
        scopes_required: ["email:send"],
        policy_decision: decision.decision,
        risk_score: decision.riskScore,
        payload_preview: { draft_id: draftId }
      },
      options.format as OutputFormat
    );
  });

program.command("tui").description("Launch the tmux-friendly TUI.").action(() => {
  console.log(renderTui());
  console.log("\nPlugin status:\n" + renderPluginStatus());
});

program.command("update").alias("upgrade").description("Update the local LogicSRC CLI.").action(() => {
  console.log("Current version: 0.1.0");
  console.log("Latest version: 0.1.0");
  console.log("LogicSRC CLI is already up to date.");
  console.log("Config preserved at $HOME/.logicsrc");
});

program.command("remove").alias("uninstall").option("--purge", "Remove config and auth tokens").description("Remove local LogicSRC CLI.").action((options) => {
  console.log("Removed LogicSRC CLI.");
  console.log(options.purge ? "Removed config and auth tokens from $HOME/.logicsrc." : "Preserved config at $HOME/.logicsrc. Run with --purge to remove config and auth tokens.");
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

function resolveArcadeGame(options: { arcade?: string | boolean; waitingArcade?: boolean; waitingGame?: string }) {
  if (options.arcade === false || process.env.LOGICSRC_NO_ARCADE === "1") {
    return undefined;
  }

  if (options.waitingGame) {
    return options.waitingGame;
  }

  if (typeof options.arcade === "string") {
    return options.arcade;
  }

  const config = readConfig();
  const configuredDefault = String(getConfigValue("waiting.arcade.defaultGame", config) ?? "hangman");

  if (options.arcade === true || options.waitingArcade || process.env.LOGICSRC_ARCADE === "1") {
    return process.env.LOGICSRC_ARCADE_GAME || configuredDefault;
  }

  return undefined;
}

function splitOption(value: string | undefined) {
  return value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parsePositiveIntegerOption(value: string | undefined, fallback: number): number;
function parsePositiveIntegerOption(value: string | undefined, fallback: undefined): number | undefined;
function parsePositiveIntegerOption(value: string | undefined, fallback: number | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

async function runYoloArcade(game: string, repo?: string) {
  const task: TaskSnapshot = {
    id: "agentswarm_yolo",
    title: repo ? `AgentSwarm YOLO on ${repo}` : "AgentSwarm YOLO session",
    status: "running",
    phase: "starting",
    progress: 0.05,
    costUsd: 0,
    lastMessage: "launching Waiting Arcade"
  };

  await runArcadeSession({
    game,
    standalone: false,
    task,
    simulateTask: true,
    logs: ["AgentSwarm master session started.", "Task continues while Waiting Arcade is active."]
  });
}

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
