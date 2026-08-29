import { describe, expect, it } from "vitest";

import { emitFixtures, fixturePayload, runConformance } from "./conformance.js";
import { openDatabase, parseDatabase } from "./database.js";
import { hasErrors, validateDatabase, validateItem } from "./validate.js";
import type { Item } from "./types.js";

describe("the conformance suite", () => {
  it("reports the reference implementation as conformant", async () => {
    const report = await runConformance();

    const failures = report.results.filter((r) => r.status === "fail");
    // Name the failures rather than asserting a count: a failing conformance
    // run should say which requirement broke, in the test output.
    expect(failures.map((f) => `${f.id} ${f.title}: ${f.detail}`)).toEqual([]);
    expect(report.conformant).toBe(true);
  }, 120_000);

  it("skips only what it cannot run, and only at MAY level", async () => {
    const report = await runConformance();
    for (const skipped of report.results.filter((r) => r.status === "skip")) {
      expect(skipped.level).toBe("MAY");
      expect(skipped.detail).toBeTruthy();
    }
  }, 120_000);

  it("emits a report in the shape the specification publishes", async () => {
    const report = await runConformance();
    expect(report.type).toBe("opencreds.conformance_report");
    expect(report.opencreds).toBe("0.1");
    expect(report.implementation.name).toBe("@logicsrc/opencreds");
    expect(report.summary.pass + report.summary.fail + report.summary.skip).toBe(report.results.length);
    for (const result of report.results) {
      expect(result.id).toMatch(/^C\d+$/);
      expect(["MUST", "SHOULD", "MAY"]).toContain(result.level);
    }
  }, 120_000);
});

describe("the generated fixtures", () => {
  it("covers one item of every type", () => {
    const payload = fixturePayload();
    expect(payload.items.map((i) => i.type).sort()).toEqual([
      "account",
      "card",
      "identity",
      "key",
      "login",
      "note",
    ]);
    for (const item of payload.items) expect(hasErrors(validateItem(item))).toBe(false);
  });

  it("produces valid documents under items/ and database/", async () => {
    const fixtures = await emitFixtures();

    const plaintext = fixtures["database/plaintext.json"];
    expect(hasErrors(validateDatabase(plaintext))).toBe(false);

    const opened = await openDatabase(
      parseDatabase(JSON.stringify(fixtures["database/encrypted.opencreds"])),
      { passphrase: "opencreds-fixture" },
    );
    expect(opened.items).toHaveLength(6);
  }, 60_000);

  it("produces documents under invalid/ that a conforming reader must reject", async () => {
    const fixtures = await emitFixtures();

    // Each of these is a different way to be wrong, and none may be accepted.
    expect(hasErrors(validateItem(fixtures["invalid/wrong-group.json"] as Item))).toBe(true);
    await expect(openDatabase(fixtures["invalid/short-payload.json"] as never)).rejects.toThrow(
      /Manifest does not match/,
    );
    await expect(openDatabase(fixtures["invalid/unknown-namespace.json"] as never)).rejects.toThrow(
      /Unregistered namespace/,
    );
    await expect(
      openDatabase(fixtures["invalid/tampered-manifest.opencreds"] as never, { passphrase: "opencreds-fixture" }),
    ).rejects.toThrow(/wrong passphrase, or the file was altered/);
  }, 60_000);

  it("ships a README naming the passphrase, so the set is usable alone", async () => {
    const fixtures = await emitFixtures();
    expect(String(fixtures["README.txt"])).toContain("opencreds-fixture");
  }, 60_000);
});
