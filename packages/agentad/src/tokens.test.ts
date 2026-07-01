import { describe, expect, it } from "vitest";
import { mintToken, verifyToken, type TokenPayload } from "./tokens.js";

const base: TokenPayload = {
  k: "impression",
  rid: "req-1",
  pid: "plc-1",
  aid: "ad-1",
  cid: "cmp-1",
  model: "cpc",
  charge: 0.5,
  cur: "USD",
  exp: 2_000_000_000_000,
  n: "abc123"
};

describe("AgentAd tracking tokens", () => {
  it("round-trips a signed payload", () => {
    const token = mintToken("s3cret", base);
    const result = verifyToken("s3cret", token, 1_000);
    expect(result.ok).toBe(true);
    expect(result.payload).toEqual(base);
  });

  it("rejects a token signed with a different secret", () => {
    const token = mintToken("s3cret", base);
    const result = verifyToken("other", token, 1_000);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("bad_signature");
  });

  it("rejects a tampered body", () => {
    const token = mintToken("s3cret", base);
    const [, sig] = token.split(".");
    const forged = `${Buffer.from(JSON.stringify({ ...base, charge: 9999 })).toString("base64url")}.${sig}`;
    expect(verifyToken("s3cret", forged).ok).toBe(false);
  });

  it("rejects expired tokens", () => {
    const token = mintToken("s3cret", { ...base, exp: 500 });
    const result = verifyToken("s3cret", token, 1_000);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("expired");
  });

  it("flags malformed tokens", () => {
    expect(verifyToken("s3cret", "not-a-token").reason).toBe("malformed");
  });
});
