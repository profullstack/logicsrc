import type { LogicSrcAccountAuditEvent, LogicSrcAccountKind, LogicSrcPolicyDecision, LogicSrcPrincipal } from "./types.js";

const REDACTED_KEYS = new Set(["accessToken", "refreshToken", "token", "password", "secret", "clientSecret", "authorization"]);

export function redactedPreview(input: Record<string, unknown>) {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    output[key] = REDACTED_KEYS.has(key) ? "[redacted]" : value;
  }

  return output;
}

export function createAccountAuditEvent(input: {
  id?: string;
  accountId?: string;
  provider: string;
  kind: LogicSrcAccountKind;
  principal: LogicSrcPrincipal;
  action: string;
  decision: LogicSrcPolicyDecision;
  riskScore?: number;
  requestPreview?: Record<string, unknown>;
  resultPreview?: Record<string, unknown>;
  correlationId?: string;
  createdAt?: string;
}): LogicSrcAccountAuditEvent {
  return {
    id: input.id ?? `acct_audit_${Date.now()}`,
    accountId: input.accountId,
    provider: input.provider,
    kind: input.kind,
    principal: input.principal,
    action: input.action,
    decision: input.decision,
    riskScore: input.riskScore ?? 0,
    requestPreview: redactedPreview(input.requestPreview ?? {}),
    resultPreview: redactedPreview(input.resultPreview ?? {}),
    correlationId: input.correlationId,
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}
