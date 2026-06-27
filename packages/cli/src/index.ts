#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { evaluateAccountPolicy, scoreAccountActionRisk } from "@logicsrc/account-core";
import { Command } from "commander";
import { createCredentialEngine, listCredentialProviders, type CredentialEndpoint } from "@logicsrc/plugin-credential-sharing";
import { listEmailAccountProviders } from "@logicsrc/plugin-email-accounts";
import { discoverFeeds, listFeedProviders, probeSite, renderDiscoveryOutput, validateFeed, type FeedKind, type FeedOutputFormat } from "@logicsrc/plugin-feed-discovery";
import { listSocialAccountProviders } from "@logicsrc/plugin-social-accounts";
import { renderArcadeList, renderPluginStatus, renderTui, runArcadeSession, type TaskSnapshot } from "@logicsrc/tui";
import { assertSchemaKind, parseDocument, validate } from "@logicsrc/validators";
import { getConfigValue, readConfig, setConfigValue, writeConfig } from "./config.js";
import { boards, tasks } from "./fixtures.js";
import { print, type OutputFormat } from "./format.js";
import { parsePositiveInteger } from "./numeric-options.js";
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
  .option("--limit <limit>", "Number of posts", parsePositiveInteger, 20)
  .option("--format <format>", "table, json, or markdown", "table")
  .description("Read a board feed.")
  .action((board, options) => {
    print(
      [
        { type: "TASK", board, title: "QA checkout flow", meta: "25 USDC" },
        { type: "POST", board, title: "New agent plugin idea", meta: "4 replies" },
        { type: "RUN", board, title: "qa-agent completed task_123", meta: "completed" }
      ].slice(0, options.limit),
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
  .option("--limit <limit>", "Maximum results", parsePositiveInteger, 25)
  .option("--freshness-days <days>", "Freshness window for callers that need it", parsePositiveInteger)
  .option("--include-dead-feeds", "Include feeds that fail validation")
  .option("--include-unvalidated", "Return provider candidates without validation")
  .option("--providers <providers>", "Comma-separated provider ids")
  .description("Discover canonical feed URLs by keyword.")
  .action(async (keyword, options) => {
    const response = await discoverFeeds({
      q: keyword,
      type: options.type as FeedKind | "all",
      limit: options.limit,
      freshnessDays: options.freshnessDays,
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
  .option("--limit <limit>", "Maximum results", parsePositiveInteger, 100)
  .description("Discover feeds and print OPML.")
  .action(async (keyword, options) => {
    const response = await discoverFeeds({ q: keyword, limit: options.limit });
    console.log(renderDiscoveryOutput(response, "opml"));
  });

program.command("plugins").option("--format <format>", "table, json, or markdown", "table").description("Show plugin status.").action((options) => {
  const snapshot = defaultPluginRegistry().snapshot();
  print(snapshot.plugins, options.format as OutputFormat);
});

const credentials = program.command("credentials").alias("creds").description("Credential Sharing OpenSpec: portable, auditable secret sync.");

function endpointFromOptions(options: Record<string, unknown>, prefix: "" | "from" | "to"): CredentialEndpoint {
  const pick = (name: string) => {
    const key = prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name;
    const value = options[key];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  };
  // The provider id is stored under the bare flag: options.from / options.to / options.provider.
  const providerValue = options[prefix ? prefix : "provider"];
  const provider = (typeof providerValue === "string" && providerValue.length > 0 ? providerValue : undefined) ?? (prefix === "to" ? "railway" : "env");
  return { provider, path: pick("path"), project: pick("project"), config: pick("config"), service: pick("service"), scope: pick("scope") };
}

function withEndpointOptions(command: import("commander").Command, prefix: "" | "from" | "to", help: string) {
  const flag = (name: string) => (prefix ? `--${prefix}-${name}` : `--${name}`);
  return command
    .option(`${flag("path")} <path>`, `${help} .env file path`)
    .option(`${flag("project")} <id>`, `${help} project (Doppler project, Railway projectId, GitHub owner)`)
    .option(`${flag("config")} <id>`, `${help} config (Doppler config, Railway environmentId, GitHub environment)`)
    .option(`${flag("service")} <id>`, `${help} service (Railway serviceId, GitHub repo)`)
    .option(`${flag("scope")} <scope>`, `${help} scope (GitHub: repo|org|environment)`);
}

function credentialEngine() {
  return createCredentialEngine();
}

credentials
  .command("providers")
  .option("--format <format>", "table, json, or markdown", "table")
  .description("List credential provider adapters and their capabilities.")
  .action((options) => {
    print(
      listCredentialProviders().map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        reads_values: p.capabilities.readValues,
        writes: p.capabilities.write,
        auth: p.authRequirements.join(", ") || "none"
      })),
      options.format as OutputFormat
    );
  });

withEndpointOptions(
  credentials.command("inspect").requiredOption("--provider <provider>", "Provider id"),
  "",
  "Source"
)
  .option("--format <format>", "table, json, or markdown", "table")
  .description("Inspect an endpoint: redacted key names and value fingerprints, never raw values.")
  .action(async (options) => {
    const snapshot = await credentialEngine().inspectCredentialSource(endpointFromOptions(options, ""));
    print(options.format === "json" ? snapshot : snapshot.keys, options.format as OutputFormat);
  });

withEndpointOptions(
  withEndpointOptions(
    credentials.command("diff").requiredOption("--from <provider>", "Source provider").requiredOption("--to <provider>", "Destination provider"),
    "from",
    "Source"
  ),
  "to",
  "Target"
)
  .option("--redact", "Explicitly redact values (always on; accepted for spec parity)")
  .option("--format <format>", "table, json, or markdown", "table")
  .description("Diff secrets between a source and target without moving anything.")
  .action(async (options) => {
    const diff = await credentialEngine().diffCredentialEndpoints(endpointFromOptions(options, "from"), endpointFromOptions(options, "to"));
    print(options.format === "json" ? diff : diff.entries, options.format as OutputFormat);
  });

withEndpointOptions(
  withEndpointOptions(
    credentials.command("plan").requiredOption("--from <provider>", "Source provider").requiredOption("--to <provider>", "Destination provider"),
    "from",
    "Source"
  ),
  "to",
  "Target"
)
  .option("--format <format>", "table, json, or markdown", "json")
  .description("Build a redacted sync plan (stored for later approve/sync).")
  .action(async (options) => {
    const plan = await credentialEngine().createCredentialSyncPlan({
      from: endpointFromOptions(options, "from"),
      to: endpointFromOptions(options, "to")
    });
    print(plan, options.format as OutputFormat);
  });

credentials
  .command("approve")
  .requiredOption("--plan <id>", "Sync plan id")
  .option("--keys <keys>", "Comma-separated keys to approve (default: all changes)")
  .option("--format <format>", "table, json, or markdown", "json")
  .description("Record an approval for a sync plan.")
  .action((options) => {
    const approval = credentialEngine().approveCredentialSync(options.plan, { keys: splitOption(options.keys) });
    print(approval, options.format as OutputFormat);
  });

credentials
  .command("sync")
  .requiredOption("--plan <id>", "Sync plan id")
  .option("--approve", "Approve and apply the plan (writes secrets)")
  .option("--apply", "Apply the plan (alias for committing the write)")
  .option("--format <format>", "table, json, or markdown", "json")
  .description("Run a sync plan. Dry-run by default; --approve/--apply writes to the target.")
  .action(async (options) => {
    const engine = credentialEngine();
    const apply = Boolean(options.approve || options.apply);
    const approval = apply ? engine.approveCredentialSync(options.plan) : undefined;
    const run = await engine.runCredentialSync(options.plan, { dryRun: !apply, approval });
    print(run, options.format as OutputFormat);
  });

credentials
  .command("rollback")
  .requiredOption("--run <id>", "Sync run id to reverse")
  .option("--format <format>", "table, json, or markdown", "json")
  .description("Create a new sync plan that restores a run's captured pre-image.")
  .action(async (options) => {
    const plan = await credentialEngine().rollbackCredentialSync(options.run);
    print(plan, options.format as OutputFormat);
  });

credentials
  .command("audit")
  .requiredOption("--run <id>", "Sync run id")
  .option("--format <format>", "table, json, or markdown", "table")
  .description("Export the audit trail for a run (key names, targets, fingerprints, timestamps).")
  .action((options) => {
    print(credentialEngine().exportCredentialAudit(options.run), options.format as OutputFormat);
  });

credentials
  .command("export")
  .requiredOption("--run <id>", "Sync run id")
  .option("--format <format>", "table, json, or markdown", "json")
  .description("Alias for audit: export a run's audit events.")
  .action((options) => {
    print(credentialEngine().exportCredentialAudit(options.run), options.format as OutputFormat);
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
