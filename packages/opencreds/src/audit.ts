/**
 * Audit events.
 *
 * An event never contains a secret value. Where a value must be referenced it
 * is referenced by a salted, truncated fingerprint — an equality and integrity
 * marker, not secret storage. Item *names* are secret-adjacent too (a folder
 * list is a good description of someone's life), so an event carries the item
 * id and type rather than its name.
 */

import { randomBytes, sha256, toBase64, utf8Encode, uuid } from "./primitives.js";
import type { AuditAction, AuditEvent, ItemTypeName, Namespace, Profile } from "./types.js";

/**
 * A per-process fingerprint salt.
 *
 * Fresh each run, so fingerprints are comparable within one audit session and
 * not across machines. A fixed salt would turn the audit log into a dictionary
 * for the values it describes.
 */
const SALT = randomBytes(16);

export async function fingerprint(value: string): Promise<string> {
  const digest = await sha256(new Uint8Array([...SALT, ...utf8Encode(value)]));
  return toBase64(digest).slice(0, 16);
}

export interface AuditInput {
  action: AuditAction;
  itemId?: string;
  itemType?: ItemTypeName;
  namespace?: Namespace;
  profile?: Profile;
  principal?: AuditEvent["principal"];
  fingerprint?: string;
  itemCount?: number;
  dryRun?: boolean;
  outcome?: AuditEvent["outcome"];
  reason?: string;
}

export function auditEvent(input: AuditInput): AuditEvent {
  return {
    type: "opencreds.audit_event",
    id: uuid(),
    createdAt: new Date().toISOString(),
    outcome: "succeeded",
    ...input,
  };
}
