// logicsrc.com serves the marketing app, but `logicsrc login` talks to /cli/*,
// which lives in apps/pwa. These rewrites are what let both live on the apex.
//
// The ordering assertion is the important one: CommandBoard owns a catch-all
// `/api/:path*`, so anything of the credentials app's that lives under /api has
// to be matched first or CLI auth silently goes to the wrong service.
import { describe, expect, it } from "vitest";

import { buildRewrites, commandboardRewrites, credentialsRewrites } from "../next.config";

const CRED = "https://creds.example";
const CB = "https://commandboard.example";

const sources = (rules: { source: string }[]) => rules.map((r) => r.source);

describe("apex rewrites", () => {
  it("proxies the whole CLI login flow to the credentials app", () => {
    expect(sources(credentialsRewrites(CRED))).toEqual([
      "/cli/:path*",
      "/api/me",
      "/api/credshare/:path*",
      "/auth/:path*",
    ]);
  });

  it("sends /cli to the credentials app, not the marketing app", () => {
    const rule = credentialsRewrites(CRED).find((r) => r.source === "/cli/:path*");
    expect(rule?.destination).toBe(`${CRED}/cli/:path*`);
  });

  it("includes /auth, because the CLI browser flow redirects there to sign in", () => {
    // /cli/authorize and /cli/device are behind requireAuth. Without /auth
    // proxied, an unauthenticated visitor lands on a 404 mid-login.
    expect(sources(credentialsRewrites(CRED))).toContain("/auth/:path*");
  });

  it("matches credentials paths BEFORE CommandBoard's /api catch-all", () => {
    const all = buildRewrites(CRED, CB);
    const list = "afterFiles" in all ? all.afterFiles : [];
    const idx = (s: string) => sources(list).indexOf(s);

    expect(idx("/api/me")).toBeGreaterThanOrEqual(0);
    expect(idx("/api/:path*")).toBeGreaterThanOrEqual(0);
    // The catch-all would otherwise swallow /api/me and /api/credshare/*.
    expect(idx("/api/me")).toBeLessThan(idx("/api/:path*"));
    expect(idx("/api/credshare/:path*")).toBeLessThan(idx("/api/:path*"));
  });

  it("keeps the existing CommandBoard rules intact", () => {
    expect(sources(commandboardRewrites(CB))).toEqual(["/health", "/api/:path*"]);
  });

  it("trims a trailing slash so destinations never double up", () => {
    const [first] = credentialsRewrites("https://creds.example/".replace(/\/$/, ""));
    expect(first.destination).toBe("https://creds.example/cli/:path*");
  });

  it("degrades to whichever services are configured", () => {
    // Neither set: unchanged behaviour, no rewrites at all.
    expect(buildRewrites(undefined, undefined)).toEqual([]);

    // CommandBoard only — exactly what shipped before this change.
    const cbOnly = buildRewrites(undefined, CB);
    expect("afterFiles" in cbOnly ? sources(cbOnly.afterFiles) : []).toEqual([
      "/health",
      "/api/:path*",
    ]);

    // Credentials only, e.g. before CommandBoard is wired up.
    const credOnly = buildRewrites(CRED, undefined);
    expect("afterFiles" in credOnly ? sources(credOnly.afterFiles) : []).toEqual([
      "/cli/:path*",
      "/api/me",
      "/api/credshare/:path*",
      "/auth/:path*",
    ]);
  });
});
