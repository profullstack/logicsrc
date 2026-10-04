/**
 * Inputs: every value an errand needs, resolved from its sources in order
 * before the browser opens, so a missing value stops the run before anything
 * is sent and a dry run can show what each page would receive.
 *
 * Sources and where they are served from:
 * - `document`: a {@link DocumentExtractor} hook. The runner ships one, which
 *   runs a command the principal names and reads JSON from it; the document
 *   never leaves the machine because the runner never sees more than the
 *   values the extractor prints.
 * - `vault`: a {@link VaultReader} (logicsrc teams, OpenCreds, or the local
 *   0600 state file). Read-only here; writing happens in outputs.
 * - `prompt`: asked at the terminal, without echo for a secret.
 * - `generate`: the runner's cryptographic generator.
 * - `derive`, `candidate`, `literal`: computed from the file and other inputs.
 *
 * `--input name=value` on the command line is the person typing the value, and
 * wins over every source.
 */

import { randomInt } from "node:crypto";
import type { Errand, Input, Source } from "./types.js";
import { ErrandError, MASK, test, transform } from "./util.js";

/** One value an extractor found in a document. `file`/`page` say where, for the person; they never reach a site. */
export interface DocumentRecord {
  form: string;
  field: string;
  value: string | number;
  year?: number;
  /** The label as printed beside the value, tested against a source's `match`. */
  label?: string;
  file?: string;
  page?: number;
}

export interface DocumentRequest {
  input: string;
  form: string;
  field: string;
  match?: string;
}

/**
 * Pluggable local extraction. The runner calls it once per run with every
 * document source of the errand and keeps what it returns in memory only.
 */
export interface DocumentExtractor {
  extract(requests: DocumentRequest[]): Promise<DocumentRecord[]>;
}

/** Read-only view of the principal's vault. */
export interface VaultReader {
  /** A human description such as `teams profullstack/ftb/prod`, shown in summaries. */
  describe(): string;
  get(key: string): Promise<string | undefined>;
}

export interface PromptOptions {
  secret: boolean;
}

/** null means nobody is at a terminal to answer. */
export type Prompt = (question: string, options: PromptOptions) => Promise<string | null>;

/** One candidate for a shared-secret input, with where it came from. */
export interface Candidate {
  value: string;
  year?: number;
  form: string;
  field: string;
  /** `2025/100S.pdf p3`: shown to the person, never sent anywhere. */
  source: string;
}

export interface Resolved {
  value: string;
  /** Which source gave it: `flag` for --input. */
  from: Source["from"] | "flag";
  /** The vault key, or the file and page a document value came from. */
  origin?: string;
}

export interface ResolveOptions {
  overrides?: Record<string, string>;
  vault?: VaultReader | null;
  extractor?: DocumentExtractor | null;
  prompt?: Prompt;
  random?: (max: number) => number;
  now?: Date;
  /** 1-based choice among a shared secret's candidates; the default is the best one. */
  candidate?: number;
}

const ALPHABET = {
  lower: "abcdefghijkmnopqrstuvwxyz",
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  digit: "23456789",
} as const;
const DEFAULT_SPECIAL = "!#$*@";

/**
 * A fresh random value with at least one character of each class. When
 * letters are allowed the first character is a letter, because user names on
 * most sites may not start with a digit.
 */
export function generate(source: Extract<Source, { from: "generate" }>, random: (max: number) => number = randomInt): string {
  const sets = source.classes.map((c) => (c === "special" ? source.special ?? DEFAULT_SPECIAL : ALPHABET[c]));
  const all = sets.join("");
  const chars = sets.map((set) => set[random(set.length)]!);
  while (chars.length < source.length) chars.push(all[random(all.length)]!);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = random(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  const out = chars.slice(0, source.length);
  const letters = (source.classes.includes("lower") ? ALPHABET.lower : "") + (source.classes.includes("upper") ? ALPHABET.upper : "");
  if (letters && !letters.includes(out[0]!)) {
    const at = out.findIndex((c) => letters.includes(c));
    if (at > 0) [out[0], out[at]] = [out[at]!, out[0]!];
  }
  return out.join("");
}

const norm = (s: string): string => s.toLowerCase().replace(/^(form|ca)\s+/g, "").replace(/\s+/g, " ").trim();

/** Same form and field, ignoring case, spacing and a leading "Form"/"CA" ("CA 100S" is "100S"). */
function sameField(record: DocumentRecord, source: Extract<Source, { from: "document" }>): boolean {
  return norm(record.form) === norm(source.form) && norm(record.field) === norm(source.field);
}

/** A closed year within `back`, and the year in progress only when `current` says so. */
export function inYears(year: number | undefined, years: { back?: number; current?: boolean } | undefined, now: Date): boolean {
  if (!years) return true;
  if (year === undefined) return false;
  const current = now.getFullYear();
  if (year >= current && !years.current) return false;
  if (years.back !== undefined && year < current - years.back) return false;
  return true;
}

/** Records that fit one document source, newest year first, transformed. */
export function documentValues(records: readonly DocumentRecord[], source: Extract<Source, { from: "document" }>, now: Date): Candidate[] {
  const out: Candidate[] = [];
  for (const record of records) {
    if (!sameField(record, source)) continue;
    if (source.match && record.label !== undefined && !test(source.match, record.label)) continue;
    if (!inYears(record.year, source.years, now)) continue;
    const value = transform(String(record.value), source.transform);
    if (value === "") continue;
    out.push({
      value,
      ...(record.year !== undefined ? { year: record.year } : {}),
      form: source.form,
      field: source.field,
      source: [record.file, record.page !== undefined ? `p${record.page}` : undefined].filter(Boolean).join(" ") || "extractor",
    });
  }
  return out.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
}

function checkValue(name: string, input: Input, value: string): string {
  const cut = input.max_length !== undefined && input.type !== "qa-set" ? value.slice(0, input.max_length) : value;
  if (input.type === "integer" && !/^-?\d+$/.test(cut)) throw new ErrandError(`${name} must be a whole number`);
  if (input.type === "number" && !Number.isFinite(Number(cut))) throw new ErrandError(`${name} must be a number`);
  if (input.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cut)) throw new ErrandError(`${name} must be an email address`);
  if (input.type === "boolean" && !/^(true|false)$/i.test(cut)) throw new ErrandError(`${name} must be true or false`);
  if (input.pattern && !test(input.pattern, cut)) throw new ErrandError(`${name} does not match ${input.pattern}`);
  return cut;
}

/**
 * Security questions and answers. A vault value is the JSON object the runner
 * wrote last time; otherwise answers are generated as questions are chosen.
 */
export class QaSet {
  readonly answers: Record<string, string>;
  private readonly generator: Extract<Source, { from: "generate" }> | undefined;
  private readonly random: (max: number) => number;

  constructor(answers: Record<string, string>, generator: Extract<Source, { from: "generate" }> | undefined, random: (max: number) => number) {
    this.answers = { ...answers };
    this.generator = generator;
    this.random = random;
  }

  /** The first offered question not used yet; records an answer for it, unless `peek` asks only which it would be. */
  choose(options: ReadonlyArray<{ value: string; text: string }>, peek = false, slot?: string): { value: string; text: string } | null {
    // The same box on a page that comes back keeps the question it chose the first time.
    const before = slot ? this.slots.get(slot) : undefined;
    if (before) {
      const again = options.find((o) => o.text.trim().toLowerCase() === before);
      if (again) return again;
    }
    const picked = this.pick(options, peek);
    if (picked && slot && !peek) this.slots.set(slot, picked.text.trim().toLowerCase());
    return picked;
  }

  private readonly slots = new Map<string, string>();

  private pick(options: ReadonlyArray<{ value: string; text: string }>, peek: boolean): { value: string; text: string } | null {
    const used = new Set(Object.keys(this.answers).map((q) => q.toLowerCase()));
    // A stored set must keep its questions: offer the stored ones first.
    const stored = options.find((o) => o.value !== "" && o.text.trim() && Object.keys(this.answers).some((q) => q.toLowerCase() === o.text.trim().toLowerCase()) && !this.chosen.has(o.text.trim().toLowerCase()));
    if (stored) {
      if (!peek) this.chosen.add(stored.text.trim().toLowerCase());
      return stored;
    }
    if (!this.generator) return null;
    const fresh = options.find((o) => o.value !== "" && o.text.trim() && !used.has(o.text.trim().toLowerCase()));
    if (!fresh) return null;
    if (peek) return fresh;
    this.answers[fresh.text.trim()] = generate(this.generator, this.random);
    this.chosen.add(fresh.text.trim().toLowerCase());
    return fresh;
  }

  private readonly chosen = new Set<string>();

  /** The answer for the question a page shows beside a box, or by its position ("Answer 2"). */
  answerFor(context: string, index: number | undefined): string | null {
    const lower = context.toLowerCase();
    const known = Object.entries(this.answers).find(([question]) => lower.includes(question.toLowerCase()));
    if (known) return known[1];
    if (index !== undefined && index > 0) return Object.values(this.answers)[index - 1] ?? null;
    return null;
  }

  toJSON(): string {
    return JSON.stringify(this.answers);
  }
}

export class Inputs {
  readonly errand: Errand;
  readonly values = new Map<string, Resolved>();
  readonly qa = new Map<string, QaSet>();
  /** Every candidate of the shared-secret input, best first, and the one this run submits. */
  candidates: Candidate[] = [];
  chosen: Candidate | null = null;
  sharedSecret: string | null = null;

  constructor(errand: Errand) {
    this.errand = errand;
  }

  input(name: string): Input | undefined {
    return this.errand.inputs?.[name];
  }

  /** The raw value, for the site's own field and the vault. */
  get(name: string): string | undefined {
    const qa = this.qa.get(name);
    if (qa) return qa.toJSON();
    return this.values.get(name)?.value;
  }

  /** What the terminal may show: secrets masked, everything else as is. */
  display(name: string): string {
    const input = this.input(name);
    const value = this.get(name);
    if (value === undefined) return "(none)";
    return input?.sensitivity === "secret" ? MASK : value;
  }

  sensitivity(name: string): Input["sensitivity"] | undefined {
    return this.input(name)?.sensitivity;
  }

  /** Inputs whose value came from `generate`: the credentials a success writes to the vault. */
  generated(): string[] {
    return [...this.values.entries()].filter(([, v]) => v.from === "generate").map(([k]) => k);
  }
}

/** Resolve every input of an errand. Throws {@link ErrandError} for a required input nothing fills. */
export async function resolveInputs(errand: Errand, options: ResolveOptions = {}): Promise<Inputs> {
  const inputs = new Inputs(errand);
  const defs = errand.inputs ?? {};
  const random = options.random ?? randomInt;
  const now = options.now ?? new Date();
  const overrides = options.overrides ?? {};

  for (const name of Object.keys(overrides)) {
    if (!(name in defs)) throw new ErrandError(`--input ${name}: this errand has no input named ${name}`);
  }

  // One extractor call for the whole errand, only when a document source is not already overridden.
  const requests: DocumentRequest[] = [];
  for (const [name, input] of Object.entries(defs)) {
    if (name in overrides) continue;
    for (const source of input.sources) {
      if (source.from === "document") requests.push({ input: name, form: source.form, field: source.field, ...(source.match ? { match: source.match } : {}) });
    }
  }
  const records = requests.length && options.extractor ? await options.extractor.extract(requests) : [];

  const resolving = new Set<string>();

  async function resolve(name: string): Promise<void> {
    if (inputs.values.has(name) || inputs.qa.has(name)) return;
    const input = defs[name];
    if (!input) throw new ErrandError(`no input named ${name}`);
    if (resolving.has(name)) throw new ErrandError(`input ${name} depends on itself`);
    resolving.add(name);
    try {
      if (input.type === "qa-set") return await resolveQa(name, input);
      if (name in overrides) {
        inputs.values.set(name, { value: checkValue(name, input, overrides[name]!), from: "flag" });
        if (input.role === "shared-secret") {
          inputs.sharedSecret = name;
          inputs.chosen = { value: overrides[name]!, form: "", field: "", source: "--input" };
        }
        return;
      }
      if (input.role === "shared-secret") return await resolveSharedSecret(name, input);
      for (const source of input.sources) {
        const got = await fromSource(name, input, source);
        if (got) {
          inputs.values.set(name, { ...got, value: checkValue(name, input, got.value) });
          return;
        }
      }
      if (input.required) throw new ErrandError(`no value for ${input.label ?? name} (${name}); give it with --input ${name}=...`);
    } finally {
      resolving.delete(name);
    }
  }

  async function fromSource(name: string, input: Input, source: Source): Promise<Omit<Resolved, "value"> & { value: string } | null> {
    switch (source.from) {
      case "literal":
        return { value: String(source.value), from: "literal" };
      case "vault": {
        const value = await options.vault?.get(source.key);
        return value === undefined || value === "" ? null : { value, from: "vault", origin: source.key };
      }
      case "prompt": {
        if (!options.prompt) return null;
        const answer = await options.prompt(source.ask ?? `${input.label ?? name}: `, { secret: input.sensitivity === "secret" });
        return answer === null || answer === "" ? null : { value: answer, from: "prompt" };
      }
      case "generate":
        return { value: generate(source, random), from: "generate" };
      case "derive": {
        await resolve(source.input);
        const base = inputs.get(source.input);
        if (base === undefined) return null;
        const value = transform(base, source.transform);
        return value === "" ? null : { value, from: "derive" };
      }
      case "candidate": {
        await resolve(source.input);
        const c = inputs.chosen;
        if (!c) return null;
        const part = source.part === "year" ? c.year : c[source.part];
        return part === undefined || part === "" ? null : { value: String(part), from: "candidate" };
      }
      case "document": {
        const found = documentValues(records, source, now);
        const pickOldest = source.pick === "oldest";
        const hit = pickOldest ? found[found.length - 1] : found[0];
        return hit ? { value: hit.value, from: "document", origin: hit.source } : null;
      }
    }
  }

  /** Candidates from document sources in order (newest first within each); other sources give one candidate. */
  async function resolveSharedSecret(name: string, input: Input): Promise<void> {
    inputs.sharedSecret = name;
    const seen = new Set<string>();
    const candidates: Candidate[] = [];
    for (const source of input.sources) {
      if (source.from === "document") {
        for (const c of documentValues(records, source, now)) {
          const key = `${c.year}:${c.form}:${c.field}:${c.value}`;
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push(c);
        }
      } else {
        const got = await fromSource(name, input, source);
        if (got) candidates.push({ value: got.value, form: "", field: "", source: got.origin ?? got.from });
      }
    }
    inputs.candidates = candidates;
    const index = (options.candidate ?? 1) - 1;
    if (index < 0 || index >= Math.max(candidates.length, 1)) throw new ErrandError(`--candidate ${options.candidate}: there are ${candidates.length} candidates`);
    const chosen = candidates[index];
    if (!chosen) {
      if (input.required !== false) throw new ErrandError(`no candidate for ${input.label ?? name} (${name}): the extractor found none, or give one with --input ${name}=...`);
      return;
    }
    inputs.chosen = chosen;
    inputs.values.set(name, { value: checkValue(name, input, chosen.value), from: "document", origin: chosen.source });
  }

  async function resolveQa(name: string, input: Input): Promise<void> {
    let answers: Record<string, string> = {};
    let generator: Extract<Source, { from: "generate" }> | undefined;
    const raw = overrides[name];
    if (raw !== undefined) answers = parseQa(name, raw);
    else {
      for (const source of input.sources) {
        if (source.from === "vault") {
          const value = await options.vault?.get(source.key);
          if (value) {
            answers = parseQa(name, value);
            break;
          }
        } else if (source.from === "generate") {
          generator = source;
          break;
        }
      }
    }
    inputs.qa.set(name, new QaSet(answers, generator, random));
  }

  for (const name of Object.keys(defs)) await resolve(name);
  return inputs;
}

function parseQa(name: string, raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.values(parsed).every((v) => typeof v === "string")) {
      return parsed as Record<string, string>;
    }
  } catch {
    // fall through
  }
  throw new ErrandError(`${name} is a qa-set: its value is a JSON object of question to answer`);
}
