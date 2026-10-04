import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CaptchaSolver } from "./captcha.js";
import { type DocumentRecord, resolveInputs } from "./inputs.js";
import { runErrand, type RunDeps } from "./run.js";
import { type Store } from "./store.js";
import { FakeDriver, type FakePage, field, ftbExample, tempStore } from "./testing.js";
import { recordLockout, keyFor } from "./throttle.js";
import type { Errand } from "./types.js";
import { fileVault, parseEnv } from "./vault.js";

const O = "https://webapp.ftb.ca.gov";
const NOW = new Date("2026-10-04T17:20:11Z");

/** Fictional returns: Jane Doe, 1234 Maple St, Sacramento 95814, corporation 1234567. */
const RECORDS: DocumentRecord[] = [
  { form: "CA 540", field: "first name", value: "Jane", year: 2025, file: "2025/540.pdf", page: 1 },
  { form: "CA 540", field: "last name", value: "Doe", year: 2025, file: "2025/540.pdf", page: 1 },
  { form: "CA 540", field: "street address", value: "1234 Maple St", year: 2025, file: "2025/540.pdf", page: 1 },
  { form: "CA 540", field: "ZIP code", value: "95814", year: 2025, file: "2025/540.pdf", page: 1 },
  { form: "CA 100S", field: "California corporation number", value: "1234567", year: 2025, file: "2025/100S.pdf", page: 1 },
  { form: "CA 100S", field: "line 20", label: "Net income for tax purposes", value: "48210", year: 2025, file: "2025/100S.pdf", page: 3 },
  { form: "CA 100S", field: "line 20", label: "Net income for tax purposes", value: "39875", year: 2024, file: "2024/100S.pdf", page: 3 },
];

interface SiteOptions {
  expectedIncome?: string;
  code?: string;
  lockout?: boolean;
  /** Where Terms goes instead of Profile. */
  termsTo?: string;
  extraBusinessField?: boolean;
  challenge?: number;
}

/** A scripted MyFTB: Terms, Profile, (challenge), Business, Phone, Code, Confirmation. */
function site(options: SiteOptions = {}): FakeDriver {
  const questions = [{ value: "", text: "Select" }, { value: "1", text: "First pet?" }, { value: "2", text: "First car?" }, { value: "3", text: "First school?" }];
  let challengeReads = 0;
  const pages: Record<string, FakePage | ((d: FakeDriver) => FakePage)> = {
    [`${O}/MyFTBAccess/Registration/NewAccount`]: {
      title: "Registration | Terms",
      fields: [field({ id: "ReadTerms", type: "checkbox", label: "I have read the terms", required: true }), field({ id: "AcceptTerms", type: "checkbox", label: "I accept", required: true })],
    },
    [`${O}/Profile`]: {
      title: "Registration | Profile",
      fields: [
        field({ id: "FstName", label: "First Name", required: true }),
        field({ id: "MInitial", label: "Middle Initial" }),
        field({ id: "LstName", label: "Last Name", required: true }),
        field({ id: "UserName", label: "User Name", required: true }),
        field({ id: "ReUserName", label: "Confirm User Name", required: true }),
        field({ id: "Email", type: "email", label: "Email", required: true }),
        field({ id: "ReEmail", type: "email", label: "Confirm Email", required: true }),
        field({ id: "Password", type: "password", label: "Password", required: true }),
        field({ id: "RePassword", type: "password", label: "Confirm Password", required: true }),
        field({ id: "SecQ1", type: "select-one", label: "Security Question 1", options: questions, required: true }),
        field({ id: "SecA1", type: "text", label: "Answer 1", required: true, question: "First pet?" }),
      ],
    },
    [`${O}/Challenge`]: (d) => {
      challengeReads += 1;
      if (challengeReads > (options.challenge ?? 0)) {
        // The page's own script finished its proof of work and moved on.
        d.current = `${O}/Business`;
        return d.page();
      }
      return { title: "Challenge Validation", hits: ["#sec-cpt-if"], fields: [] };
    },
    [`${O}/Business`]: (d) => ({
      title: "Registration | Business",
      errors: d.current.endsWith("?err") ? ["The information you entered does not match our records."] : d.current.endsWith("?locked") ? ["Your account has been locked."] : [],
      fields: [
        field({ id: "RoleInd", name: "Role", type: "radio", label: "Individual" }),
        field({ id: "RoleBus", name: "Role", type: "radio", label: "Business Representative", required: true }),
        field({ id: "CoType", type: "select-one", label: "Type of Company", options: [{ value: "", text: "Select" }, { value: "C", text: "Corporation" }, { value: "P", text: "Partnership" }] }),
        field({ id: "FormType", type: "select-one", label: "Form type", options: [{ value: "", text: "Select" }, { value: "100", text: "100" }, { value: "100S", text: "100S" }] }),
        field({ id: "Year", type: "select-one", label: "Tax year", options: [{ value: "", text: "Select" }, { value: "2025", text: "2025" }, { value: "2024", text: "2024" }] }),
        field({ id: "CorpNo", label: "California corporation number", required: true }),
        field({ id: "Zip", label: "ZIP Code", required: true }),
        field({ id: "AddrNum", label: "Numbers in your mailing address", required: true }),
        field({ id: "NetInc", label: "Net income for tax purposes", required: true }),
        field({ id: "Decl", type: "checkbox", label: "I declare under penalty of perjury that the information is true", required: true }),
        ...(options.extraBusinessField ? [field({ id: "Mystery", label: "Favourite colour", required: true })] : []),
      ],
    }),
    [`${O}/Phone`]: { title: "Registration | Phone", fields: [field({ id: "Ph", type: "tel", label: "Phone Number", required: true }), field({ id: "Txt", name: "How", type: "radio", label: "Send me a text message" })] },
    [`${O}/Code`]: (d) => ({
      title: "Registration | Code",
      errors: d.current.endsWith("?wrong") ? ["The code you entered is incorrect."] : [],
      fields: [field({ id: "VerificationCode", label: "Enter the verification code", required: true })],
    }),
    [`${O}/Confirmation`]: { title: "Registration Confirmation", text: "Registration Confirmation. Your account was successfully created. We will mail you a PIN.", fields: [] },
    [`${O}/Locked`]: { title: "Locked", text: "Your account has been locked. Try again in 30 minutes.", fields: [] },
  };
  for (const url of [`${O}/Business?err`, `${O}/Business?locked`]) pages[url] = pages[`${O}/Business`]!;
  pages[`${O}/Code?wrong`] = pages[`${O}/Code`]!;
  return new FakeDriver(pages, (url, values) => {
    const path = url.replace(O, "").replace(/\?.*$/, "");
    if (path === "/MyFTBAccess/Registration/NewAccount") return options.termsTo ?? `${O}/Profile`;
    if (path === "/Profile") return options.challenge !== undefined ? `${O}/Challenge` : `${O}/Business`;
    if (path === "/Business") {
      if (options.lockout) return `${O}/Locked`;
      if (values["#Decl"] !== true) return `${O}/Business?err`;
      return values["#NetInc"] === (options.expectedIncome ?? "48210") ? `${O}/Phone` : `${O}/Business?err`;
    }
    if (path === "/Phone") return `${O}/Code`;
    if (path === "/Code") return values["#VerificationCode"] === (options.code ?? "482913") ? `${O}/Confirmation` : `${O}/Code?wrong`;
    return `${O}/Nowhere`;
  });
}

async function deps(store: Store, driver: FakeDriver, over: Partial<RunDeps> & { errand?: Errand; candidate?: number } = {}): Promise<RunDeps & { lines: string[] }> {
  const errand = over.errand ?? ftbExample();
  const inputs = await resolveInputs(errand, {
    extractor: { extract: async () => RECORDS },
    overrides: Object.fromEntries(Object.entries({ email: "jane@example.com", phone: "5555550100" }).filter(([k]) => k in (errand.inputs ?? {}))),
    now: NOW,
    random: () => 3,
    ...(over.candidate ? { candidate: over.candidate } : {}),
  });
  const lines: string[] = [];
  return {
    errand,
    source: "ftb-register-business.json",
    sha256: "0".repeat(64),
    inputs,
    store,
    openDriver: async () => driver,
    declare: false,
    dryRun: false,
    headful: false,
    interactive: false,
    prompt: async () => null,
    say: (line) => lines.push(line),
    now: () => NOW,
    random: () => 3,
    vault: null,
    fallbackVault: fileVault(store.credentialsFile(errand.name)),
    pollMs: 5,
    rereadMs: 0,
    lines,
    ...over,
  };
}

/** Write the code file when the runner says it is waiting: `codes` in order, one per wait. */
function relay(store: Store, d: { say: (line: string) => void; lines: string[] }, codes: string[]): void {
  const say = d.say;
  d.say = (line) => {
    say(line);
    if (/WAITING for the sms code/.test(line)) {
      const code = codes.shift();
      if (code) setTimeout(() => writeFileSync(store.codeFile("ftb-register-business"), `${code}\n`), 20);
    }
  };
}

describe("a full run", () => {
  it("registers with --declare, takes the code from the file after a wrong one, writes the login, and ends on the PIN-letter card", async () => {
    const store = tempStore();
    const driver = site();
    const d = await deps(store, driver, { declare: true });
    relay(store, d, ["000000", "482913"]);
    const { record } = await runErrand(d);

    expect(record).toMatchObject({ outcome: "registered", kind: "success", page: `${O}/Confirmation`, handoff: expect.stringMatching(/^pin-letter\//) });
    expect(record.waiting).toEqual({ step: "pin-letter", what: "MyFTB PIN letter", expires_on: "2026-10-25", resume: "ftb-activate-business" });
    expect(record.card?.steps[1]).toContain("2026-10-25");
    expect(record.candidate).toEqual({ year: 2025, form: "CA 100S", field: "line 20", source: "2025/100S.pdf p3" });
    // Credentials written (to the 0600 fallback here) before success.
    const saved = parseEnv(readFileSync(store.credentialsFile("ftb-register-business"), "utf8"));
    expect(saved.FTB_BUSINESS_EMAIL).toBe("jane@example.com");
    expect(saved.FTB_BUSINESS_PASSWORD).toBe(d.inputs.get("password"));
    expect(JSON.parse(saved.FTB_BUSINESS_SECURITY_ANSWERS!)).toHaveProperty(["First pet?"]);
    // The business page was submitted exactly once, with the declaration ticked after the values.
    expect(driver.submits.filter((s) => s.url.startsWith(`${O}/Business`))).toHaveLength(1);
    const lines = d.lines.join("\n");
    expect(lines.indexOf("net income = ••••")).toBeLessThan(lines.indexOf("declaration ticked on your --declare"));
    expect(lines).toContain("the site said: The code you entered is incorrect.");
    // Rule 8: no value in the page log or the run record.
    const log = readFileSync(store.pageLog("ftb-register-business"), "utf8");
    const record_ = JSON.stringify(record);
    for (const secret of [d.inputs.get("password")!, "48210", "482913", "jane@example.com", "Maple", "5555550100"]) {
      expect(log).not.toContain(secret);
      expect(record_).not.toContain(secret);
    }
    expect(lines).not.toContain(d.inputs.get("password")!);
    expect(lines).not.toContain("48210");
    expect(store.loadLedger().attempts).toHaveLength(1);
    expect(driver.closed).toBe(true);
  });

  it("waits out a challenge the page clears by itself", async () => {
    const store = tempStore();
    const d = await deps(store, site({ challenge: 2 }), { declare: true });
    relay(store, d, ["482913"]);
    const errand = ftbExample();
    errand.steps[0] = { ...errand.steps[0]!, poll: "PT0S" } as Errand["steps"][number];
    const { record } = await runErrand({ ...d, errand });
    expect(record.reason).toBeUndefined();
    expect(record.kind).toBe("success");
    expect(d.lines.join("\n")).toContain("proof of work");
  });
});

describe("the declare gate", () => {
  it("without --declare stops on the page, prints the statement word for word, and submits nothing there", async () => {
    const store = tempStore();
    const driver = site();
    const d = await deps(store, driver);
    const { record } = await runErrand(d);
    expect(record).toMatchObject({ kind: "stopped", reason: expect.stringMatching(/^gate: declaration needs --declare/) });
    expect(driver.submits.map((s) => s.url)).not.toContain(`${O}/Business`);
    expect(driver.fills.find((f) => f.selector === "#Decl")).toBeUndefined();
    expect(d.lines).toContain('  "I declare under penalty of perjury that the information is true"');
  });
});

describe("the dry run", () => {
  it("fills up to the shared-secret page, shows it masked, and stops before its forward button without counting an attempt", async () => {
    const store = tempStore();
    const driver = site();
    const { record } = await runErrand(await deps(store, driver, { dryRun: true }));
    expect(record).toMatchObject({ kind: "dry-run", page: `${O}/Business` });
    expect(driver.submits.map((s) => s.url)).toEqual([`${O}/MyFTBAccess/Registration/NewAccount`, `${O}/Profile`]);
    expect(driver.fills.find((f) => f.selector === "#Decl")).toBeUndefined();
    expect(store.loadLedger().attempts).toHaveLength(0);
  });
});

describe("a rejected shared secret", () => {
  it("ends the run, retries nothing, and lists the other candidates for the person to choose", async () => {
    const store = tempStore();
    const driver = site({ expectedIncome: "39875" });
    const d = await deps(store, driver, { declare: true });
    const { record } = await runErrand(d);
    expect(record).toMatchObject({ outcome: "rejected", kind: "rejected" });
    expect(driver.submits.filter((s) => s.url.startsWith(`${O}/Business`))).toHaveLength(1);
    expect(record.others).toEqual([{ index: 2, year: 2024, form: "CA 100S", field: "line 20", source: "2024/100S.pdf p3" }]);
    expect(d.lines).toContain("Nothing was retried.");
    expect(JSON.stringify(record)).not.toContain("39875");
  });

  it("the next run, with --candidate 2, submits the person's choice", async () => {
    const store = tempStore();
    const driver = site({ expectedIncome: "39875" });
    const d = await deps(store, driver, { declare: true, candidate: 2 });
    relay(store, d, ["482913"]);
    expect((await runErrand(d)).record.kind).toBe("success");
  });
});

describe("lockouts and the throttle", () => {
  it("records a lockout page and refuses the next run even with --force", async () => {
    const store = tempStore();
    const { record } = await runErrand(await deps(store, site({ lockout: true }), { declare: true }));
    expect(record).toMatchObject({ kind: "rejected" });
    expect(Object.keys(store.loadLedger().lockedUntil)).toEqual(["https://webapp.ftb.ca.gov|default"]);
    const later = new Date(NOW.getTime() + 10 * 60_000);
    const driver = site();
    const again = await runErrand(await deps(store, driver, { declare: true, force: true, now: () => later }));
    expect(again.record).toMatchObject({ kind: "stopped", reason: expect.stringMatching(/^throttle: the site locked/) });
    expect(driver.visits).toEqual([]);
  });

  it("refuses a third run inside 30 minutes, and --force lifts that cap", async () => {
    const store = tempStore();
    for (const min of [0, 3]) await runErrand(await deps(store, site(), { now: () => new Date(NOW.getTime() + min * 60_000) }));
    const at = () => new Date(NOW.getTime() + 6 * 60_000);
    expect((await runErrand(await deps(store, site(), { now: at }))).record.reason).toMatch(/^throttle: 2 runs/);
    expect((await runErrand(await deps(store, site(), { now: at, force: true }))).record.reason).toMatch(/^gate/);
  });

  it("a lockout recorded by another errand on the same site and account holds this one", async () => {
    const store = tempStore();
    const other = { ...ftbExample(), name: "ftb-activate-business" };
    store.saveLedger(recordLockout(store.loadLedger(), keyFor(other), NOW));
    expect((await runErrand(await deps(store, site(), { force: true }))).record.reason).toMatch(/locked/);
  });
});

describe("stops", () => {
  it("an unmatched required field stops the run and names it", async () => {
    const store = tempStore();
    const { record } = await runErrand(await deps(store, site({ extraBusinessField: true }), { declare: true }));
    expect(record.reason).toMatch(/^unmatched: no rule fills Favourite colour \(text, required\) \(id "Mystery"/);
  });

  it("a loop stops the run", async () => {
    const store = tempStore();
    const { record } = await runErrand(await deps(store, site({ termsTo: `${O}/MyFTBAccess/Registration/NewAccount` })));
    expect(record.reason).toMatch(/^loop: the same page came back 3 times/);
  });

  it("leaving the site stops the run", async () => {
    const store = tempStore();
    const { record } = await runErrand(await deps(store, site({ termsTo: "https://evil.example/" })));
    expect(record.reason).toMatch(/^off-site/);
  });

  it("a validation error on a later page ends the run as rejected", async () => {
    const store = tempStore();
    const driver = site();
    // Profile submits; the business page then shows an error because nothing was declared on a page that has no declare gate.
    const errand = ftbExample();
    errand.outcomes = errand.outcomes.filter((o) => o.kind !== "rejected");
    const d = await deps(store, driver, { errand, declare: true, candidate: 2 });
    const { record } = await runErrand(d);
    expect(record).toMatchObject({ kind: "rejected", outcome: "page-errors" });
  });
});

describe("identity proofing", () => {
  const errand = (): Errand => ({
    ...ftbExample(),
    steps: [...ftbExample().steps, { id: "id-me", kind: "identity-proofing", provider: "ID.me", origins: ["https://api.id.me"], handoff: "pin-letter", why: "ID.me may ask for a selfie. That is yours to do." }],
  });

  it("headless, it stops and tells the person, without reading the provider's page", async () => {
    const store = tempStore();
    const driver = site({ termsTo: "https://api.id.me/session" });
    driver.pages["https://api.id.me/session"] = { title: "ID.me", fields: [field({ id: "selfie", label: "Take a selfie", required: true })] };
    const readsBefore = () => driver.reads;
    const d = await deps(store, driver, { errand: errand() });
    const { record } = await runErrand(d);
    expect(record.reason).toMatch(/^gate: identity proofing with ID.me is yours/);
    expect(d.lines.join("\n")).toContain("ID.me: ID.me may ask for a selfie");
    expect(driver.fills.filter((f) => f.url.startsWith("https://api.id.me"))).toEqual([]);
    expect(readsBefore()).toBe(2); // Terms read twice (choices, then text); never the provider's page.
  });

  it("headful at a terminal, it waits untouched until the site is back", async () => {
    const store = tempStore();
    const driver = site({ termsTo: "https://api.id.me/session" });
    driver.pages["https://api.id.me/session"] = { title: "ID.me", fields: [] };
    setTimeout(() => (driver.current = `${O}/Profile`), 30);
    const d = await deps(store, driver, { errand: errand(), headful: true, interactive: true });
    const { record } = await runErrand(d);
    expect(record.reason).toMatch(/^gate: declaration/);
    expect(driver.fills.filter((f) => f.url.startsWith("https://api.id.me"))).toEqual([]);
  });
});

describe("captcha", () => {
  const commercial = (sector: "commercial" | "tax" = "commercial"): Errand => ({
    type: "logicsrc.openerrand",
    version: "0.1",
    name: "newsletter",
    title: "Sign up",
    site: { name: "Shop", sector, origins: ["https://shop.example"], start: ["https://shop.example/"] },
    inputs: { email: { type: "email", sensitivity: "personal", sources: [{ from: "literal", value: "jane@example.com" }] } },
    rules: [{ name: "email", label: "email", do: { text: "{{email}}" } }],
    steps: [{ id: "cap", kind: "captcha", match: { selector: ".g-recaptcha" }, solver: "allowed", why: "a test for people" }, { id: "form", kind: "page" }],
    outcomes: [{ name: "ok", kind: "success", text: "thanks" }],
  });
  const shop = (): FakeDriver => {
    let solved = false;
    const driver = new FakeDriver(
      {
        "https://shop.example/": () => (solved ? { title: "Sign up", fields: [field({ id: "e", label: "Email", required: true })] } : { title: "Check", hits: [".g-recaptcha"], fields: [] }),
        "https://shop.example/thanks": { title: "Thanks", text: "thanks", fields: [] },
      },
      () => "https://shop.example/thanks",
    );
    (driver as unknown as { solve: () => void }).solve = () => (solved = true);
    return driver;
  };

  it("headless with no solver: hands it to the person and stops", async () => {
    const store = tempStore();
    const d = await deps(store, shop(), { errand: commercial() });
    expect((await runErrand(d)).record.reason).toMatch(/^gate: a captcha is the person's/);
  });

  it("uses a given solver only where the errand allows one, and logs the use without the answer", async () => {
    const store = tempStore();
    const driver = shop();
    const used: string[] = [];
    const solver: CaptchaSolver = { service: "test-solver", solve: async (c) => (used.push(c.url), (driver as unknown as { solve: () => void }).solve(), true) };
    const d = await deps(store, driver, { errand: commercial(), solver });
    expect((await runErrand(d)).record.kind).toBe("success");
    expect(used).toEqual(["https://shop.example/"]);
    expect(readFileSync(store.pageLog("newsletter"), "utf8")).toContain('"captcha":{"url":"https://shop.example/","service":"test-solver"}');
  });

  it("never calls a solver on a tax site, even when one is given and the file says allowed", async () => {
    const store = tempStore();
    const used: string[] = [];
    const solver: CaptchaSolver = { service: "test-solver", solve: async (c) => (used.push(c.url), true) };
    const d = await deps(store, shop(), { errand: commercial("tax"), solver });
    expect((await runErrand(d)).record.reason).toMatch(/^gate: a captcha/);
    expect(used).toEqual([]);
  });
});

describe("resuming", () => {
  it("the errand a mail gate named marks that card done when it succeeds", async () => {
    const store = tempStore();
    store.saveRun({ errand: "x", name: "ftb-register-business", title: "t", sha256: "0", outcome: "registered", kind: "success", at: "2026-10-01T00:00:00.000Z", log: "", waiting: { step: "pin-letter", what: "PIN", resume: "ftb-activate-business" }, card: { id: "pin-letter/abc234", title: "PIN", steps: ["x"] } });
    const activate: Errand = { ...ftbExample(), name: "ftb-activate-business", inputs: {}, rules: [], steps: [{ id: "form", kind: "page" }], outcomes: [{ name: "activated", kind: "success", text: "activated" }], outputs: {}, handoffs: {} };
    const driver = new FakeDriver({ [`${O}/MyFTBAccess/Registration/NewAccount`]: { title: "Done", text: "Your account is activated.", fields: [] } }, () => "");
    const { record } = await runErrand(await deps(store, driver, { errand: activate }));
    expect(record.kind).toBe("success");
    expect(store.runs().find((r) => r.name === "ftb-register-business")?.card?.done).toBe(true);
  });
});

describe("the mail gate", () => {
  it("a rule that hands a field to a mail gate ends the run waiting, with the card", async () => {
    const store = tempStore();
    const errand = ftbExample();
    errand.rules = [{ name: "pin", label: "pin", do: { gate: "pin-letter" } }, ...errand.rules!];
    const driver = site({ termsTo: `${O}/Pin` });
    driver.pages[`${O}/Pin`] = { title: "Activate", fields: [field({ id: "Pin", label: "PIN from the letter", required: true })] };
    const { record } = await runErrand(await deps(store, driver, { errand }));
    expect(record).toMatchObject({ kind: "waiting", outcome: "pin-letter", waiting: { expires_on: "2026-10-25" } });
    expect(record.card?.command).toBe("ftb activate business --pin <PIN from the letter>");
  });
});
