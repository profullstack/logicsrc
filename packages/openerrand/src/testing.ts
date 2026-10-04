/**
 * Test helpers: a scripted browser and fixtures. Not part of the build.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll } from "vitest";
import type { DownloadedFile, Driver, FillAction } from "./driver.js";
import { Store } from "./store.js";
import type { Errand, Field, Page } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));

/** The worked example from the spec, as published in @logicsrc/schemas' fixtures. */
export function ftbExample(): Errand {
  return JSON.parse(readFileSync(join(here, "..", "..", "schemas", "fixtures", "openerrand", "ftb-register-business.json"), "utf8")) as Errand;
}

export function ftbExamplePath(): string {
  return join(here, "..", "..", "schemas", "fixtures", "openerrand", "ftb-register-business.json");
}

const temps: string[] = [];
// Registered in each test file that imports this module (vitest isolates modules per file).
afterAll(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A temp dir removed after the test file finishes. */
export function tempDir(prefix = "openerrand-test-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

export function tempStore(): Store {
  return new Store(tempDir());
}

export function field(partial: Partial<Field> & { id: string }): Field {
  return { selector: `#${partial.id}`, name: partial.id, type: "text", label: "", required: false, ...partial };
}

export interface FakePage {
  title?: string;
  text?: string;
  errors?: string[];
  fields?: Field[];
  /** CSS selectors that find something on this page. */
  hits?: string[];
  buttons?: string[];
}

/**
 * A browser over a table of pages. `submit` calls `next(url, values)` to say
 * where the site goes; `values` maps selector to what was filled (true for a
 * ticked box). Every fill and submit is recorded so a test can assert that
 * nothing was sent.
 */
export class FakeDriver implements Driver {
  current = "";
  values: Record<string, string | boolean> = {};
  readonly fills: Array<{ url: string; selector: string; value: string | boolean }> = [];
  readonly submits: Array<{ url: string; values: Record<string, string | boolean> }> = [];
  readonly visits: string[] = [];
  reads = 0;
  closed = false;
  files: DownloadedFile[] = [];

  constructor(
    readonly pages: Record<string, FakePage | ((driver: FakeDriver) => FakePage)>,
    readonly next: (url: string, values: Record<string, string | boolean>, driver: FakeDriver) => string,
  ) {}

  page(): FakePage {
    const p = this.pages[this.current];
    if (!p) return { title: "Not found", text: "404", fields: [] };
    return typeof p === "function" ? p(this) : p;
  }

  async goto(url: string): Promise<void> {
    this.current = url;
    this.values = {};
    this.visits.push(url);
  }

  async url(): Promise<string> {
    return this.current;
  }

  async read(): Promise<Page> {
    this.reads += 1;
    const p = this.page();
    return { url: this.current, title: p.title ?? "", text: p.text ?? "", errors: p.errors ?? [], fields: p.fields ?? [] };
  }

  async selectorHits(selectors: string[]): Promise<Record<string, boolean>> {
    const hits = this.page().hits ?? [];
    return Object.fromEntries(selectors.map((s) => [s, hits.includes(s)]));
  }

  async fill(f: Field, action: FillAction): Promise<boolean> {
    const value = action.kind === "check" ? true : action.value;
    this.values[f.selector] = value;
    this.fills.push({ url: this.current, selector: f.selector, value });
    return true;
  }

  async submit(): Promise<string> {
    const buttons = this.page().buttons ?? ["Continue"];
    if (!buttons.length) return "?";
    this.submits.push({ url: this.current, values: { ...this.values } });
    const to = this.next(this.current, { ...this.values }, this);
    this.current = to;
    this.values = {};
    this.visits.push(to);
    return buttons[0]!;
  }

  async settle(): Promise<void> {}

  downloads(): DownloadedFile[] {
    return this.files;
  }

  async evaluate(): Promise<unknown> {
    return null;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}
