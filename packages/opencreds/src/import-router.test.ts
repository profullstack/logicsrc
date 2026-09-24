import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ALL_SOURCES,
  SOURCE_NAMES,
  detectContainer,
  isKnownSource,
  looksLikeOnePasswordExport,
  parseOnePasswordExport,
  readZipEntry,
  routeImport,
  stableUuid,
} from "./index.js";

/**
 * Build a real ZIP with the system zip, so the reader is tested against bytes
 * some other implementation produced rather than ones we wrote ourselves.
 */
function makeZip(files: Record<string, string>): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "oc-zip-"));
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
  }
  const out = join(dir, "out.zip");
  execFileSync("zip", ["-q", "-r", out, ...Object.keys(files)], { cwd: dir });
  return readFileSync(out);
}

/** A .1pux in 1Password's documented shape. */
function onePasswordExport(items: unknown[], vaultName = "Personal"): Buffer {
  const doc = {
    accounts: [
      {
        attrs: { name: "Test" },
        vaults: [
          {
            attrs: { uuid: "vault-1", name: vaultName, type: "P" },
            items: items.map((item) => ({ item })),
          },
        ],
      },
    ],
  };
  return makeZip({ "export.data": JSON.stringify(doc) });
}

describe("the minimal ZIP reader", () => {
  it("reads a stored and a deflated entry written by the system zip", () => {
    // A short string stores; a long repetitive one deflates. Both paths matter.
    const zip = makeZip({ "small.txt": "hi", "big.txt": "x".repeat(5000) });
    expect(readZipEntry(zip, "small.txt")?.toString()).toBe("hi");
    expect(readZipEntry(zip, "big.txt")?.toString()).toBe("x".repeat(5000));
  });

  it("returns null for an entry that is not there", () => {
    expect(readZipEntry(makeZip({ "a.txt": "a" }), "missing.txt")).toBeNull();
  });
});

describe("telling one container from another", () => {
  it("knows a zip, a json and a csv apart", () => {
    expect(detectContainer(makeZip({ "a.txt": "a" }))).toBe("zip");
    expect(detectContainer(Buffer.from('  {"a":1}'))).toBe("json");
    expect(detectContainer(Buffer.from("name,url\na,b\n"))).toBe("csv");
  });
});

describe("--source names a product, not a file format", () => {
  it("lists every product it accepts", () => {
    expect(SOURCE_NAMES).toContain("bitwarden");
    expect(SOURCE_NAMES).toContain("onepassword");
    expect(SOURCE_NAMES).toContain("lastpass");
    expect(SOURCE_NAMES).toContain("opencreds");
    expect(isKnownSource("nordpass")).toBe(true);
    expect(isKnownSource("nonesuch")).toBe(false);
  });

  it("rejects an unknown source by name rather than guessing", () => {
    const route = routeImport(Buffer.from("name,url\na,b\n"), "nonesuch");
    expect(route.parsed).toBeNull();
    expect(route.reason).toMatch(/Unknown --source/);
  });

  it("forces a CSV whose headers would not have identified it", () => {
    // Bare two-column CSV: no detector claims this, so it needs --source.
    const csv = "name,secret\nmybank,hunter2\n";
    expect(routeImport(Buffer.from(csv)).parsed?.source).toBeNull();
    const forced = routeImport(Buffer.from(csv), "lastpass");
    expect(forced.parsed?.source).toBe("lastpass");
  });

  it("says so when a product does not export the container it was given", () => {
    const route = routeImport(Buffer.from('{"items":[],"encrypted":false}'), "lastpass");
    expect(route.parsed).toBeNull();
    expect(route.reason).toMatch(/does not export JSON/);
  });

  it("routes an OpenCreds database back to the caller, which owns the passphrase", () => {
    const db = JSON.stringify({ opencreds: "0.1", type: "opencreds.database", payload: "x" });
    const route = routeImport(Buffer.from(db));
    expect(route.isOpenCredsDatabase).toBe(true);
    expect(route.parsed).toBeNull();
  });

  it("still detects Bitwarden JSON without being told", () => {
    const route = routeImport(Buffer.from('{"encrypted":false,"folders":[],"items":[]}'));
    expect(route.description).toBe("Bitwarden JSON");
  });

  it("keeps 1Password and Apple apart, whose columns nearly collide", () => {
    // 1Password: title,url,username,password,otpauth,notes,type
    // Apple:     title,url,username,password,notes,otpauth  (no type)
    // Adding Apple's detector without this stole every 1Password CSV.
    const onepassword = "title,url,username,password,otpauth,notes,type\na,b,c,d,e,f,Login\n";
    const apple = "title,url,username,password,notes,otpauth\na,b,c,d,e,f\n";
    expect(routeImport(Buffer.from(onepassword)).parsed?.source).toBe("onepassword");
    expect(routeImport(Buffer.from(apple)).parsed?.source).toBe("apple");
  });

  it("every advertised source has a label", () => {
    for (const name of SOURCE_NAMES) {
      expect(ALL_SOURCES[name]!.label.length).toBeGreaterThan(0);
    }
  });
});

describe("reading a 1Password .1pux", () => {
  it("recognises the archive by its export.data", () => {
    expect(looksLikeOnePasswordExport(onePasswordExport([]))).toBe(true);
    expect(looksLikeOnePasswordExport(makeZip({ "other.txt": "x" }))).toBe(false);
  });

  it("reads a login with its urls, totp and vault", () => {
    const buf = onePasswordExport([
      {
        uuid: "abcdefghijklmnopqrstuvwxyz",
        categoryUuid: "001",
        createdAt: 1590000000,
        updatedAt: 1600000000,
        favIndex: 1,
        overview: {
          title: "Example",
          url: "https://example.com",
          urls: [{ url: "https://example.com" }, { url: "https://alt.example" }],
        },
        details: {
          loginFields: [
            { designation: "username", value: "ann" },
            { designation: "password", value: "hunter2" },
          ],
          notesPlain: "a note",
          sections: [
            { fields: [{ id: "totp", title: "one-time password", value: { totp: "otpauth://x" } }] },
          ],
        },
      },
    ]);

    const parsed = parseOnePasswordExport(buf);
    expect(parsed.source).toBe("onepassword");
    expect(parsed.items).toHaveLength(1);
    const item = parsed.items[0]!;
    expect(item.type).toBe("login");
    expect(item.name).toBe("Example");
    expect(item.login?.username).toBe("ann");
    expect(item.login?.password).toBe("hunter2");
    expect(item.login?.totp).toBe("otpauth://x");
    expect(item.login?.uris.map((u) => u.uri)).toEqual([
      "https://example.com",
      "https://alt.example",
    ]);
    expect(item.notes).toBe("a note");
    expect(item.favorite).toBe(true);
    // Seconds, not milliseconds.
    expect(item.createdAt).toBe(new Date(1590000000 * 1000).toISOString());
    expect(parsed.folders).toEqual([
      { id: stableUuid("1password:vault", "vault-1"), name: "Personal" },
    ]);
  });

  it("gives the same ids every time, so a re-import dedupes", () => {
    const make = () =>
      parseOnePasswordExport(
        onePasswordExport([
          { uuid: "stableid", categoryUuid: "001", overview: { title: "x" }, details: {} },
        ]),
      );
    expect(make().items[0]!.id).toBe(make().items[0]!.id);
  });

  it("reads a card, splitting 1Password's monthYear", () => {
    const parsed = parseOnePasswordExport(
      onePasswordExport([
        {
          uuid: "card1",
          categoryUuid: "002",
          overview: { title: "Amex" },
          details: {
            sections: [
              {
                fields: [
                  { id: "cardholder", value: { string: "A Ettinger" } },
                  { id: "ccnum", value: { creditCardNumber: "3782" } },
                  { id: "cvv", value: { concealed: "1234" } },
                  { id: "expiry", value: { monthYear: 202801 } },
                ],
              },
            ],
          },
        },
      ]),
    );
    const card = parsed.items[0]!;
    expect(card.type).toBe("card");
    expect(card.card?.number).toBe("3782");
    expect(card.card?.expMonth).toBe("1");
    expect(card.card?.expYear).toBe("2028");
    expect(card.card?.code).toBe("1234");
  });

  it("leaves trashed items behind and says so", () => {
    const parsed = parseOnePasswordExport(
      onePasswordExport([
        { uuid: "a", categoryUuid: "001", trashed: true, overview: { title: "gone" }, details: {} },
        { uuid: "b", categoryUuid: "001", overview: { title: "kept" }, details: {} },
      ]),
    );
    expect(parsed.items.map((i) => i.name)).toEqual(["kept"]);
    expect(parsed.skipped[0]?.reason).toMatch(/trash/i);
  });

  it("turns a category it does not model into a note rather than dropping it", () => {
    const parsed = parseOnePasswordExport(
      onePasswordExport([
        {
          uuid: "p1",
          categoryUuid: "106",
          overview: { title: "Passport" },
          details: {
            sections: [{ fields: [{ id: "number", title: "Number", value: { string: "X123" } }] }],
          },
        },
      ]),
    );
    const item = parsed.items[0]!;
    expect(item.type).toBe("note");
    expect(item.notes).toMatch(/Passport/);
    expect(item.fields?.[0]).toMatchObject({ name: "Number", value: "X123" });
  });

  it("refuses a zip that is not a .1pux", () => {
    const parsed = parseOnePasswordExport(makeZip({ "nope.txt": "x" }));
    expect(parsed.items).toEqual([]);
    expect(parsed.skipped[0]?.reason).toMatch(/not a \.1pux/i);
  });
});
