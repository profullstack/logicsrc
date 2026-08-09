/**
 * Audit events.
 *
 * The specification defines the event shape and deliberately does not mandate
 * storage: an NDJSON file committed next to the context is a conforming sink,
 * and so is a warehouse. What matters is that after an agent is retired its
 * reads, writes, and refusals remain attributable — and that a recorded bundle
 * digest makes the record verifiable rather than merely descriptive.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ContextBundle, EffectiveScope, Manifest } from "./types.js";
import { resolveInside } from "./adapters/file.js";
import { SPEC_VERSION } from "./manifest.js";

export type AuditEventName =
  | "context.read"
  | "context.search"
  | "context.resolve"
  | "context.bundle"
  | "context.write"
  | "context.supersede"
  | "context.conflict"
  | "context.denied"
  | "decision.record";

export interface AuditEvent {
  opencontext: string;
  event: AuditEventName;
  at: string;
  actor: { type: "agent" | "human" | "role" | "service"; id: string; roles?: string[]; on_behalf_of?: string };
  task?: string;
  objects?: string[];
  bundle?: { bundle_id?: string; digest?: string; object_count?: number };
  outcome?: "allowed" | "denied" | "partial" | "error";
  reason?: string;
  namespace?: string;
  extensions?: Record<string, unknown>;
}

/** Whether the manifest asks for this event to be recorded. */
export function isAuditEnabled(manifest: Manifest, event: AuditEventName): boolean {
  const audit = manifest.audit;
  if (!audit) return false;

  switch (event) {
    case "context.read":
    case "context.search":
    case "context.resolve":
    case "context.bundle":
      return audit.context_reads === true;
    case "context.write":
    case "context.supersede":
      return audit.context_writes === true;
    case "context.conflict":
      return audit.conflicts === true;
    case "context.denied":
      return audit.context_reads === true || audit.context_writes === true;
    case "decision.record":
      return audit.decisions === true;
    default:
      return false;
  }
}

export interface AuditContext {
  manifest: Manifest;
  dir: string;
  scope?: EffectiveScope;
}

export function buildEvent(
  event: AuditEventName,
  ctx: AuditContext,
  details: Omit<Partial<AuditEvent>, "event"> = {}
): AuditEvent {
  const scope = ctx.scope;
  return {
    opencontext: SPEC_VERSION,
    event,
    at: new Date().toISOString(),
    actor: details.actor ?? {
      type: scope?.consumer.type ?? "human",
      id: scope?.consumer.id ?? "local",
      ...(scope && scope.consumer.roles.length > 0 ? { roles: scope.consumer.roles } : {})
    },
    namespace: ctx.manifest.id,
    ...details
  };
}

export function eventForBundle(ctx: AuditContext, bundle: ContextBundle, excludedCount: number): AuditEvent {
  return buildEvent("context.resolve", ctx, {
    task: bundle.task,
    objects: bundle.objects.map((object) => object.id),
    bundle: { bundle_id: bundle.bundle_id, digest: bundle.digest, object_count: bundle.objects.length },
    // "partial" is the honest and normal outcome: a resolution that excluded
    // nothing is rare, and recording it as "allowed" would hide the scoping.
    outcome: bundle.objects.length === 0 ? "denied" : excludedCount > 0 ? "partial" : "allowed"
  });
}

/**
 * Append an event to the configured sink.
 *
 * Only `file://` sinks are written by the reference implementation; anything
 * else is returned for the caller to ship. A failure to write audit is
 * reported, never swallowed — silently losing the audit trail is worse than a
 * noisy command.
 */
export function recordEvent(ctx: AuditContext, event: AuditEvent): { written: boolean; sink?: string } {
  const sink = ctx.manifest.audit?.sink;
  if (!sink) return { written: false };

  if (!sink.startsWith("file:") && !sink.startsWith("./") && !sink.startsWith("/")) {
    return { written: false, sink };
  }

  const path = resolveInside(ctx.dir, sink);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(event)}\n`, "utf8");
  return { written: true, sink: path };
}
