import { isVariable } from "./ids.js";
import type {
  Claim,
  ClaimStatus,
  Entity,
  Property,
  QueryBody,
  QueryExplanation,
  QueryResult,
  QueryRow,
  RelationshipType,
  TriplePattern,
  WhereClause
} from "./types.js";

/**
 * The read model a query runs against. Storage adapters build one of these;
 * the evaluator never talks to a database directly, which is what keeps the
 * portable AST portable.
 *
 * `claims` MUST already carry each claim's *effective* status (the store
 * resolves the append-only status log before handing claims over).
 */
export interface KnowledgeView {
  entities: Map<string, Entity>;
  claims: Claim[];
  relationships: Map<string, RelationshipType>;
  properties: Map<string, Property>;
  /** Follows merge redirects so a query for an old id still finds the survivor. */
  resolveEntityId?: (id: string) => string;
}

export interface QueryLimits {
  maxRows: number;
  maxDepth: number;
  maxBindings: number;
  maxMatchedClaims: number;
}

export const DEFAULT_LIMITS: QueryLimits = {
  maxRows: 1000,
  maxDepth: 8,
  maxBindings: 50_000,
  maxMatchedClaims: 200_000
};

const DEFAULT_STATUSES: ClaimStatus[] = ["asserted"];

type Binding = { vars: Record<string, unknown>; claims: string[] };

export class QueryLimitError extends Error {
  readonly code = "OO-Q-LIMIT";
  constructor(message: string) {
    super(message);
    this.name = "QueryLimitError";
  }
}

export function evaluateQuery(
  view: KnowledgeView,
  query: QueryBody,
  limits: Partial<QueryLimits> = {}
): QueryResult {
  const lim = { ...DEFAULT_LIMITS, ...limits };
  const statuses = query.include?.claimStatus ?? DEFAULT_STATUSES;
  const derivedIncluded = query.include?.derived ?? statuses.includes("derived");
  const visibilities = query.include?.visibility;

  if (query.match.length > (query.maxDepth ?? lim.maxDepth)) {
    throw new QueryLimitError(
      `Query depth ${query.match.length} exceeds the maximum of ${query.maxDepth ?? lim.maxDepth}`
    );
  }

  const candidates = view.claims.filter((claim) => {
    if (!statuses.includes(claim.status)) return false;
    if (!derivedIncluded && claim.status === "derived") return false;
    if (visibilities && !visibilities.includes(claim.visibility ?? "public")) return false;
    if (query.asOf && !validAt(claim, query.asOf)) return false;
    if (query.recordedAsOf && claim.assertedAt > query.recordedAsOf) return false;
    return true;
  });

  if (candidates.length > lim.maxMatchedClaims) {
    throw new QueryLimitError(
      `Query would scan ${candidates.length} claims, above the ${lim.maxMatchedClaims} limit`
    );
  }

  const patternTrace: QueryExplanation["patterns"] = [];
  let bindings: Binding[] = [{ vars: {}, claims: [] }];

  for (const pattern of query.match) {
    const next: Binding[] = [];
    const matchedClaims = new Set<string>();

    for (const binding of bindings) {
      let extended = false;

      for (const claim of candidates) {
        const merged = unify(view, pattern, claim, binding);
        if (!merged) continue;
        matchedClaims.add(claim.id);
        next.push(merged);
        extended = true;
        if (next.length > lim.maxBindings) {
          throw new QueryLimitError(
            `Query produced more than ${lim.maxBindings} intermediate bindings; add filters or a limit`
          );
        }
      }

      // OPTIONAL keeps the row alive with the pattern's variables unbound.
      if (!extended && pattern.optional) next.push(binding);
    }

    patternTrace.push({ pattern, matchedClaims: [...matchedClaims], bindingsAfter: next.length });
    bindings = next;
    if (bindings.length === 0) break;
  }

  const filters = query.where ?? [];
  for (const clause of filters) {
    bindings = bindings.filter((binding) => passesWhere(view, binding, clause));
  }

  let rows: QueryRow[] = bindings.map((binding) => ({
    bindings: project(view, binding, query),
    claims: [...new Set(binding.claims)]
  }));

  if (query.distinct) rows = distinctRows(rows);
  if (query.orderBy?.length) rows = sortRows(rows, query.orderBy);

  const offset = query.offset ?? 0;
  const hardLimit = Math.min(query.limit ?? lim.maxRows, lim.maxRows);
  const truncated = rows.length - offset > hardLimit;
  rows = rows.slice(offset, offset + hardLimit);

  const columns =
    query.select && query.select.length > 0 ? query.select.slice() : inferColumns(query.match);

  return {
    columns,
    rows,
    explanation: {
      asOf: query.asOf,
      recordedAsOf: query.recordedAsOf,
      claimStatus: statuses,
      derivedIncluded,
      patterns: patternTrace,
      filters,
      truncated
    }
  };
}

/** A claim is valid at `instant` unless its declared valid time excludes it. */
export function validAt(claim: Claim, instant: string): boolean {
  const from = claim.validTime?.from;
  const to = claim.validTime?.to;
  if (from && from > instant) return false;
  if (to && to <= instant) return false;
  return true;
}

function unify(
  view: KnowledgeView,
  pattern: TriplePattern,
  claim: Claim,
  binding: Binding
): Binding | null {
  const vars = { ...binding.vars };

  if (!bindTerm(view, pattern.subject, claim.subject, vars)) return null;
  if (!bindTerm(view, pattern.predicate, claim.predicate, vars)) return null;

  const objectTerm = pattern.object;
  if (typeof objectTerm === "string") {
    const actual = "entity" in claim.object ? claim.object.entity : claim.object.value;
    if (!bindTerm(view, objectTerm, actual, vars)) return null;
  } else if (objectTerm.variable) {
    const actual = "entity" in claim.object ? claim.object.entity : claim.object.value;
    if (!bindTerm(view, objectTerm.variable, actual, vars)) return null;
  } else if (objectTerm.entity !== undefined) {
    if (!("entity" in claim.object)) return null;
    if (resolve(view, claim.object.entity) !== resolve(view, objectTerm.entity)) return null;
  } else if (objectTerm.value !== undefined) {
    if ("entity" in claim.object) return null;
    if (!looseEqual(claim.object.value, objectTerm.value)) return null;
  }

  if (pattern.bindClaim) {
    if (!bindTerm(view, pattern.bindClaim, claim.id, vars)) return null;
  }

  return { vars, claims: [...binding.claims, claim.id] };
}

function bindTerm(
  view: KnowledgeView,
  term: string,
  actual: unknown,
  vars: Record<string, unknown>
): boolean {
  if (isVariable(term)) {
    const existing = vars[term];
    if (existing !== undefined) {
      return typeof existing === "string" && typeof actual === "string"
        ? resolve(view, existing) === resolve(view, actual)
        : looseEqual(existing, actual);
    }
    vars[term] = actual;
    return true;
  }
  if (typeof actual === "string") return resolve(view, term) === resolve(view, actual);
  return looseEqual(term, actual);
}

function resolve(view: KnowledgeView, id: string): string {
  return view.resolveEntityId ? view.resolveEntityId(id) : id;
}

function looseEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (a instanceof Date || b instanceof Date) return String(a) === String(b);
  if (typeof a === "object" && typeof b === "object" && a && b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/**
 * Resolve `?var.field` for a WHERE clause. Entity fields win over property
 * claims so `status`/`type`/`canonicalName` always mean the entity's own
 * metadata; anything else falls back to a scalar property claim.
 */
function fieldValue(view: KnowledgeView, bound: unknown, field?: string): unknown {
  if (!field) return bound;
  if (typeof bound !== "string") return undefined;

  const entity = view.entities.get(resolve(view, bound));
  if (entity) {
    if (field in entity) return (entity as unknown as Record<string, unknown>)[field];
    if (entity.externalIds && field in entity.externalIds) return entity.externalIds[field];
  }

  const claim = view.claims.find(
    (c) => c.subject === bound && c.predicate === field && !("entity" in c.object)
  );
  if (claim && !("entity" in claim.object)) return claim.object.value;

  const rel = view.claims.find((c) => c.subject === bound && c.predicate === field);
  if (rel && "entity" in rel.object) return rel.object.entity;

  return undefined;
}

function passesWhere(view: KnowledgeView, binding: Binding, clause: WhereClause): boolean {
  const bound = binding.vars[clause.variable];
  const actual = fieldValue(view, bound, clause.field);
  const expected = clause.value;

  switch (clause.operator) {
    case "eq":
      return looseEqual(actual, expected);
    case "neq":
      return !looseEqual(actual, expected);
    case "lt":
      return compare(actual, expected) < 0;
    case "lte":
      return compare(actual, expected) <= 0;
    case "gt":
      return compare(actual, expected) > 0;
    case "gte":
      return compare(actual, expected) >= 0;
    case "before":
      return String(actual) < String(expected);
    case "after":
      return String(actual) > String(expected);
    case "in":
      return Array.isArray(expected) && expected.some((v) => looseEqual(actual, v));
    case "not-in":
      return Array.isArray(expected) && !expected.some((v) => looseEqual(actual, v));
    case "exists":
      return actual !== undefined && actual !== null;
    case "not-exists":
      return actual === undefined || actual === null;
    case "contains":
      return Array.isArray(actual)
        ? actual.some((v) => looseEqual(v, expected))
        : String(actual ?? "").includes(String(expected ?? ""));
    case "starts-with":
      return String(actual ?? "").startsWith(String(expected ?? ""));
    case "matches":
      return new RegExp(String(expected ?? "")).test(String(actual ?? ""));
    default:
      return false;
  }
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = String(a ?? "");
  const sb = String(b ?? "");
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function project(view: KnowledgeView, binding: Binding, query: QueryBody): Record<string, unknown> {
  const select = query.select && query.select.length > 0 ? query.select : Object.keys(binding.vars);
  const out: Record<string, unknown> = {};

  for (const term of select) {
    const value = binding.vars[term];
    out[term] = value;

    if (typeof value !== "string") continue;
    const entity = view.entities.get(resolve(view, value));
    if (!entity) continue;

    if (query.include?.labels) out[`${term}.label`] = entity.canonicalName;
    for (const prop of query.include?.properties ?? []) {
      out[`${term}.${prop}`] = fieldValue(view, value, prop);
    }
  }

  return out;
}

function distinctRows(rows: QueryRow[]): QueryRow[] {
  const seen = new Set<string>();
  const out: QueryRow[] = [];
  for (const row of rows) {
    const key = JSON.stringify(row.bindings);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function sortRows(rows: QueryRow[], orderBy: NonNullable<QueryBody["orderBy"]>): QueryRow[] {
  return [...rows].sort((left, right) => {
    for (const clause of orderBy) {
      const key = clause.field ? `${clause.variable}.${clause.field}` : clause.variable;
      const cmp = compare(left.bindings[key], right.bindings[key]);
      if (cmp !== 0) return clause.direction === "desc" ? -cmp : cmp;
    }
    return 0;
  });
}

function inferColumns(match: TriplePattern[]): string[] {
  const columns: string[] = [];
  const add = (term: unknown) => {
    if (typeof term === "string" && isVariable(term) && !columns.includes(term)) columns.push(term);
  };
  for (const pattern of match) {
    add(pattern.subject);
    add(pattern.predicate);
    if (typeof pattern.object === "string") add(pattern.object);
    else if (pattern.object.variable) add(pattern.object.variable);
    add(pattern.bindClaim);
  }
  return columns;
}
