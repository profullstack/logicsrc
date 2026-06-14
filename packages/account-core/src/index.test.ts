import { describe, expect, it } from "vitest";
import { createAccountAuditEvent, createProviderRegistry, evaluateAccountPolicy, isPolicyGatedPermission, riskBandForScore, scoreAccountActionRisk } from "./index.js";

describe("account-core", () => {
  it("indexes account providers by kind and id", () => {
    const registry = createProviderRegistry([
      { id: "gmail", name: "Gmail", kind: "email", authMethods: ["oauth2"], capabilities: ["email.search"] },
      { id: "mastodon", name: "Mastodon", kind: "social", authMethods: ["oauth2"], capabilities: ["social.post.publish"] }
    ]);

    expect(registry.list("email")).toHaveLength(1);
    expect(registry.require("mastodon").name).toBe("Mastodon");
  });

  it("keeps write and private actions policy-gated", () => {
    expect(isPolicyGatedPermission("email:send")).toBe(true);
    expect(isPolicyGatedPermission("social:profile:read")).toBe(false);
  });

  it("scores and bands risky account actions", () => {
    const score = scoreAccountActionRisk({ action: "email:send", externalRecipientCount: 1, hasAttachment: true, sensitiveKeywordDetected: true });

    expect(score).toBe(0.55);
    expect(riskBandForScore(score)).toBe("high");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "classifies a non-finite risk score of %s as critical",
    (riskScore) => {
      expect(riskBandForScore(riskScore)).toBe("critical");
    }
  );

  it("requires approval for gated actions with matching grants", () => {
    const result = evaluateAccountPolicy({
      action: "email:send",
      principal: { type: "agent", id: "marketing-agent" },
      grant: {
        id: "grant_1",
        accountId: "account_1",
        principal: { type: "agent", id: "marketing-agent" },
        permissions: ["email:send"],
        policy: [],
        createdAt: new Date(0).toISOString()
      }
    });

    expect(result.decision).toBe("approval_required");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "fails closed for a non-finite risk score of %s",
    (riskScore) => {
      const result = evaluateAccountPolicy({
        action: "social:profile:read",
        riskScore,
        principal: { type: "agent", id: "profile-agent" },
        grant: {
          id: "grant_non_finite",
          accountId: "account_1",
          principal: { type: "agent", id: "profile-agent" },
          permissions: ["social:profile:read"],
          policy: [],
          createdAt: new Date(0).toISOString()
        }
      });

      expect(result).toMatchObject({
        decision: "deny",
        riskScore: 1,
        reason: "critical risk requires admin override"
      });
    }
  );

  it("redacts secret-like audit previews", () => {
    const event = createAccountAuditEvent({
      provider: "gmail",
      kind: "email",
      principal: { type: "user", id: "user_1" },
      action: "accounts:connect",
      decision: "allow",
      requestPreview: { accessToken: "raw-token", provider: "gmail" }
    });

    expect(event.requestPreview.accessToken).toBe("[redacted]");
    expect(event.requestPreview.provider).toBe("gmail");
  });
});
