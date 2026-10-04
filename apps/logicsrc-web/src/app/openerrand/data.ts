// The facts the /openerrand landing page shows, kept apart from page.tsx so
// contract/openerrand.contract.test.ts can hold them against docs/openerrand.md.

/** The step kinds, in the order the spec's Steps table lists them. */
export const STEPS: Array<[string, string]> = [
  ["page", "A form page: fill it from the rules, then press its forward button."],
  ["wait", "An interstitial the page clears by itself, such as a proof-of-work bot check. Waited out, never solved or bypassed."],
  ["declare", "A legal attestation. Ticked only on the principal's consent for this run, given after seeing the values."],
  ["identity-proofing", "A selfie, a video call or an ID scan at a provider such as ID.me. Never driven by the runner: the person does it in a visible window."],
  ["code", "A one-time code by text, email, call or app, relayed by the person through a terminal, a file or the runner's own page."],
  ["mail", "A letter with a PIN. The run ends as waiting and a hand-off card says what to do when it comes."],
  ["captcha", "Shown to the principal, or the run stops. Never sent to a solving service or a model."]
];

/** The sensitivity classes, in the order the spec lists them. */
export const SENSITIVITY: Array<[string, string]> = [
  ["public", "Logs, the terminal, hand-off cards, the run record."],
  ["personal", "The principal's terminal, the site's own fields, the vault. Never a log, never a card."],
  ["secret", "The site's own field and the vault, and nowhere else. Masked as •••• everywhere."]
];

/** Where an input may come from, in the order the spec lists them. */
export const SOURCES: Array<[string, string]> = [
  ["document", "Extracted on the principal's machine from their own files, with the file and page recorded. The document never leaves the machine."],
  ["vault", "A key in the principal's vault, read before anything is generated, so a second run reuses the first run's login."],
  ["prompt", "Asked of a person at run time. A secret prompt does not echo."],
  ["generate", "A fresh random value, written to the vault on success."],
  ["derive", "Another input, transformed: the digits of a street address."],
  ["candidate", "A part of the chosen shared-secret candidate, such as the tax year the figure came from."],
  ["literal", "A fixed value."]
];
