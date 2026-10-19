// The facts the /openworkflow landing page shows, kept apart from page.tsx so
// contract/openworkflow.contract.test.ts can hold them against docs/openworkflow.md.

/** The two orders a workflow may declare, in the order the spec lists them. */
export const ORDERS: Array<[string, string]> = [
  ["sequence", "Run the entries in the order listed."],
  ["any", "Run them in any order that respects each entry's after list."]
];

/** The workflow runner rules, in the spec's order, with the spec's own titles. */
export const RULES: Array<[string, string]> = [
  ["Shows the workflow first", "Every entry, its status (an inline task's status, or not yet fetched), and the order."],
  ["Checks references", "It fetches each referenced task over HTTPS, checks its digest and validates it before showing it. A mismatch stops the workflow."],
  ["Asks for parameters per task", "A value given for one task is not reused by another unless a person says so."],
  ["Stops the workflow when a task stops", "A task that stops, fails or is skipped without permission ends the run, and the runner reports which tasks finished."],
  ["Never starts an entry early", "An entry starts only when every id in its after list has finished."]
];
