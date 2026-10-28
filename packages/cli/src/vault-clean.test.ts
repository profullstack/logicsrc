import { describe, expect, it } from "vitest";
import { archiveSlot, archiveVaultName, findDead, jwtHosts, urlHosts } from "./vault-clean.js";

const jwt = (payload: object) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.c2ln`;

describe("urlHosts", () => {
  it("finds hosts in URLs, connection strings and multi-URL values", () => {
    expect(urlHosts("https://abc.supabase.co")).toEqual(["abc.supabase.co"]);
    expect(urlHosts("postgres://u:p@db.abc.supabase.co:5432/postgres?sslmode=require")).toEqual(["db.abc.supabase.co"]);
    expect(urlHosts("a=https://One.example.com/x b=redis://two.example.org")).toEqual(["one.example.com", "two.example.org"]);
  });
  it("ignores values without a URL", () => {
    expect(urlHosts("sk_live_abc123")).toEqual([]);
    expect(urlHosts("http://localhost:3000")).toEqual([]);
  });
});

describe("jwtHosts", () => {
  it("maps a Supabase key's ref to its project host", () => {
    expect(jwtHosts(jwt({ ref: "odhaoehucfyrqhanthyq", role: "anon" }))).toEqual(["odhaoehucfyrqhanthyq.supabase.co"]);
  });
  it("reads the issuer host", () => {
    expect(jwtHosts(jwt({ iss: "https://auth.example.com/v1" }))).toEqual(["auth.example.com"]);
  });
  it("returns nothing for non-JWTs and self-hosted keys without a ref", () => {
    expect(jwtHosts("not.a.jwt")).toEqual([]);
    expect(jwtHosts(jwt({ iss: "supabase", role: "service_role" }))).toEqual([]);
  });
});

describe("findDead", () => {
  it("flags URL and token keys bound to a host that does not resolve, checking each host once", async () => {
    const asked: string[] = [];
    const check = async (h: string) => {
      asked.push(h);
      return h !== "goneabcdefghijklmnop.supabase.co";
    };
    const dead = await findDead(
      new Map([
        ["SUPABASE_URL", "https://goneabcdefghijklmnop.supabase.co"],
        ["ANON_KEY", jwt({ ref: "goneabcdefghijklmnop" })],
        ["LIVE_URL", "https://supabase.example.com"],
        ["PLAIN", "hunter2"]
      ]),
      check
    );
    expect([...dead.keys()].sort()).toEqual(["ANON_KEY", "SUPABASE_URL"]);
    expect(asked.filter((h) => h === "goneabcdefghijklmnop.supabase.co")).toHaveLength(1);
  });
});

describe("archiveSlot", () => {
  const now = new Date("2026-10-28T16:40:05.123Z");
  it("keeps the key's name when the archive has none", () => {
    expect(archiveSlot("K", "fp1", new Map(), now)).toBe("K");
  });
  it("skips a value the archive already holds", () => {
    expect(archiveSlot("K", "fp1", new Map([["K", "fp1"]]), now)).toBeNull();
  });
  it("never overwrites a different archived value", () => {
    expect(archiveSlot("K", "fp2", new Map([["K", "fp1"]]), now)).toBe("K__20261028T164005");
    expect(archiveSlot("K", "fp3", new Map([["K", "fp1"], ["K__20261028T164005", "fp2"]]), now)).toBe("K__20261028T164005_2");
  });
});

it("names the archive vault after the live one", () => {
  expect(archiveVaultName("threatcrush", "prod")).toBe("threatcrush--prod-archive");
});
