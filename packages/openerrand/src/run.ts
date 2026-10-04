/**
 * The run loop: open the start page, then for each page find its step, test
 * the outcomes, fill it from the rules, hand every gate to a person, and press
 * the forward button, until the site answers or the runner has to stop.
 *
 * Everything that touches the world comes in through {@link RunDeps}, so the
 * loop is tested against a scripted fake browser and only the integration
 * test drives a real Chrome.
 */

import { randomInt } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import type { CaptchaSolver } from "./captcha.js";
import type { Driver } from "./driver.js";
import type { Inputs, Prompt } from "./inputs.js";
import { credentialValues, expiresOn, fileDownloads, renderCard, writeCredentials } from "./outputs.js";
import { allowedOrigins, fits, isLockout, outcomeOf, selectorsOf, solverPermitted, stepById, stepFor } from "./pages.js";
import { type Action, decide, describeField, isChoice } from "./rules.js";
import type { Card, RunRecord, Store } from "./store.js";
import { checkThrottle, keyFor, lockoutMs, recordAttempt, recordLockout } from "./throttle.js";
import type { CaptchaStep, CodeStep, DeclareStep, Errand, Field, IdentityStep, MailStep, Outcome, Page, StopReason, WaitStep } from "./types.js";
import { durationMs, ErrandError, MASK, originOf, re, sleep } from "./util.js";
import type { Vault } from "./vault.js";

export interface RunDeps {
  errand: Errand;
  /** Where the file came from, and its SHA-256: both go in the run record. */
  source: string;
  sha256: string;
  inputs: Inputs;
  store: Store;
  openDriver: () => Promise<Driver>;
  /** The principal's consent to tick declaration boxes for this run (`--declare`). Never from a file or the environment. */
  declare: boolean;
  dryRun: boolean;
  /** A visible window a person can use. */
  headful: boolean;
  /** A person is at a terminal. */
  interactive: boolean;
  prompt: Prompt;
  /** One line for the person, on the terminal (stderr). */
  say: (line: string) => void;
  now?: () => Date;
  random?: (max: number) => number;
  vault: Vault | null;
  fallbackVault: Vault;
  solver?: CaptchaSolver;
  account?: string;
  force?: boolean;
  /** Test knobs: how often files and pages are polled, and the pause between the choice and text passes. */
  pollMs?: number;
  rereadMs?: number;
}

export interface RunResult {
  record: RunRecord;
  file: string;
}

class Stop extends Error {
  constructor(
    readonly reason: StopReason,
    message: string,
    readonly page?: string,
  ) {
    super(message);
  }
}

/** Run one errand. Never throws for anything the site or the person does; the record says what happened. */
export async function runErrand(deps: RunDeps): Promise<RunResult> {
  const { errand, inputs, store, say } = deps;
  const now = deps.now ?? (() => new Date());
  const random = deps.random ?? randomInt;
  const pollMs = deps.pollMs ?? 2_000;
  const rereadMs = deps.rereadMs ?? 1_000;
  const log = store.pageLog(errand.name);
  const startedAt = now();
  const base = {
    errand: errand.id ?? deps.source,
    name: errand.name,
    title: errand.title,
    sha256: deps.sha256,
    at: startedAt.toISOString(),
    log,
    ...(inputs.chosen ? { candidate: { ...(inputs.chosen.year !== undefined ? { year: inputs.chosen.year } : {}), form: inputs.chosen.form, field: inputs.chosen.field, source: inputs.chosen.source } } : {}),
  };
  const finish = (record: Omit<RunRecord, keyof typeof base> & Partial<RunRecord>): RunResult => {
    const full = { ...base, ...record } as RunRecord;
    return { record: full, file: store.saveRun(full) };
  };

  // The throttle: a dry run creates nothing a site keeps, so it is not an attempt.
  const key = keyFor(errand, deps.account);
  if (!deps.dryRun) {
    const ledger = store.loadLedger();
    const check = checkThrottle(ledger, key, startedAt, deps.force);
    if (!check.ok) {
      say(`Not running: ${check.reason}. Next allowed at ${check.until.toISOString()}.`);
      return finish({ outcome: "stopped", kind: "stopped", reason: `throttle: ${check.reason}; next at ${check.until.toISOString()}` });
    }
    store.saveLedger(recordAttempt(ledger, key, startedAt));
  }

  const codeFile = store.codeFile(errand.name);
  rmSync(codeFile, { force: true });

  const limits = { pages: errand.limits?.pages ?? 15, samePage: errand.limits?.same_page ?? 2, pageMs: durationMs(errand.limits?.page_timeout, 30_000) };
  const selectors = selectorsOf(errand);
  const allowed = allowedOrigins(errand);
  const pageRules = (stepRules: Errand["rules"]) => [...(stepRules ?? []), ...(errand.rules ?? [])];

  const logPage = (page: Page, extra: Record<string, unknown> = {}): void => {
    // Fields without values; the text only of a page with nothing to fill, which is a result page.
    const fields = page.fields.map(({ selector, type, label, required, options }) => ({ selector, type, label, required, ...(options ? { options: options.slice(0, 15) } : {}) }));
    store.appendPageLog(errand.name, {
      at: now().toISOString(),
      url: page.url,
      title: page.title,
      errors: page.errors,
      fields,
      ...(page.fields.length ? {} : { text: page.text.slice(0, 2000) }),
      ...extra,
    });
  };

  let driver: Driver | null = null;
  try {
    driver = await deps.openDriver();
    let opened = false;
    for (const url of errand.site.start) {
      try {
        await driver.goto(url);
        opened = true;
        break;
      } catch (error) {
        say(`  could not open ${url}: ${(error as Error).message}`);
      }
    }
    if (!opened) throw new Stop("error", "none of the start URLs opened");

    let submitted = 0;
    let lastUrl = "";
    let comebacks = 0;
    let codeSubmitted = false;
    let afterWait = false;
    let refilled = false;

    for (;;) {
      // The URL first, read without running script: an identity provider's page is never touched.
      const url = await driver.url();
      const origin = originOf(url);
      if (!errand.site.origins.includes(origin)) {
        const identity = errand.steps.find((s): s is IdentityStep => s.kind === "identity-proofing" && s.origins.includes(origin));
        if (identity) {
          await identityGate(identity, url);
          continue;
        }
        throw new Stop("off-site", `the browser left the site for ${origin || url}`, url);
      }

      let page = await readSettled(driver);
      const hits = await driver.selectorHits(selectors);
      const step = stepFor(errand, page, hits);

      if (step?.kind === "wait") {
        await waitStep(step);
        afterWait = true;
        continue;
      }
      if (step?.kind === "captcha") {
        await captchaGate(step, page.url);
        continue;
      }
      if (step?.kind === "identity-proofing") {
        await identityGate(step, page.url);
        continue;
      }

      logPage(page);
      const codeFields = page.fields.filter((f) => {
        const d = decide(pageRules(step?.kind === "page" ? step.rules : undefined), f, inputs, true);
        return d?.action?.kind === "gate" && stepById(errand, d.action.step)?.kind === "code";
      });
      // A wrong or late code leaves the code page up with an error: wait for the next code, do not end the run.
      const codeRetry = codeSubmitted && page.errors.length > 0 && codeFields.length > 0;

      const outcome = outcomeOf(errand, page);
      if (outcome?.kind === "rejected") return rejected(outcome, page);
      if (isLockout(errand, lockoutText(page))) return rejected({ name: "locked", kind: "rejected" }, page);
      if (outcome) return await succeeded(outcome, page);

      if (page.errors.length && submitted > 0 && (errand.retry?.page_errors ?? "rejected") === "rejected" && !codeRetry) {
        if (afterWait && !refilled) {
          // The interstitial replayed the form without its values; the site never saw them. Fill it once more.
          refilled = true;
          say("  (the page came back from the bot check without its values; filling it again, once)");
        } else {
          return rejected({ name: "page-errors", kind: "rejected" }, page);
        }
      }
      afterWait = false;
      if (codeRetry) say(`  the site said: ${page.errors[0]}`);

      comebacks = page.url === lastUrl ? comebacks + 1 : 0;
      if (comebacks >= limits.samePage && !codeRetry) throw new Stop("loop", `the same page came back ${comebacks + 1} times: ${page.url} (fields logged to ${log})`, page.url);
      lastUrl = page.url;
      if (submitted >= limits.pages) throw new Stop("pages", `more than ${limits.pages} pages (fields logged to ${log})`, page.url);
      if (!step || step.kind !== "page") throw new Stop("unmatched", `no page step fits ${page.url}`, page.url);

      say(`  ${page.title || "(untitled)"}  ${page.url}`);
      if (step.say) say(`    ${step.say}`);
      const rules = pageRules(step.rules);
      const filled: string[] = [];
      const missing: Field[] = [];
      const declares: Array<{ field: Field; gate: DeclareStep }> = [];
      const codes: Array<{ field: Field; gate: CodeStep }> = [];
      let sharedSecretHere = false;

      for (const pass of ["choices", "text"] as const) {
        if (pass === "text") {
          // A choice can rewrite the page around it; let that land, then read again.
          await sleep(rereadMs);
          page = await readSettled(driver);
        }
        for (const field of page.fields) {
          if ((pass === "choices") !== isChoice(field)) continue;
          const decision = decide(rules, field, inputs);
          if (!decision || !decision.action) {
            // A radio group with one already chosen is answered; a required box nothing fills stops the run.
            if (field.required && !(field.type === "radio" && field.groupChecked)) missing.push(field);
            continue;
          }
          const { rule, action } = decision;
          if (action.kind === "skip") continue;
          if (action.kind === "gate") {
            const gate = stepById(errand, action.step);
            if (gate?.kind === "declare") declares.push({ field, gate });
            else if (gate?.kind === "code") codes.push({ field, gate });
            else if (gate?.kind === "mail") return waitingOnMail(gate, page);
            else if (gate?.kind === "identity-proofing") await identityGate(gate, page.url);
            else if (gate?.kind === "captcha") await captchaGate(gate, page.url);
            continue;
          }
          if ((action.kind === "text" || action.kind === "select") && action.sharedSecret) sharedSecretHere = true;
          if (!(await driver.fill(field, action.kind === "check" ? { kind: "check" } : { kind: action.kind, value: action.value }))) {
            throw new Stop("error", `could not fill ${describeField(field)} on ${page.url}`, page.url);
          }
          filled.push(describeAction(rule.name, field, action));
        }
      }

      for (const field of missing) {
        if (step.unmatched === "ask" && deps.interactive) {
          const answer = await deps.prompt(`${field.label || field.name}${field.options ? ` [${field.options.map((o) => o.text).join(" | ")}]` : ""}: `, { secret: field.type === "password" });
          if (answer === null) throw new Stop("unmatched", unmatchedMessage(field, page), page.url);
          const option = field.options?.find((o) => o.text === answer || o.value === answer);
          await driver.fill(field, field.type === "checkbox" || field.type === "radio" ? { kind: "check" } : { kind: field.options ? "select" : "text", value: option?.value ?? answer });
          filled.push(`${field.label || field.name} = (typed)`);
          continue;
        }
        throw new Stop("unmatched", unmatchedMessage(field, page), page.url);
      }

      for (const line of filled) say(`    ${line}`);

      // Rule 12: a dry run stops on the first page holding a declaration or a shared secret, before its forward button.
      if (deps.dryRun && (declares.length || sharedSecretHere)) {
        for (const { field, gate } of declares) {
          say(`    declaration (not ticked): "${field.label}"`);
          say(`      ${gate.why}`);
        }
        say("Dry run: stopped before the forward button of the first page that sends a declaration or a shared secret.");
        return finish({ outcome: "dry-run", kind: "dry-run", page: page.url });
      }

      for (const { field, gate } of declares) {
        if (!deps.declare) {
          say("");
          say(`This page asks the principal to state:`);
          say(`  "${field.label}"`);
          say(`  ${gate.why}`);
          say("The values above are what would be attested. Nothing was submitted. Rerun with --declare once you have checked them.");
          throw new Stop("gate", `declaration needs --declare: "${field.label}"`, page.url);
        }
        if (!(await driver.fill(field, { kind: "check" }))) throw new Stop("error", `could not tick ${describeField(field)}`, page.url);
        say(`    declaration ticked on your --declare: "${field.label}"`);
      }

      let filledCode = false;
      for (const { field, gate } of codes) {
        const code = await waitForCode(gate);
        if (!(await driver.fill(field, { kind: "text", value: code }))) throw new Stop("error", `could not fill ${describeField(field)}`, page.url);
        say(`    code = ${MASK}`);
        filledCode = true;
      }

      const pressed = await driver.submit();
      if (pressed.startsWith("?")) throw new Stop("no-forward", `no forward button on ${page.url}; buttons seen: ${pressed.slice(1) || "none"}`, page.url);
      say(`    -> ${pressed}`);
      submitted += 1;
      codeSubmitted = filledCode;
      await driver.settle();
    }
  } catch (error) {
    if (error instanceof Stop) {
      say(`Stopped (${error.reason}): ${error.message}`);
      return finish({ outcome: "stopped", kind: "stopped", reason: `${error.reason}: ${error.message}`, ...(error.page ? { page: error.page } : {}) });
    }
    const message = (error as Error).message;
    say(`Stopped (error): ${message}`);
    return finish({ outcome: "stopped", kind: "stopped", reason: `error: ${message}` });
  } finally {
    await driver?.close();
  }

  // -------------------------------------------------------------------------

  /** A page caught mid-navigation cannot be read; give it a moment, twice, before calling it an error. */
  async function readSettled(d: Driver): Promise<Page> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await d.read();
      } catch (error) {
        if (attempt >= 2) throw error;
        await sleep(Math.max(pollMs, 500));
      }
    }
  }

  function unmatchedMessage(field: Field, page: Page): string {
    return `no rule fills ${describeField(field)} (id "${field.id}", name "${field.name}") on ${page.url}; add a rule, or set "unmatched": "ask" and run at a terminal (fields logged to ${log})`;
  }

  function rejected(outcome: Outcome, page: Page): RunResult {
    logPage(page, { outcome: outcome.name });
    if (!deps.dryRun && isLockout(errand, `${page.title} ${lockoutText(page)}`)) {
      store.saveLedger(recordLockout(store.loadLedger(), key, now(), lockoutMs(errand)));
      say(`The site locked the account. Nothing will run against it for ${Math.round(lockoutMs(errand) / 60_000)} minutes, --force or not.`);
    }
    say(`Rejected: ${page.errors.join(" ") || page.text.slice(0, 300)}`);
    const others = inputs.candidates
      .map((c, i) => ({ index: i + 1, ...(c.year !== undefined ? { year: c.year } : {}), form: c.form, field: c.field, source: c.source }))
      .filter((c) => !(inputs.chosen && inputs.candidates[c.index - 1] === inputs.chosen));
    if (inputs.sharedSecret) {
      // Rule 5: one shared secret per run, never retried. The person chooses the next one.
      say("Nothing was retried.");
      if (others.length) {
        say("Other candidates (choose one for the next run with --candidate N):");
        for (const c of others) say(`  ${c.index}. ${c.year ?? ""} ${c.form} ${c.field}  from ${c.source}`.replace(/\s+/g, " "));
      }
    }
    return finish({ outcome: outcome.name, kind: "rejected", page: page.url, ...(inputs.sharedSecret && others.length ? { others } : {}) });
  }

  async function succeeded(outcome: Outcome, page: Page): Promise<RunResult> {
    logPage(page, { outcome: outcome.name });
    // Rule 10: credentials are written before success is reported.
    const values = credentialValues(errand, outcome, inputs);
    const saved = await writeCredentials(values, deps.vault, deps.fallbackVault);
    const downloads = fileDownloads(errand, outcome, inputs, driver?.downloads() ?? []);
    const then = outcome.then ? stepById(errand, outcome.then) : undefined;
    let card: Card | undefined;
    let waiting: RunRecord["waiting"];
    if (then?.kind === "mail") {
      const expires = then.expires ? expiresOn(now(), durationMs(then.expires, 0)) : undefined;
      card = then.handoff ? renderCard(errand, then.handoff, inputs, expires ? { expires_on: expires } : {}, random) : undefined;
      waiting = { step: then.id, what: then.what, ...(expires ? { expires_on: expires } : {}), ...(then.resume ? { resume: then.resume } : {}) };
    }
    const kind = outcome.kind === "waiting" ? "waiting" : "success";
    // The errand a mail gate said to resume with has succeeded: its card is done.
    if (kind === "success") {
      for (const earlier of store.runs()) {
        if (earlier.waiting?.resume === errand.name && earlier.card && !earlier.card.done) {
          store.saveRun({ ...earlier, card: { ...earlier.card, done: true } });
          say(`  card ${earlier.card.id} is done`);
        }
      }
    }
    say(`${kind === "waiting" ? "Waiting" : "Done"}: ${outcome.name} (${errand.title}).`);
    if (saved.where) say(`  credentials saved to ${saved.where}`);
    if (saved.warning) say(`  ${saved.warning}`);
    for (const d of downloads) say(`  filed ${d}`);
    if (waiting) say(`  ${waiting.what}${waiting.expires_on ? `: act before ${waiting.expires_on}` : ""}`);
    if (card) {
      say(`  card ${card.id} (logicsrc errand status shows it; it is not sent anywhere)`);
      for (const [i, s] of card.steps.entries()) say(`    ${i + 1}. ${s}`);
      if (card.command) say(`    ${card.command}`);
    }
    return finish({
      outcome: outcome.name,
      kind,
      page: page.url,
      ...(saved.where ? { vault: saved.where } : {}),
      ...(downloads.length ? { downloads } : {}),
      ...(card ? { handoff: card.id, card } : {}),
      ...(waiting ? { waiting } : {}),
    });
  }

  function waitingOnMail(gate: MailStep, page: Page): RunResult {
    const expires = gate.expires ? expiresOn(now(), durationMs(gate.expires, 0)) : undefined;
    const card = gate.handoff ? renderCard(errand, gate.handoff, inputs, expires ? { expires_on: expires } : {}, random) : undefined;
    say(`Waiting: ${gate.what}${expires ? `, act before ${expires}` : ""}.`);
    if (card) say(`  card ${card.id} (logicsrc errand status shows it)`);
    return finish({
      outcome: gate.id,
      kind: "waiting",
      page: page.url,
      waiting: { step: gate.id, what: gate.what, ...(expires ? { expires_on: expires } : {}), ...(gate.resume ? { resume: gate.resume } : {}) },
      ...(card ? { handoff: card.id, card } : {}),
    });
  }

  /** An interstitial the page clears by itself: poll until its match no longer fits. Never solved, never bypassed. */
  async function waitStep(step: WaitStep): Promise<void> {
    say(`  ${step.say ?? `waiting for ${step.id} to clear`}`);
    const until = now().getTime() + durationMs(step.timeout, 90_000);
    const poll = durationMs(step.poll, 3_000);
    while (now().getTime() < until) {
      await sleep(Math.min(poll, pollMs * 5));
      const url = await driver!.url();
      if (!errand.site.origins.includes(originOf(url))) return;
      // The page may be navigating away as it is read; that is the interstitial clearing, so poll again.
      const page = await driver!.read().catch(() => null);
      if (!page) continue;
      if (!fits(step.match, page, await driver!.selectorHits(selectors))) {
        await sleep(Math.min(1_500, pollMs));
        return;
      }
    }
    throw new Stop("timeout", `${step.id} did not clear in ${step.timeout}`);
  }

  /** Identity proofing is the person's: hand them the window, or stop. Nothing on the provider's pages is touched. */
  async function identityGate(step: IdentityStep, url: string): Promise<void> {
    say("");
    say(`${step.provider}: ${step.why}`);
    if (!(deps.headful && deps.interactive)) {
      const card = step.handoff ? renderCard(errand, step.handoff, inputs, {}, random) : undefined;
      if (card) say(`  card ${card.id} (logicsrc errand status shows it)`);
      throw new Stop("gate", `identity proofing with ${step.provider} is yours to do; rerun with --headful at a terminal to do it in the window`, url);
    }
    say(`  The window is yours. The runner waits, without touching the page, until it is back on ${errand.site.origins.join(" or ")}.`);
    const until = now().getTime() + durationMs(step.timeout, 30 * 60_000);
    while (now().getTime() < until) {
      await sleep(pollMs);
      const current = await driver!.url();
      if (errand.site.origins.includes(originOf(current))) return;
      if (!allowed.has(originOf(current))) throw new Stop("off-site", `the browser left for ${originOf(current) || current}`, current);
    }
    throw new Stop("timeout", `identity proofing did not return to the site within ${step.timeout ?? "PT30M"}`, url);
  }

  /** A captcha is the person's unless the errand allows a solver where the rules permit one, and one was given. */
  async function captchaGate(step: CaptchaStep, url: string): Promise<void> {
    if (deps.solver && solverPermitted(errand, step)) {
      store.appendPageLog(errand.name, { at: now().toISOString(), captcha: { url, service: deps.solver.service } });
      say(`  captcha: using ${deps.solver.service}, as this errand allows (logged)`);
      if (!(await deps.solver.solve({ url, evaluate: (e) => driver!.evaluate(e) }))) throw new Stop("gate", `${deps.solver.service} did not clear the captcha`, url);
      await driver!.settle();
      return;
    }
    say("");
    say(`A captcha: ${step.why ?? "a test meant for a person."}`);
    if (!(deps.headful && deps.interactive)) throw new Stop("gate", "a captcha is the person's to answer; rerun with --headful at a terminal", url);
    say("  Answer it in the window; the runner waits until it is gone.");
    const until = now().getTime() + durationMs(step.timeout, 10 * 60_000);
    while (now().getTime() < until) {
      await sleep(pollMs);
      const current = await driver!.url();
      if (!errand.site.origins.includes(originOf(current))) return;
      const page = await driver!.read();
      if (!fits(step.match, page, await driver!.selectorHits(selectors))) return;
    }
    throw new Stop("timeout", "the captcha was not answered in time", url);
  }

  /**
   * A one-time code through a declared relay: typed at the terminal, or
   * written to the code file by whoever holds the phone. Used once, never
   * logged or shown. A code that does not fit the pattern is ignored and the
   * wait goes on.
   */
  async function waitForCode(step: CodeStep): Promise<string> {
    const pattern = step.pattern ?? "^\\w{4,10}$";
    const timeoutMs = durationMs(step.timeout, 15 * 60_000);
    if (step.why) say(`    ${step.why}`);
    if (deps.interactive && step.relay.includes("terminal")) {
      for (;;) {
        const code = await deps.prompt(`Code sent by ${step.channel}: `, { secret: false });
        if (code === null) break;
        if (re(pattern).test(code.trim())) return code.trim();
        say("    that does not look like the code; try again");
      }
    }
    if (!step.relay.includes("file")) throw new Stop("gate", `the code arrives by ${step.channel} and this errand relays it only through ${step.relay.join(", ")}; nobody is at a terminal`);
    say(`    WAITING for the ${step.channel} code: write it to ${codeFile} (${Math.round(timeoutMs / 60_000)} minutes)`);
    const until = now().getTime() + timeoutMs;
    while (now().getTime() < until) {
      await sleep(pollMs);
      if (!existsSync(codeFile)) continue;
      const code = readFileSync(codeFile, "utf8").trim();
      rmSync(codeFile, { force: true });
      if (re(pattern).test(code)) return code;
    }
    throw new Stop("timeout", `no code arrived in ${step.timeout}`);
  }
}

/** Where a lockout is read: the errors a page shows, or the text of a result page with nothing to fill (never a form's own warnings). */
function lockoutText(page: Page): string {
  return page.errors.length ? page.errors.join(" ") : page.fields.length ? "" : page.text;
}

function describeAction(name: string, field: Field, action: Action): string {
  if (action.kind === "text") return `${name} = ${action.secret ? MASK : action.value}`;
  if (action.kind === "select") return `${name} = ${action.secret ? MASK : action.text}`;
  if (action.kind === "check") return `${name}${field.type === "radio" ? ` = ${field.label}` : ""}`;
  return name;
}

export { ErrandError };
