import { describe, expect, it } from "vitest";

import { createItem, formatDiagnostics, hasErrors, validateDatabase, validateDocument, validateItem } from "./index.js";
import type { Item } from "./index.js";

function pointers(diagnostics: ReturnType<typeof validateItem>): string[] {
  return diagnostics.map((d) => d.pointer);
}

describe("validating an item", () => {
  it("accepts every well-formed type", () => {
    for (const type of ["login", "card", "identity", "note", "key", "account"] as const) {
      expect(validateItem(createItem(type, { name: type }))).toEqual([]);
    }
  });

  it("points at the field that is wrong", () => {
    const diagnostics = validateItem({ ...createItem("login"), id: "not-a-uuid" });
    expect(pointers(diagnostics)).toContain("/id");
    expect(diagnostics[0]?.message).toMatch(/bound into the ciphertext/);
  });

  it("names a bad URI match rule with its index", () => {
    const item = createItem("login", {
      login: { username: "", password: "", totp: "", uris: [{ uri: "https://x" }, { uri: "https://y", match: "fuzzy" }] },
    } as unknown as Partial<Item>);
    expect(pointers(validateItem(item))).toEqual(["/login/uris/1/match"]);
  });

  it("rejects a group belonging to another type", () => {
    const item = { ...createItem("login"), card: { number: "1" } } as unknown as Item;
    expect(pointers(validateItem(item))).toContain("/card");
  });

  it("rejects history on a non-login and an over-long history on a login", () => {
    const note = { ...createItem("note"), history: [{ password: "x", changedAt: new Date().toISOString() }] } as Item;
    expect(pointers(validateItem(note))).toContain("/history");

    const long = {
      ...createItem("login"),
      history: Array.from({ length: 21 }, () => ({ password: "x", changedAt: new Date().toISOString() })),
    } as Item;
    expect(validateItem(long).some((d) => d.message.includes("capped at 20"))).toBe(true);
  });

  it("rejects a non-octal key mode and an unknown key type", () => {
    const item = createItem("key", { key: { keyType: "quantum", mode: "rwx" } } as unknown as Partial<Item>);
    expect(pointers(validateItem(item)).sort()).toEqual(["/key/keyType", "/key/mode"]);
  });

  it("accepts an octal mode with or without a leading zero", () => {
    for (const mode of ["600", "0600", "0644"]) {
      expect(validateItem(createItem("key", { key: { mode } } as unknown as Partial<Item>))).toEqual([]);
    }
  });

  it("checks custom field shapes", () => {
    const item = createItem("note", { fields: [{ name: "a", value: "b", type: "mystery" }] } as unknown as Partial<Item>);
    expect(pointers(validateItem(item))).toEqual(["/fields/0/type"]);
  });

  it("prefixes pointers with the position it was given", () => {
    expect(pointers(validateItem({ ...createItem("login"), id: "x" }, "/items/17"))).toContain("/items/17/id");
  });
});

describe("validating a database", () => {
  const base = {
    opencreds: "0.1",
    type: "opencreds.database",
    protected: false,
    namespace: "opencreds",
    exportedAt: "2026-08-29T00:00:00.000Z",
    manifest: { itemCount: 0, types: {}, folderCount: 0, digest: "x" },
    items: [] as Item[],
  };

  it("accepts a well-formed plaintext database, with a warning about what it is", () => {
    const diagnostics = validateDatabase(base);
    expect(hasErrors(diagnostics)).toBe(false);
    expect(diagnostics.some((d) => d.severity === "warning" && d.pointer === "/protected")).toBe(true);
  });

  it("requires a manifest", () => {
    const { manifest, ...without } = base;
    void manifest;
    expect(pointers(validateDatabase(without))).toContain("/manifest");
  });

  it("rejects an encrypted database that also states its items in the clear", () => {
    const diagnostics = validateDatabase({ ...base, protected: true, iv: "x", ciphertext: "y", items: [] });
    expect(pointers(diagnostics)).toContain("/items");
  });

  it("rejects an export kdf below the floor", () => {
    const diagnostics = validateDatabase({
      ...base,
      protected: true,
      iv: "x",
      ciphertext: "y",
      items: undefined,
      kdf: { kdf: "pbkdf2-sha256", iterations: 10, salt: "s" },
    });
    expect(pointers(diagnostics)).toContain("/kdf/iterations");
  });

  it("warns rather than errors on an unregistered namespace", () => {
    const diagnostics = validateDatabase({ ...base, namespace: "someone-else" });
    expect(hasErrors(diagnostics)).toBe(false);
    expect(diagnostics.some((d) => d.pointer === "/namespace" && d.severity === "warning")).toBe(true);
  });

  it("rejects a namespace that is not a namespace", () => {
    const diagnostics = validateDatabase({ ...base, namespace: "Not A Namespace" });
    expect(hasErrors(diagnostics)).toBe(true);
  });

  it("validates the items inside a plaintext database, with their positions", () => {
    const diagnostics = validateDatabase({
      ...base,
      items: [createItem("login"), { ...createItem("login"), id: "nope" } as Item],
    });
    expect(pointers(diagnostics)).toContain("/items/1/id");
  });

  it("rejects an unsupported version", () => {
    expect(pointers(validateDatabase({ ...base, opencreds: "9.9" }))).toContain("/opencreds");
  });
});

describe("validateDocument", () => {
  it("recognises a database, an item, and a bare array of items", () => {
    expect(validateDocument({ ...{ type: "opencreds.database" } }).kind).toBe("database");
    expect(validateDocument(createItem("login")).kind).toBe("item");
    expect(validateDocument([createItem("login")]).kind).toBe("items");
  });
});

describe("formatting", () => {
  it("aligns the pointers and marks warnings", () => {
    const rendered = formatDiagnostics([
      { pointer: "/items/17/login/uris/0/match", message: '"fuzzy" is not a valid match rule', severity: "error" },
      { pointer: "/manifest/itemCount", message: "says 42, payload has 41", severity: "warning" },
    ]);
    const lines = rendered.split("\n");
    expect(lines[0]).toMatch(/^\/items\/17\/login\/uris\/0\/match {2}"fuzzy"/);
    expect(lines[1]).toContain("warning: says 42");
  });

  it("renders nothing for no diagnostics", () => {
    expect(formatDiagnostics([])).toBe("");
  });
});
