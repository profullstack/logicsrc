/**
 * Test helpers: build a throwaway context repository on disk.
 *
 * Resolution reads real files through real adapters, so the tests do too —
 * mocking the filesystem here would stop them from catching the path-handling
 * and glob bugs that matter most.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { stringify as toYaml } from "yaml";
import type { ContextObject, Manifest } from "./types.js";

export interface ProjectSpec {
  manifest: Partial<Manifest> & { id?: string };
  /** Path relative to the project root -> file contents. */
  files?: Record<string, string>;
  /** Convenience: objects written as Markdown with front matter. */
  objects?: Record<string, Partial<ContextObject>>;
}

const created: string[] = [];

export function makeProject(spec: ProjectSpec): string {
  const dir = mkdtempSync(join(tmpdir(), "opencontext-test-"));
  created.push(dir);

  const manifest: Manifest = {
    opencontext: "1.0",
    id: spec.manifest.id ?? "test",
    ...spec.manifest
  } as Manifest;

  writeFileSync(join(dir, "opencontext.yaml"), toYaml(manifest, { lineWidth: 100 }), "utf8");

  for (const [path, contents] of Object.entries(spec.files ?? {})) {
    write(dir, path, contents);
  }

  for (const [path, object] of Object.entries(spec.objects ?? {})) {
    write(dir, path, renderMarkdown(object));
  }

  return dir;
}

function write(dir: string, path: string, contents: string): void {
  const full = join(dir, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents, "utf8");
}

/** Front matter plus body, the way a human would author it. */
export function renderMarkdown(object: Partial<ContextObject>): string {
  const { content, ...meta } = object;
  const frontMatter = toYaml(meta, { lineWidth: 100 }).trimEnd();
  const body = typeof content === "string" ? content : "";
  return `---\n${frontMatter}\n---\n\n${body}\n`;
}

/** Remove every project created during the run. Call from an afterAll hook. */
export function cleanupProjects(): void {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A fixed instant, so lifecycle assertions never depend on when the suite runs. */
export const NOW = new Date("2026-08-09T12:00:00Z");

export function isoDaysAgo(days: number, from: Date = NOW): string {
  return new Date(from.getTime() - days * 86_400_000).toISOString();
}

export function isoDaysAhead(days: number, from: Date = NOW): string {
  return new Date(from.getTime() + days * 86_400_000).toISOString();
}
