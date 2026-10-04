/**
 * The errand file as the runner reads it. These mirror
 * `logicsrc-openerrand.schema.json` in @logicsrc/schemas; the runner never
 * trusts a file it has not first passed through @logicsrc/validators, so the
 * types describe a document that is already known to be well formed.
 */

export type Sensitivity = "public" | "personal" | "secret";
export type InputType = "string" | "integer" | "number" | "email" | "date" | "boolean" | "qa-set";
export type Role = "shared-secret" | "credential" | "identifier";
export type Sector = "government" | "tax" | "financial" | "healthcare" | "identity-provider" | "commercial" | "other";
export type FieldType = "text" | "password" | "email" | "tel" | "number" | "date" | "textarea" | "select-one" | "radio" | "checkbox";

export type Source =
  | { from: "prompt"; ask?: string }
  | { from: "vault"; key: string }
  | {
      from: "document";
      form: string;
      field: string;
      match?: string;
      pick?: "newest" | "oldest" | "each";
      years?: { back?: number; current?: boolean };
      transform?: string;
    }
  | { from: "derive"; input: string; transform: string }
  | { from: "candidate"; input: string; part: "year" | "form" | "field" | "source" }
  | { from: "generate"; length: number; classes: Array<"lower" | "upper" | "digit" | "special">; special?: string }
  | { from: "literal"; value: string | number | boolean };

export interface Input {
  label?: string;
  type: InputType;
  sensitivity: Sensitivity;
  role?: Role;
  required?: boolean;
  pattern?: string;
  max_length?: number;
  count?: number;
  sources: Source[];
}

export type RuleAction =
  | { text: string; split?: number[] }
  | { select: string[] }
  | { check: true | { label: string } }
  | { skip: true }
  | { gate: string }
  | { choose: string }
  | { answer: string };

export interface Rule {
  name: string;
  id?: string;
  label?: string;
  types?: FieldType[];
  do: RuleAction;
}

export interface Match {
  url?: string;
  title?: string;
  text?: string;
  selector?: string;
}

export interface PageStep {
  id: string;
  kind: "page";
  match?: Match;
  rules?: Rule[];
  unmatched?: "stop" | "ask";
  say?: string;
}
export interface WaitStep {
  id: string;
  kind: "wait";
  match: Match;
  timeout: string;
  poll?: string;
  say?: string;
}
export interface DeclareStep {
  id: string;
  kind: "declare";
  statement: string;
  why: string;
  say?: string;
}
export interface IdentityStep {
  id: string;
  kind: "identity-proofing";
  provider: string;
  origins: string[];
  match?: Match;
  timeout?: string;
  handoff?: string;
  why: string;
  say?: string;
}
export interface CodeStep {
  id: string;
  kind: "code";
  channel: "sms" | "email" | "voice" | "app";
  relay: Array<"terminal" | "file" | "page">;
  pattern?: string;
  timeout: string;
  why?: string;
  say?: string;
}
export interface MailStep {
  id: string;
  kind: "mail";
  what: string;
  arrives?: string;
  expires?: string;
  resume?: string;
  input?: string;
  handoff?: string;
  why?: string;
  say?: string;
}
export interface CaptchaStep {
  id: string;
  kind: "captcha";
  match: Match;
  solver?: "forbidden" | "allowed";
  timeout?: string;
  why?: string;
  say?: string;
}

export type Step = PageStep | WaitStep | DeclareStep | IdentityStep | CodeStep | MailStep | CaptchaStep;
export type GateStep = DeclareStep | IdentityStep | CodeStep | MailStep | CaptchaStep;

export interface Outcome {
  name: string;
  kind: "success" | "rejected" | "waiting";
  text?: string;
  url?: string;
  then?: string;
}

export interface Handoff {
  title: string;
  open?: string;
  steps: string[];
  command?: string;
}

export interface Download {
  match: { url?: string; filename?: string; type?: string };
  to: string;
  when?: string;
}

export interface Errand {
  type: "logicsrc.openerrand";
  version: "0.1";
  id?: string;
  name: string;
  title: string;
  description?: string;
  publisher?: string;
  updated?: string;
  reference?: string;
  principal?: "self" | "represented";
  site: { name: string; sector?: Sector; origins: string[]; start: string[]; terms?: string };
  limits?: { pages?: number; page_timeout?: string; same_page?: number };
  inputs?: Record<string, Input>;
  rules?: Rule[];
  steps: Step[];
  submit?: { labels: string; never?: string; ignore?: string };
  outcomes: Outcome[];
  retry?: { shared_secret?: "never"; page_errors?: "rejected" | "continue" };
  outputs?: {
    vault?: { when?: string; keys: Record<string, string> };
    downloads?: Download[];
  };
  handoffs?: Record<string, Handoff>;
  metadata?: Record<string, unknown>;
}

/** One form control as the runner reads it off a page. Never carries a value. */
export interface Field {
  /** A CSS selector that finds exactly this control. */
  selector: string;
  id: string;
  name: string;
  type: string;
  label: string;
  required: boolean;
  options?: Array<{ value: string; text: string }>;
  /** For a text box: the chosen option of the nearest select before it, or the question printed beside it. */
  question?: string;
  /** For a radio: whether any radio of its group is already checked. */
  groupChecked?: boolean;
}

/** What the runner reads from a page. `text` is the visible body text, cut short. */
export interface Page {
  url: string;
  title: string;
  text: string;
  errors: string[];
  fields: Field[];
}

/** The outcome the runner adds of its own, with why it stopped. */
export type StopReason = "unmatched" | "loop" | "pages" | "timeout" | "gate" | "off-site" | "no-forward" | "throttle" | "input" | "error";
