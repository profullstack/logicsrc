import { describe, expect, it } from "vitest";
import { validateErrand } from "./load.js";
import { isLockout, outcomeOf, solverPermitted, stepFor } from "./pages.js";
import { ftbExample } from "./testing.js";
import { checkThrottle, emptyLedger, keyFor, LIMITS, lockoutMs, recordAttempt, recordLockout } from "./throttle.js";
import type { CaptchaStep, Errand } from "./types.js";

const page = (url: string, title = "", text = "", errors: string[] = []) => ({ url, title, text, errors, fields: [] });

describe("which step a page is", () => {
  const e = ftbExample();
  it("a wait step whose title and selector both fit", () => {
    expect(stepFor(e, page("https://webapp.ftb.ca.gov/x", "Challenge Validation"), { "#sec-cpt-if": true })?.id).toBe("bot-check");
    // All given parts must fit: the title alone is not enough.
    expect(stepFor(e, page("https://webapp.ftb.ca.gov/x", "Challenge Validation"), { "#sec-cpt-if": false })?.id).toBe("form");
  });

  it("falls back to the page step with no match", () => {
    expect(stepFor(e, page("https://webapp.ftb.ca.gov/MyFTBAccess/Registration/NewAccount", "Registration"), {})?.id).toBe("form");
  });

  it("an identity provider's origin is its gate", () => {
    const withId: Errand = { ...e, steps: [...e.steps, { id: "id-me", kind: "identity-proofing", provider: "ID.me", origins: ["https://api.id.me"], why: "yours" }] };
    expect(stepFor(withId, page("https://api.id.me/en/session"), {})?.id).toBe("id-me");
  });
});

describe("outcomes", () => {
  const e = ftbExample();
  it("tests rejected outcomes first, against the errors when there are any", () => {
    const p = page("https://webapp.ftb.ca.gov/c", "Confirmation", "Registration confirmation", ["The information does not match our records."]);
    expect(outcomeOf(e, p)?.name).toBe("rejected");
  });

  it("reads the page text when there are no errors", () => {
    expect(outcomeOf(e, page("https://webapp.ftb.ca.gov/c", "x", "Registration Confirmation. We will mail you a PIN."))?.name).toBe("registered");
    expect(outcomeOf(e, page("https://webapp.ftb.ca.gov/c", "x", "Please enter your name"))).toBeNull();
  });

  it("needs both text and url when both are given", () => {
    const both: Errand = { ...e, outcomes: [{ name: "done", kind: "success", text: "done", url: "/finished$" }] };
    expect(outcomeOf(both, page("https://webapp.ftb.ca.gov/finished", "", "done"))?.name).toBe("done");
    expect(outcomeOf(both, page("https://webapp.ftb.ca.gov/other", "", "done"))).toBeNull();
  });

  it("knows a lockout by the file's signature or the default", () => {
    expect(isLockout(e, "Your account has been locked for 30 minutes")).toBe(true);
    expect(isLockout(e, "You have exceeded the allowed number of attempts")).toBe(true);
    expect(isLockout(e, "Welcome")).toBe(false);
    const own: Errand = { ...e, metadata: { lockout: { text: "come back tomorrow", duration: "PT24H" } } };
    expect(isLockout(own, "Please come back tomorrow")).toBe(true);
    expect(isLockout(own, "account locked")).toBe(false);
    expect(lockoutMs(own)).toBe(24 * 3_600_000);
    expect(lockoutMs(e)).toBe(LIMITS.lockoutMs);
  });
});

describe("captcha solver gating", () => {
  const captcha: CaptchaStep = { id: "cap", kind: "captcha", match: { selector: ".g-recaptcha" }, solver: "allowed" };
  const commercial = (over: Partial<Errand> = {}): Errand => ({
    type: "logicsrc.openerrand",
    version: "0.1",
    name: "newsletter",
    title: "Sign up",
    site: { name: "Shop", sector: "commercial", origins: ["https://shop.example"], start: ["https://shop.example/"] },
    inputs: { email: { type: "email", sensitivity: "personal", sources: [{ from: "prompt" }] } },
    steps: [{ id: "form", kind: "page" }, captcha],
    outcomes: [{ name: "ok", kind: "success", text: "thanks" }],
    ...over,
  });

  it("allows a solver only on a commercial or other site with nothing sensitive, as the file says", () => {
    expect(validateErrand(commercial())).toEqual([]);
    expect(solverPermitted(commercial(), captcha)).toBe(true);
    expect(solverPermitted(commercial(), { ...captcha, solver: "forbidden" })).toBe(false);
    expect(solverPermitted(commercial(), { ...captcha, solver: undefined })).toBe(false);
  });

  for (const sector of ["government", "tax", "financial", "healthcare", "identity-provider"] as const) {
    it(`never on a ${sector} site, even when the file says allowed (and the validator rejects the file)`, () => {
      const e = commercial({ site: { name: "x", sector, origins: ["https://x.example"], start: ["https://x.example/"] } });
      expect(solverPermitted(e, captcha)).toBe(false);
      expect(validateErrand(e).join(" ")).toMatch(/captcha solver is never allowed/);
    });
  }

  it("never without a stated sector, with a secret input, or with a declaration", () => {
    expect(solverPermitted(commercial({ site: { name: "x", origins: ["https://x.example"], start: ["https://x.example/"] } }), captcha)).toBe(false);
    expect(solverPermitted(commercial({ inputs: { pw: { type: "string", sensitivity: "secret", sources: [{ from: "prompt" }] } } }), captcha)).toBe(false);
    expect(solverPermitted(commercial({ steps: [{ id: "form", kind: "page" }, captcha, { id: "d", kind: "declare", statement: "x", why: "y" }] }), captcha)).toBe(false);
  });
});

describe("throttle", () => {
  const e = ftbExample();
  const key = keyFor(e);
  const t0 = new Date("2026-10-04T10:00:00Z");
  const at = (min: number) => new Date(t0.getTime() + min * 60_000);

  it("spaces runs on one site 2 minutes apart", () => {
    const l = recordAttempt(emptyLedger(), key, t0);
    expect(checkThrottle(l, key, at(1))).toMatchObject({ ok: false, lockout: false });
    expect(checkThrottle(l, { ...key, account: "other", errand: "ftb-activate-business" }, at(1)).ok).toBe(false);
    expect(checkThrottle(l, key, at(2)).ok).toBe(true);
  });

  it("allows 2 runs in 30 minutes and 4 a day per errand and account", () => {
    let l = recordAttempt(emptyLedger(), key, t0);
    l = recordAttempt(l, key, at(3));
    expect(checkThrottle(l, key, at(10))).toMatchObject({ ok: false, reason: expect.stringMatching(/2 runs/) });
    expect(checkThrottle(l, { ...key, account: "personal" }, at(10)).ok).toBe(true);
    l = recordAttempt(l, key, at(40));
    l = recordAttempt(l, key, at(80));
    expect(checkThrottle(l, key, at(200))).toMatchObject({ ok: false, reason: expect.stringMatching(/4 runs/) });
    expect(checkThrottle(l, key, at(24 * 60 + 1)).ok).toBe(true);
  });

  it("--force lifts the caps and never a lockout", () => {
    let l = recordAttempt(emptyLedger(), key, t0);
    expect(checkThrottle(l, key, at(1), true).ok).toBe(true);
    l = recordLockout(l, key, at(1));
    expect(checkThrottle(l, key, at(10), true)).toMatchObject({ ok: false, lockout: true });
    // The lock is per site and account: another errand on the same account is held too.
    expect(checkThrottle(l, { ...key, errand: "ftb-activate-business" }, at(10), true)).toMatchObject({ ok: false, lockout: true });
    expect(checkThrottle(l, key, at(1 + 35), true).ok).toBe(true);
  });

  it("a shorter later lock never shortens a longer one", () => {
    let l = recordLockout(emptyLedger(), key, t0, 24 * 3_600_000);
    l = recordLockout(l, key, at(5));
    expect(checkThrottle(l, key, at(60), true).ok).toBe(false);
  });
});
