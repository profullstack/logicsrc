import { describe, expect, it } from "vitest";

import { looksLikeBitwardenJson, parseBitwardenJson } from "./index.js";
import { looksLikeBitwardenText } from "./bitwarden.js";

/** A minimal export in Bitwarden's real shape. */
function exportOf(items: unknown[], folders: unknown[] = []) {
  return JSON.stringify({ encrypted: false, folders, items });
}

describe("telling a Bitwarden export from an OpenCreds database", () => {
  it("accepts a Bitwarden export", () => {
    expect(looksLikeBitwardenText(exportOf([]))).toBe(true);
  });

  it("rejects an OpenCreds database, which also starts with a brace", () => {
    // The whole bug: this used to be the only branch, so a Bitwarden export was
    // handed to the OpenCreds reader and died as "Not an OpenCreds database".
    const db = JSON.stringify({
      opencreds: "0.1",
      type: "opencreds.database",
      protected: true,
      payload: "…ciphertext…",
    });
    expect(looksLikeBitwardenText(db)).toBe(false);
  });

  it("rejects text that is not JSON at all", () => {
    expect(looksLikeBitwardenText("name,username\na,b\n")).toBe(false);
  });

  it("needs more than an items array to claim a file", () => {
    expect(looksLikeBitwardenJson({ items: [] })).toBe(false);
    expect(looksLikeBitwardenJson({ items: [], encrypted: false })).toBe(true);
  });
});

describe("reading a Bitwarden JSON export", () => {
  it("reads a login with its uris, username and password", () => {
    const parsed = parseBitwardenJson(
      exportOf([
        {
          type: 1,
          name: "Example",
          login: {
            username: "ann",
            password: "hunter2",
            totp: "otpauth://x",
            uris: [{ uri: "https://example.com" }, { uri: "https://alt.example" }],
          },
        },
      ]),
    );
    expect(parsed.source).toBe("bitwarden");
    expect(parsed.items).toHaveLength(1);
    const item = parsed.items[0]!;
    expect(item.type).toBe("login");
    expect(item.login?.username).toBe("ann");
    expect(item.login?.password).toBe("hunter2");
    expect(item.login?.totp).toBe("otpauth://x");
    // Both URIs survive; the CSV export would have kept only the first.
    expect(item.login?.uris.map((u) => u.uri)).toEqual([
      "https://example.com",
      "https://alt.example",
    ]);
  });

  it("names an untitled login after its host", () => {
    const parsed = parseBitwardenJson(
      exportOf([{ type: 1, name: "", login: { uris: [{ uri: "https://www.example.com/x" }] } }]),
    );
    expect(parsed.items[0]!.name).toBe("example.com");
  });

  it("keeps custom fields, including which ones are hidden", () => {
    const parsed = parseBitwardenJson(
      exportOf([
        {
          type: 1,
          name: "x",
          login: {},
          fields: [
            { name: "Company ID", value: "abc", type: 0 },
            { name: "PIN", value: "1234", type: 1 },
            // Named but empty: a placeholder the user made on purpose, so it is
            // kept. Only a field with neither name nor value is dropped.
            { name: "placeholder", value: "", type: 0 },
            { name: "", value: "", type: 0 },
          ],
        },
      ]),
    );
    const fields = parsed.items[0]!.fields ?? [];
    expect(fields).toHaveLength(3);
    expect(fields[0]).toMatchObject({ name: "Company ID", value: "abc", type: "text" });
    expect(fields[1]).toMatchObject({ name: "PIN", type: "hidden", hidden: true });
    expect(fields[2]).toMatchObject({ name: "placeholder", value: "" });
  });

  it("reads cards, expanding a two-digit year", () => {
    const parsed = parseBitwardenJson(
      exportOf([
        {
          type: 3,
          name: "amex",
          card: { cardholderName: "A E", brand: "Amex", number: "3782", expMonth: "4", expYear: "28", code: "123" },
        },
      ]),
    );
    const item = parsed.items[0]!;
    expect(item.type).toBe("card");
    expect(item.card?.expYear).toBe("2028");
    expect(item.card?.number).toBe("3782");
  });

  it("reads identities and secure notes", () => {
    const parsed = parseBitwardenJson(
      exportOf([
        { type: 4, name: "me", identity: { firstName: "Ann", lastName: "Lee", email: "a@b.c" } },
        { type: 2, name: "note", notes: "remember this", secureNote: { type: 0 } },
      ]),
    );
    expect(parsed.items.map((i) => i.type)).toEqual(["identity", "note"]);
    expect(parsed.items[0]!.identity?.firstName).toBe("Ann");
    expect(parsed.items[1]!.notes).toBe("remember this");
  });

  it("resolves folders by Bitwarden's own id, and keeps only the ones used", () => {
    const parsed = parseBitwardenJson(
      exportOf(
        [{ type: 1, name: "x", folderId: "f1", login: {} }],
        [
          { id: "f1", name: "Email" },
          { id: "f2", name: "Unused" },
        ],
      ),
    );
    expect(parsed.folders).toEqual([{ id: "f1", name: "Email" }]);
    expect(parsed.items[0]!.folderId).toBe("f1");
  });

  it("drops a folderId that names no folder rather than inventing one", () => {
    const parsed = parseBitwardenJson(
      exportOf([{ type: 1, name: "x", folderId: "ghost", login: {} }], []),
    );
    expect(parsed.items[0]!.folderId).toBeNull();
    expect(parsed.folders).toEqual([]);
  });

  it("refuses an encrypted export instead of storing ciphertext as passwords", () => {
    const text = JSON.stringify({ encrypted: true, folders: [], items: ["2.aBc|dEf"] });
    const parsed = parseBitwardenJson(text);
    expect(parsed.items).toEqual([]);
    expect(parsed.skipped[0]?.reason).toMatch(/encrypt/i);
  });

  it("skips an unreadable row and keeps the rest, reporting the row number", () => {
    const parsed = parseBitwardenJson(
      exportOf([
        { type: 1, name: "first", login: {} },
        { type: 99, name: "weird" },
        { type: 1, name: "third", login: {} },
      ]),
    );
    expect(parsed.items.map((i) => i.name)).toEqual(["first", "third"]);
    expect(parsed.skipped).toEqual([{ row: 2, reason: "Unknown Bitwarden item type 99" }]);
  });

  it("reports bad JSON rather than throwing", () => {
    const parsed = parseBitwardenJson("{not json");
    expect(parsed.source).toBeNull();
    expect(parsed.skipped[0]?.reason).toBe("Not valid JSON");
  });

  it("maps Bitwarden's numeric URI match rules instead of assuming domain", () => {
    // Assuming "domain" for all of them quietly widens a login pinned to an
    // exact URL, which is a security change, not a cosmetic one.
    const parsed = parseBitwardenJson(
      exportOf([
        {
          type: 1,
          name: "x",
          login: {
            uris: [
              { uri: "https://a.test", match: 3 },
              { uri: "https://b.test", match: 5 },
              { uri: "https://c.test", match: null },
              { uri: "https://d.test" },
            ],
          },
        },
      ]),
    );
    expect(parsed.items[0]!.login?.uris).toEqual([
      { uri: "https://a.test", match: "exact" },
      { uri: "https://b.test", match: "never" },
      { uri: "https://c.test", match: "domain" },
      { uri: "https://d.test", match: "domain" },
    ]);
  });

  it("keeps Bitwarden's item id, so a re-import dedupes instead of duplicating", () => {
    const id = "56126b05-485c-44c2-a6fc-acb70001e348";
    const parsed = parseBitwardenJson(exportOf([{ type: 1, id, name: "x", login: {} }]));
    expect(parsed.items[0]!.id).toBe(id);
  });

  it("keeps the original timestamps, the only record of when a password rotated", () => {
    const parsed = parseBitwardenJson(
      exportOf([
        {
          type: 1,
          name: "x",
          login: {},
          creationDate: "2021-01-21T00:06:52.377Z",
          revisionDate: "2023-05-02T11:00:00.000Z",
        },
      ]),
    );
    expect(parsed.items[0]!.createdAt).toBe("2021-01-21T00:06:52.377Z");
    expect(parsed.items[0]!.updatedAt).toBe("2023-05-02T11:00:00.000Z");
  });

  it("carries password history newest first, capped at the spec limit", () => {
    const history = Array.from({ length: 25 }, (_, i) => ({
      password: `p${i}`,
      // Ascending dates, so the newest is the last one written.
      lastUsedDate: `2024-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
    }));
    const parsed = parseBitwardenJson(
      exportOf([{ type: 1, name: "x", login: {}, passwordHistory: history }]),
    );
    const got = parsed.items[0]!.history ?? [];
    expect(got).toHaveLength(20);
    expect(got[0]).toMatchObject({ password: "p24" });
    expect(got[19]).toMatchObject({ password: "p5" });
  });

  it("carries favourite through", () => {
    const parsed = parseBitwardenJson(
      exportOf([{ type: 1, name: "x", favorite: true, login: {} }]),
    );
    expect(parsed.items[0]!.favorite).toBe(true);
  });
});
