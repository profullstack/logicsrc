/**
 * Scopes, roles, and authorization.
 *
 * The one invariant everything here serves: **authorization precedes
 * relevance**. Nothing in this module knows or cares what the task is. An
 * object an agent may not read is removed before any ranking happens, so
 * unauthorized context cannot reach a ranker, a prompt, or a bundle — not even
 * as a title in an explanation.
 *
 * Deny overrides allow, everywhere and unconditionally.
 */

import type {
  Classification,
  ContextObject,
  EffectiveScope,
  ExclusionReason,
  Manifest,
  Redaction,
  RoleDefinition
} from "./types.js";
import { CLASSIFICATIONS } from "./types.js";
import { firstMatch, matchesAny, matchesPrincipal } from "./ids.js";
import { DEFAULT_MAX_CLASSIFICATION } from "./manifest.js";

export class UnknownConsumerError extends Error {
  constructor(kind: "agent" | "role", name: string, known: string[]) {
    super(
      known.length === 0
        ? `No ${kind}s are defined in opencontext.yaml, so "${name}" cannot be resolved.`
        : `Unknown ${kind} "${name}". Defined ${kind}s: ${known.join(", ")}.`
    );
    this.name = "UnknownConsumerError";
  }
}

export function classificationRank(value: Classification | undefined): number {
  return CLASSIFICATIONS.indexOf(value ?? "internal");
}

export interface ScopeRequest {
  agent?: string;
  role?: string | string[];
  consumerType?: "agent" | "human" | "role" | "service";
}

/**
 * Flatten a consumer's roles into one scope.
 *
 * Inheritance unions includes, excludes, and redactions, and takes the *lowest*
 * classification ceiling of the parents — so inheriting a role can only ever
 * narrow what is readable. A role that could widen its parent's access by
 * inheriting it would make scopes impossible to reason about.
 */
export function resolveScope(manifest: Manifest, request: ScopeRequest): EffectiveScope {
  const roles = manifest.roles ?? {};
  const requestedRoles = new Set<string>();

  if (request.agent) {
    const binding = manifest.agents?.[request.agent];
    if (!binding) {
      // An agent may also be addressed by a role of the same name, which is the
      // common shape in small repositories.
      if (roles[request.agent]) {
        requestedRoles.add(request.agent);
      } else {
        throw new UnknownConsumerError("agent", request.agent, Object.keys(manifest.agents ?? {}));
      }
    } else {
      for (const role of binding.roles) requestedRoles.add(role);
    }
  }

  const explicitRoles = request.role === undefined ? [] : Array.isArray(request.role) ? request.role : [request.role];
  for (const role of explicitRoles) {
    if (!roles[role]) throw new UnknownConsumerError("role", role, Object.keys(roles));
    requestedRoles.add(role);
  }

  const expanded = new Set<string>();
  for (const role of requestedRoles) expandRole(role, roles, expanded);

  const include: string[] = [];
  const exclude: string[] = [];
  const permissions: string[] = [];
  const redact: Redaction[] = [];

  for (const name of [...expanded].sort()) {
    const role = roles[name];
    if (!role) continue;
    include.push(...(role.include ?? []));
    exclude.push(...(role.exclude ?? []));
    permissions.push(...(role.permissions ?? []));
    redact.push(...(role.redact ?? []));
  }

  const maxClassification = ceilingFor(requestedRoles, roles);

  const consumerId = request.agent ?? explicitRoles[0] ?? "anonymous";
  const consumerType = request.consumerType ?? (request.agent ? "agent" : "role");

  return {
    consumer: { type: consumerType, id: consumerId, roles: [...expanded].sort() },
    include: unique(include),
    exclude: unique(exclude),
    permissions: unique(permissions),
    maxClassification,
    redact,
    // Both the consumer name and its roles are principals, so an object can grant
    // read access to a specific agent or to a whole role.
    principals: unique([consumerId, ...expanded])
  };
}

/**
 * The classification ceiling for a set of requested roles.
 *
 * Two different rules, because the two situations mean different things.
 *
 * **Within an inheritance chain, the most specific declaration wins.** A role
 * that says `max_classification: confidential` means it, even when it inherits
 * a base role capped at `internal`. The alternative — taking the minimum across
 * the chain — makes a single `max_classification` on a shared `everyone` role
 * silently cap every role in the repository, so a `finance` role explicitly
 * granted `confidential` quietly receives nothing above `internal`. That is a
 * denial nobody can see in the manifest.
 *
 * **Across independently requested roles, the lowest wins.** Holding two roles
 * at once must never escalate beyond what either grants on its own, so
 * `--role support --role finance` is capped at the more cautious of the two.
 *
 * Both are safe under review: a ceiling is written by whoever edits the
 * manifest, never by the context being read.
 */
function ceilingFor(requested: Set<string>, roles: Record<string, RoleDefinition>): Classification {
  const ceilings: Classification[] = [];

  for (const name of requested) {
    const declared = nearestCeiling(name, roles, new Set());
    if (declared) ceilings.push(declared);
  }

  if (ceilings.length === 0) return DEFAULT_MAX_CLASSIFICATION;

  return ceilings.reduce((lowest, candidate) =>
    classificationRank(candidate) < classificationRank(lowest) ? candidate : lowest
  );
}

/** The role's own ceiling, else the nearest one up its inheritance chain. */
function nearestCeiling(
  name: string,
  roles: Record<string, RoleDefinition>,
  seen: Set<string>
): Classification | undefined {
  if (seen.has(name)) return undefined;
  seen.add(name);

  const role = roles[name];
  if (!role) return undefined;
  if (role.max_classification) return role.max_classification;

  for (const parent of role.inherits ?? []) {
    const inherited = nearestCeiling(parent, roles, seen);
    if (inherited) return inherited;
  }
  return undefined;
}

function expandRole(name: string, roles: Record<string, RoleDefinition>, seen: Set<string>): void {
  if (seen.has(name)) return;
  seen.add(name);
  for (const parent of roles[name]?.inherits ?? []) {
    if (roles[parent]) expandRole(parent, roles, seen);
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * The unrestricted scope, used when no agent or role is given.
 *
 * This is a local operator inspecting their own repository, not an anonymous
 * caller: `opencontext list` with no role shows everything on disk. It is still
 * capped at `internal` unless the caller opts in, so a stray `resolve` with no
 * `--role` cannot spill restricted context into a bundle by accident.
 */
export function unrestrictedScope(maxClassification: Classification = "restricted"): EffectiveScope {
  return {
    consumer: { type: "human", id: "local", roles: [] },
    include: ["*"],
    exclude: [],
    permissions: [],
    maxClassification,
    redact: [],
    principals: ["local", "*"]
  };
}

export interface AuthorizationResult {
  allowed: boolean;
  reason?: ExclusionReason;
  detail?: string;
}

/**
 * Decide whether one object is readable in one scope.
 *
 * Order matters, and it is the order the specification requires: explicit
 * denials first, then scope exclusions, then object read grants, then scope
 * inclusion, then the classification ceiling. The first failure is reported, so
 * `--explain` says *why* rather than merely *no*.
 */
export function authorize(object: ContextObject, scope: EffectiveScope): AuthorizationResult {
  if (matchesPrincipal(object.permissions?.deny, scope.principals)) {
    return { allowed: false, reason: "permission-denied", detail: `${object.id} denies this consumer explicitly.` };
  }

  const excludedBy = firstMatch(scope.exclude, object.id);
  if (excludedBy) {
    return { allowed: false, reason: "scope-exclusion", detail: `excluded by "${excludedBy}"` };
  }

  const readList = object.permissions?.read;
  if (readList && readList.length > 0 && !matchesPrincipal(readList, scope.principals)) {
    return {
      allowed: false,
      reason: "permission-denied",
      detail: `${object.id} grants read to ${readList.join(", ")}.`
    };
  }

  const includedBy = firstMatch(scope.include, object.id);
  if (!includedBy) {
    return { allowed: false, reason: "not-in-scope", detail: "no include pattern matches" };
  }

  if (classificationRank(object.classification) > classificationRank(scope.maxClassification)) {
    return {
      allowed: false,
      reason: "classification-denied",
      detail: `${object.classification} exceeds the ${scope.maxClassification} ceiling`
    };
  }

  return { allowed: true, detail: `included by "${includedBy}"` };
}

/** Whether a consumer may write or supersede an object. Writes are never implicit. */
export function canWrite(object: ContextObject, scope: EffectiveScope): boolean {
  if (matchesPrincipal(object.permissions?.deny, scope.principals)) return false;
  const writeList = object.permissions?.write;
  if (!writeList || writeList.length === 0) return false;
  return matchesPrincipal(writeList, scope.principals);
}

/** Every redaction that applies: repository-wide, role-level, then object-level. */
export function redactionsFor(manifest: Manifest, scope: EffectiveScope, object: ContextObject): Redaction[] {
  return [...(manifest.redact ?? []), ...scope.redact, ...(object.redact ?? [])];
}

/** Check a permission string, for runtimes that enforce capabilities. */
export function hasPermission(scope: EffectiveScope, permission: string): boolean {
  return matchesAny(scope.permissions, permission) || scope.permissions.includes(permission);
}
