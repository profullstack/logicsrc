import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isSigningKey, isSigningKeyName, looksLikeSigningKeyValue } from "./signing-keys.js";

const fx = JSON.parse(readFileSync(new URL("./signing-keys.fixtures.json", import.meta.url), "utf8")) as { signing: string[]; not_signing: string[] };

describe("isSigningKeyName", () => {
  it.each(fx.signing)("%s is a signing key", (n) => expect(isSigningKeyName(n)).toBe(true));
  it.each(fx.not_signing)("%s is not", (n) => expect(isSigningKeyName(n)).toBe(false));
});

describe("looksLikeSigningKeyValue", () => {
  const hex = "ab".repeat(32);
  it("catches PEM, 0x-hex, Solana base58 and byte arrays, and mnemonic shapes", () => {
    expect(looksLikeSigningKeyValue("-----BEGIN OPENSSH PRIVATE KEY-----\nb3Bl\n-----END OPENSSH PRIVATE KEY-----")).toBe(true);
    expect(looksLikeSigningKeyValue("-----BEGIN EC PRIVATE KEY-----")).toBe(true);
    expect(looksLikeSigningKeyValue(`0x${hex}`)).toBe(true);
    expect(looksLikeSigningKeyValue(`"0x${hex}"`)).toBe(true);
    expect(looksLikeSigningKeyValue("4".repeat(44) + "5".repeat(44))).toBe(true);
    expect(looksLikeSigningKeyValue(`[${Array.from({ length: 64 }, (_, i) => i).join(",")}]`)).toBe(true);
    expect(looksLikeSigningKeyValue(Array(12).fill("abandon").join(" "))).toBe(true);
    expect(looksLikeSigningKeyValue(Array(24).fill("zoo").join(" "))).toBe(true);
  });
  it("leaves ordinary secrets alone", () => {
    expect(looksLikeSigningKeyValue(hex)).toBe(false); // bare hex: HMAC/session secrets look like this
    expect(looksLikeSigningKeyValue("sk_live_51Habc")).toBe(false);
    expect(looksLikeSigningKeyValue("postgres://u:p@h/db")).toBe(false);
    expect(looksLikeSigningKeyValue("-----BEGIN PUBLIC KEY-----")).toBe(false);
    expect(looksLikeSigningKeyValue("hello world this is a normal sentence of eleven words ok")).toBe(false);
    expect(looksLikeSigningKeyValue(Array(12).fill("Abandon").join(" "))).toBe(false);
  });
  it("isSigningKey checks the name, then the value", () => {
    expect(isSigningKey("NOTES", `0x${hex}`)).toBe(true);
    expect(isSigningKey("SOLANA_PRIVATE_KEY")).toBe(true);
    expect(isSigningKey("NOTES", "plain")).toBe(false);
  });
});
