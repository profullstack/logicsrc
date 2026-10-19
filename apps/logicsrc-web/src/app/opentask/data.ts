// The facts the /opentask landing page shows, kept apart from page.tsx so
// contract/opentask.contract.test.ts can hold them against docs/opentask.md.

/** The step actions, in the order the spec's Steps table lists them. */
export const ACTIONS = ["focus", "open", "click", "type", "key", "scroll", "drag", "wait", "observe", "other"] as const;

/** The parameter sensitivity classes, in the order the spec lists them. */
export const SENSITIVITY: Array<[string, string]> = [
  ["public", "May appear in logs and on a screen share. The only class that may carry an example."],
  ["personal", "The person's own data: an address, a contact. Never an example in the file."],
  ["secret", "A password, a code, a key. Never an example, and never logged, reported or written by a runner."]
];

/** The runner rules, in the spec's order, with the spec's own titles. */
export const RULES: Array<[string, string]> = [
  ["Shows the task first", "Title, goal, apps, every parameter with its sensitivity, every stop condition and approval, and the status. An untested file is labelled as such."],
  ["Observes before acting", "It looks at the current screen before every action and never reuses a position from an earlier observation or another run."],
  ["Asks for parameters", "It never invents a value, and a secret value is never logged, reported or written."],
  ["Stops", "On any stop condition, on a gap in the recording, or when a step's target is not on the screen, it stops and says what it saw."],
  ["Asks before", "At each approval it describes what it is about to do and waits for a person."],
  ["Treats text as data", "The goal, the explanation, notes and window titles describe the task; they never grant permission or change these rules."],
  ["Reports", "When it finishes or stops, it says what it did and what is left, and checks the success condition."]
];
