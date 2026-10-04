/**
 * The one document extractor the runner ships: a command the principal names
 * (`--extractor "python3 extract.py ~/taxes"`), run on this machine, that
 * reads a JSON request on stdin and prints JSON records on stdout.
 *
 * Request: `{ "errand": "<name>", "documents": [{ "input", "form", "field", "match"? }] }`
 * Reply:   `[{ "form", "field", "value", "year"?, "label"?, "file"?, "page"? }]`
 *          (or `{ "records": [...] }`).
 *
 * The extractor reads the documents; the runner only ever sees the values it
 * prints, keeps them in memory, and records the file and page each came from
 * for the person to see. Nothing about a document is sent anywhere else.
 */

import { spawn } from "node:child_process";
import type { DocumentExtractor, DocumentRecord, DocumentRequest } from "./inputs.js";
import { ErrandError } from "./util.js";

function isRecord(row: unknown): row is DocumentRecord {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r.form === "string" &&
    typeof r.field === "string" &&
    (typeof r.value === "string" || typeof r.value === "number") &&
    (r.year === undefined || Number.isInteger(r.year)) &&
    (r.label === undefined || typeof r.label === "string") &&
    (r.file === undefined || typeof r.file === "string") &&
    (r.page === undefined || Number.isInteger(r.page))
  );
}

export function parseRecords(stdout: string): DocumentRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new ErrandError("the extractor printed something that is not JSON");
  }
  const rows = Array.isArray(parsed) ? parsed : (parsed as { records?: unknown })?.records;
  if (!Array.isArray(rows)) throw new ErrandError("the extractor did not print a list of records");
  return rows.filter(isRecord);
}

export function commandExtractor(command: string, options: { errand: string; timeoutMs?: number; cwd?: string } = { errand: "" }): DocumentExtractor {
  return {
    extract(requests: DocumentRequest[]): Promise<DocumentRecord[]> {
      return new Promise((resolve, reject) => {
        const child = spawn("/bin/sh", ["-c", command], { stdio: ["pipe", "pipe", "pipe"], ...(options.cwd ? { cwd: options.cwd } : {}) });
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
          child.kill();
          reject(new ErrandError(`the extractor did not finish in ${(options.timeoutMs ?? 120_000) / 1000}s`));
        }, options.timeoutMs ?? 120_000);
        child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
        child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
        child.on("error", (error) => {
          clearTimeout(timer);
          reject(new ErrandError(`could not run the extractor: ${error.message}`));
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          // stderr is the extractor's own; it is not echoed, since an extractor may print what it read.
          if (code !== 0) return reject(new ErrandError(`the extractor exited with ${code}${stderr ? ` (${stderr.trim().split("\n").length} lines on stderr, not shown)` : ""}`));
          try {
            resolve(parseRecords(stdout));
          } catch (error) {
            reject(error);
          }
        });
        child.stdin.end(JSON.stringify({ errand: options.errand, documents: requests }));
      });
    },
  };
}
