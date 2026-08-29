import { describe, expect, it } from "vitest";

import {
  MAX_HISTORY_ENTRIES,
  assertGroupsMatchType,
  createItem,
  maskItem,
  readField,
  recordPasswordChange,
  updateItem,
} from "./index.js";
import type { Item } from "./index.js";

describe("the item model", () => {
  it("creates one item per type, each with its own field group and no other", () => {
    // C1, C6.
    for (const type of ["login", "card", "identity", "note", "key", "account"] as const) {
      const item = createItem(type, { name: `a ${type}` });
      expect(item.type).toBe(type);
      expect(item.name).toBe(`a ${type}`);
      if (type !== "note") expect(item[type]).toBeTypeOf("object");
      for (const other of ["login", "card", "identity", "key", "account"] as const) {
        if (other !== type) expect(item[other]).toBeUndefined();
      }
      expect(() => assertGroupsMatchType(item)).not.toThrow();
    }
  });

  it("stamps the required fields on every item", () => {
    // C2.
    const item = createItem("login");
    expect(item.v).toBe(1);
    expect(item.id).toMatch(/^[0-9a-f]{8}-/);
    expect(Date.parse(item.createdAt)).not.toBeNaN();
    expect(Date.parse(item.updatedAt)).not.toBeNaN();
  });

  it("rejects a field group that does not match the type", () => {
    // C6 — a card group on a login is a broken importer or a smuggled field.
    const item = { ...createItem("login"), card: { number: "4242" } } as unknown as Item;
    expect(() => assertGroupsMatchType(item)).toThrow(/must not carry a card field group/);
  });

  it("preserves unknown top-level fields", () => {
    // C3 — an item from a later version must survive a round trip through this one.
    const item = createItem("login", { futureField: { anything: true } } as unknown as Partial<Item>);
    expect(item.futureField).toEqual({ anything: true });
    const edited = updateItem(item, { name: "renamed" });
    expect(edited.futureField).toEqual({ anything: true });
  });

  it("distinguishes an empty string from an absent field", () => {
    // C4.
    const item = createItem("login", { notes: "" });
    expect(item.notes).toBe("");
    expect("notes" in item).toBe(true);
    expect(item.login?.username).toBe("");
  });

  it("records the value being replaced, newest first", () => {
    let item = createItem("login", { login: { username: "a", password: "first", totp: "", uris: [] } });
    item = recordPasswordChange(item, "second");
    item = recordPasswordChange(item, "third");

    expect(item.login?.password).toBe("third");
    expect(item.history?.map((h) => h.password)).toEqual(["second", "first"]);
  });

  it("does not record a change when the password did not change", () => {
    let item = createItem("login", { login: { username: "a", password: "same", totp: "", uris: [] } });
    item = recordPasswordChange(item, "same");
    expect(item.history).toHaveLength(0);
  });

  it("caps history at twenty entries and keeps the newest", () => {
    // C5 — the blob is rewritten on every save, so an uncapped array grows
    // the ciphertext without bound.
    let item = createItem("login", { login: { username: "a", password: "p0", totp: "", uris: [] } });
    for (let i = 1; i <= 25; i++) item = recordPasswordChange(item, `p${i}`);

    expect(item.history).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(item.history?.[0]?.password).toBe("p24");
    expect(item.history?.at(-1)?.password).toBe("p5");
  });

  it("refuses history on anything but a login", () => {
    const note = createItem("note");
    expect(() => recordPasswordChange(note, "x")).toThrow(/Only logins/);
  });

  it("merges a field group on update rather than replacing it", () => {
    const item = createItem("login", { login: { username: "a", password: "b", totp: "t", uris: [] } });
    const edited = updateItem(item, { login: { password: "c" } } as Partial<Item>);
    expect(edited.login).toMatchObject({ username: "a", password: "c", totp: "t" });
  });
});

describe("masking", () => {
  it("masks every secret field, including history and hidden custom fields", () => {
    // C31, C32 — a pipeline is not an authorization.
    const item = createItem("login", {
      name: "GitHub",
      login: { username: "anthony", password: "hunter2", totp: "otpauth://x", uris: [] },
      fields: [
        { name: "PIN", value: "1234", type: "hidden" },
        { name: "Team", value: "infra", type: "text" },
      ],
      history: [{ password: "old", changedAt: new Date().toISOString() }],
    } as Partial<Item>);

    const masked = maskItem(item);
    expect(masked.login?.username).toBe("anthony");
    expect(masked.login?.password).not.toBe("hunter2");
    expect(masked.login?.totp).not.toBe("otpauth://x");
    expect(masked.fields?.[0]?.value).not.toBe("1234");
    expect(masked.fields?.[1]?.value).toBe("infra");
    expect(masked.history?.[0]?.password).not.toBe("old");
    // The original is untouched.
    expect(item.login?.password).toBe("hunter2");
  });

  it("masks a card number and code, a private key, and an access token", () => {
    const card = createItem("card", { card: { number: "4242424242424242", code: "123" } } as Partial<Item>);
    expect(maskItem(card).card?.number).not.toContain("4242");
    expect(maskItem(card).card?.code).not.toBe("123");

    const key = createItem("key", { key: { privateKey: "-----BEGIN-----", value: "sk_live" } } as Partial<Item>);
    expect(maskItem(key).key?.privateKey).not.toContain("BEGIN");
    expect(maskItem(key).key?.value).not.toBe("sk_live");

    const account = createItem("account", { account: { accessToken: "tok", refreshToken: "ref" } } as Partial<Item>);
    expect(maskItem(account).account?.accessToken).not.toBe("tok");
    expect(maskItem(account).account?.refreshToken).not.toBe("ref");
  });

  it("leaves an empty secret empty rather than masking nothing into something", () => {
    const item = createItem("login");
    expect(maskItem(item).login?.password).toBe("");
  });

  it("reads a single field by dotted path", () => {
    const item = createItem("login", { login: { username: "a", password: "b", totp: "", uris: [] } });
    expect(readField(item, "login.password")).toBe("b");
    expect(readField(item, "login.nope")).toBeUndefined();
  });
});
