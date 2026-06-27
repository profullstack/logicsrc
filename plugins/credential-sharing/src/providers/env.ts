import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { keysFromValues } from "../fingerprint.js";
import type { CredentialEndpoint, CredentialProvider, CredentialValueBag, CredentialWriteResult } from "../types.js";

const QUOTED = /^(['"])(.*)\1$/s;

/** Parse a `.env` file body into a value bag. Supports quotes and `export` prefixes. */
export function parseEnv(body: string): CredentialValueBag {
  const out: CredentialValueBag = {};
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const withoutExport = line.startsWith("export ") ? line.slice("export ".length) : line;
    const eq = withoutExport.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = withoutExport.slice(0, eq).trim();
    if (!key) {
      continue;
    }
    let value = withoutExport.slice(eq + 1).trim();
    const quoted = QUOTED.exec(value);
    if (quoted) {
      value = quoted[2];
      if (quoted[1] === '"') {
        value = value.replace(/\\n/g, "\n").replace(/\\"/g, '"');
      }
    }
    out[key] = value;
  }
  return out;
}

function needsQuoting(value: string): boolean {
  return /[\s#'"=]|^$/.test(value) || value.includes("\n");
}

function serializeValue(value: string): string {
  if (!needsQuoting(value)) {
    return value;
  }
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

/** Merge upserts/deletes into an existing `.env` body, preserving comments and order. */
export function applyEnv(body: string, upserts: CredentialValueBag, deletes: string[]): string {
  const deleteSet = new Set(deletes);
  const remaining = new Map(Object.entries(upserts));
  const lines = body.split(/\r?\n/);
  const output: string[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      output.push(rawLine);
      continue;
    }
    const withoutExport = trimmed.startsWith("export ") ? trimmed.slice("export ".length) : trimmed;
    const eq = withoutExport.indexOf("=");
    const key = eq === -1 ? "" : withoutExport.slice(0, eq).trim();
    if (key && deleteSet.has(key)) {
      continue;
    }
    if (key && remaining.has(key)) {
      output.push(`${key}=${serializeValue(remaining.get(key) as string)}`);
      remaining.delete(key);
      continue;
    }
    output.push(rawLine);
  }

  if (remaining.size > 0) {
    // Drop the blank line(s) a trailing newline left behind so new keys append cleanly.
    while (output.length > 0 && output[output.length - 1].trim() === "") {
      output.pop();
    }
    for (const [key, value] of remaining) {
      output.push(`${key}=${serializeValue(value)}`);
    }
  }

  let result = output.join("\n");
  if (!result.endsWith("\n")) {
    result += "\n";
  }
  return result;
}

function endpointPath(endpoint: CredentialEndpoint): string {
  return resolve(process.cwd(), endpoint.path ?? ".env");
}

function readBody(endpoint: CredentialEndpoint): string {
  const file = endpointPath(endpoint);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

export const envProvider: CredentialProvider = {
  id: "env",
  name: "Local .env file",
  description: "Read, diff, redact, and write local environment files.",
  capabilities: { readValues: true, readNames: true, write: true, delete: true, rollback: true, audit: false },
  authRequirements: [],
  status: "available",

  async inspect(endpoint) {
    const values = parseEnv(readBody(endpoint));
    return {
      provider: "env",
      endpoint,
      valuesReadable: true,
      keys: keysFromValues(values),
      inspectedAt: new Date().toISOString()
    };
  },

  async readValues(endpoint, keys) {
    const values = parseEnv(readBody(endpoint));
    return Object.fromEntries(keys.filter((k) => k in values).map((k) => [k, values[k]]));
  },

  async write({ endpoint, upserts, deletes, dryRun }) {
    const results: CredentialWriteResult[] = [
      ...Object.keys(upserts).map((key) => ({ key, applied: !dryRun })),
      ...deletes.map((key) => ({ key, applied: !dryRun }))
    ];
    if (dryRun) {
      return results;
    }
    const next = applyEnv(readBody(endpoint), upserts, deletes);
    writeFileSync(endpointPath(endpoint), next, { mode: 0o600 });
    return results;
  },

  async rollback({ endpoint, preImage, dryRun }) {
    return this.write({ endpoint, upserts: preImage, deletes: [], dryRun });
  }
};
