import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validate } from "./index.js";

function fixture(name: string) {
  return JSON.parse(readFileSync(new URL(`../../schemas/fixtures/openwall/${name}.json`, import.meta.url), "utf8"));
}

describe("OpenWall draft structural contracts", () => {
  it.each(["broadcast", "direct", "announcement"])("accepts the %s message fixture", (name) => {
    expect(validate("openwall-message", fixture(name))).toMatchObject({ ok: true });
  });

  it.each(["receipt-accepted", "receipt-retrying"])("accepts the %s fixture", (name) => {
    expect(validate("openwall-receipt", fixture(name))).toMatchObject({ ok: true });
  });

  it("requires a service scope for every users selector", () => {
    const message = fixture("broadcast");
    delete message.audience.selectors[0].scope;
    expect(validate("openwall-message", message).ok).toBe(false);
  });

  it("permits a union of relationship groups and sources", () => {
    const message = fixture("broadcast");
    message.audience.selectors.push({
      source: "https://social.example/graph",
      actor: "did:web:ops.example",
      groups: ["connections", "followers", "following"]
    });
    expect(validate("openwall-message", message).ok).toBe(true);
  });

  it.each(["broadcast", "direct"])("rejects changing a %s to public while retaining recipients", (name) => {
    const message = fixture(name);
    message.visibility = "public";
    expect(validate("openwall-message", message).ok).toBe(false);
  });

  it("rejects a private message with an unrestricted public audience", () => {
    const message = fixture("announcement");
    message.visibility = "private";
    expect(validate("openwall-message", message).ok).toBe(false);
  });

  it("rejects recipient metadata in a public audience", () => {
    const message = fixture("announcement");
    message.audience.recipient = "did:web:ada.example";
    expect(validate("openwall-message", message).ok).toBe(false);
  });

  it("requires explicit groups and rejects an implicit all audience", () => {
    const message = fixture("broadcast");
    message.audience.selectors[0].groups = [];
    expect(validate("openwall-message", message).ok).toBe(false);
    message.audience.selectors[0].groups = ["all"];
    expect(validate("openwall-message", message).ok).toBe(false);
  });

  it("requires a resolved recipient identity rather than a display handle", () => {
    const message = fixture("direct");
    message.audience.recipient = "ada.example";
    expect(validate("openwall-message", message).ok).toBe(false);
  });

  it("rejects absent expiry, malformed timestamps and oversized text", () => {
    const message = fixture("direct");
    delete message.expiresAt;
    expect(validate("openwall-message", message).ok).toBe(false);
    message.expiresAt = "tomorrow";
    expect(validate("openwall-message", message).ok).toBe(false);
    message.expiresAt = "2026-09-13T13:00:00Z";
    message.content.text = "x".repeat(4001);
    expect(validate("openwall-message", message).ok).toBe(false);
  });

  it("requires receipt delivery correlation and disallows audience disclosure", () => {
    const receipt = fixture("receipt-accepted");
    delete receipt.deliveryId;
    expect(validate("openwall-receipt", receipt).ok).toBe(false);
    receipt.deliveryId = "unscoped-message-id";
    expect(validate("openwall-receipt", receipt).ok).toBe(false);
    receipt.deliveryId = "urn:uuid:db925d64-4e1a-4e5a-83c1-e37b68aa5eef";
    receipt.recipients = ["did:web:other.example"];
    expect(validate("openwall-receipt", receipt).ok).toBe(false);
  });

  it("requires retry timing and a reason and disallows retry timing on acceptance", () => {
    const receipt = fixture("receipt-retrying");
    delete receipt.nextAttemptAt;
    expect(validate("openwall-receipt", receipt).ok).toBe(false);
    receipt.nextAttemptAt = "2026-09-13T12:01:00Z";
    delete receipt.reason;
    expect(validate("openwall-receipt", receipt).ok).toBe(false);
    receipt.reason = "rate-limited";
    receipt.state = "accepted";
    expect(validate("openwall-receipt", receipt).ok).toBe(false);
  });

  it("represents ambiguous provider acceptance separately from a known failure", () => {
    const receipt = fixture("receipt-accepted");
    receipt.state = "unknown";
    receipt.reason = "acceptance-unknown";
    expect(validate("openwall-receipt", receipt).ok).toBe(true);
    receipt.reason = "rate-limited";
    expect(validate("openwall-receipt", receipt).ok).toBe(false);
    delete receipt.reason;
    receipt.state = "failed";
    expect(validate("openwall-receipt", receipt).ok).toBe(false);
  });

  it("requires a real route and attempt for provider acceptance", () => {
    const receipt = fixture("receipt-accepted");
    receipt.attempt = 0;
    expect(validate("openwall-receipt", receipt).ok).toBe(false);
    receipt.attempt = 1;
    delete receipt.route;
    expect(validate("openwall-receipt", receipt).ok).toBe(false);
  });
});
