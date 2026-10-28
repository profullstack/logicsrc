import { randomBytes, randomInt } from "node:crypto";
import { ROTATION_ENTRY_PREFIX, fingerprintValue } from "@logicsrc/plugin-credential-sharing";

/** Every empty value shares this fingerprint; an empty value is nothing to rotate. */
export const EMPTY_FINGERPRINT = fingerprintValue("");

/** Server timestamps arrive as ISO strings or epoch seconds; normalise to ISO. */
export function isoTime(value: unknown): string {
  if (typeof value === "number") return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  if (typeof value === "string" && /^\d+$/.test(value)) return isoTime(Number(value));
  return String(value ?? "");
}

/**
 * How to rotate a secret's VALUE (not the vault key: that is `credentials
 * rotate`). Every vault entry can carry its own instructions in a companion
 * entry `__ROTATE__<KEY>` (JSON, encrypted like any other value), so an agent
 * that can read the vault can also rotate what is in it. Entries without one
 * fall back to the built-in catalog below, matched on the key name.
 *
 * Methods:
 *   random      we mint the new value ourselves (shared secrets we invented:
 *               cron tokens, session secrets). Safe to automate.
 *   ssh-keygen  new ed25519 keypair; the private key goes in the vault, the
 *               public key has to be installed where the old one was.
 *   command     a shell command that prints the new value on stdout (a
 *               provider CLI that can mint keys). Runs only with --approve.
 *   manual      a person or agent follows `steps` at `url`. Never automatic:
 *               provider-issued keys, wallet seeds, encryption keys that
 *               protect stored data.
 */
export type RotationMethod = "random" | "ssh-keygen" | "command" | "manual";
export type RandomFormat = "hex" | "base64" | "base64url" | "alnum";

export interface RotationSpec {
  method: RotationMethod;
  /** random: alphabet; defaults to the old value's shape. */
  format?: RandomFormat;
  /** random: length in characters; defaults to the old value's length (min 32). */
  length?: number;
  /** command: prints the new value on stdout. */
  command?: string;
  /** Where to do it (provider dashboard, docs). */
  url?: string;
  /** What to do, in order. For manual rotations this is the whole job. */
  steps?: string[];
  /** What reads this value and needs a restart/redeploy after it changes. */
  consumers?: string[];
  /** Why this method; shown in the plan. */
  note?: string;
}

export const ROTATE_PREFIX = ROTATION_ENTRY_PREFIX;

export function isRotationEntry(name: string): boolean {
  return name.startsWith(ROTATE_PREFIX);
}

export function rotationEntryName(key: string): string {
  return `${ROTATE_PREFIX}${key}`;
}

const METHODS: readonly RotationMethod[] = ["random", "ssh-keygen", "command", "manual"];
const FORMATS: readonly RandomFormat[] = ["hex", "base64", "base64url", "alnum"];

/** Parse and validate a stored spec. Throws with a message naming the problem. */
export function parseRotationSpec(raw: string): RotationSpec {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("rotation instructions are not valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("rotation instructions must be a JSON object");
  const v = value as Record<string, unknown>;
  if (!METHODS.includes(v.method as RotationMethod)) throw new Error(`method must be one of ${METHODS.join(", ")}`);
  if (v.format !== undefined && !FORMATS.includes(v.format as RandomFormat)) throw new Error(`format must be one of ${FORMATS.join(", ")}`);
  if (v.length !== undefined && !(Number.isInteger(v.length) && (v.length as number) >= 16 && (v.length as number) <= 512)) {
    throw new Error("length must be an integer between 16 and 512");
  }
  if (v.method === "command" && (typeof v.command !== "string" || !v.command.trim())) throw new Error("method command needs a command");
  const strings = (x: unknown): string[] | undefined =>
    Array.isArray(x) ? x.filter((s): s is string => typeof s === "string" && s.trim() !== "") : undefined;
  return {
    method: v.method as RotationMethod,
    ...(v.format ? { format: v.format as RandomFormat } : {}),
    ...(v.length ? { length: v.length as number } : {}),
    ...(typeof v.command === "string" ? { command: v.command } : {}),
    ...(typeof v.url === "string" ? { url: v.url } : {}),
    ...(strings(v.steps) ? { steps: strings(v.steps) } : {}),
    ...(strings(v.consumers) ? { consumers: strings(v.consumers) } : {}),
    ...(typeof v.note === "string" ? { note: v.note } : {})
  };
}

const REVOKE = "Revoke the old key once every consumer runs on the new one.";

function provider(name: string, url: string, extra: string[] = []): RotationSpec {
  return {
    method: "manual",
    url,
    steps: [`Create a new key in ${name} (${url}).`, ...extra, "Store it: logicsrc teams rotate-keys <team> <project> <env> --key <KEY> --set-from-stdin", REVOKE]
  };
}

interface CatalogRule {
  test: RegExp;
  spec: RotationSpec;
}

/**
 * Order matters: the first match wins, so specific names come before the broad
 * suffix rules at the bottom.
 */
const CATALOG: CatalogRule[] = [
  // Things whose "rotation" moves money or re-encrypts data: never automatic.
  {
    test: /(MNEMONIC|SEED_PHRASE|WALLET_PRIVATE_KEY|^(EVM|SOLANA|SOL|ETH|BTC|TRON)_PRIVATE_KEY$|X402_.*PRIVATE_KEY)/,
    spec: {
      method: "manual",
      note: "a wallet key: rotating it means moving funds",
      steps: [
        "Generate a new wallet on a trusted machine.",
        "Move every balance (tokens and native gas) from the old address to the new one.",
        "Store the new key/seed under the same name, then update anything that pays to or watches the old address.",
        "Never reuse the old seed: assume it is public."
      ]
    }
  },
  {
    test: /(^|_)(ENCRYPTION_KEY|MASTER_KEY|DB_ENCRYPTION_KEY|SETTINGS_ENCRYPTION_KEY|LN_KEY_ENCRYPTION_KEY|NEXT_SERVER_ACTIONS_ENCRYPTION_KEY)$/,
    spec: {
      method: "manual",
      note: "protects data at rest: a new value makes old ciphertext unreadable",
      steps: [
        "Add the new key next to the old one (dual-read), or run the app's re-encryption migration.",
        "Re-encrypt stored data under the new key.",
        "Remove the old key only after every row decrypts with the new one."
      ]
    }
  },
  {
    // Raw keys (DEPLOY_KEY=...) and the ssh provider's file envelopes (SSH_ID_ED25519).
    test: /(^|_)(SSH_PRIVATE_KEY|DEPLOY_KEY|SSH_KEY)$|^SSH_(.*_)?ID_(RSA|ED25519|ECDSA|DSA)(_[A-Z0-9_]+)?$|^SSH_.*_(KEY|PEM)$/,
    spec: {
      method: "ssh-keygen",
      steps: [
        "Install the new public key everywhere the old one was authorized (authorized_keys on every host, GitHub deploy/user keys, CI secrets).",
        "Remove the old public key from all of those places.",
        "Pull the new private key onto the machines that use it: logicsrc teams pull / logicsrc ssh pull."
      ]
    }
  },
  // Secrets we invent and only we check: mint a new random value.
  {
    // Exact names, or our own *_CRON_SECRET / *_ADMIN_TOKEN style suffixes. A
    // provider prefix (META_APP_SECRET, GOOGLE_AUTH_SECRET) is THEIR secret and
    // must never be replaced with random bytes.
    test: /^(APP_SECRET|AUTH_SECRET|BETTER_AUTH_SECRET|NEXTAUTH_SECRET|SESSION_SECRET|COOKIE_SECRET|JWT_SIGNING_SECRET|([A-Z0-9]+_)*(CRON_SECRET|INTERNAL_API_KEY|ADMIN_TOKEN|CLI_SESSION_SECRET|WEBHOOK_SIGNING_SECRET|REPUTATION_SIGNING_SECRET|OIDC_SIGNING_SECRET))$/,
    spec: { method: "random", steps: ["Redeploy every consumer so both sides use the new value."] }
  },
  // Provider-issued keys.
  { test: /^STRIPE_(SECRET|RESTRICTED)_KEY$/, spec: provider("the Stripe dashboard (Developers > API keys > Roll key)", "https://dashboard.stripe.com/apikeys") },
  { test: /^STRIPE.*WEBHOOK_SECRET$/, spec: provider("the Stripe webhook endpoint (Roll secret)", "https://dashboard.stripe.com/webhooks") },
  { test: /^(GITHUB|GH)_(TOKEN|PAT)$|^GITHUB_APP_PRIVATE_KEY$/, spec: provider("GitHub", "https://github.com/settings/tokens") },
  { test: /^ANTHROPIC_API_KEY$/, spec: provider("the Anthropic console", "https://console.anthropic.com/settings/keys") },
  { test: /^OPENAI_API_KEY$/, spec: provider("the OpenAI dashboard", "https://platform.openai.com/api-keys") },
  { test: /^GEMINI_API_KEY$|^GOOGLE_API_KEY$/, spec: provider("Google AI Studio", "https://aistudio.google.com/app/apikey") },
  { test: /^RESEND_API_KEY$/, spec: provider("Resend", "https://resend.com/api-keys") },
  { test: /^TELNYX_API_KEY$/, spec: provider("Telnyx", "https://portal.telnyx.com/#/app/api-keys") },
  { test: /^ELEVENLABS_API_KEY$/, spec: provider("ElevenLabs", "https://elevenlabs.io/app/settings/api-keys") },
  { test: /^(COINPAY|COINPAYPORTAL)_API_KEY$|^COINPAY_X402_KEY$/, spec: provider("CoinPay (business > API keys)", "https://coinpayportal.com/dashboard") },
  { test: /^COINPAY.*WEBHOOK_SECRET$/, spec: provider("CoinPay (business > webhook secret > regenerate)", "https://coinpayportal.com/dashboard") },
  { test: /^CLOUDFLARE_API_TOKEN$|^CF_API_TOKEN$/, spec: provider("Cloudflare", "https://dash.cloudflare.com/profile/api-tokens") },
  { test: /^PORKBUN_(API|SECRET)_KEY$/, spec: provider("Porkbun", "https://porkbun.com/account/api") },
  {
    test: /^(SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|SUPABASE_JWT_SECRET|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_ANON_KEY|JWT_SECRET)$/,
    spec: {
      method: "manual",
      note: "the Supabase JWT secret signs every key and session",
      steps: [
        "Self-hosted: set a new JWT secret, mint new anon + service_role keys from it, restart the stack (all sessions end).",
        "Hosted: Project settings > API > generate new JWT secret / new API keys.",
        "Update every vault holding the old keys (they share a fingerprint), redeploy, then revoke the old ones."
      ]
    }
  },
  { test: /(^|_)WEBHOOK_SECRET$/, spec: provider("the service that signs the webhook", "") },
  // Broad fallbacks for anything provider-issued.
  { test: /(_API_KEY|_API_SECRET|_SECRET_KEY|_ACCESS_KEY|_TOKEN|_PRIVATE_KEY|_PASSWORD|_SECRET)$/, spec: provider("the issuing provider's dashboard", "") }
];

/** Names that read like credentials. Plain config (MODE, URL, *_USD) is not planned at all. */
export function looksSecret(key: string): boolean {
  return /(KEY|SECRET|TOKEN(?!S)|PASSWORD|PASSWD|_PASS$|PRIVATE|MNEMONIC|SEED_PHRASE|_SEED$|CREDENTIAL|AUTH|SALT|SIGNING|COOKIE|SESSION|DSN|CONNECTION_STRING|DATABASE_URL|_PEM|_P12|CERT)/i.test(key);
}

/** Built-in instructions for a key name, or null when we know nothing. */
/** Public halves, ssh config and browser-public values: nothing to rotate. */
export function isNotSecret(key: string): boolean {
  const name = key.toUpperCase();
  return /^SSH_.*(_PUB|CONFIG|KNOWN_HOSTS|AUTHORIZED_KEYS|_CONF)$/.test(name) || /_PUBLIC_KEY$|^NEXT_PUBLIC_(?!SUPABASE_ANON_KEY)/.test(name);
}

export function catalogSpec(key: string): RotationSpec | null {
  const name = key.toUpperCase();
  if (isNotSecret(name)) return null;
  const rule = CATALOG.find((r) => r.test.test(name));
  if (!rule) return null;
  const spec = { ...rule.spec, steps: rule.spec.steps ? [...rule.spec.steps] : undefined };
  if (spec.url === "") delete spec.url;
  return spec;
}

/** The alphabet an existing value looks like it was drawn from. */
export function detectFormat(value: string): RandomFormat {
  if (/^[0-9a-f]+$/i.test(value)) return "hex";
  if (/^[A-Za-z0-9]+$/.test(value)) return "alnum";
  if (/^[A-Za-z0-9_-]+$/.test(value)) return "base64url";
  return "base64";
}

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * A new random value. Matches the old value's alphabet and length unless the
 * spec says otherwise, so a consumer that validates the shape keeps working;
 * never shorter than 32 characters.
 */
export function generateRandomSecret(spec: Pick<RotationSpec, "format" | "length">, oldValue = ""): string {
  const format = spec.format ?? (oldValue ? detectFormat(oldValue) : "hex");
  const length = Math.max(32, spec.length ?? oldValue.length);
  switch (format) {
    case "hex":
      return randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length);
    case "base64":
      return randomBytes(Math.ceil((length * 3) / 4) + 2).toString("base64").slice(0, length);
    case "base64url":
      return randomBytes(Math.ceil((length * 3) / 4) + 2).toString("base64url").slice(0, length);
    case "alnum":
      return Array.from({ length }, () => ALNUM[randomInt(ALNUM.length)]).join("");
  }
}

export interface PlanInput {
  vault: string;
  key: string;
  fingerprint: string;
  updatedAt: string;
}

export interface PlannedRotation {
  key: string;
  vaults: string[];
  fingerprint: string;
  oldestUpdate: string;
  method: RotationMethod | "unknown";
  source: "entry" | "catalog" | "none";
  automatic: boolean;
  spec: RotationSpec | null;
}

/**
 * One row per distinct (key name, value): the same value stored under the same
 * name in several vaults rotates once and is written to all of them. Rotation
 * entries themselves are never rotated.
 */
export function planRotations(rows: PlanInput[], entrySpecs: Map<string, RotationSpec>): PlannedRotation[] {
  const groups = new Map<string, PlanInput[]>();
  for (const r of rows) {
    if (isRotationEntry(r.key) || isNotSecret(r.key) || r.fingerprint === EMPTY_FINGERPRINT) continue;
    // Config with no instructions is not a secret to rotate; an explicit entry overrides.
    if (!looksSecret(r.key) && !catalogSpec(r.key) && !entrySpecs.has(`${r.vault}\u0000${r.key}`)) continue;
    const id = `${r.key}\u0000${r.fingerprint}`;
    groups.set(id, [...(groups.get(id) ?? []), r]);
  }
  const out: PlannedRotation[] = [];
  for (const members of groups.values()) {
    const first = members[0]!;
    // An entry spec in any vault holding this value applies to all of them.
    const fromEntry = members.map((m) => entrySpecs.get(`${m.vault}\u0000${m.key}`)).find(Boolean) ?? null;
    const spec = fromEntry ?? catalogSpec(first.key);
    out.push({
      key: first.key,
      vaults: members.map((m) => m.vault).sort(),
      fingerprint: first.fingerprint,
      oldestUpdate: members.map((m) => isoTime(m.updatedAt)).sort()[0]!,
      method: spec?.method ?? "unknown",
      source: fromEntry ? "entry" : spec ? "catalog" : "none",
      automatic: spec?.method === "random" || spec?.method === "ssh-keygen" || spec?.method === "command",
      spec
    });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key) || a.vaults[0]!.localeCompare(b.vaults[0]!));
}
