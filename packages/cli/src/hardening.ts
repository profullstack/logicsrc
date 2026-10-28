import { existsSync, readFileSync, rmSync } from "node:fs";
import {
  TeamApiError,
  checkAndPinKey,
  decryptValue,
  encryptValue,
  fingerprintValue,
  fingerprintsEqual,
  generateIdentityKeyPair,
  identityPath,
  keyFingerprint,
  planVaultRekey,
  publicKeyForSecret,
  readIdentity,
  repinKey,
  resolveApiUrl,
  saveIdentity,
  unwrapVaultKey,
  wrapVaultKey,
  type RemoteVault,
  type TeamClient
} from "@logicsrc/plugin-credential-sharing";
import { authedClient, splitVaultName, vaultName } from "./teams.js";
import { print, type OutputFormat } from "./format.js";

/**
 * Post-incident commands (2026-10-28): rotate your identity key, re-key vaults,
 * read the audit trail, and import an identity copied from another machine.
 *
 * All crypto stays on this machine. The server sees public keys, sealed boxes
 * and ciphertext only, as everywhere else in `logicsrc teams`.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const b64ToUtf8 = (b64: string) => Buffer.from(b64, "base64").toString("utf8");

function personClient() {
  const { client, identity } = authedClient();
  if (identity.keyKind === "machine") {
    throw new Error("This needs a person's login (logicsrc login), not a machine API key.");
  }
  return { client, identity, apiUrl: resolveApiUrl(identity) };
}

/** The server's key must be the one this machine holds, or nothing here can work. */
async function assertLocalKeyIsRegistered(client: TeamClient, publicKey: string): Promise<void> {
  const me = await client.me();
  if (me.user.publicKey !== publicKey) {
    throw new Error(
      `This machine's identity key (${keyFingerprint(publicKey)}) is not the one registered for ${me.user.email} (${keyFingerprint(me.user.publicKey) ?? "none"}). ` +
        "Run this on the machine that holds the registered key, or import it here: logicsrc teams key --import"
    );
  }
}

// ------------------------------------------------------------- rotate-identity

export async function teamsRotateIdentityAction(options: { format: OutputFormat }): Promise<void> {
  const { client, identity, apiUrl } = personClient();
  if (!identity.keys?.secretKey || (await publicKeyForSecret(identity.keys.secretKey)) !== identity.keys.publicKey) {
    throw new Error(`${identityPath()} is missing or damaged; cannot prove the current key.`);
  }
  await assertLocalKeyIsRegistered(client, identity.keys.publicKey);

  const next = await generateIdentityKeyPair();
  // Keep the new key on disk BEFORE the server switches to it: if this process
  // dies between the server's commit and the local write, the key is not lost.
  const pending = `${identityPath()}.next`;
  saveIdentity({ ...identity, keys: next }, pending);

  let result: Awaited<ReturnType<TeamClient["rotateIdentity"]>> | undefined;
  for (let attempt = 1; attempt <= 3 && !result; attempt++) {
    const { grants } = await client.myGrants();
    const resealed: Array<{ vaultId: string; wrappedDek: string }> = [];
    for (const g of grants) {
      const dek = await unwrapVaultKey(g.wrappedDek, identity.keys);
      resealed.push({ vaultId: g.vaultId, wrappedDek: await wrapVaultKey(dek, next.publicKey) });
    }
    const challenge = await client.identityChallenge();
    const answer = b64ToUtf8(await unwrapVaultKey(challenge.sealed, identity.keys));
    try {
      result = await client.rotateIdentity({ publicKey: next.publicKey, challengeId: challenge.challengeId, answer, grants: resealed });
    } catch (error) {
      // A grant added or removed while we were re-sealing: read them again.
      if (error instanceof TeamApiError && error.status === 409 && attempt < 3) { await sleep(500); continue; }
      rmSync(pending, { force: true });
      throw error;
    }
  }
  if (!result) {
    rmSync(pending, { force: true });
    throw new Error("Identity rotation did not complete; nothing changed.");
  }

  const stored = readIdentity() ?? identity;
  saveIdentity({ ...stored, keys: next });
  rmSync(pending, { force: true });
  repinKey(apiUrl, identity.email, next.publicKey);

  console.error(
    `Rotated your identity key: ${result.previousFingerprint} -> ${result.fingerprint}. Re-sealed ${result.regranted} vault grant(s). ` +
      `${identityPath()} now holds the new key (0600).`
  );
  console.error(
    "The vault keys themselves did not change. If the old secret key leaked, re-key the vaults now: logicsrc teams rekey <team> --all\n" +
      "Other machines with the old key must import the new one (logicsrc teams key here, then logicsrc teams key --import there). " +
      "Teammates will see your fingerprint change and must confirm it before granting you anything."
  );
  print({ previousFingerprint: result.previousFingerprint, fingerprint: result.fingerprint, regranted: result.regranted }, options.format);
}

// ------------------------------------------------------------------ key import

export async function teamsKeyImportAction(options: { format: OutputFormat }): Promise<void> {
  const raw = readFileSync(0, "utf8").trim();
  if (!raw) throw new Error("Paste the identity secret key (or the whole identity.json) on stdin.");
  let secretKey = raw;
  if (raw.startsWith("{")) {
    const parsed = JSON.parse(raw) as { keys?: { secretKey?: string }; secretKey?: string };
    secretKey = parsed.keys?.secretKey ?? parsed.secretKey ?? "";
  }
  if (!/^[A-Za-z0-9+/]{43}=$/.test(secretKey)) throw new Error("That is not a base64 X25519 secret key.");
  const publicKey = await publicKeyForSecret(secretKey);
  const current = readIdentity();
  if (current?.apiToken) {
    const { client } = authedClient();
    const me = await client.me();
    if (me.user.publicKey && me.user.publicKey !== publicKey) {
      throw new Error(
        `That key (${keyFingerprint(publicKey)}) is not the one registered for ${me.user.email} (${keyFingerprint(me.user.publicKey)}). Nothing written.`
      );
    }
    if (!me.user.publicKey) await client.uploadPublicKey(publicKey);
  }
  if (current?.keys?.secretKey && current.keys.publicKey !== publicKey && existsSync(identityPath())) {
    console.error(`Replacing this machine's previous identity key (${keyFingerprint(current.keys.publicKey)}).`);
  }
  saveIdentity({ ...(current ?? { createdAt: new Date().toISOString() }), keys: { publicKey, secretKey } } as Parameters<typeof saveIdentity>[0]);
  console.error(`Imported identity key ${keyFingerprint(publicKey)} into ${identityPath()} (0600).`);
  print({ fingerprint: keyFingerprint(publicKey), file: identityPath() }, options.format);
}

// ----------------------------------------------------------------------- rekey

export interface RekeyOptions {
  all?: boolean;
  acceptKeyChange?: string[];
  concurrency?: number;
  dryRun?: boolean;
  format: OutputFormat;
}

interface RekeyOutcome {
  vault: string;
  status: "rekeyed" | "planned" | "skipped" | "failed";
  secrets?: number;
  members?: number;
  machineKeys?: number;
  keysDropped?: string[];
  repaired?: number;
  unreadable?: string[];
  keyVersion?: number;
  note?: string;
}

interface Retired {
  vaultId: string;
  vault: string;
  oldDeks: string[];
}

/**
 * Check every secret opens under the vault's CURRENT key. A value that does
 * not, but opens under a retired one, was pushed by a client that read the old
 * key just before the re-key: re-seal it under the current key. Values never
 * change here (the fingerprint is checked both ways).
 */
export async function verifyAndRepair(client: TeamClient, identityKeys: { publicKey: string; secretKey: string }, retired: Retired) {
  const { wrappedDek, keyVersion } = await client.getMyGrant(retired.vaultId);
  const dek = await unwrapVaultKey(wrappedDek, identityKeys);
  const { secrets } = await client.listSecrets(retired.vaultId);
  const repairs: Array<{ name: string; nonce: string; ciphertext: string; fingerprint: string }> = [];
  const unreadable: string[] = [];
  for (const s of secrets) {
    let value: string | null = null;
    try {
      value = await decryptValue({ nonce: s.nonce, ciphertext: s.ciphertext }, dek);
      if (fingerprintsEqual(s.fingerprint, fingerprintValue(value))) continue;
      value = null;
    } catch { /* not under the current key */ }
    for (const old of retired.oldDeks) {
      try {
        const v = await decryptValue({ nonce: s.nonce, ciphertext: s.ciphertext }, old);
        if (fingerprintsEqual(s.fingerprint, fingerprintValue(v))) { value = v; break; }
      } catch { /* try the next */ }
    }
    if (value === null) { unreadable.push(s.name); continue; }
    const sealed = await encryptValue(value, dek);
    repairs.push({ name: s.name, nonce: sealed.nonce, ciphertext: sealed.ciphertext, fingerprint: fingerprintValue(value) });
  }
  if (repairs.length) await client.putSecrets(retired.vaultId, repairs, [], keyVersion);
  return { repaired: repairs.length, unreadable, secrets: secrets.length };
}

async function rekeyOne(
  client: TeamClient,
  identity: { email: string; keys: { publicKey: string; secretKey: string } },
  apiUrl: string,
  v: RemoteVault,
  options: RekeyOptions,
  retiredOut: Retired[]
): Promise<RekeyOutcome> {
  if (!v.hasAccess) return { vault: v.name, status: "skipped", note: "you hold no grant" };
  const accept = options.acceptKeyChange ?? [];
  const oldDeks: string[] = [];
  for (let attempt = 1; attempt <= 4; attempt++) {
    const [{ wrappedDek }, { secrets }, { grants }, { keyGrants }] = await Promise.all([
      client.getMyGrant(v.id),
      client.listSecrets(v.id),
      client.listGrants(v.id),
      client.listKeyGrants(v.id)
    ]);
    // Seal only to keys this machine has pinned (or pins now, first use).
    for (const g of grants) {
      if (!g.hasAccess || !g.publicKey) continue;
      if (g.email.toLowerCase() === identity.email.toLowerCase()) {
        if (g.publicKey !== identity.keys.publicKey) throw new Error(`The server holds a different key for you (${keyFingerprint(g.publicKey)}) than this machine (${keyFingerprint(identity.keys.publicKey)}). Refusing to re-key.`);
        continue;
      }
      checkAndPinKey(apiUrl, g.email, g.publicKey, accept);
    }
    for (const k of keyGrants) {
      if (k.publicKey) checkAndPinKey(apiUrl, `key:${k.keyId}`, k.publicKey, accept.includes(k.name) || accept.includes(k.keyId) || accept.includes(`key:${k.keyId}`));
    }
    const oldDek = await unwrapVaultKey(wrappedDek, identity.keys);
    if (!oldDeks.includes(oldDek)) oldDeks.push(oldDek);
    const plan = await planVaultRekey({
      myWrappedDek: wrappedDek,
      identity: identity.keys,
      secrets: secrets.map((s) => ({ name: s.name, nonce: s.nonce, ciphertext: s.ciphertext, fingerprint: s.fingerprint })),
      members: grants.map((g) => ({ email: g.email, publicKey: g.publicKey, status: g.status, hasAccess: g.hasAccess })),
      scope: "all",
      machineKeys: keyGrants.map((k) => ({ keyId: k.keyId, name: k.name, owner: k.owner, publicKey: k.publicKey }))
    });
    if (options.dryRun) {
      return { vault: v.name, status: "planned", secrets: plan.secrets.length, members: plan.grants.length, machineKeys: plan.keyGrants.length, keysDropped: plan.keysDropped };
    }
    try {
      const result = await client.rekeyVault(v.id, { grants: plan.grants, secrets: plan.secrets, revoke: plan.revoked, keyGrants: plan.keyGrants });
      const retired = { vaultId: v.id, vault: v.name, oldDeks };
      retiredOut.push(retired);
      const check = await verifyAndRepair(client, identity.keys, retired);
      return {
        vault: v.name,
        status: "rekeyed",
        secrets: result.rekeyed,
        members: result.granted.length,
        machineKeys: result.keysResealed?.length ?? 0,
        keysDropped: result.keysDropped ?? [],
        repaired: check.repaired,
        unreadable: check.unreadable,
        keyVersion: result.keyVersion
      };
    } catch (error) {
      // 409: a push changed the vault between our read and the re-key. Read again.
      if (error instanceof TeamApiError && error.status === 409 && attempt < 4) { await sleep(400 * attempt); continue; }
      throw error;
    }
  }
  return { vault: v.name, status: "failed", note: "kept changing under us" };
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

export async function teamsRekeyAction(slug: string, project: string | undefined, env: string | undefined, options: RekeyOptions): Promise<void> {
  const { client, identity, apiUrl } = personClient();
  await assertLocalKeyIsRegistered(client, identity.keys.publicKey);
  const { vaults } = await client.listVaults(slug);
  let selected: RemoteVault[];
  if (options.all) {
    if (project || env) throw new Error("Give <project> <env> or --all, not both.");
    selected = vaults;
  } else {
    if (!project || !env) throw new Error("Re-key which vault? Give <project> <env>, or --all for every vault you can open.");
    const name = vaultName(project, env);
    const found = vaults.find((v) => v.name === name);
    if (!found) throw new Error(`Vault "${name}" not found in team "${slug}".`);
    selected = [found];
  }

  const retired: Retired[] = [];
  let done = 0;
  const outcomes = await mapLimit(selected, Math.max(1, Math.min(options.concurrency ?? 4, 8)), async (v) => {
    try {
      return await rekeyOne(client, identity, apiUrl, v, options, retired);
    } catch (error) {
      return { vault: v.name, status: "failed", note: error instanceof Error ? error.message.split("\n")[0] : String(error) } as RekeyOutcome;
    } finally {
      done++;
      if (selected.length > 1 && process.stderr.isTTY) process.stderr.write(`\r  ${done}/${selected.length} vaults`);
    }
  });
  if (selected.length > 1 && process.stderr.isTTY) process.stderr.write("\n");

  // A push that read the old key moments before a re-key can land after the
  // per-vault check. One more pass over everything re-keyed catches it.
  let lateRepairs = 0;
  if (!options.dryRun && retired.length) {
    await sleep(2000);
    const byVault = new Map(outcomes.map((o) => [o.vault, o]));
    await mapLimit(retired, Math.max(1, Math.min(options.concurrency ?? 4, 8)), async (r) => {
      try {
        const check = await verifyAndRepair(client, identity.keys, r);
        lateRepairs += check.repaired;
        const o = byVault.get(r.vault);
        if (o) { o.repaired = (o.repaired ?? 0) + check.repaired; o.unreadable = check.unreadable; }
      } catch (error) {
        const o = byVault.get(r.vault);
        if (o) o.note = `verify failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    });
  }

  const count = (s: RekeyOutcome["status"]) => outcomes.filter((o) => o.status === s).length;
  const unreadable = outcomes.filter((o) => o.unreadable?.length);
  console.error(
    options.dryRun
      ? `Dry run: ${count("planned")} vault(s) would be re-keyed, ${count("skipped")} skipped, ${count("failed")} cannot be.`
      : `Re-keyed ${count("rekeyed")} vault(s); ${count("skipped")} skipped (no grant), ${count("failed")} failed. ` +
          `Repaired ${outcomes.reduce((n, o) => n + (o.repaired ?? 0), 0)} value(s) written under a retired key (${lateRepairs} in the final pass).` +
          (unreadable.length ? ` ${unreadable.length} vault(s) hold values that open under no key we know: see "unreadable".` : "")
  );
  print(
    outcomes.map((o) => ({
      vault: o.vault,
      status: o.status,
      secrets: o.secrets ?? "",
      members: o.members ?? "",
      machineKeys: o.machineKeys ?? "",
      ...(o.keysDropped?.length ? { keysDropped: o.keysDropped.join(",") } : {}),
      ...(o.repaired ? { repaired: o.repaired } : {}),
      ...(o.unreadable?.length ? { unreadable: o.unreadable.join(",") } : {}),
      ...(o.note ? { note: o.note } : {})
    })),
    options.format
  );
  if (count("failed")) process.exitCode = 1;
}

// ----------------------------------------------------------------------- audit

function parseSince(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /^(\d+)\s*(m|h|d|w)$/i.exec(value.trim());
  if (m) return Date.now() - Number(m[1]) * { m: 60e3, h: 3600e3, d: 86400e3, w: 7 * 86400e3 }[m[2]!.toLowerCase() as "m"];
  const t = Date.parse(value);
  if (Number.isNaN(t)) throw new Error(`Cannot read --since "${value}". Use 24h, 7d, or a date.`);
  return t;
}

export async function teamsAuditAction(
  slug: string,
  project: string | undefined,
  env: string | undefined,
  options: { actor?: string; action?: string; since?: string; limit?: string; format: OutputFormat }
): Promise<void> {
  const { client } = authedClient();
  if (project && !env) throw new Error("Give both <project> and <env>, or neither.");
  const { audit } = await client.teamAudit(slug, {
    vault: project && env ? vaultName(project, env) : undefined,
    actor: options.actor,
    action: options.action,
    since: parseSince(options.since),
    limit: options.limit ? Number(options.limit) : 200
  });
  print(
    audit.length
      ? audit.map((a) => ({
          at: new Date(a.at).toISOString().replace("T", " ").slice(0, 19),
          actor: a.actor ?? "?",
          via: a.apiKey ? `${a.apiKeyKind === "machine" ? "machine:" : ""}${a.apiKey}` : "",
          action: a.action,
          vault: a.vault ?? "",
          target: a.apiKey ? "" : (a.target ?? ""),
          ip: a.ip ?? "",
          userAgent: options.format === "table" ? (a.userAgent ?? "").slice(0, 40) : (a.userAgent ?? "")
        }))
      : [{ note: "No audit rows match." }],
    options.format
  );
}

export { splitVaultName };
