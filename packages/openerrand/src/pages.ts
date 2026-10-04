/**
 * Reading a page against the errand: which step it is, and whether it is an
 * outcome. Pure; the driver supplies the page and which CSS selectors hit.
 */

import { NO_SOLVER_SECTORS } from "@logicsrc/validators";
import type { CaptchaStep, Errand, GateStep, IdentityStep, Match, Outcome, Page, Step } from "./types.js";
import { originOf, re } from "./util.js";

/** Every CSS selector the errand's matches name, so the driver can test them in one evaluation. */
export function selectorsOf(errand: Errand): string[] {
  const out = new Set<string>();
  for (const step of errand.steps) {
    const match = (step as { match?: Match }).match;
    if (match?.selector) out.add(match.selector);
  }
  return [...out];
}

/** All the given parts of a match must fit. */
export function fits(match: Match, page: Pick<Page, "url" | "title" | "text">, hits: Record<string, boolean>): boolean {
  if (match.url !== undefined && !re(match.url).test(page.url)) return false;
  if (match.title !== undefined && !re(match.title).test(page.title)) return false;
  if (match.text !== undefined && !re(match.text).test(page.text)) return false;
  if (match.selector !== undefined && !hits[match.selector]) return false;
  return true;
}

/**
 * The step for a page: the first step whose match fits, an identity-proofing
 * gate whose provider origin the page is on, else the first page step with no
 * match (the fallback). null when nothing fits.
 */
export function stepFor(errand: Errand, page: Pick<Page, "url" | "title" | "text">, hits: Record<string, boolean>): Step | null {
  const origin = originOf(page.url);
  for (const step of errand.steps) {
    if (step.kind === "identity-proofing" && step.origins.includes(origin)) return step;
    const match = (step as { match?: Match }).match;
    if (match && (step.kind === "page" || step.kind === "wait" || step.kind === "captcha" || step.kind === "identity-proofing") && fits(match, page, hits)) return step;
  }
  return errand.steps.find((s) => s.kind === "page" && !s.match) ?? null;
}

export function isGate(step: Step): step is GateStep {
  return step.kind === "declare" || step.kind === "identity-proofing" || step.kind === "code" || step.kind === "mail" || step.kind === "captcha";
}

export function stepById(errand: Errand, id: string): Step | undefined {
  return errand.steps.find((s) => s.id === id);
}

/** The text an outcome is tested against: the page's error messages, or its text when it shows none. */
export function outcomeText(page: Pick<Page, "errors" | "text">): string {
  return page.errors.length ? page.errors.join(" ") : page.text;
}

/** Rejected outcomes first, then the others in file order. Both `text` and `url` must fit when both are given. */
export function outcomeOf(errand: Errand, page: Pick<Page, "url" | "errors" | "text">): Outcome | null {
  const text = outcomeText(page);
  const ordered = [...errand.outcomes.filter((o) => o.kind === "rejected"), ...errand.outcomes.filter((o) => o.kind !== "rejected")];
  for (const outcome of ordered) {
    if (outcome.text !== undefined && !re(outcome.text).test(text)) continue;
    if (outcome.url !== undefined && !re(outcome.url).test(page.url)) continue;
    return outcome;
  }
  return null;
}

/** Origins a run may be on: the site's, plus every identity provider's (only while that gate is handed over). */
export function allowedOrigins(errand: Errand): Set<string> {
  const out = new Set(errand.site.origins);
  for (const step of errand.steps) if (step.kind === "identity-proofing") for (const o of (step as IdentityStep).origins) out.add(o);
  return out;
}

/**
 * Whether a captcha solver may be used for this step: the step says `allowed`
 * and the errand is outside the forbidden set (a stated sector that is not
 * government, tax, financial, healthcare or identity-provider; no declare or
 * identity-proofing step; no secret input). The validator rejects a file that
 * breaks this, and the runner checks again so a hand-edited file that skipped
 * validation still cannot reach a solver.
 */
export function solverPermitted(errand: Errand, step: CaptchaStep): boolean {
  if (step.solver !== "allowed") return false;
  const sector = errand.site.sector;
  if (!sector || (NO_SOLVER_SECTORS as readonly string[]).includes(sector)) return false;
  if (errand.steps.some((s) => s.kind === "declare" || s.kind === "identity-proofing")) return false;
  if (Object.values(errand.inputs ?? {}).some((i) => i.sensitivity === "secret")) return false;
  return true;
}

/** The text that marks a lockout: `metadata.lockout.text` when the file gives one, else a default that covers the common wordings. */
export const DEFAULT_LOCKOUT = "account (is |has been )?(temporarily )?locked|locked out|too many (failed |unsuccessful )?attempts|exceeded the (allowed |maximum )?number of attempts";

export function lockoutPattern(errand: Errand): string {
  const lockout = (errand.metadata as { lockout?: { text?: unknown } } | undefined)?.lockout;
  return typeof lockout?.text === "string" && lockout.text ? lockout.text : DEFAULT_LOCKOUT;
}

export function isLockout(errand: Errand, text: string): boolean {
  return re(lockoutPattern(errand)).test(text);
}
