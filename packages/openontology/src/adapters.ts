import { parse as parseYaml } from "yaml";
import { digest } from "./canonical.js";
import { OPENONTOLOGY_VERSION } from "./types.js";
import type { ChangeOperation, Claim, Entity, Evidence, EvidenceSelector, Source } from "./types.js";

/**
 * Source adapters turn foreign data into **proposals**.
 *
 * Nothing here writes to a store. Every adapter returns entities, claims,
 * sources, evidence, and the change-set operations that would introduce them —
 * a human or a policy decides whether they land (R113).
 *
 * Each adapter declares what it can and cannot do (R118), so a caller knows
 * whether "no deletions" means "nothing was deleted" or "this adapter cannot
 * see deletions."
 */

export interface AdapterCapabilities {
  /** Can read publicly available data. */
  publicData: boolean;
  /** Can read private data given credentials. */
  privateData: boolean;
  /** Can fetch only what changed since a marker. */
  incremental: boolean;
  /** Can detect that a record disappeared upstream. */
  deletions: boolean;
  /** Reports the licence of what it ingested. */
  license: boolean;
}

export interface IngestResult {
  adapter: string;
  sources: Source[];
  entities: Entity[];
  claims: Claim[];
  evidence: Evidence[];
  /** Ready for `createOntologyChangeSet({ operations })`. */
  operations: ChangeOperation[];
  warnings: string[];
  capabilities: AdapterCapabilities;
}

export interface IngestContext {
  /** Compact id prefix for generated ids. */
  prefix: string;
  /** Actor recorded on generated claims. */
  actor: string;
  /** Required when the actor is an agent. */
  runId?: string;
  now: string;
  /** Confidence stamped on generated claims. */
  confidence?: number;
  license?: string;
}

/** How a flat record becomes an entity plus its claims. */
export interface RecordMapping {
  entityType: string;
  /** Field holding the stable local id. */
  idField: string;
  /** Field holding the display name. Defaults to `idField`. */
  nameField?: string;
  /** Segment used in generated ids: `<prefix>:<idSegment>:<value>`. */
  idSegment?: string;
  aliasField?: string;
  /** External id namespace → field. */
  externalIds?: Record<string, string>;
  /** Property predicate → field. */
  properties?: Record<string, string>;
  /** Relationship predicate → field holding the target's local id. */
  relationships?: Record<string, { field: string; targetSegment: string; separator?: string }>;
}

export interface SourceAdapter<Input> {
  id: string;
  description: string;
  capabilities: AdapterCapabilities;
  ingest(input: Input, ctx: IngestContext): Promise<IngestResult> | IngestResult;
}

const READ_ONLY_PUBLIC: AdapterCapabilities = {
  publicData: true,
  privateData: false,
  incremental: false,
  deletions: false,
  license: true
};

/* ── shared record → proposal machinery ─────────────────────────────────── */

function slug(value: string): string {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

interface BuildOptions {
  records: Array<Record<string, unknown>>;
  mapping: RecordMapping;
  source: Source;
  ctx: IngestContext;
  adapter: string;
  selectorFor?: (index: number) => EvidenceSelector;
}

function buildProposal(options: BuildOptions): IngestResult {
  const { records, mapping, source, ctx, adapter } = options;
  const entities: Entity[] = [];
  const claims: Claim[] = [];
  const evidence: Evidence[] = [];
  const warnings: string[] = [];

  const segment = mapping.idSegment ?? slug(mapping.entityType);
  let claimSeq = 0;
  let evidenceSeq = 0;

  const nextClaimId = () => `${ctx.prefix}:claim:${adapter}-${String(++claimSeq).padStart(4, "0")}`;

  records.forEach((record, index) => {
    const rawId = record[mapping.idField];
    if (rawId === undefined || rawId === null || String(rawId).trim() === "") {
      warnings.push(`record ${index} has no ${mapping.idField}; skipped`);
      return;
    }

    const entityId = `${ctx.prefix}:${segment}:${slug(String(rawId))}`;
    const name = String(record[mapping.nameField ?? mapping.idField] ?? rawId);

    const selector = options.selectorFor?.(index) ?? { type: "json-pointer", pointer: `/${index}` };
    const evidenceId = `${ctx.prefix}:evidence:${adapter}-${String(++evidenceSeq).padStart(4, "0")}`;
    evidence.push({
      openontology: OPENONTOLOGY_VERSION,
      kind: "Evidence",
      id: evidenceId,
      source: source.id,
      selector
    });

    const entity: Entity = {
      openontology: OPENONTOLOGY_VERSION,
      kind: "Entity",
      id: entityId,
      type: mapping.entityType,
      canonicalName: name,
      createdAt: ctx.now,
      createdBy: ctx.actor
    };

    if (mapping.aliasField && record[mapping.aliasField]) {
      const raw = record[mapping.aliasField];
      entity.aliases = Array.isArray(raw)
        ? raw.map(String)
        : String(raw)
            .split(",")
            .map((alias) => alias.trim())
            .filter(Boolean);
    }

    if (mapping.externalIds) {
      const externalIds: Record<string, string> = {};
      for (const [namespace, field] of Object.entries(mapping.externalIds)) {
        const value = record[field];
        if (value !== undefined && value !== null && String(value) !== "") {
          externalIds[namespace] = String(value);
        }
      }
      if (Object.keys(externalIds).length > 0) entity.externalIds = externalIds;
    }

    entities.push(entity);

    const base = {
      openontology: OPENONTOLOGY_VERSION,
      kind: "Claim" as const,
      status: "proposed" as const,
      assertedAt: ctx.now,
      assertedBy: ctx.actor,
      sources: [source.id],
      evidence: [evidenceId],
      ...(ctx.runId ? { runId: ctx.runId } : {}),
      ...(ctx.confidence !== undefined ? { confidence: ctx.confidence } : {})
    };

    for (const [predicate, field] of Object.entries(mapping.properties ?? {})) {
      const value = record[field];
      if (value === undefined || value === null || value === "") continue;
      claims.push({ ...base, id: nextClaimId(), subject: entityId, predicate, object: { value } });
    }

    for (const [predicate, config] of Object.entries(mapping.relationships ?? {})) {
      const raw = record[config.field];
      if (raw === undefined || raw === null || String(raw) === "") continue;
      const targets = Array.isArray(raw)
        ? raw.map(String)
        : String(raw)
            .split(config.separator ?? ",")
            .map((value) => value.trim())
            .filter(Boolean);

      for (const target of targets) {
        claims.push({
          ...base,
          id: nextClaimId(),
          subject: entityId,
          predicate,
          object: { entity: `${ctx.prefix}:${config.targetSegment}:${slug(target)}` }
        });
      }
    }
  });

  const operations: ChangeOperation[] = [
    ...entities.map((entity) => ({ op: "add-entity" as const, value: entity as unknown as Record<string, unknown> })),
    ...claims.map((claim) => ({ op: "assert-claim" as const, value: claim as unknown as Record<string, unknown> }))
  ];

  return {
    adapter,
    sources: [source],
    entities,
    claims,
    evidence,
    operations,
    warnings,
    capabilities: READ_ONLY_PUBLIC
  };
}

function makeSource(
  id: string,
  sourceType: string,
  uri: string,
  ctx: IngestContext,
  content: string,
  extra: Partial<Source> = {}
): Source {
  return {
    openontology: OPENONTOLOGY_VERSION,
    kind: "Source",
    id,
    sourceType,
    uri,
    retrievedAt: ctx.now,
    contentHash: digest(content),
    license: ctx.license ?? "unknown",
    ...extra
  };
}

/* ── file adapters ──────────────────────────────────────────────────────── */

export interface FileInput {
  /** Where the content came from, recorded on the Source. */
  uri: string;
  content: string;
  mapping: RecordMapping;
}

export const csvAdapter: SourceAdapter<FileInput> = {
  id: "csv",
  description: "Rows of a CSV file become entities and claims.",
  capabilities: READ_ONLY_PUBLIC,
  ingest(input, ctx) {
    const rows = parseCsv(input.content);
    return buildProposal({
      adapter: "csv",
      records: rows,
      mapping: input.mapping,
      ctx,
      source: makeSource(`${ctx.prefix}:source:csv-${digest(input.uri).slice(7, 15)}`, "csv", input.uri, ctx, input.content, {
        mediaType: "text/csv"
      }),
      // Row 1 is the header, so record 0 lives on line 2.
      selectorFor: (index) => ({ type: "line-range", start: index + 2, end: index + 2 })
    });
  }
};

export const jsonAdapter: SourceAdapter<FileInput> = {
  id: "json",
  description: "A JSON array (or an object with an array field) becomes entities and claims.",
  capabilities: READ_ONLY_PUBLIC,
  ingest(input, ctx) {
    const parsed = JSON.parse(input.content) as unknown;
    const records = toRecords(parsed);
    return buildProposal({
      adapter: "json",
      records,
      mapping: input.mapping,
      ctx,
      source: makeSource(
        `${ctx.prefix}:source:json-${digest(input.uri).slice(7, 15)}`,
        "json",
        input.uri,
        ctx,
        input.content,
        { mediaType: "application/json" }
      )
    });
  }
};

export const yamlAdapter: SourceAdapter<FileInput> = {
  id: "yaml",
  description: "A YAML sequence becomes entities and claims.",
  capabilities: READ_ONLY_PUBLIC,
  ingest(input, ctx) {
    const records = toRecords(parseYaml(input.content) as unknown);
    return buildProposal({
      adapter: "yaml",
      records,
      mapping: input.mapping,
      ctx,
      source: makeSource(
        `${ctx.prefix}:source:yaml-${digest(input.uri).slice(7, 15)}`,
        "yaml",
        input.uri,
        ctx,
        input.content,
        { mediaType: "application/yaml" }
      )
    });
  }
};

export const ndjsonAdapter: SourceAdapter<FileInput> = {
  id: "ndjson",
  description: "Newline-delimited JSON records become entities and claims.",
  capabilities: READ_ONLY_PUBLIC,
  ingest(input, ctx) {
    const records: Array<Record<string, unknown>> = [];
    input.content.split("\n").forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        records.push(JSON.parse(trimmed) as Record<string, unknown>);
      } catch {
        // Reported below rather than aborting the whole file.
        records.push({ __parseError: index + 1 });
      }
    });

    const bad = records.filter((record) => "__parseError" in record);
    const clean = records.filter((record) => !("__parseError" in record));

    const result = buildProposal({
      adapter: "ndjson",
      records: clean,
      mapping: input.mapping,
      ctx,
      source: makeSource(
        `${ctx.prefix}:source:ndjson-${digest(input.uri).slice(7, 15)}`,
        "ndjson",
        input.uri,
        ctx,
        input.content,
        { mediaType: "application/x-ndjson" }
      ),
      selectorFor: (index) => ({ type: "line-range", start: index + 1, end: index + 1 })
    });

    for (const record of bad) {
      result.warnings.push(`line ${String(record.__parseError)} is not valid JSON; skipped`);
    }
    return result;
  }
};

export interface MarkdownInput {
  uri: string;
  content: string;
  entityType: string;
  idSegment?: string;
  /** Heading level that starts a new entity. Defaults to 2 (`##`). */
  headingLevel?: number;
}

export const markdownAdapter: SourceAdapter<MarkdownInput> = {
  id: "markdown",
  description: "Each heading in a Markdown document becomes an entity; its links become claims.",
  capabilities: READ_ONLY_PUBLIC,
  ingest(input, ctx) {
    const level = input.headingLevel ?? 2;
    const marker = "#".repeat(level);
    const source = makeSource(
      `${ctx.prefix}:source:markdown-${digest(input.uri).slice(7, 15)}`,
      "markdown",
      input.uri,
      ctx,
      input.content,
      { mediaType: "text/markdown" }
    );

    const entities: Entity[] = [];
    const claims: Claim[] = [];
    const evidence: Evidence[] = [];
    const segment = input.idSegment ?? slug(input.entityType);

    let current: { id: string; line: number } | null = null;
    let seq = 0;

    input.content.split("\n").forEach((line, index) => {
      const heading = new RegExp(`^${marker}\\s+(.+?)\\s*$`).exec(line);
      if (heading && !line.startsWith(`${marker}#`)) {
        const name = heading[1] as string;
        const id = `${ctx.prefix}:${segment}:${slug(name)}`;
        const evidenceId = `${ctx.prefix}:evidence:markdown-${String(++seq).padStart(4, "0")}`;
        evidence.push({
          openontology: OPENONTOLOGY_VERSION,
          kind: "Evidence",
          id: evidenceId,
          source: source.id,
          selector: { type: "line-range", start: index + 1, end: index + 1 }
        });
        entities.push({
          openontology: OPENONTOLOGY_VERSION,
          kind: "Entity",
          id,
          type: input.entityType,
          canonicalName: name,
          createdAt: ctx.now,
          createdBy: ctx.actor
        });
        current = { id, line: index + 1 };
        return;
      }

      if (!current) return;
      for (const match of line.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
        const evidenceId = `${ctx.prefix}:evidence:markdown-${String(++seq).padStart(4, "0")}`;
        evidence.push({
          openontology: OPENONTOLOGY_VERSION,
          kind: "Evidence",
          id: evidenceId,
          source: source.id,
          selector: { type: "line-range", start: index + 1, end: index + 1 }
        });
        claims.push({
          openontology: OPENONTOLOGY_VERSION,
          kind: "Claim",
          id: `${ctx.prefix}:claim:markdown-${String(seq).padStart(4, "0")}`,
          subject: current.id,
          predicate: "references",
          object: { value: match[2] as string },
          status: "proposed",
          assertedAt: ctx.now,
          assertedBy: ctx.actor,
          sources: [source.id],
          evidence: [evidenceId],
          ...(ctx.runId ? { runId: ctx.runId } : {}),
          ...(ctx.confidence !== undefined ? { confidence: ctx.confidence } : {})
        });
      }
    });

    return {
      adapter: "markdown",
      sources: [source],
      entities,
      claims,
      evidence,
      operations: [
        ...entities.map((entity) => ({ op: "add-entity" as const, value: entity as unknown as Record<string, unknown> })),
        ...claims.map((claim) => ({ op: "assert-claim" as const, value: claim as unknown as Record<string, unknown> }))
      ],
      warnings: entities.length === 0 ? [`no level-${level} headings found in ${input.uri}`] : [],
      capabilities: READ_ONLY_PUBLIC
    };
  }
};

/* ── HTTP adapters ──────────────────────────────────────────────────────── */

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

export interface HttpInput {
  url: string;
  mapping: RecordMapping;
  headers?: Record<string, string>;
  /** JSON pointer-ish path to the array in the response, e.g. "data.items". */
  path?: string;
  fetch: FetchLike;
}

export const httpApiAdapter: SourceAdapter<HttpInput> = {
  id: "http-api",
  description: "A JSON HTTP endpoint becomes entities and claims.",
  capabilities: { publicData: true, privateData: true, incremental: false, deletions: false, license: false },
  async ingest(input, ctx) {
    const response = await input.fetch(input.url, { headers: input.headers });
    if (!response.ok) {
      throw new Error(`${input.url} returned HTTP ${response.status}`);
    }
    const body = await response.text();
    const parsed = JSON.parse(body) as unknown;
    const target = input.path
      ? input.path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown>)?.[key], parsed)
      : parsed;

    const result = buildProposal({
      adapter: "http-api",
      records: toRecords(target),
      mapping: input.mapping,
      ctx,
      source: makeSource(
        `${ctx.prefix}:source:http-${digest(input.url).slice(7, 15)}`,
        "api-response",
        input.url,
        ctx,
        body,
        { mediaType: "application/json" }
      ),
      selectorFor: (index) => ({ type: "api-field", field: `${input.path ?? "$"}[${index}]`, endpoint: input.url })
    });

    result.capabilities = httpApiAdapter.capabilities;
    if (!ctx.license) {
      result.warnings.push("no licence declared for this endpoint; source licence recorded as unknown");
    }
    return result;
  }
};

export interface GithubInput {
  /** `owner/name`. */
  repo: string;
  fetch: FetchLike;
  token?: string;
  apiBase?: string;
}

/**
 * GitHub repository → a codebase entity plus its contributors.
 *
 * Fetch is injected, so tests (and offline runs) never touch the network.
 */
export const githubAdapter: SourceAdapter<GithubInput> = {
  id: "github",
  description: "A GitHub repository and its contributors become a codebase and people.",
  capabilities: { publicData: true, privateData: true, incremental: false, deletions: false, license: true },
  async ingest(input, ctx) {
    const base = input.apiBase ?? "https://api.github.com";
    const headers = {
      accept: "application/vnd.github+json",
      ...(input.token ? { authorization: `Bearer ${input.token}` } : {})
    };

    const repoResponse = await input.fetch(`${base}/repos/${input.repo}`, { headers });
    if (!repoResponse.ok) throw new Error(`GitHub returned HTTP ${repoResponse.status} for ${input.repo}`);
    const repoBody = await repoResponse.text();
    const repo = JSON.parse(repoBody) as {
      full_name?: string;
      name?: string;
      language?: string;
      license?: { spdx_id?: string };
      html_url?: string;
    };

    const contributorsResponse = await input.fetch(`${base}/repos/${input.repo}/contributors`, { headers });
    const contributorsBody = contributorsResponse.ok ? await contributorsResponse.text() : "[]";
    const contributors = JSON.parse(contributorsBody) as Array<{ login?: string; contributions?: number }>;

    const source = makeSource(
      `${ctx.prefix}:source:github-${slug(input.repo)}`,
      "api-response",
      repo.html_url ?? `${base}/repos/${input.repo}`,
      ctx,
      repoBody,
      { mediaType: "application/json", license: repo.license?.spdx_id ?? ctx.license ?? "unknown", publisher: "github" }
    );

    const codebaseId = `${ctx.prefix}:code:${slug(repo.name ?? input.repo)}`;
    const entities: Entity[] = [
      {
        openontology: OPENONTOLOGY_VERSION,
        kind: "Entity",
        id: codebaseId,
        type: "Codebase",
        canonicalName: repo.name ?? input.repo,
        externalIds: { github: repo.full_name ?? input.repo },
        createdAt: ctx.now,
        createdBy: ctx.actor
      }
    ];

    const claims: Claim[] = [];
    let seq = 0;
    const claimBase = {
      openontology: OPENONTOLOGY_VERSION,
      kind: "Claim" as const,
      status: "proposed" as const,
      assertedAt: ctx.now,
      assertedBy: ctx.actor,
      sources: [source.id],
      ...(ctx.runId ? { runId: ctx.runId } : {}),
      ...(ctx.confidence !== undefined ? { confidence: ctx.confidence } : {})
    };

    if (repo.language) {
      claims.push({
        ...claimBase,
        id: `${ctx.prefix}:claim:github-${String(++seq).padStart(4, "0")}`,
        subject: codebaseId,
        predicate: "language",
        object: { value: repo.language }
      });
    }
    if (repo.license?.spdx_id) {
      claims.push({
        ...claimBase,
        id: `${ctx.prefix}:claim:github-${String(++seq).padStart(4, "0")}`,
        subject: codebaseId,
        predicate: "license",
        object: { value: repo.license.spdx_id }
      });
    }

    for (const contributor of contributors) {
      if (!contributor.login) continue;
      const personId = `${ctx.prefix}:person:${slug(contributor.login)}`;
      entities.push({
        openontology: OPENONTOLOGY_VERSION,
        kind: "Entity",
        id: personId,
        type: "Person",
        canonicalName: contributor.login,
        externalIds: { github: contributor.login },
        createdAt: ctx.now,
        createdBy: ctx.actor
      });
      claims.push({
        ...claimBase,
        id: `${ctx.prefix}:claim:github-${String(++seq).padStart(4, "0")}`,
        subject: personId,
        predicate: "contributesTo",
        object: { entity: codebaseId }
      });
    }

    const warnings: string[] = [];
    if (!contributorsResponse.ok) {
      warnings.push(`contributors endpoint returned HTTP ${contributorsResponse.status}; only the codebase was mapped`);
    }
    if (!repo.license?.spdx_id) {
      warnings.push("repository declares no SPDX licence; source licence recorded as unknown");
    }

    return {
      adapter: "github",
      sources: [source],
      entities,
      claims,
      evidence: [],
      operations: [
        ...entities.map((entity) => ({ op: "add-entity" as const, value: entity as unknown as Record<string, unknown> })),
        ...claims.map((claim) => ({ op: "assert-claim" as const, value: claim as unknown as Record<string, unknown> }))
      ],
      warnings,
      capabilities: githubAdapter.capabilities
    };
  }
};

export const ADAPTERS = {
  csv: csvAdapter,
  json: jsonAdapter,
  yaml: yamlAdapter,
  ndjson: ndjsonAdapter,
  markdown: markdownAdapter,
  "http-api": httpApiAdapter,
  github: githubAdapter
} as const;

export type AdapterId = keyof typeof ADAPTERS;

export function listAdapters(): Array<{ id: string; description: string; capabilities: AdapterCapabilities }> {
  return Object.values(ADAPTERS).map((adapter) => ({
    id: adapter.id,
    description: adapter.description,
    capabilities: adapter.capabilities
  }));
}

/* ── helpers ────────────────────────────────────────────────────────────── */

function toRecords(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  if (value && typeof value === "object") {
    const arrayField = Object.values(value as Record<string, unknown>).find((entry) => Array.isArray(entry));
    if (arrayField) return arrayField as Array<Record<string, unknown>>;
    return [value as Record<string, unknown>];
  }
  return [];
}

/** Minimal RFC-4180 CSV reader: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] as string;

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((entry) => entry.some((cell) => cell.trim() !== ""));
  if (!header) return [];

  return body.map((cells) =>
    Object.fromEntries(header.map((name, index) => [name.trim(), (cells[index] ?? "").trim()]))
  );
}
