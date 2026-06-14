import { describe, expect, it } from "vitest";
import { DraftError, formatAddress, isValidEmail, mailboxAddress, normalizeDraft, parseAddress, snippet } from "./domain.js";

describe("isValidEmail", () => {
  it("accepts normal addresses", () => {
    expect(isValidEmail("alice@mail.profullstack.com")).toBe(true);
  });
  it("rejects malformed addresses", () => {
    for (const bad of ["", "alice", "alice@", "@host.com", "a b@host.com", "alice@host"]) {
      expect(isValidEmail(bad)).toBe(false);
    }
  });
});

describe("mailboxAddress", () => {
  it("joins local part and domain", () => {
    expect(mailboxAddress("alice", "mail.profullstack.com")).toBe("alice@mail.profullstack.com");
  });
});

describe("parseAddress / formatAddress", () => {
  it("parses a named address", () => {
    expect(parseAddress("Ada Lovelace <ada@mail.profullstack.com>")).toEqual({
      name: "Ada Lovelace",
      address: "ada@mail.profullstack.com"
    });
  });
  it("parses a bare address", () => {
    expect(parseAddress("ada@mail.profullstack.com")).toEqual({ address: "ada@mail.profullstack.com" });
  });
  it("round-trips and quotes names with specials", () => {
    expect(formatAddress({ name: "Ada", address: "ada@x.com" })).toBe("Ada <ada@x.com>");
    expect(formatAddress({ address: "ada@x.com" })).toBe("ada@x.com");
    expect(formatAddress({ name: "Doe, John", address: "j@x.com" })).toBe('"Doe, John" <j@x.com>');
  });
});

describe("snippet", () => {
  it("collapses whitespace and truncates", () => {
    expect(snippet("hello   world\n\nthere")).toBe("hello world there");
    expect(snippet("abcdef", 4)).toBe("abc…");
  });
});

describe("normalizeDraft", () => {
  it("trims subject, drops empty cc/bcc, keeps valid recipients", () => {
    const d = normalizeDraft({
      to: [{ address: " ada@x.com " }],
      cc: [],
      subject: "  hi  ",
      text: "yo"
    });
    expect(d.to).toEqual([{ address: "ada@x.com" }]);
    expect(d.subject).toBe("hi");
    expect(d.cc).toBeUndefined();
  });
  it("rejects a draft with no recipients", () => {
    expect(() => normalizeDraft({ to: [], subject: "x", text: "y" })).toThrow(DraftError);
  });
  it("rejects an invalid recipient", () => {
    expect(() => normalizeDraft({ to: [{ address: "nope" }], subject: "x", text: "y" })).toThrow(/invalid recipient/);
  });
});
