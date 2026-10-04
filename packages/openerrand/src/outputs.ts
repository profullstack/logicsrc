/**
 * What a run keeps: credentials (written before success is reported), files
 * the site handed over, and hand-off cards (kept in the local run record
 * only, never posted anywhere).
 */

import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { HANDOFF_BUILTINS } from "@logicsrc/validators";
import { type DownloadedFile, looksLike } from "./driver.js";
import type { Inputs } from "./inputs.js";
import { type Card, ensureDir } from "./store.js";
import type { Errand, Outcome } from "./types.js";
import { ErrandError, re, render, shortId, templateNames } from "./util.js";
import type { Vault } from "./vault.js";

/**
 * Render a hand-off card. Only `{{expires_on}}`, `{{errand.title}}`,
 * `{{site.name}}` and public inputs may appear; anything else and the card is
 * refused, whatever the validator said about the file.
 */
export function renderCard(errand: Errand, id: string, inputs: Inputs, extra: { expires_on?: string }, random: (max: number) => number): Card {
  const card = errand.handoffs?.[id];
  if (!card) throw new ErrandError(`no hand-off card named ${id}`);
  const lookup = (name: string): string | undefined => {
    if (name === "expires_on") return extra.expires_on ?? "(no deadline)";
    if (name === "errand.title") return errand.title;
    if (name === "site.name") return errand.site.name;
    return inputs.get(name);
  };
  const texts = [card.title, ...card.steps, ...(card.command !== undefined ? [card.command] : [])];
  for (const text of texts) {
    for (const name of templateNames(text)) {
      if ((HANDOFF_BUILTINS as readonly string[]).includes(name)) continue;
      const sensitivity = inputs.sensitivity(name);
      if (sensitivity !== "public") throw new ErrandError(`card ${id} names {{${name}}}, which is ${sensitivity ?? "not an input"}; a card carries built-ins and public inputs only`);
    }
  }
  return {
    id: `${id}/${shortId(random)}`,
    title: render(card.title, lookup),
    ...(card.open ? { open: card.open } : {}),
    steps: card.steps.map((s) => render(s, lookup)),
    ...(card.command !== undefined ? { command: render(card.command, lookup) } : {}),
    ...(extra.expires_on ? { expires_on: extra.expires_on } : {}),
  };
}

/** The credential keys for this outcome, rendered from the file's templates. Empty when the outcome is not `when`. */
export function credentialValues(errand: Errand, outcome: Outcome, inputs: Inputs): Record<string, string> {
  const vault = errand.outputs?.vault;
  if (!vault || (vault.when !== undefined && vault.when !== outcome.name)) return {};
  const out: Record<string, string> = {};
  for (const [key, template] of Object.entries(vault.keys)) {
    out[key] = render(template, (name) => inputs.get(name));
  }
  return out;
}

/**
 * Write credentials to the vault, falling back to the 0600 state file when
 * there is no writable vault or the write fails. Returns where they went and
 * any warning, so the caller says so.
 */
export async function writeCredentials(values: Record<string, string>, vault: Vault | null, fallback: Vault): Promise<{ where: string; warning?: string }> {
  if (!Object.keys(values).length) return { where: "" };
  if (vault?.write) {
    try {
      await vault.write(values);
      return { where: vault.describe() };
    } catch (error) {
      await fallback.write!(values);
      return { where: fallback.describe(), warning: `vault write failed (${(error as Error).message}); the login is only in ${fallback.describe()}` };
    }
  }
  await fallback.write!(values);
  return {
    where: fallback.describe(),
    warning: vault ? `${vault.describe()} is read-only; the login is in ${fallback.describe()} (0600)` : `no vault named; the login is in ${fallback.describe()} (0600)`,
  };
}

const expand = (path: string): string => path.replace(/^~(?=\/|$)/, homedir());

/**
 * File what the site handed over. Each entry matches by URL, file name and
 * media type (checked against the file's first bytes); the target path is
 * rendered from public and personal inputs, never secrets, and an existing
 * file with different bytes is never overwritten.
 */
export function fileDownloads(errand: Errand, outcome: Outcome, inputs: Inputs, downloaded: readonly DownloadedFile[]): string[] {
  const filed: string[] = [];
  for (const entry of errand.outputs?.downloads ?? []) {
    if (entry.when !== undefined && entry.when !== outcome.name) continue;
    const file = downloaded.find(
      (d) => (entry.match.url === undefined || re(entry.match.url).test(d.url)) && (entry.match.filename === undefined || re(entry.match.filename).test(d.filename)),
    );
    if (!file) continue;
    const bytes = readFileSync(file.path);
    if (entry.match.type && !looksLike(entry.match.type, bytes)) throw new ErrandError(`${file.filename} is not ${entry.match.type}; left in ${file.path}`);
    const to = expand(
      render(entry.to, (name) => {
        if (inputs.sensitivity(name) === "secret") throw new ErrandError(`download path ${entry.to} names a secret input`);
        return inputs.get(name);
      }),
    );
    if (existsSync(to)) {
      if (!readFileSync(to).equals(bytes)) throw new ErrandError(`${to} exists with different bytes; the new file is left in ${file.path}`);
    } else {
      ensureDir(dirname(to));
      copyFileSync(file.path, to);
    }
    filed.push(to);
  }
  return filed;
}

/** Run date plus an ISO 8601 duration, as YYYY-MM-DD. */
export function expiresOn(now: Date, ms: number): string {
  return new Date(now.getTime() + ms).toISOString().slice(0, 10);
}
