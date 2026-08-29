import { describe, expect, it } from "vitest";

import { DETECT_ORDER, detectSource, parseCsv, parseCsvImport, rowsToObjects, toBitwardenCsv } from "./index.js";
import { createItem } from "./index.js";
import type { Item } from "./index.js";

describe("the CSV reader", () => {
  it("reads quoted fields containing commas, newlines and escaped quotes", () => {
    // C40 — notes fields contain everything, and a naive split(',') mangles
    // every export that has one.
    const rows = parseCsv('name,notes\n"a, b","he said ""hi""\nsecond line"\n');
    expect(rows).toEqual([
      ["name", "notes"],
      ["a, b", 'he said "hi"\nsecond line'],
    ]);
  });

  it("handles CRLF", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a UTF-8 BOM so the first column name is usable", () => {
    // Chrome and Excel both emit one; unhandled it breaks every lookup.
    const rows = parseCsv("﻿name,url\nGitHub,https://github.com\n");
    expect(rows[0]?.[0]).toBe("name");
  });

  it("keeps empty trailing fields", () => {
    expect(parseCsv("a,b,c\n1,,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });

  it("returns nothing useful for an empty document", () => {
    expect(parseCsv("")).toEqual([]);
    expect(rowsToObjects(parseCsv("only,headers"))).toEqual([]);
  });

  it("lowercases and trims header names", () => {
    const objects = rowsToObjects(parseCsv(" Name , URL \nGitHub,https://github.com\n"));
    expect(objects[0]).toEqual({ name: "GitHub", url: "https://github.com" });
  });
});

describe("source detection", () => {
  it("asks the most specific detector first", () => {
    // C42 — Chrome's columns are a subset of 1Password's.
    expect(DETECT_ORDER[0]).toBe("bitwarden");
    expect(DETECT_ORDER.indexOf("chrome")).toBe(DETECT_ORDER.length - 1);
  });

  it("identifies each product from its header row", () => {
    expect(detectSource(["folder", "type", "name", "login_uri", "login_username", "login_password"])).toBe("bitwarden");
    expect(detectSource(["url", "username", "password", "totp", "extra", "name", "grouping", "fav"])).toBe("lastpass");
    expect(detectSource(["account", "login name", "password", "web site", "comments"])).toBe("keepass");
    expect(detectSource(["title", "url", "username", "password", "otpauth", "notes", "type"])).toBe("onepassword");
    expect(detectSource(["name", "url", "username", "password", "note"])).toBe("chrome");
    expect(detectSource(["nothing", "familiar"])).toBeNull();
  });
});

describe("importing", () => {
  it("maps a Bitwarden export across all four of its types", () => {
    const csv = [
      "folder,favorite,type,name,notes,login_uri,login_username,login_password,login_totp,card_number,card_code,card_expmonth,card_expyear,identity_firstname,identity_lastname",
      "Work,1,login,GitHub,,https://github.com,anthony,hunter2,otpauth://x,,,,,,",
      ",,card,Visa,my card,,,,,4242424242424242,123,4,26,,",
      ",,identity,Me,,,,,,,,,,Anthony,Ettinger",
      ",,securenote,WiFi,on the router,,,,,,,,,,",
      "",
    ].join("\n");

    const result = parseCsvImport(csv);
    expect(result.source).toBe("bitwarden");
    expect(result.items).toHaveLength(4);

    const login = result.items.find((i) => i.type === "login")!;
    expect(login.name).toBe("GitHub");
    expect(login.favorite).toBe(true);
    expect(login.login?.password).toBe("hunter2");
    expect(login.login?.totp).toBe("otpauth://x");
    expect(login.login?.uris).toEqual([{ uri: "https://github.com", match: "domain" }]);
    expect(result.folders.map((f) => f.name)).toEqual(["Work"]);
    expect(login.folderId).toBe(result.folders[0]?.id);

    const card = result.items.find((i) => i.type === "card")!;
    expect(card.card).toMatchObject({ number: "4242424242424242", code: "123", expMonth: "4", expYear: "2026" });

    const identity = result.items.find((i) => i.type === "identity")!;
    expect(identity.identity).toMatchObject({ firstName: "Anthony", lastName: "Ettinger" });

    const note = result.items.find((i) => i.type === "note")!;
    expect(note.notes).toBe("on the router");
    expect(note.name).toBe("WiFi");
  });

  it("expands a two-digit expiry year", () => {
    const csv = "type,name,card_expyear,login_password\ncard,V,26,\n";
    expect(parseCsvImport(csv, { source: "bitwarden" }).items[0]?.card?.expYear).toBe("2026");
  });

  it("names a Chrome row from its host when the export had none", () => {
    const csv = "name,url,username,password,note\n,https://www.github.com/login,anthony,hunter2,\n";
    const result = parseCsvImport(csv);
    expect(result.source).toBe("chrome");
    expect(result.items[0]?.name).toBe("github.com");
  });

  it("reads a LastPass secure note by its sentinel URL", () => {
    const csv = [
      "url,username,password,totp,extra,name,grouping,fav",
      "http://sn,,,,the note body,WiFi,Home,0",
      "https://github.com,anthony,hunter2,,,GitHub,Work,1",
      "",
    ].join("\n");
    const result = parseCsvImport(csv);
    expect(result.source).toBe("lastpass");
    expect(result.items.find((i) => i.name === "WiFi")?.type).toBe("note");
    const login = result.items.find((i) => i.name === "GitHub")!;
    expect(login.type).toBe("login");
    expect(login.favorite).toBe(true);
    expect(result.folders.map((f) => f.name).sort()).toEqual(["Home", "Work"]);
  });

  it("maps a KeePass export", () => {
    const csv = [
      '"Account","Login Name","Password","Web Site","Comments","Group"',
      '"GitHub","anthony","hunter2","https://github.com","a note","Dev"',
      "",
    ].join("\n");
    const result = parseCsvImport(csv);
    expect(result.source).toBe("keepass");
    expect(result.items[0]).toMatchObject({ name: "GitHub", notes: "a note" });
    expect(result.items[0]?.login?.username).toBe("anthony");
  });

  it("maps a 1Password export", () => {
    const csv = "title,url,username,password,otpauth,notes,type\nGitHub,https://github.com,anthony,hunter2,otpauth://y,note,login\n";
    const result = parseCsvImport(csv);
    expect(result.source).toBe("onepassword");
    expect(result.items[0]?.login?.totp).toBe("otpauth://y");
  });

  it("reports a blank row rather than dropping it silently", () => {
    // C41 — the person still has the source file, and only knows to go back
    // for it if they are told.
    const csv = "name,url,username,password,note\nGitHub,https://github.com,a,b,\n,,,,\n";
    const result = parseCsvImport(csv);
    expect(result.items).toHaveLength(1);
    expect(result.skipped).toEqual([{ row: 3, reason: "Empty row" }]);
  });

  it("reports an unrecognised format instead of importing nothing quietly", () => {
    const result = parseCsvImport("alpha,beta\n1,2\n");
    expect(result.source).toBeNull();
    expect(result.skipped[0]?.reason).toBe("Unrecognised export format");
  });

  it("reports a file with no rows", () => {
    expect(parseCsvImport("").skipped[0]?.reason).toBe("No rows found");
  });

  it("honours a forced source over detection", () => {
    const csv = "name,url,username,password,note\nGitHub,https://github.com,a,b,\n";
    expect(parseCsvImport(csv, { source: "onepassword" }).source).toBe("onepassword");
  });

  it("survives a quoting torture file", () => {
    const csv =
      '﻿name,url,username,password,note\r\n' +
      '"Weird, Inc.",https://weird.example,"user""quoted","p,a,s,s","line one\nline two, with comma"\r\n';
    const result = parseCsvImport(csv);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe("Weird, Inc.");
    expect(result.items[0]?.login?.username).toBe('user"quoted');
    expect(result.items[0]?.login?.password).toBe("p,a,s,s");
    expect(result.items[0]?.notes).toBe("line one\nline two, with comma");
  });
});

describe("exporting to CSV", () => {
  it("writes logins and notes, and reports what no CSV can carry", () => {
    const folder = { id: "11111111-1111-4111-8111-111111111111", name: "Work" };
    const items: Item[] = [
      createItem("login", {
        name: "GitHub",
        folderId: folder.id,
        login: { username: "anthony", password: "hunter2", totp: "", uris: [{ uri: "https://github.com", match: "exact" }] },
        history: [{ password: "old", changedAt: new Date().toISOString() }],
      } as Partial<Item>),
      createItem("key", { name: "deploy key" }),
      createItem("account", { name: "Stripe" }),
      createItem("card", { name: "Visa" }),
    ];

    const { csv, dropped } = toBitwardenCsv(items, [folder]);
    expect(csv.split("\n")[0]).toContain("login_password");
    expect(csv).toContain("hunter2");
    expect(csv).toContain("Work");
    // The three types and the history have no column anywhere.
    expect(dropped["key items"]).toBe(1);
    expect(dropped["account items"]).toBe(1);
    expect(dropped["card items"]).toBe(1);
    expect(dropped["password history"]).toBe(1);
    expect(dropped["URI match rules"]).toBe(1);
  });

  it("quotes a value containing a comma so the file reads back", () => {
    const items = [createItem("login", { name: "Weird, Inc.", notes: 'say "hi"' })];
    const { csv } = toBitwardenCsv(items, []);
    const rows = parseCsv(csv);
    expect(rows[1]?.[3]).toBe("Weird, Inc.");
    expect(rows[1]?.[4]).toBe('say "hi"');
  });
});
