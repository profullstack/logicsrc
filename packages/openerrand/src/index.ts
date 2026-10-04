/**
 * @logicsrc/openerrand: the reference runner for OpenErrand 0.1.
 *
 * `logicsrc errand run <file>` is the command; this module is the library
 * behind it, for a program that wants to embed the runner (its own driver,
 * extractor, vault or prompt).
 */

export * from "./types.js";
export { ErrandError, durationMs, render, transform, templateNames, MASK } from "./util.js";
export {
  Inputs,
  QaSet,
  resolveInputs,
  generate,
  documentValues,
  inYears,
  type Candidate,
  type DocumentExtractor,
  type DocumentRecord,
  type DocumentRequest,
  type Prompt,
  type ResolveOptions,
  type VaultReader,
} from "./inputs.js";
export { commandExtractor, parseRecords } from "./extract.js";
export { act, decide, describeField, isChoice, type Action, type Decision } from "./rules.js";
export { DEFAULT_LOCKOUT, allowedOrigins, fits, isGate, isLockout, lockoutPattern, outcomeOf, outcomeText, selectorsOf, solverPermitted, stepFor } from "./pages.js";
export { LIMITS, checkThrottle, emptyLedger, keyFor, lockoutMs, recordAttempt, recordLockout, type Ledger, type ThrottleCheck } from "./throttle.js";
export { Store, errandHome, type Card, type RunRecord } from "./store.js";
export { fileVault, opencredsVault, openVault, parseEnv, parseTarget, serializeEnv, teamsVault, type LogicsrcExec, type Vault, type VaultTarget } from "./vault.js";
export { credentialValues, expiresOn, fileDownloads, renderCard, writeCredentials } from "./outputs.js";
export { type CaptchaContext, type CaptchaSolver } from "./captcha.js";
export { fillScript, looksLike, openCdpDriver, readPageScript, submitScript, type Driver, type FillAction } from "./driver.js";
export { findChrome, launchBrowser, plainUserAgent } from "./browser.js";
export { loadErrand, sha256, summarize, validateErrand } from "./load.js";
export { runErrand, type RunDeps, type RunResult } from "./run.js";
export { EXIT, registerErrandCommands, runCommand, type Deps } from "./commands.js";
