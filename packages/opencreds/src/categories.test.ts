import { describe, expect, it } from "vitest";

import {
  SECRET_CATEGORIES,
  SECRET_CATEGORY_IDS,
  categorizeItem,
  categorizeSecret,
  csvLine,
  parseCategories,
  toSimpleCsv,
} from "./categories.js";
import { createItem } from "./items.js";

describe("categorizeSecret", () => {
  it("puts every documented example in its own category", () => {
    for (const category of SECRET_CATEGORIES) {
      for (const example of category.examples) {
        expect([example, categorizeSecret(example)]).toEqual([example, category.id]);
      }
    }
  });

  it.each([
    ["DATABASE_URL", "db"],
    ["SUPABASE_SERVICE_ROLE_KEY", "db"],
    ["SUPABAsE_URL", "db"],
    ["TWITTER_API_KEY", "social"],
    ["X_CLIENT_SECRET", "social"],
    ["SSH_PORT", "server"],
    ["SEED1_SUDO_PASSWORD", "server"],
    ["TMDB_API_KEY", "api"],
    // a service beats the generic word: rotate Stripe, get its webhook secret too
    ["STRIPE_WEBHOOK_SECRET", "finance"],
    ["COINPAYPORTAL_API_KEY", "finance"],
    ["SMTP_HOST", "email"],
    ["DB_HOST", "db"],
    ["R2_SECRET_ACCESS_KEY", "storage"],
    ["SUPABASE_S3_SECRET_KEY", "storage"],
    ["SYSTEM_MNEMONIC_BTC", "crypto"],
    ["JWT_SECRET", "auth"],
    ["NODE_ENV", "config"],
    ["NEXT_PUBLIC_APP_URL", "config"],
    ["PLANETSCALE_DATABASE_URL", "db"],
    ["SOMETHING_ELSE", "other"],
  ])("%s is %s", (name, category) => {
    expect(categorizeSecret(name)).toBe(category);
  });

  it("reads item names and hosts the same way as env names", () => {
    expect(categorizeSecret("My Postgres")).toBe("db");
    expect(categorizeSecret("api.stripe.com")).toBe("finance");
  });
});

describe("categorizeItem", () => {
  it("uses the item type where it is unambiguous", () => {
    expect(categorizeItem(createItem("card", { name: "Visa" }))).toBe("finance");
    expect(categorizeItem(createItem("key", { name: "laptop", key: { keyType: "ssh" } }))).toBe("server");
  });

  it("classifies a login by its URL when the name says nothing", () => {
    const item = createItem("login", { name: "work", login: { uris: [{ uri: "https://www.reddit.com/login" }] } });
    expect(categorizeItem(item)).toBe("social");
  });

  it("classifies an env key by its name", () => {
    expect(categorizeItem(createItem("key", { name: "REDIS_URL", key: { keyType: "env", value: "redis://x" } }))).toBe("db");
  });
});

describe("parseCategories", () => {
  it("accepts commas, repeats and aliases", () => {
    expect(parseCategories(["db,social", "payments"])).toEqual(new Set(["db", "social", "finance"]));
    expect(parseCategories(" DB ")).toEqual(new Set(["db"]));
  });

  it("means no filter when nothing is given", () => {
    expect(parseCategories(undefined)).toBeUndefined();
    expect(parseCategories([])).toBeUndefined();
  });

  it("names the valid words when one is wrong", () => {
    expect(() => parseCategories("databse")).toThrow(/Unknown category "databse".*db/);
  });

  it("lists other last so every secret has a category to filter on", () => {
    expect(SECRET_CATEGORY_IDS.at(-1)).toBe("other");
  });
});

describe("csv", () => {
  it("quotes only what needs quoting, including multi-line keys", () => {
    expect(csvLine(["a", 'b"c', "d,e", "-----BEGIN\nKEY-----", undefined])).toBe('a,"b""c","d,e","-----BEGIN\nKEY-----",');
  });

  it("keeps key and account secrets, which a Bitwarden CSV drops", () => {
    const items = [
      createItem("key", { name: "DATABASE_URL", key: { keyType: "env", value: "postgres://u:p@h/db" } }),
      createItem("account", { name: "Mastodon", account: { provider: "mastodon", handle: "@me", accessToken: "tok" } }),
    ];
    const lines = toSimpleCsv(items, []).trim().split("\n");
    expect(lines[0]).toBe("folder,category,type,name,username,password,url,value,totp,notes");
    expect(lines[1]).toBe(",db,key,DATABASE_URL,,,,postgres://u:p@h/db,,");
    expect(lines[2]).toBe(",social,account,Mastodon,@me,,mastodon,tok,,");
  });
});
