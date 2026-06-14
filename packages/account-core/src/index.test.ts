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

  it.each([
    { principal: { type: "agent" as const, id: "trusted-agent", trusted: true }, expected: "allow" },
    { principal: { type: "agent" as const, id: "untrusted-agent", trusted: false }, expected: "approval_required" },
    { principal: undefined, expected: "approval_required" }
  ])("enforces trusted-agent policies for $expected decisions", ({ principal, expected }) => {
    const result = evaluateAccountPolicy({
      action: "social:profile:read",
      principal,
      grant: {
        id: "grant_trusted_agent",
        accountId: "account_1",
        principal: { type: "agent", id: "trusted-agent" },
        permissions: ["social:profile:read"],
        policy: [
          {
            id: "trusted_read",
            resource: "social:profile",
            action: "social:profile:read",
            default: "allow_if_trusted_agent"
          }
        ],
        createdAt: new Date(0).toISOString()
      }
    });

    expect(result.decision).toBe(expected);
  });

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
