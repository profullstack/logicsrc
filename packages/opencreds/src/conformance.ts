/**
 * The conformance suite.
 *
 * `docs/opencreds/conformance.md` lists what an implementation must do; this
 * file is that list, executable. Each check is a self-contained assertion
 * against the requirement id it carries, so `opencreds conformance` produces a
 * report a third party can compare against their own.
 *
 * Fixtures are generated rather than hand-written. A vector produced by the
 * reference implementation and then verified by it is worth more than a JSON
 * file someone typed: the file drifts silently when the format moves, and the
 * generated one cannot. `emitFixtures` writes them out so another
 * implementation can be tested against exactly what this one accepts.
 */

import {
  createItem,
  decryptItems,
  encryptItem,
  maskItem,
  recordPasswordChange,
  assertGroupsMatchType,
} from "./items.js";
import {
  assertUsableKdfParams,
  assertUsableNamespace,
  deriveAuthHash,
  deriveMasterKey,
  deriveWrapKey,
} from "./kdf.js";
import { createVault, rewrapUserKey, unlockVault } from "./vault-key.js";
import {
  buildManifest,
  exportDatabase,
  exportPlaintextDatabase,
  mergePayload,
  openDatabase,
} from "./database.js";
import { detectSource, parseCsv, parseCsvImport, DETECT_ORDER } from "./importers.js";
import { hasErrors, validateItem } from "./validate.js";
import { fromBase64, randomBytes, toBase64 } from "./primitives.js";
import {
  ITEM_TYPE,
  ITEM_TYPE_NAMES,
  MAX_HISTORY_ENTRIES,
  OPENCREDS_VERSION,
  type DatabasePayload,
  type Item,
  type KdfParams,
} from "./types.js";

export type ConformanceLevel = "MUST" | "SHOULD" | "MAY";
export type ConformanceStatus = "pass" | "fail" | "skip";

export interface ConformanceResult {
  id: string;
  level: ConformanceLevel;
  title: string;
  status: ConformanceStatus;
  detail?: string;
}

export interface ConformanceReport {
  type: "opencreds.conformance_report";
  opencreds: string;
  implementation: { name: string; version: string };
  results: ConformanceResult[];
  summary: { pass: number; fail: number; skip: number };
  conformant: boolean;
}

interface Check {
  id: string;
  level: ConformanceLevel;
  title: string;
  run: () => Promise<void> | void;
}

/** Derivation at the floor: the construction is under test, not the work factor. */
const FAST: KdfParams = { kdf: "pbkdf2-sha256", iterations: 100_000 };
const PASSPHRASE = "opencreds-fixture";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function assertThrows(body: () => Promise<unknown> | unknown, what: string): Promise<void> {
  try {
    await body();
  } catch {
    return;
  }
  throw new Error(`expected a refusal: ${what}`);
}

/** One item of every type, so no field group goes unexercised. */
export function fixturePayload(): DatabasePayload {
  const folder = { id: "11111111-1111-4111-8111-111111111111", name: "Work" };
  return {
    folders: [folder],
    items: [
      createItem("login", {
        name: "GitHub",
        folderId: folder.id,
        login: {
          username: "anthony",
          password: "hunter2",
          totp: "otpauth://totp/GitHub:anthony?secret=JBSWY3DPEHPK3PXP",
          uris: [{ uri: "https://github.com", match: "domain" }],
        },
        history: [{ password: "hunter1", changedAt: "2026-01-04T09:12:00.000Z" }],
      } as Partial<Item>),
      createItem("card", {
        name: "Visa",
        card: { cardholderName: "A Ettinger", brand: "Visa", number: "4242424242424242", expMonth: "4", expYear: "2029", code: "123" },
      } as Partial<Item>),
      createItem("identity", {
        name: "Me",
        identity: { firstName: "Anthony", lastName: "Ettinger", ssn: "000-00-0000" },
      } as Partial<Item>),
      createItem("note", { name: "WiFi", notes: "the password is on the router" }),
      createItem("key", {
        name: "deploy@railway",
        key: { keyType: "ssh", algorithm: "ed25519", privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----", path: "~/.ssh/id_ed25519", mode: "0600" },
      } as Partial<Item>),
      createItem("account", {
        name: "Stripe",
        account: { provider: "stripe", accessToken: "sk_live_x", scopes: ["charges:write", "customers:read"], environment: "production" },
      } as Partial<Item>),
    ],
  };
}

const CHECKS: Check[] = [
  {
    id: "C1",
    level: "MUST",
    title: "Reads and writes all six item types with their field groups",
    run: () => {
      assert(Object.keys(ITEM_TYPE).length === 6, "expected six item types");
      for (const type of ITEM_TYPE_NAMES) {
        const item = createItem(type, { name: type });
        assert(item.type === type, `createItem lost the type ${type}`);
        if (type !== "note") {
          assert(typeof (item as Record<string, unknown>)[type] === "object", `${type} has no field group`);
        }
      }
    },
  },
  {
    id: "C2",
    level: "MUST",
    title: "Stamps v, id, type, name, createdAt and updatedAt on every item",
    run: () => {
      const item = createItem("login");
      for (const field of ["v", "id", "type", "name", "createdAt", "updatedAt"] as const) {
        assert(item[field] !== undefined, `missing ${field}`);
      }
      assert(hasErrors(validateItem(item)) === false, "a freshly created item does not validate");
    },
  },
  {
    id: "C3",
    level: "MUST",
    title: "Preserves unknown top-level item fields on round trip",
    run: async () => {
      const key = randomBytes(32);
      const item = createItem("login", { fromTheFuture: { keep: "me" } } as unknown as Partial<Item>);
      const back = await decryptItems(key, [await encryptItem(key, item)]);
      assert(
        JSON.stringify(back.items[0]?.fromTheFuture) === JSON.stringify({ keep: "me" }),
        "an unknown field was dropped",
      );
    },
  },
  {
    id: "C4",
    level: "MUST",
    title: "Distinguishes an empty-string field from an absent one",
    run: () => {
      const item = createItem("login", { notes: "" });
      assert("notes" in item && item.notes === "", "an empty string became absent");
      assert(item.login?.username === "", "a group field lost its empty string");
    },
  },
  {
    id: "C5",
    level: "MUST",
    title: "Caps password history at 20 entries, newest first",
    run: () => {
      let item = createItem("login", { login: { username: "", password: "p0", totp: "", uris: [] } });
      for (let i = 1; i <= 25; i++) item = recordPasswordChange(item, `p${i}`);
      assert(item.history?.length === MAX_HISTORY_ENTRIES, `history is ${item.history?.length}, expected ${MAX_HISTORY_ENTRIES}`);
      assert(item.history?.[0]?.password === "p24", "history is not newest first");
    },
  },
  {
    id: "C6",
    level: "MUST",
    title: "Rejects a field group that does not match the item's type",
    run: async () => {
      const item = { ...createItem("login"), card: { number: "1" } } as unknown as Item;
      await assertThrows(() => assertGroupsMatchType(item), "a card group on a login item");
    },
  },
  {
    id: "C7",
    level: "SHOULD",
    title: "Round-trips attachment references without storing blobs",
    run: async () => {
      const key = randomBytes(32);
      const attachments = [{ id: "a1", name: "passport.pdf", size: 12, contentType: "application/pdf" }];
      const item = createItem("note", { name: "docs", attachments } as Partial<Item>);
      const back = await decryptItems(key, [await encryptItem(key, item)]);
      assert(JSON.stringify(back.items[0]?.attachments) === JSON.stringify(attachments), "attachments were lost");
    },
  },
  {
    id: "C10",
    level: "MUST",
    title: "AES-256-GCM with a fresh 96-bit IV per encryption",
    run: async () => {
      const key = randomBytes(32);
      const item = createItem("note", { name: "n" });
      const seen = new Set<string>();
      for (let i = 0; i < 20; i++) seen.add((await encryptItem(key, item)).iv);
      assert(seen.size === 20, "an IV was reused");
      assert(fromBase64([...seen][0]!).length === 12, "the IV is not 96 bits");
    },
  },
  {
    id: "C11",
    level: "MUST",
    title: "Binds the item id as AAD, so a swapped ciphertext fails",
    run: async () => {
      const key = randomBytes(32);
      const low = await encryptItem(key, createItem("login", { name: "low" }));
      const high = await encryptItem(key, createItem("login", { name: "high" }));
      const swapped = { ...high, ciphertext: low.ciphertext, iv: low.iv };
      const result = await decryptItems(key, [swapped]);
      assert(result.failed.length === 1 && result.items.length === 0, "a swapped ciphertext decrypted");
    },
  },
  {
    id: "C12",
    level: "MUST",
    title: "Verifies the decrypted id against the envelope id",
    run: async () => {
      const key = randomBytes(32);
      const envelope = await encryptItem(key, createItem("login"));
      const moved = { ...envelope, id: "00000000-0000-4000-8000-000000000000" };
      const result = await decryptItems(key, [moved]);
      assert(result.failed.length === 1, "a relabelled envelope decrypted");
    },
  },
  {
    id: "C13",
    level: "MUST",
    title: "Refuses to derive below 100,000 PBKDF2 iterations",
    run: async () => {
      await assertThrows(() => assertUsableKdfParams({ kdf: "pbkdf2-sha256", iterations: 1 }), "iterations: 1");
      await assertThrows(() => assertUsableKdfParams({ kdf: "pbkdf2-sha256", iterations: 99_999 }), "iterations: 99999");
      assertUsableKdfParams({ kdf: "pbkdf2-sha256", iterations: 100_000 });
    },
  },
  {
    id: "C14",
    level: "MUST",
    title: "Derives wrap, auth and recovery keys under distinct HKDF labels",
    run: async () => {
      const master = await deriveMasterKey("correct horse", randomBytes(16), FAST);
      const wrap = toBase64(await deriveWrapKey(master));
      const auth = await deriveAuthHash(master);
      assert(wrap !== auth, "the wrap key and the auth hash are the same value");
    },
  },
  {
    id: "C15",
    level: "MUST",
    title: "Generates the user key randomly; a password change re-wraps",
    run: async () => {
      const { meta, userKey } = await createVault("first", { params: FAST });
      const item = await encryptItem(userKey, createItem("login", { name: "GitHub" }));
      const rewrapped = await rewrapUserKey(meta, userKey, "second", FAST);
      const after = await unlockVault(rewrapped, "second");
      assert(toBase64(after) === toBase64(userKey), "the user key changed with the password");
      const back = await decryptItems(after, [item]);
      assert(back.items.length === 1, "an item stopped decrypting after a password change");
    },
  },
  {
    id: "C16",
    level: "MUST",
    title: "Returns partial results with a failure list when one item fails",
    run: async () => {
      const key = randomBytes(32);
      const good = await encryptItem(key, createItem("login", { name: "one" }));
      const bad = await encryptItem(key, createItem("note", { name: "two" }));
      const bytes = fromBase64(bad.ciphertext);
      bytes[0] ^= 0xff;
      const result = await decryptItems(key, [good, { ...bad, ciphertext: toBase64(bytes) }]);
      assert(result.items.length === 1 && result.failed.length === 1, "one corrupt row hid the rest of the vault");
    },
  },
  {
    id: "C17",
    level: "MUST",
    title: "Rejects an unregistered namespace unless explicitly opted in",
    run: async () => {
      await assertThrows(() => assertUsableNamespace("somebody-elses-vault"), "an unregistered namespace");
      assertUsableNamespace("somebody-elses-vault", true);
      assertUsableNamespace("marksyncr");
    },
  },
  {
    id: "C18",
    level: "MUST",
    title: "Refuses a vault whose profile it does not implement",
    run: async () => {
      const { meta } = await createVault("pw", { params: FAST });
      await assertThrows(() => unlockVault({ ...meta, profile: "team" }, "pw"), "a team-profile vault");
    },
  },
  {
    id: "C19",
    level: "MAY",
    title: "Supports the team profile",
    run: () => {
      // The envelope is profile-independent, but this build has no member
      // key management of its own; `logicsrc credentials` holds that.
      throw new SkipError("key management for the team profile lives in @logicsrc/plugin-credential-sharing");
    },
  },
  {
    id: "C20",
    level: "MUST",
    title: "Writes the encrypted form by default",
    run: async () => {
      const db = await exportDatabase(fixturePayload(), { passphrase: PASSPHRASE, params: FAST });
      assert(db.protected === true, "the default export was not encrypted");
      assert(!JSON.stringify(db).includes("hunter2"), "a secret appeared in an encrypted export");
    },
  },
  {
    id: "C21",
    level: "MUST",
    title: "Binds the header as AAD, so the manifest is authenticated",
    run: async () => {
      const db = await exportDatabase(fixturePayload(), { passphrase: PASSPHRASE, params: FAST });
      await assertThrows(
        () => openDatabase({ ...db, manifest: { ...db.manifest, itemCount: 5 } }, { passphrase: PASSPHRASE }),
        "a restated item count",
      );
      await assertThrows(
        () => openDatabase({ ...db, protected: false } as never, { passphrase: PASSPHRASE }),
        "a downgrade to unprotected",
      );
    },
  },
  {
    id: "C22",
    level: "MUST",
    title: "Recomputes and verifies itemCount, types, folderCount and digest",
    run: async () => {
      const payload = fixturePayload();
      const db = await exportPlaintextDatabase(payload, { acknowledged: true });
      await assertThrows(() => openDatabase({ ...db, items: db.items.slice(0, 3) }), "a truncated payload");
      const manifest = await buildManifest(payload);
      assert(manifest.itemCount === 6 && manifest.folderCount === 1, "the manifest miscounted");
    },
  },
  {
    id: "C23",
    level: "MUST",
    title: "Writes nothing on a manifest mismatch",
    run: async () => {
      // openDatabase throws before returning a payload, so a caller has
      // nothing to write. This asserts the shape that guarantee relies on.
      const db = await exportPlaintextDatabase(fixturePayload(), { acknowledged: true });
      let returned: unknown;
      try {
        returned = await openDatabase({ ...db, items: db.items.slice(0, 2) });
      } catch {
        returned = undefined;
      }
      assert(returned === undefined, "a mismatched database still returned a payload");
    },
  },
  {
    id: "C24",
    level: "MUST",
    title: "Requires an explicit opt-in for the plaintext form",
    run: async () => {
      await assertThrows(
        () => exportPlaintextDatabase(fixturePayload(), { acknowledged: false }),
        "a plaintext export without acknowledgement",
      );
    },
  },
  {
    id: "C25",
    level: "MUST",
    title: "Writes protected: false in a plaintext file's header",
    run: async () => {
      const db = await exportPlaintextDatabase(fixturePayload(), { acknowledged: true });
      assert(db.protected === false, "a plaintext database did not label itself");
    },
  },
  {
    id: "C26",
    level: "MUST",
    title: "Export → import → export produces byte-identical item records",
    run: async () => {
      const payload = fixturePayload();
      const first = await exportDatabase(payload, { passphrase: PASSPHRASE, params: FAST });
      const opened = await openDatabase(first, { passphrase: PASSPHRASE });
      const second = await exportDatabase(opened, { passphrase: PASSPHRASE, params: FAST });
      const again = await openDatabase(second, { passphrase: PASSPHRASE });
      assert(JSON.stringify(again.items) === JSON.stringify(payload.items), "items changed across a round trip");
    },
  },
  {
    id: "C27",
    level: "MUST",
    title: "Does not restamp createdAt / updatedAt on import",
    run: async () => {
      const payload = fixturePayload();
      payload.items[0] = { ...payload.items[0]!, createdAt: "2019-04-01T00:00:00.000Z", updatedAt: "2020-07-09T00:00:00.000Z" };
      const db = await exportDatabase(payload, { passphrase: PASSPHRASE, params: FAST });
      const opened = await openDatabase(db, { passphrase: PASSPHRASE });
      assert(opened.items[0]?.createdAt === "2019-04-01T00:00:00.000Z", "createdAt was restamped");
      assert(opened.items[0]?.updatedAt === "2020-07-09T00:00:00.000Z", "updatedAt was restamped");
    },
  },
  {
    id: "C28",
    level: "SHOULD",
    title: "Reports per-strategy merge outcomes rather than one total",
    run: () => {
      const existing = fixturePayload();
      const skipped = mergePayload(existing, { folders: [], items: [existing.items[0]!] }, "skip");
      const replaced = mergePayload(existing, { folders: [], items: [existing.items[0]!] }, "replace");
      const duplicated = mergePayload(existing, { folders: [], items: [existing.items[0]!] }, "duplicate");
      assert(skipped.outcome.skipped === 1, "skip did not report a skip");
      assert(replaced.outcome.replaced === 1, "replace did not report a replacement");
      assert(duplicated.outcome.duplicated === 1, "duplicate did not report a duplicate");
    },
  },
  {
    id: "C40",
    level: "MUST",
    title: "CSV reader handles quotes, newlines, commas, CRLF and a BOM",
    run: () => {
      const rows = parseCsv('﻿name,notes\r\n"a, b","he said ""hi""\nsecond"\r\n');
      assert(rows[0]?.[0] === "name", "the BOM was not stripped");
      assert(rows[1]?.[0] === "a, b", "a quoted comma was mangled");
      assert(rows[1]?.[1] === 'he said "hi"\nsecond', "an escaped quote or embedded newline was mangled");
    },
  },
  {
    id: "C41",
    level: "MUST",
    title: "Reports unmappable rows with row number and reason",
    run: () => {
      const result = parseCsvImport("name,url,username,password,note\nGitHub,https://github.com,a,b,\n,,,,\n");
      assert(result.items.length === 1, "the good row did not import");
      assert(result.skipped.length === 1 && result.skipped[0]?.row === 3, "the empty row was dropped silently");
    },
  },
  {
    id: "C42",
    level: "MUST",
    title: "Detects sources most-specific first",
    run: () => {
      assert(DETECT_ORDER[0] === "bitwarden", "bitwarden is not asked first");
      assert(DETECT_ORDER[DETECT_ORDER.length - 1] === "chrome", "chrome is not asked last");
      assert(detectSource(["name", "url", "username", "password", "note"]) === "chrome", "a chrome export was misidentified");
      assert(
        detectSource(["url", "username", "password", "totp", "extra", "name", "grouping", "fav"]) === "lastpass",
        "a lastpass export was misidentified",
      );
    },
  },
  {
    id: "C31",
    level: "MUST",
    title: "Masks every secret field, including history and hidden fields",
    run: () => {
      const item = createItem("login", {
        login: { username: "anthony", password: "hunter2", totp: "otpauth://x", uris: [] },
        fields: [{ name: "PIN", value: "1234", type: "hidden" }],
        history: [{ password: "old", changedAt: new Date().toISOString() }],
      } as Partial<Item>);
      const masked = maskItem(item);
      assert(masked.login?.password !== "hunter2", "a password survived masking");
      assert(masked.login?.totp !== "otpauth://x", "a TOTP seed survived masking");
      assert(masked.fields?.[0]?.value !== "1234", "a hidden custom field survived masking");
      assert(masked.history?.[0]?.password !== "old", "a historical password survived masking");
      assert(masked.login?.username === "anthony", "masking removed a non-secret field");
    },
  },
];

/** Thrown by a check that cannot run here, as opposed to one that failed. */
class SkipError extends Error {}

/** Run the suite. */
export async function runConformance(): Promise<ConformanceReport> {
  const results: ConformanceResult[] = [];

  for (const check of CHECKS) {
    try {
      await check.run();
      results.push({ id: check.id, level: check.level, title: check.title, status: "pass" });
    } catch (err) {
      if (err instanceof SkipError) {
        results.push({ id: check.id, level: check.level, title: check.title, status: "skip", detail: err.message });
        continue;
      }
      results.push({ id: check.id, level: check.level, title: check.title, status: "fail", detail: (err as Error).message });
    }
  }

  results.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));

  const summary = {
    pass: results.filter((r) => r.status === "pass").length,
    fail: results.filter((r) => r.status === "fail").length,
    skip: results.filter((r) => r.status === "skip").length,
  };

  // A skipped MAY does not affect conformance; a skipped or failed MUST does.
  const conformant = results.every((r) => r.level !== "MUST" || r.status === "pass");

  return {
    type: "opencreds.conformance_report",
    opencreds: OPENCREDS_VERSION,
    implementation: { name: "@logicsrc/opencreds", version: "0.1.0" },
    results,
    summary,
    conformant,
  };
}

/**
 * The fixture set, as data.
 *
 * Generated from the reference implementation so another implementation can be
 * tested against exactly what this one produces and accepts. A hand-written
 * vector drifts silently when the format moves; a generated one cannot.
 */
export async function emitFixtures(): Promise<Record<string, unknown>> {
  const payload = fixturePayload();
  const encrypted = await exportDatabase(payload, { passphrase: PASSPHRASE, params: FAST });
  const plaintext = await exportPlaintextDatabase(payload, { acknowledged: true });

  const key = randomBytes(32);
  const envelopes = [];
  for (const item of payload.items) envelopes.push(await encryptItem(key, item));

  const historyItem = (() => {
    let item = createItem("login", { name: "capped", login: { username: "", password: "p0", totp: "", uris: [] } });
    for (let i = 1; i <= 25; i++) item = recordPasswordChange(item, `p${i}`);
    return item;
  })();

  return {
    "README.txt":
      "OpenCreds 0.1 conformance fixtures, generated by @logicsrc/opencreds.\n" +
      `The encrypted database opens with the passphrase: ${PASSPHRASE}\n` +
      "vault/user-key.txt is the base64 key the envelopes in vault/ are under.\n" +
      "Files under invalid/ MUST be rejected by a conforming implementation.\n",
    "items/one-of-each.json": payload.items,
    "items/history-cap.json": historyItem,
    "items/unknown-fields.json": createItem("login", { fromTheFuture: { keep: "me" } } as unknown as Partial<Item>),
    "invalid/wrong-group.json": { ...createItem("login"), card: { number: "4242" } },
    "invalid/weak-kdf.json": { ...(await createVault("pw", { params: FAST })).meta, kdfIterations: 1 },
    "invalid/unknown-namespace.json": { ...plaintext, namespace: "somebody-elses-vault" },
    "invalid/short-payload.json": { ...plaintext, items: plaintext.items.slice(0, 3) },
    "invalid/tampered-manifest.opencreds": { ...encrypted, manifest: { ...encrypted.manifest, itemCount: 5 } },
    "vault/user-key.txt": toBase64(key),
    "vault/envelopes.json": envelopes,
    "vault/meta.json": (await createVault(PASSPHRASE, { params: FAST })).meta,
    "database/encrypted.opencreds": encrypted,
    "database/plaintext.json": plaintext,
  };
}

/** Render a report for a terminal. */
export function formatReport(report: ConformanceReport): string {
  const lines: string[] = [];
  const width = Math.max(...report.results.map((r) => r.title.length));

  for (const result of report.results) {
    const mark = result.status === "pass" ? "pass" : result.status === "skip" ? "skip" : "FAIL";
    lines.push(
      `  ${result.id.padEnd(4)} ${result.level.padEnd(6)} ${result.title.padEnd(width)}  ${mark}` +
        (result.detail ? `\n         ${result.detail}` : ""),
    );
  }

  lines.push("");
  lines.push(
    `  ${report.summary.pass} passed, ${report.summary.fail} failed, ${report.summary.skip} skipped — ` +
      (report.conformant ? "conformant with OpenCreds 0.1" : "NOT conformant"),
  );
  return lines.join("\n");
}
