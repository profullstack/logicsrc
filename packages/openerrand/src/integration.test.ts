/**
 * The FTB worked example, run unchanged by `logicsrc errand run` in real
 * headless Chrome against a local fake site. Chrome resolves
 * webapp.ftb.ca.gov to the fake server and every other hostname to nothing,
 * so the real site is unreachable from this test. All data is fictional.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findChrome } from "./browser.js";
import { type Deps, registerErrandCommands } from "./commands.js";
import { FAKE, type FakeSite, startFakeSite } from "./fake-site.js";
import type { RunRecord } from "./store.js";
import { ftbExamplePath, tempDir } from "./testing.js";
import { type LogicsrcExec, parseEnv, serializeEnv } from "./vault.js";

const hasOpenssl = (() => {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const chrome = findChrome();
const enabled = Boolean(chrome && hasOpenssl && !process.env.OPENERRAND_SKIP_BROWSER);

describe.skipIf(!enabled)("logicsrc errand run, the FTB example, real Chrome, fake site", () => {
  let site: FakeSite;
  let home: string;
  let extractor: string;
  let remote: Record<string, string>;
  const out: string[] = [];
  const say: string[] = [];

  beforeAll(async () => {
    site = await startFakeSite();
    if (!Number.isInteger(site.port)) throw new Error("fake site has no port");
    home = tempDir("openerrand-it-");
    // The extractor the person would point at their returns: here it prints fictional records.
    extractor = join(home, "extract.mjs");
    const records = [
      { form: "CA 540", field: "first name", value: FAKE.firstName, year: 2025, file: "2025/540.pdf", page: 1 },
      { form: "CA 540", field: "last name", value: FAKE.lastName, year: 2025, file: "2025/540.pdf", page: 1 },
      { form: "CA 540", field: "street address", value: "1234 Maple St", year: 2025, file: "2025/540.pdf", page: 1 },
      { form: "CA 540", field: "ZIP code", value: "95814-0001", year: 2025, file: "2025/540.pdf", page: 1 },
      { form: "CA 100S", field: "California corporation number", value: FAKE.corpId, year: 2025, file: "2025/100S.pdf", page: 1 },
      { form: "CA 100S", field: "line 20", label: "Net income for tax purposes", value: "48,210", year: 2025, file: "2025/100S.pdf", page: 3 },
      { form: "CA 100S", field: "line 20", label: "Net income for tax purposes", value: "39,875", year: 2024, file: "2024/100S.pdf", page: 3 },
    ];
    writeFileSync(extractor, `let input = ""; process.stdin.on("data", (c) => (input += c)); process.stdin.on("end", () => { JSON.parse(input); process.stdout.write(${JSON.stringify(JSON.stringify(records))}); });`);
    remote = { OTHER_TEAM_KEY: "keep me" };
  });

  afterAll(async () => {
    await site?.close();
  });

  function program(): Command {
    const fakeTeams: LogicsrcExec = (args) => {
      // logicsrc teams pull/push against an in-memory vault: the pull-merge-push is what is under test.
      const file = args[args.indexOf("--env") + 1]!;
      if (args[0] === "teams" && args[1] === "pull") writeFileSync(file, serializeEnv(remote));
      else if (args[0] === "teams" && args[1] === "push") remote = parseEnv(readFileSync(file, "utf8"));
      else return { status: 1, stdout: "", stderr: "unexpected" };
      return { status: 0, stdout: "", stderr: "" };
    };
    const deps: Partial<Deps> = {
      env: { ...process.env, LOGICSRC_ERRAND_HOME: home },
      out: (line) => out.push(line),
      say: (line) => {
        say.push(line);
        // Whoever holds the phone writes the code to the file the runner names.
        if (/WAITING for the sms code/.test(line)) relayNext();
      },
      interactive: false,
      logicsrc: fakeTeams,
      chromeArgs: [
        `--host-resolver-rules=MAP webapp.ftb.ca.gov:443 127.0.0.1:${site.port}, MAP * ~NOTFOUND`,
        "--ignore-certificate-errors",
        // CI runners often lack the user namespaces Chrome's sandbox needs.
        ...(process.env.CI ? ["--no-sandbox"] : []),
      ],
      pollMs: 250,
      rereadMs: 300,
      settleMs: 300,
    };
    const p = new Command();
    p.name("logicsrc").enablePositionalOptions().exitOverride();
    registerErrandCommands(p.command("errand"), deps);
    return p;
  }

  const codes = ["000000", FAKE.code];
  function relayNext(): void {
    const code = codes.shift();
    if (code) setTimeout(() => writeFileSync(join(home, "codes", "ftb-register-business.code"), `${code}\n`, { mode: 0o600 }), 300);
  }

  const lastRecord = (): RunRecord => JSON.parse(out.filter((l) => l.startsWith("{")).at(-1)!) as RunRecord;
  const args = (...extra: string[]) => ["node", "logicsrc", "errand", "run", ftbExamplePath(), "--extractor", `${process.execPath} ${extractor}`, "--input", "email=jane@example.com", "--input", `phone=${FAKE.phone}`, "--vault", "teams:test/ftb/prod", "--json", ...extra];

  it("a dry run stops before the business page's forward button", async () => {
    await program().parseAsync(args("--dry-run"));
    expect(process.exitCode).toBe(0);
    expect(lastRecord()).toMatchObject({ kind: "dry-run", page: "https://webapp.ftb.ca.gov/MyFTBAccess/Registration/Business" });
    expect(site.posted["/MyFTBAccess/Registration/Business"]).toBeUndefined();
    // The challenge interstitial was waited out, not solved.
    expect(site.requests.some((r) => r.path.endsWith("/Challenge"))).toBe(true);
    expect(say.join("\n")).toContain("declaration (not ticked)");
  }, 120_000);

  it("a run with --declare registers, relays the code after a wrong one, pushes the login into the team vault, and keeps the card local", async () => {
    site.requests.length = 0;
    await program().parseAsync(args("--declare"));
    const record = lastRecord();
    expect(record, say.join("\n")).toMatchObject({ outcome: "registered", kind: "success", vault: "teams test/ftb/prod" });
    expect(process.exitCode).toBe(0);
    expect(record.card?.id).toMatch(/^pin-letter\//);
    expect(record.waiting?.what).toBe("MyFTB PIN letter");

    // What the site received: the shared secret once, the declaration ticked, the code on the second try.
    expect(site.posted["/MyFTBAccess/Registration/Business"]).toMatchObject({ NetInc: FAKE.netIncome, TaxYear: "2025", Decl: "true", Role: "business", Zip: FAKE.zip, AddrNum: "1234" });
    expect(site.requests.filter((r) => r.method === "POST" && r.path.endsWith("/Business"))).toHaveLength(1);
    expect(site.requests.filter((r) => r.method === "POST" && r.path.endsWith("/Code"))).toHaveLength(2);
    // Rule 11: the user agent says Chrome, not HeadlessChrome.
    expect(site.requests.filter((r) => r.userAgent.includes("HeadlessChrome")).map((r) => `${r.method} ${r.path}`)).toEqual([]);

    // The team vault: merged, nothing dropped, the generated login in it.
    const profile = site.posted["/MyFTBAccess/Registration/Profile"]!;
    expect(remote).toMatchObject({ OTHER_TEAM_KEY: "keep me", FTB_BUSINESS_USERNAME: profile.UserName, FTB_BUSINESS_PASSWORD: profile.Password, FTB_BUSINESS_EMAIL: "jane@example.com" });
    expect(Object.keys(JSON.parse(remote.FTB_BUSINESS_SECURITY_ANSWERS!))).toHaveLength(3);

    // Rule 8: values never reach the page log or the run record; secrets never reach the terminal.
    const log = readFileSync(join(home, "pages", "ftb-register-business.jsonl"), "utf8");
    for (const value of [profile.Password!, FAKE.netIncome, FAKE.code, "jane@example.com", FAKE.phone]) {
      expect(log).not.toContain(value);
      expect(JSON.stringify(record)).not.toContain(value);
    }
    expect(say.join("\n")).not.toContain(profile.Password!);
    expect(say.join("\n")).not.toContain(FAKE.netIncome);

    // `errand status` shows the card from the local run record.
    out.length = 0;
    await program().parseAsync(["node", "logicsrc", "errand", "status"]);
    expect(out.join("\n")).toMatch(/ftb-register-business {2}success \(registered\)/);
    expect(out.join("\n")).toContain("ftb activate business --pin <PIN from the letter>");
  }, 180_000);

  it("a third run inside the window is refused by the throttle before Chrome starts", async () => {
    const before = site.requests.length;
    await program().parseAsync(args("--declare"));
    expect(process.exitCode).toBe(4);
    expect(site.requests.length).toBe(before);
    process.exitCode = 0;
  }, 30_000);
});
