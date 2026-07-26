import type { ActorType, ChangeSet } from "./types.js";

export const SCOPES = [
  "ontology:read",
  "ontology:schema:read",
  "ontology:query",
  "ontology:source:read",
  "ontology:claim:propose",
  "ontology:claim:write",
  "ontology:changeset:review",
  "ontology:changeset:approve",
  "ontology:action:execute",
  "ontology:publish",
  "ontology:admin"
] as const;

export type Scope = (typeof SCOPES)[number];

export interface Actor {
  id: string;
  type: ActorType;
  scopes: Scope[];
  /**
   * Unattended/--yolo execution. Recorded for audit and explicitly NOT a way
   * to skip a required approval (R107) — it only affects prompting.
   */
  unattended?: boolean;
  client?: string;
}

export type Operation =
  | { kind: "read" }
  | { kind: "query" }
  | { kind: "propose"; changeSet?: ChangeSet }
  | { kind: "review" }
  | { kind: "approve" }
  | { kind: "apply"; changeSet: ChangeSet }
  | { kind: "publish" }
  | { kind: "execute-action"; approvalMode: "none" | "policy" | "always"; declaredSideEffects: boolean };

export interface PolicyDecision {
  decision: "allow" | "deny" | "require-approval";
  rule: string;
  reason: string;
  /** Approvals that must exist before an apply/execute may proceed. */
  requiredApprovals: number;
  missingScopes: Scope[];
}

export interface PolicyOptions {
  /** A change set with at least this many retractions counts as bulk. */
  bulkRetractionThreshold?: number;
  /** Approvals required for an entity merge. */
  mergeApprovals?: number;
  /** Approvals required for a bulk retraction. */
  bulkRetractionApprovals?: number;
  /** Allow agents to apply directly. Off by default and strongly discouraged. */
  allowAgentApply?: boolean;
}

const DEFAULTS: Required<PolicyOptions> = {
  bulkRetractionThreshold: 2,
  mergeApprovals: 1,
  bulkRetractionApprovals: 2,
  allowAgentApply: false
};

function need(actor: Actor, scopes: Scope[]): Scope[] {
  if (actor.scopes.includes("ontology:admin")) return [];
  return scopes.filter((scope) => !actor.scopes.includes(scope));
}

/**
 * The default policy from the PRD, expressed as code:
 *
 *   agent query        → allowed with ontology:query
 *   agent proposal     → allowed with ontology:claim:propose
 *   agent direct apply → DENIED regardless of scopes or confidence
 *   human apply        → requires ontology:claim:write
 *   entity merge       → one curator approval
 *   bulk retraction    → two approvals
 *   breaking migration → maintainer approval
 *   undeclared action  → denied
 */
export function evaluatePolicy(
  operation: Operation,
  actor: Actor,
  options: PolicyOptions = {}
): PolicyDecision {
  const opts = { ...DEFAULTS, ...options };
  const allow = (rule: string, reason: string): PolicyDecision => ({
    decision: "allow",
    rule,
    reason,
    requiredApprovals: 0,
    missingScopes: []
  });
  const deny = (rule: string, reason: string, missingScopes: Scope[] = []): PolicyDecision => ({
    decision: "deny",
    rule,
    reason,
    requiredApprovals: 0,
    missingScopes
  });

  switch (operation.kind) {
    case "read": {
      const missing = need(actor, ["ontology:read"]);
      return missing.length
        ? deny("read.scope", "Reading requires ontology:read", missing)
        : allow("read.scope", "Actor holds ontology:read");
    }

    case "query": {
      const missing = need(actor, ["ontology:query"]);
      return missing.length
        ? deny("query.scope", "Querying requires ontology:query", missing)
        : allow("query.scope", "Actor holds ontology:query");
    }

    case "propose": {
      const missing = need(actor, ["ontology:claim:propose"]);
      return missing.length
        ? deny("propose.scope", "Proposing requires ontology:claim:propose", missing)
        : allow("propose.scope", "Actor holds ontology:claim:propose");
    }

    case "review": {
      const missing = need(actor, ["ontology:changeset:review"]);
      return missing.length
        ? deny("review.scope", "Reviewing requires ontology:changeset:review", missing)
        : allow("review.scope", "Actor holds ontology:changeset:review");
    }

    case "approve": {
      const missing = need(actor, ["ontology:changeset:approve"]);
      return missing.length
        ? deny("approve.scope", "Approving requires ontology:changeset:approve", missing)
        : allow("approve.scope", "Actor holds ontology:changeset:approve");
    }

    case "publish": {
      const missing = need(actor, ["ontology:publish"]);
      if (missing.length) return deny("publish.scope", "Publishing requires ontology:publish", missing);
      return {
        decision: "require-approval",
        rule: "publish.maintainer-approval",
        reason: "Public package publish requires maintainer approval and a passing conformance run",
        requiredApprovals: 1,
        missingScopes: []
      };
    }

    case "execute-action": {
      if (!operation.declaredSideEffects) {
        return deny(
          "action.undeclared-side-effects",
          "Action execution is denied when side effects are undeclared"
        );
      }
      const missing = need(actor, ["ontology:action:execute"]);
      if (missing.length) {
        return deny("action.scope", "Executing an action requires ontology:action:execute", missing);
      }
      if (operation.approvalMode === "always") {
        return {
          decision: "require-approval",
          rule: "action.approval-always",
          reason: "This action declares approval.mode: always",
          requiredApprovals: 1,
          missingScopes: []
        };
      }
      return allow("action.scope", "Actor holds ontology:action:execute");
    }

    case "apply": {
      const changeSet = operation.changeSet;

      // R105/R107: neither model confidence nor unattended mode is a permission.
      if (actor.type === "agent" && !opts.allowAgentApply) {
        return deny(
          "apply.agent-denied",
          "Agents may propose but never apply directly; a human or service actor must apply"
        );
      }

      const missing = need(actor, ["ontology:claim:write"]);
      if (missing.length) {
        return deny("apply.scope", "Applying requires ontology:claim:write", missing);
      }

      const merges = changeSet.operations.filter((op) => op.op === "merge-entity").length;
      const retractions = changeSet.operations.filter((op) => op.op === "retract-claim").length;
      const breaking = changeSet.operations.some(
        (op) => op.op === "schema-migration" && op.breaking === true
      );

      let requiredApprovals = changeSet.requiredApprovals ?? 0;
      let rule = "apply.scope";
      let reason = "Actor holds ontology:claim:write";

      if (merges > 0 && requiredApprovals < opts.mergeApprovals) {
        requiredApprovals = opts.mergeApprovals;
        rule = "apply.merge-approval";
        reason = `Entity merge requires ${opts.mergeApprovals} curator approval(s)`;
      }
      if (retractions >= opts.bulkRetractionThreshold && requiredApprovals < opts.bulkRetractionApprovals) {
        requiredApprovals = opts.bulkRetractionApprovals;
        rule = "apply.bulk-retraction";
        reason = `Bulk retraction (${retractions} claims) requires ${opts.bulkRetractionApprovals} approvals`;
      }
      if (breaking) {
        requiredApprovals = Math.max(requiredApprovals, 1);
        rule = "apply.breaking-migration";
        reason = "Breaking schema migration requires maintainer approval and a major version bump";
      }

      if (requiredApprovals > 0) {
        return { decision: "require-approval", rule, reason, requiredApprovals, missingScopes: [] };
      }
      return allow(rule, reason);
    }

    default:
      return deny("unknown-operation", "No policy rule matched this operation");
  }
}

/** Convenience actor used by the CLI for local, offline, single-user work. */
export function localActor(id = "local", type: ActorType = "human"): Actor {
  return { id, type, scopes: [...SCOPES] };
}

export function readOnlyActor(id: string, type: ActorType = "agent"): Actor {
  return { id, type, scopes: ["ontology:read", "ontology:schema:read", "ontology:query", "ontology:source:read"] };
}

export function proposerActor(id: string, type: ActorType = "agent"): Actor {
  return {
    id,
    type,
    scopes: [
      "ontology:read",
      "ontology:schema:read",
      "ontology:query",
      "ontology:source:read",
      "ontology:claim:propose"
    ]
  };
}
