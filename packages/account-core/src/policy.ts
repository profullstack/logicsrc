import { isPolicyGatedPermission } from "./permissions.js";
import type { LogicSrcPolicyEvaluationInput, LogicSrcPolicyEvaluationResult, LogicSrcRiskBand } from "./types.js";

const WRITE_ACTIONS = new Set([
  "social:post:publish",
  "social:post:delete",
  "social:dm:send",
  "email:send",
  "email:reply",
  "email:forward",
  "email:delete",
  "email:labels:modify",
  "email:archive"
]);

export function riskBandForScore(score: number): LogicSrcRiskBand {
  if (score >= 0.75) {
    return "critical";
  }
  if (score >= 0.5) {
    return "high";
  }
  if (score >= 0.25) {
    return "medium";
  }
  return "low";
}

export function scoreAccountActionRisk(input: {
  action: string;
  externalRecipientCount?: number;
  newRecipientOrDomain?: boolean;
  hasAttachment?: boolean;
  highReachAccount?: boolean;
  sensitiveKeywordDetected?: boolean;
  rawCredentialAccessAttempted?: boolean;
}) {
  let score = 0;

  if (input.externalRecipientCount && input.externalRecipientCount > 0) score += 0.1;
  if (input.newRecipientOrDomain) score += 0.15;
  if (input.hasAttachment) score += 0.15;
  if (input.action === "social:post:publish") score += 0.2;
  if (input.action.includes("delete")) score += 0.2;
  if (input.action.includes("dm:read") || input.action.includes("attachments:read")) score += 0.25;
  if (input.highReachAccount) score += 0.25;
  if (input.sensitiveKeywordDetected) score += 0.3;
  if (input.rawCredentialAccessAttempted) score += 0.4;

  return Math.min(1, Number(score.toFixed(2)));
}

export function evaluateAccountPolicy(input: LogicSrcPolicyEvaluationInput): LogicSrcPolicyEvaluationResult {
  const rawRiskScore = input.riskScore ?? scoreAccountActionRisk({ action: input.action });
  const riskScore = Number.isFinite(rawRiskScore) ? Math.min(1, Math.max(0, rawRiskScore)) : 1;
  const grantActive = input.grant && !input.grant.revokedAt && (!input.grant.expiresAt || Date.parse(input.grant.expiresAt) > Date.now());
  const hasPermission = Boolean(grantActive && input.grant?.permissions.includes(input.action));

  if (!hasPermission) {
    return { decision: "deny", riskScore, reason: `missing grant for ${input.action}` };
  }

  if (input.dryRun) {
    return { decision: "allow", riskScore, reason: "dry run with matching grant" };
  }

  const policy = input.grant?.policy.find((entry) => entry.action === input.action);
  if (policy?.default === "deny") {
    return { decision: "deny", riskScore, reason: `policy ${policy.id} denies ${input.action}` };
  }
  if (policy?.default === "approval_required") {
    return { decision: "approval_required", riskScore, reason: `policy ${policy.id} requires approval` };
  }
  if (policy?.default === "allow_if_trusted_agent" && input.principal?.trusted) {
    return { decision: "allow", riskScore, reason: `policy ${policy.id} allows trusted principal` };
  }
  if (policy?.default === "allow_if_below_risk_score") {
    const maxRiskScore = typeof policy.conditions?.maxRiskScore === "number" ? policy.conditions.maxRiskScore : 0.25;
    return riskScore <= maxRiskScore
      ? { decision: "allow", riskScore, reason: `risk score is within policy ${policy.id}` }
      : { decision: "approval_required", riskScore, reason: `risk score exceeds policy ${policy.id}` };
  }

  const band = riskBandForScore(riskScore);
  if (band === "critical") {
    return { decision: "deny", riskScore, reason: "critical risk requires admin override" };
  }
  if (isPolicyGatedPermission(input.action) || (WRITE_ACTIONS.has(input.action) && band !== "low")) {
    return { decision: "approval_required", riskScore, reason: "default gate for risky account action" };
  }

  return { decision: "allow", riskScore, reason: "grant allows account action" };
}
