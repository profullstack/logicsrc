/**
 * The captcha solver hook. The runner ships no solver and never will: by
 * default a captcha is handed to the person in a visible window, or the run
 * stops. A program embedding the runner may pass a {@link CaptchaSolver}, and
 * the runner calls it only when {@link solverPermitted} says the errand allows
 * one (the step says `solver: allowed`, the site's stated sector is outside
 * government, tax, financial, healthcare and identity-provider, and the errand
 * has no declare or identity-proofing step and no secret input). Every use is
 * logged with the time, the page URL and the service, never the image or the
 * answer.
 */

export { solverPermitted } from "./pages.js";

export interface CaptchaContext {
  /** The page the captcha is on. */
  url: string;
  /** Evaluate script in the page, for a solver that must place its token. */
  evaluate(expression: string): Promise<unknown>;
}

export interface CaptchaSolver {
  /** The service's name, written to the log on every use. */
  readonly service: string;
  /** Resolve true when the captcha is cleared. */
  solve(context: CaptchaContext): Promise<boolean>;
}
