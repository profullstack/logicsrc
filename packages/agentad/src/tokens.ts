// Signed, single-use tracking tokens for impressions and clicks. The exchange
// mints an impression_token when it serves an ad; confirming that impression
// mints a click_token. Tokens are HMAC-signed so a publisher cannot forge a
// billable event, and they carry the pricing context needed to settle.

import { createHmac, timingSafeEqual } from "node:crypto";

export type TokenKind = "impression" | "click";

export interface TokenPayload {
  /** Token kind. */
  k: TokenKind;
  /** request_id the token was minted for. */
  rid: string;
  /** placement id. */
  pid: string;
  /** ad id. */
  aid: string;
  /** campaign id. */
  cid: string;
  /** pricing model of the winning ad. */
  model: "cpm" | "cpc" | "cpa" | "flat";
  /** per-unit charge for the winner at the second-price clearing level. */
  charge: number;
  /** currency code. */
  cur: string;
  /** unix ms expiry. */
  exp: number;
  /** random nonce to keep tokens unique + single-use. */
  n: string;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function mintToken(secret: string, payload: TokenPayload): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(secret, body)}`;
}

export interface VerifyResult {
  ok: boolean;
  reason?: "malformed" | "bad_signature" | "expired";
  payload?: TokenPayload;
}

export function verifyToken(secret: string, token: string, now = Date.now()): VerifyResult {
  const dot = token.indexOf(".");
  if (dot <= 0) return { ok: false, reason: "malformed" };

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(secret, body);

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (typeof payload.exp === "number" && payload.exp < now) {
    return { ok: false, reason: "expired", payload };
  }

  return { ok: true, payload };
}
