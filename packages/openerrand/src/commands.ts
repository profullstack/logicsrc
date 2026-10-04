/**
 * `logicsrc errand run|validate|status`.
 *
 * Everything that touches the world (environment, terminal, the logicsrc CLI
 * for team vaults, the browser) is injectable, so the commands are tested
 * without a terminal and the integration test can point Chrome at a fake site.
 * Exit codes go on `process.exitCode`, never `process.exit`.
 */

import { randomInt } from "node:crypto";
import type { Command } from "commander";
import type { CaptchaSolver } from "./captcha.js";
import { type Driver, openCdpDriver } from "./driver.js";
import { commandExtractor } from "./extract.js";
import { type Prompt, resolveInputs } from "./inputs.js";
import { loadErrand, summarize } from "./load.js";
import { confirm, terminalPrompt } from "./prompt.js";
import { runErrand } from "./run.js";
import { type Env, Store } from "./store.js";
import { durationMs, ErrandError } from "./util.js";
import { describeTarget, fileVault, type LogicsrcExec, openVault, parseTarget, pathLogicsrc, type Vault } from "./vault.js";

/** 0 done (success, waiting or a dry run), 1 rejected, 2 invalid file or usage, 3 stopped, 4 refused by the throttle. */
export const EXIT = { OK: 0, REJECTED: 1, INVALID: 2, STOPPED: 3, THROTTLED: 4 } as const;

export interface Deps {
  env: Env;
  /** stdout: machine output (--json) and the final line. */
  out: (line: string) => void;
  /** stderr: everything a person reads while it runs. */
  say: (line: string) => void;
  prompt: Prompt;
  confirm: (question: string) => Promise<boolean>;
  interactive: boolean;
  logicsrc: LogicsrcExec;
  now: () => Date;
  random: (max: number) => number;
  /** Extra Chrome switches (tests map the site's hostname to a local server). */
  chromeArgs?: string[];
  /** Replace the browser entirely (unit tests). */
  openDriver?: () => Promise<Driver>;
  solver?: CaptchaSolver;
  pollMs?: number;
  rereadMs?: number;
  settleMs?: number;
}

export function defaultDeps(): Deps {
  return {
    env: process.env,
    out: (line) => process.stdout.write(`${line}\n`),
    say: (line) => process.stderr.write(`${line}\n`),
    prompt: terminalPrompt,
    confirm,
    interactive: process.stdin.isTTY === true,
    logicsrc: pathLogicsrc,
    now: () => new Date(),
    random: randomInt,
  };
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseOverrides(pairs: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of pairs) {
    const at = pair.indexOf("=");
    if (at <= 0) throw new ErrandError(`--input ${pair}: expected name=value`);
    out[pair.slice(0, at)] = pair.slice(at + 1);
  }
  return out;
}

interface RunFlags {
  input: string[];
  dryRun?: boolean;
  declare?: boolean;
  headful?: boolean;
  chrome?: string;
  vault?: string;
  extractor?: string;
  candidate?: string;
  account?: string;
  force?: boolean;
  yes?: boolean;
  json?: boolean;
}

export function registerErrandCommands(parent: Command, partial: Partial<Deps> = {}): void {
  const deps: Deps = { ...defaultDeps(), ...partial };

  parent
    .command("run")
    .argument("<file>", "an OpenErrand 0.1 JSON file")
    .description("Run an errand in headless Chrome, stopping at every step that belongs to a person.")
    .option("--input <name=value>", "give an input's value (repeatable); wins over every source", collect, [])
    .option("--dry-run", "fill every page up to the first that holds a declaration or a shared secret, show it, and stop before its forward button")
    .option("--declare", "your consent, for this run, to tick the declarations the errand names after the values are shown")
    .option("--headful", "open a visible window, so you can take identity proofing or a captcha yourself")
    .option("--chrome <path>", "the Chrome or Chromium binary (default: CHROME_PATH, then the usual places)")
    .option("--vault <target>", "teams:<team>/<project>/<env>, opencreds[:<field>] or file:<path> (default: the file's metadata.vault)")
    .option("--extractor <command>", "a command that reads the errand's document requests as JSON on stdin and prints records")
    .option("--candidate <n>", "which shared-secret candidate to submit (1 is the best); a rejection lists the others")
    .option("--account <name>", "which account at the site, for the throttle ledger", "default")
    .option("--force", "lift the per-window, per-day and spacing caps (never a lockout)")
    .option("--yes", "run a file whose SHA-256 changed since its last run without asking")
    .option("--json", "print the run record as JSON on stdout")
    .addHelpText(
      "after",
      `
Examples:
  logicsrc errand validate ftb-register-business.json
  logicsrc errand run ftb-register-business.json --extractor "python3 extract.py ~/taxes" --dry-run
  logicsrc errand run ftb-register-business.json --extractor "python3 extract.py ~/taxes" --declare
  logicsrc errand status

A one-time code is typed at the prompt, or written to the code file the run
names (~/.local/share/logicsrc/errand/codes/<name>.code) by whoever holds the
phone. Credentials go to the vault the file or --vault names, else a 0600
file under ~/.local/share/logicsrc/errand/credentials/.`,
    )
    .action(async (file: string, flags: RunFlags) => {
      process.exitCode = await runCommand(file, flags, deps);
    });

  parent
    .command("validate")
    .argument("<file>", "an OpenErrand 0.1 JSON file")
    .description("Check an errand file against the schema and the spec's rules, and show what it will ask of you.")
    .action((file: string) => {
      try {
        const loaded = loadErrand(file);
        for (const line of summarize(loaded.errand, "unverified: a local file")) deps.out(line);
        deps.out(`valid OpenErrand 0.1  sha256 ${loaded.sha256}`);
        process.exitCode = EXIT.OK;
      } catch (error) {
        deps.say((error as Error).message);
        process.exitCode = EXIT.INVALID;
      }
    });

  parent
    .command("status")
    .description("The last run of each errand, the cards waiting on you, and any lockout.")
    .option("--json", "machine-readable")
    .action((flags: { json?: boolean }) => {
      const store = Store.fromEnv(deps.env);
      const runs = store.runs();
      const latest = new Map<string, (typeof runs)[number]>();
      for (const run of runs) latest.set(run.name, run);
      const ledger = store.loadLedger();
      const now = deps.now().getTime();
      const locks = Object.entries(ledger.lockedUntil).filter(([, until]) => Date.parse(until) > now);
      if (flags.json) {
        deps.out(JSON.stringify({ runs: [...latest.values()], lockouts: Object.fromEntries(locks) }, null, 2));
        process.exitCode = EXIT.OK;
        return;
      }
      if (!latest.size) deps.out("No errands run yet.");
      for (const run of latest.values()) {
        deps.out(`${run.name}  ${run.kind}${run.outcome !== run.kind ? ` (${run.outcome})` : ""}  ${run.at.slice(0, 16).replace("T", " ")}${run.reason ? `  ${run.reason}` : ""}`);
        if (run.card && !run.card.done) {
          deps.out(`  card ${run.card.id}: ${run.card.title}${run.card.expires_on ? `  (before ${run.card.expires_on})` : ""}`);
          for (const [i, s] of run.card.steps.entries()) deps.out(`    ${i + 1}. ${s}`);
          if (run.card.open) deps.out(`    open ${run.card.open}`);
          if (run.card.command) deps.out(`    ${run.card.command}`);
        }
      }
      for (const [key, until] of locks) deps.out(`locked: ${key.replace("|", " account ")} until ${until}`);
      process.exitCode = EXIT.OK;
    });
}

export async function runCommand(file: string, flags: RunFlags, deps: Deps): Promise<number> {
  const store = Store.fromEnv(deps.env);
  try {
    const { errand, sha256 } = loadErrand(file);

    // Rule 1: show it before running it, and show a change to a file run before.
    for (const line of summarize(errand, "unverified: a local file, not fetched from a publisher's index")) deps.say(line);
    const approved = store.approvals()[errand.name];
    if (approved && approved.sha256 !== sha256) {
      deps.say(`  this file changed since its last run (${approved.sha256.slice(0, 12)} on ${approved.at.slice(0, 10)}, now ${sha256.slice(0, 12)})`);
      if (!flags.yes && !(deps.interactive && (await deps.confirm("Run the changed file?")))) {
        deps.say("Not run. Read the change, then rerun with --yes.");
        return EXIT.STOPPED;
      }
    }

    const metaVault = (errand.metadata as { vault?: unknown } | undefined)?.vault;
    const targetText = flags.vault ?? (typeof metaVault === "string" ? metaVault : undefined);
    const vault: Vault | null = targetText ? openVault(parseTarget(targetText), deps.logicsrc) : null;
    const fallbackVault = fileVault(store.credentialsFile(errand.name));
    const reader = vault ?? fallbackVault;

    const candidate = flags.candidate !== undefined ? Number(flags.candidate) : undefined;
    if (candidate !== undefined && (!Number.isInteger(candidate) || candidate < 1)) throw new ErrandError("--candidate is 1, 2, 3, ...");
    const inputs = await resolveInputs(errand, {
      overrides: parseOverrides(flags.input ?? []),
      vault: reader,
      extractor: flags.extractor ? commandExtractor(flags.extractor, { errand: errand.name }) : null,
      prompt: deps.interactive ? deps.prompt : async () => null,
      random: deps.random,
      now: deps.now(),
      ...(candidate !== undefined ? { candidate } : {}),
    });

    deps.say("Values for this run (secrets masked):");
    for (const name of Object.keys(errand.inputs ?? {})) {
      const resolved = inputs.values.get(name);
      const qa = inputs.qa.get(name);
      const from = qa ? (Object.keys(qa.answers).length ? "vault" : "generated as questions are chosen") : resolved ? `${resolved.from}${resolved.origin ? ` ${resolved.origin}` : ""}` : "none";
      deps.say(`  ${name} = ${qa ? "••••" : inputs.display(name)}   (${from})`);
    }
    if (inputs.chosen && inputs.candidates.length > 1) deps.say(`  shared secret: candidate ${inputs.candidates.indexOf(inputs.chosen) + 1} of ${inputs.candidates.length} (${inputs.chosen.year ?? ""} ${inputs.chosen.form} ${inputs.chosen.field}, ${inputs.chosen.source})`);
    deps.say(`  credentials go to ${vault?.write ? vault.describe() : `${fallbackVault.describe()} (0600)`}`);

    store.approve(errand.name, sha256, file, deps.now());
    const origin = errand.site.origins[0]!;
    const runId = `${deps.now().toISOString().replace(/[:.]/g, "-")}-${errand.name}`;
    const { record } = await runErrand({
      errand,
      source: file,
      sha256,
      inputs,
      store,
      declare: flags.declare === true,
      dryRun: flags.dryRun === true,
      headful: flags.headful === true,
      interactive: deps.interactive,
      prompt: deps.prompt,
      say: deps.say,
      now: deps.now,
      random: deps.random,
      vault,
      fallbackVault,
      account: flags.account ?? "default",
      force: flags.force === true,
      ...(deps.solver ? { solver: deps.solver } : {}),
      ...(deps.pollMs !== undefined ? { pollMs: deps.pollMs } : {}),
      ...(deps.rereadMs !== undefined ? { rereadMs: deps.rereadMs } : {}),
      openDriver:
        deps.openDriver ??
        (() =>
          openCdpDriver({
            errand,
            headless: flags.headful !== true,
            profile: store.profile(origin),
            pageTimeoutMs: durationMs(errand.limits?.page_timeout, 30_000),
            downloadDir: store.downloadsDir(runId),
            ...(flags.chrome ? { chrome: flags.chrome } : {}),
            ...(deps.chromeArgs ? { args: deps.chromeArgs } : {}),
            ...(deps.settleMs !== undefined ? { settleMs: deps.settleMs } : {}),
          })),
    });

    if (flags.json) deps.out(JSON.stringify(record, null, 2));
    else deps.out(`${record.name}: ${record.kind}${record.outcome !== record.kind ? ` (${record.outcome})` : ""}${record.reason ? `: ${record.reason}` : ""}`);
    if (record.kind === "rejected") return EXIT.REJECTED;
    if (record.kind === "stopped") return record.reason?.startsWith("throttle") ? EXIT.THROTTLED : EXIT.STOPPED;
    return EXIT.OK;
  } catch (error) {
    deps.say((error as Error).message);
    return error instanceof ErrandError && /not a valid OpenErrand|is not JSON|cannot read|^--input|^--candidate|^vault target/.test((error as Error).message) ? EXIT.INVALID : EXIT.STOPPED;
  }
}

export { describeTarget, type LogicsrcExec };
