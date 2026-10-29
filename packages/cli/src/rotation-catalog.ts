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
 *   provider    a built-in rotator (rotators.ts) that creates the new
 *               credential by API, and revokes the old one only after every
 *               consumer is healthy on the new one.
 *   manual      a person or agent follows `steps` at `url`. Never automatic:
 *               provider-issued keys without a rotator, wallet seeds,
 *               encryption keys that protect stored data.
 *   not-secret  public config that happens to look like a secret (URLs,
 *               client ids, publishable keys). Dropped from the plan.
 */
export type RotationMethod = "random" | "ssh-keygen" | "command" | "provider" | "manual" | "not-secret";
export type RandomFormat = "hex" | "base64" | "base64url" | "alnum";
/** Who has to do a manual rotation: an agent with dashboard/CLI access, or Anthony (money, signing ceremonies, his logins). */
export type RotationOwner = "agent" | "anthony";

export interface RotationSpec {
  method: RotationMethod;
  /** random: alphabet; defaults to the old value's shape. */
  format?: RandomFormat;
  /** random: length in characters; defaults to the old value's length (min 32). */
  length?: number;
  /** command: prints the new value on stdout. */
  command?: string;
  /** provider: the rotator id (see rotators.ts). */
  provider?: string;
  /** Where to do it (provider dashboard, docs). */
  url?: string;
  /** What to do, in order. For manual rotations this is the whole job. */
  steps?: string[];
  /** What reads this value and needs a restart/redeploy after it changes. */
  consumers?: string[];
  /** Why this method; shown in the plan. */
  note?: string;
  /** Grouping for reports and the runbook (stripe, supabase, wallet, ...). */
  family?: string;
  /** Manual rotations: who must do it. */
  owner?: RotationOwner;
  /** Never automated, whatever the method says (moves money, signing ceremony, banned provider). */
  never?: boolean;
  /** What a rotation breaks for users (sessions end, push subscriptions die). The weekly job skips these. */
  disruptive?: string;
  /** Rotator bookkeeping (e.g. the provider's id for the current key), written back after a rotation. */
  state?: Record<string, string>;
}

export const ROTATE_PREFIX = ROTATION_ENTRY_PREFIX;
/** `teams clean` archive records: metadata about an archived value, never consumed. */
export const ARCHIVE_PREFIX = "__ARCHIVE__";

export function isRotationEntry(name: string): boolean {
  return name.startsWith(ROTATE_PREFIX);
}

export function rotationEntryName(key: string): string {
  return `${ROTATE_PREFIX}${key}`;
}

const METHODS: readonly RotationMethod[] = ["random", "ssh-keygen", "command", "provider", "manual", "not-secret"];
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
  if (v.method === "provider" && (typeof v.provider !== "string" || !v.provider.trim())) throw new Error("method provider needs a provider");
  if (v.owner !== undefined && v.owner !== "agent" && v.owner !== "anthony") throw new Error("owner must be agent or anthony");
  const strings = (x: unknown): string[] | undefined =>
    Array.isArray(x) ? x.filter((s): s is string => typeof s === "string" && s.trim() !== "") : undefined;
  const state =
    v.state && typeof v.state === "object" && !Array.isArray(v.state)
      ? Object.fromEntries(Object.entries(v.state as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"))
      : undefined;
  return {
    method: v.method as RotationMethod,
    ...(v.format ? { format: v.format as RandomFormat } : {}),
    ...(v.length ? { length: v.length as number } : {}),
    ...(typeof v.command === "string" ? { command: v.command } : {}),
    ...(typeof v.provider === "string" ? { provider: v.provider } : {}),
    ...(typeof v.url === "string" ? { url: v.url } : {}),
    ...(strings(v.steps) ? { steps: strings(v.steps) } : {}),
    ...(strings(v.consumers) ? { consumers: strings(v.consumers) } : {}),
    ...(typeof v.note === "string" ? { note: v.note } : {}),
    ...(typeof v.family === "string" ? { family: v.family } : {}),
    ...(v.owner ? { owner: v.owner as RotationOwner } : {}),
    ...(v.never === true ? { never: true } : {}),
    ...(typeof v.disruptive === "string" ? { disruptive: v.disruptive } : {}),
    ...(state && Object.keys(state).length ? { state } : {})
  };
}

const STORE = "Store it: logicsrc teams rotate-keys <team> <project> <env> --key <KEY> --set-from-stdin --approve (writes every vault holding the old value).";
const REDEPLOY = "Redeploy every consumer the plan lists, check each health URL.";
const REVOKE = "Revoke the old key once every consumer runs on the new one.";

function provider(name: string, url: string, extra: string[] = [], more: Partial<RotationSpec> = {}): RotationSpec {
  return {
    method: "manual",
    owner: "agent",
    url,
    steps: [`Create a new key in ${name}${url ? ` (${url})` : ""}.`, ...extra, STORE, REDEPLOY, REVOKE],
    ...more
  };
}

/** Anthony has to do it: his login/2FA, a signing ceremony, or money. */
function anthony(family: string, note: string, steps: string[], url?: string): RotationSpec {
  return { method: "manual", owner: "anthony", never: true, family, note, steps, ...(url ? { url } : {}) };
}

function auto(provider: string, family: string, extra: Partial<RotationSpec> = {}): RotationSpec {
  return { method: "provider", provider, family, ...extra };
}

interface CatalogRule {
  test: RegExp;
  spec: RotationSpec;
}

const WALLET_STEPS = [
  "Generate a new wallet on a trusted machine (never on a server).",
  "Move every balance (tokens and native gas) from the old address to the new one. A person signs this: it moves money.",
  "Store the new key/seed under the same name (CoinPay system keys go in the CoinPay operator vault, not app.env), then update anything that pays to or watches the old address.",
  "Never reuse the old seed: assume it is public."
];

const SIGNING_STEPS = [
  "Generate the new key pair on a trusted machine.",
  "Publish the new public half where verifiers look for it (DID document, TUF root, PLC directory, keyserver, MCP registry) BEFORE switching signers.",
  "Store the new private key, redeploy the signer, keep the old public key trusted until everything signed with it has expired.",
  "Revoke the old key in the same place you published the new one."
];

/**
 * Order matters: the first match wins, so specific names come before the broad
 * suffix rules at the bottom. Names are matched upper-cased with any `__<n>`
 * duplicate suffix removed (KEY__1 is the second copy of KEY).
 */
const CATALOG: CatalogRule[] = [
  // ---- never automated: personal vault, money, signing ceremonies, banned providers --------
  {
    test: /^OPENCREDS_(MASTER_PASSWORD|RECOVERY_KEY)$/,
    spec: anthony("personal-vault", "unlocks Anthony's personal vault", [
      "Anthony only: logicsrc vault passwd (new master password), then save the new recovery key it prints.",
      "Update the copy in the anthony-personal vault by hand at a terminal."
    ])
  },
  {
    test: /(MNEMONIC|SEED_PHRASE|^TREASURY_|WALLET_PRIVATE_KEY|^(EVM|SOLANA|SOL|ETH|BTC|TRON|XRP|PRIVATE)_?(PRIVATE_)?KEY$|^PRIVATE_KEY$|X402_.*PRIVATE_KEY|TREASURY|LN_HSM_SECRET|HSM_SECRET|^LNBITS_.*(ADMIN|INVOICE|PAYLINK)_KEY$|^LNBITS_SUPERUSER_PASSWORD$|RELAYER.*KEY|^QRYPT_WEB_ISSUER_SEED$)/,
    spec: anthony("wallet", "a wallet or Lightning key: rotating it means moving funds", WALLET_STEPS)
  },
  {
    test: /^(KRAKEN|BINANCE(_US)?|COINBASE|ALPACA|APCA|CHANGENOW|SIDESHIFT|ZEROX|MOONPAY|PLAID|PAYPAL(_PLATFORM|_SANDBOX)?|WATCHWALLET)_.*(KEY|SECRET|PASSWORD|B64)$/,
    spec: anthony("exchange", "an exchange, ramp or bank-link credential: it can move money", [
      "Anthony: create a new key in the provider dashboard with the same (least) permissions; 2FA is his.",
      STORE,
      REDEPLOY,
      "Delete the old key in the dashboard."
    ])
  },
  {
    test: /^STRIPE_/,
    spec: anthony("stripe", "Stripe is banned for new work: never rotated by automation", [
      "Anthony: Stripe dashboard > Developers > API keys > Roll key (or the webhook endpoint > Roll secret).",
      STORE,
      REDEPLOY
    ], "https://dashboard.stripe.com/apikeys")
  },
  {
    test: /^NPM_TOKEN$|^PYPI_API_TOKEN$|^CHOCOLATEY_API_KEY$/,
    spec: anthony("package-registry", "publishes packages: a person creates it", [
      "Anthony: create a granular automation token on the registry (npmjs.com > Access Tokens), scoped to the packages it publishes.",
      STORE,
      "Delete the old token on the registry."
    ], "https://www.npmjs.com/settings/~/tokens")
  },
  {
    test: /^GITHUB_APP_(PRIVATE_KEY|CLIENT_SECRET|WEBHOOK_SECRET)$|^GITHUB_MARKETPLACE_WEBHOOK_SECRET$/,
    spec: anthony("github-app", "GitHub App credentials are made in the App settings UI", [
      "Anthony: github.com/settings/apps/<app> (or the org's) > Generate a private key / new client secret / webhook secret.",
      STORE,
      REDEPLOY,
      "Delete the old private key in the App settings."
    ], "https://github.com/settings/apps")
  },
  {
    test: /(^|_)(DID_PRIVATE_KEY|MCP_(REGISTRY|PUBLISHER)_PRIVATE_KEY|PLC_ROTATION_KEY|TUF_.*_KEY|PUBLISHER_KEY|POWER_KEY_PRIVATE_KEY|GPG_PRIVATE_KEY|CA_(ROOT_)?KEY|NOSTR_PRIVATE_KEY|CLIENT_JWT_PRIVATE_KEY|JWT_KEYS|FIREBASE_PRIVATE_KEY)/,
    spec: anthony("signing", "a signing identity: verifiers pin the public half", SIGNING_STEPS)
  },
  {
    test: /^(FTB|IRS|EFTPS|MAIL|CAL|NVIDIA|REDDIT|BLUESKY|MASTODON|BRAVE|APPLE|RIOTCODER|CHA0SPUNK|SEED\d*|OUTREACHGRAPH|THREATCRUSH|MOSHPIT|COINPAY|W3BS_SOCIAL|GIT_CHOVY|MYNA_CLOUD|EPIC|EXTELLA|PDL|HUNTER|CONTACTOUT|FULLENRICH|ROCKETREACH|SERPAPI|SERPER|DATAFORSEO|STOPFORUMSPAM|ABUSEIPDB|PROXIWARE|SALAD|OPENSUBTITLES|WEBSHARE|[A-Z0-9]+_AFFILIATE)(_[A-Z0-9]+)*_(PASSWORD|APP_SPECIFIC_PASSWORD|SUDO_PASSWORD)$/,
    spec: anthony("account-login", "a human account login (often behind 2FA or email confirmation)", [
      "Sign in to the account and change the password there (2FA/email confirmation goes to Anthony).",
      "Save it in the personal vault (logicsrc vault) and, if an app logs in with it, store it: " + STORE.slice(10)
    ])
  },

  // ---- data at rest: a new value makes stored data unreadable ------------------------------
  {
    test: /(^|_)(ENCRYPTION_KEY|MASTER_KEY|DB_ENCRYPTION_KEY|SETTINGS_ENCRYPTION_KEY|LN_KEY_ENCRYPTION_KEY|TOKEN_ENC_KEY|CRYPTO_KEY|VAULT_KEY|KEYS_SECRET|API_KEY_SALT|TOKEN_PEPPER|SUPPRESSION_HASH_SALT|VOTE_SALT|SUBMISSION_SALT|OTR_SALT|DHT_API_KEY_SALT)$/,
    spec: {
      method: "manual",
      owner: "agent",
      family: "data-at-rest",
      note: "protects or indexes stored data: a new value makes old ciphertext or hashes unreadable",
      steps: [
        "Add the new key next to the old one (dual-read), or run the app's re-encryption / re-hash migration.",
        "Re-encrypt (or re-hash) stored data under the new key.",
        "Remove the old key only after every row decrypts or matches with the new one."
      ]
    }
  },
  {
    // Next's server-actions key encrypts closures in flight only: a redeploy is all it needs.
    test: /^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY$/,
    spec: { method: "random", family: "internal", format: "base64", length: 44, note: "Next server actions key: in-flight only", disruptive: "open tabs lose pending server actions until reload" }
  },

  // ---- SSH -----------------------------------------------------------------------------------
  {
    // Raw keys (DEPLOY_KEY=...) and the ssh provider's file envelopes (SSH_ID_ED25519).
    test: /(^|_)(SSH_PRIVATE_KEY|DEPLOY_KEY|SSH_KEY)$|^SSH_(.*_)?ID_(RSA|ED25519|ECDSA|DSA)(_[A-Z0-9_]+)?$|^SSH_.*_(KEY|PEM)$/,
    spec: {
      method: "ssh-keygen",
      family: "ssh",
      steps: [
        "Install the new public key everywhere the old one was authorized (authorized_keys on every host, GitHub deploy/user keys, CI secrets).",
        "Remove the old public key from all of those places.",
        "Pull the new private key onto the machines that use it: logicsrc teams pull / logicsrc ssh pull / logicsrc keyring."
      ]
    }
  },

  // ---- built-in API rotators --------------------------------------------------------------
  { test: /^RESEND(_[A-Z0-9]+)*_(API|ADMIN)_KEY$/, spec: auto("resend", "resend", { url: "https://resend.com/api-keys" }) },
  {
    test: /^(CLOUDFLARE|CF)(_[A-Z0-9]+)*_(API_TOKEN|TOKEN)$/,
    spec: auto("cloudflare-token", "cloudflare", { url: "https://dash.cloudflare.com/profile/api-tokens" })
  },
  {
    test: /^(COINPAY|COINPAYPORTAL|CHOVY_COINPAY)(_[A-Z0-9]+)*_API_KEY$|^COINPAY_X402_KEY$/,
    spec: auto("coinpay-api-key", "coinpay", { url: "https://coinpayportal.com/dashboard" })
  },
  {
    test: /^(COINPAY|COINPAYPORTAL|CHOVY_COINPAY)(_[A-Z0-9]+)*_WEBHOOK_SECRET$/,
    spec: auto("coinpay-webhook-secret", "coinpay", {
      url: "https://coinpayportal.com/dashboard",
      disruptive: "CoinPay has one webhook secret per business: webhooks fail signature checks until the consumer restarts (CoinPay retries them)"
    })
  },
  {
    test: /^VAPID_PRIVATE(_KEY)?$/,
    spec: auto("vapid", "vapid", { disruptive: "every existing push subscription stops working; browsers must subscribe again" })
  },
  {
    test: /^(POSTGRES_PASSWORD|DB_PASS(WORD)?|PG_?PASSWORD|[A-Z0-9_]*_DB_PASSWORD)$/,
    spec: auto("postgres-role", "postgres", {
      disruptive: "Postgres keeps one password per role: consumers that are not restarted fail to connect",
      note: "self-hosted Supabase shares this password across its service roles: see the runbook"
    })
  },

  // ---- provider-issued keys without a rotator (yet) ----------------------------------------
  { test: /^(GITHUB|GH)(_[A-Z0-9]+)*_(TOKEN|PAT)$/, spec: provider("GitHub (fine-grained token, same repos and permissions)", "https://github.com/settings/tokens", [], { family: "github" }) },
  { test: /^GITHUB(_[A-Z0-9]+)*_(CLIENT_SECRET|WEBHOOK_SECRET)$|^GL_WEBHOOK_SECRET$/, spec: provider("the GitHub OAuth app / webhook settings (Generate a new client secret; GitHub keeps two live)", "https://github.com/settings/developers", [], { family: "github" }) },
  { test: /^ANTHROPIC_API_KEY$/, spec: provider("the Anthropic console", "https://console.anthropic.com/settings/keys", [], { family: "ai" }) },
  { test: /^OPENAI_API_KEY$/, spec: provider("the OpenAI dashboard (same project)", "https://platform.openai.com/api-keys", [], { family: "ai" }) },
  { test: /^(GEMINI|GOOGLE)_API_(KEY|SECRET)$|^EXPO_PUBLIC_GOOGLE_API_KEY$/, spec: provider("Google Cloud credentials (same API restrictions)", "https://console.cloud.google.com/apis/credentials", [], { family: "google" }) },
  { test: /^GOOGLE(_OAUTH)?_CLIENT_SECRET$|^CHROME_(CLIENT_SECRET|REFRESH_TOKEN)$/, spec: provider("Google Cloud OAuth client (Add secret, then disable the old one)", "https://console.cloud.google.com/apis/credentials", [], { family: "google" }) },
  {
    test: /^SUPABASE_ACCESS_TOKEN$/,
    spec: provider("Supabase account tokens", "https://supabase.com/dashboard/account/tokens", [], { family: "supabase" })
  },
  {
    test: /^(SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_KEY|SUPABASE_SECRET_KEY|SUPABASE_SECRETMAT_KEY|SERVICE_ROLE_KEY(_ASYMMETRIC)?|SUPABASE_JWT_SECRET|JWT_SECRET|NEXT_PUBLIC_SUPABASE_ANON_KEY|VITE_SUPABASE_ANON_KEY|PUBLIC_SUPABASE_ANON_KEY|SUPABASE_ANON_KEY|ANON_KEY(_ASYMMETRIC)?|[A-Z0-9]+_SUPABASE_KEY|SUPABASE_S3_(ACCESS|SECRET)_KEY|S3_PROTOCOL_ACCESS_KEY_SECRET|SUPABASE_SMS_HOOK_SECRET|SEND_SMS_HOOK_SECRET|LOGFLARE_.*(KEY|TOKEN))$/,
    spec: {
      method: "manual",
      owner: "agent",
      family: "supabase",
      note: "the Supabase JWT secret signs every key and session",
      disruptive: "a new JWT secret signs everyone out and re-issues the anon and service_role keys",
      url: "https://supabase.com/docs/guides/self-hosting/docker#securing-your-services",
      steps: [
        "Self-hosted: generate a new JWT_SECRET (40+ chars), mint new anon + service_role JWTs from it, write all three to the stack's .env.",
        "Restart the stack (docker compose up -d with the stack's own env file); every session ends.",
        "Hosted: Project settings > API > generate new JWT secret / new API keys.",
        "Store each new value with --set-from-stdin (every vault sharing the old fingerprint is updated), redeploy the apps, then confirm the old anon key gets 401."
      ]
    }
  },
  {
    test: /^(TURSO|DATABASE|[A-Z0-9]+_DB|[A-Z0-9]+_DATABASE)_AUTH_TOKEN$|^TURSO_AUTH_TOKEN$/,
    spec: provider("Turso: turso db tokens create <db> (old tokens keep working)", "https://docs.turso.tech/cli/db/tokens/create", [
      "turso db tokens invalidate <db> kills EVERY token for that database: run it only after all consumers use the new one."
    ], { family: "turso" })
  },
  { test: /^TWILIO_(AUTH_TOKEN|SECRET)$/, spec: provider("Twilio (Console > Account > API keys & tokens > secondary auth token, then promote)", "https://console.twilio.com/us1/account/keys-credentials/api-keys", [], { family: "twilio" }) },
  { test: /^TELNYX_(API_KEY|.*SECRET)$/, spec: provider("Telnyx", "https://portal.telnyx.com/#/app/api-keys", [], { family: "telnyx" }) },
  { test: /^PORKBUN_(API|SECRET)(_API)?_KEY$|^PORKBUN_API_SECRET$/, spec: provider("Porkbun (create a new API key pair)", "https://porkbun.com/account/api", [], { family: "porkbun" }) },
  { test: /^ELEVENLABS_API_KEY$/, spec: provider("ElevenLabs", "https://elevenlabs.io/app/settings/api-keys", [], { family: "ai" }) },
  { test: /^(DEEPSEEK|MOONSHOT|QWEN|DASHSCOPE|ZAI|PERPLEXITY|OLLAMA|GLAMA|FAL|HUGGINGFACE|NGC|NVIDIA_NIM|ABLITERATION|SALAD_AI_GATEWAY|EXA|LINKUP|BRAVE)(_API)?_(KEY|TOKEN)$/, spec: provider("the model/search provider's API keys page", "", [], { family: "ai" }) },
  { test: /^(COINPAY|[A-Z0-9]+_COINPAY|ADNETWORK_COINPAY)(_OAUTH)?_CLIENT_SECRET$/, spec: provider("CoinPay OAuth apps (our own: coinpayportal.com > Developer > OAuth apps > regenerate secret)", "https://coinpayportal.com/dashboard", [], { family: "coinpay" }) },
  { test: /^FIREFOX_JWT_(SECRET|ISSUER)$/, spec: provider("addons.mozilla.org API credentials (Developer Hub > Manage API Keys > Generate new credentials)", "https://addons.mozilla.org/developers/addon/api/key/", [], { family: "browser-store" }) },
  { test: /^EDGE_(API_KEY|CLIENT_SECRET)$/, spec: provider("Microsoft Partner Center (Edge Add-ons API)", "https://partner.microsoft.com/dashboard/microsoftedge/publishapi", [], { family: "browser-store" }) },
  { test: /^SLACK_|^META_APP_SECRET$|^THREADS_APP_SECRET$|^LINKEDIN_|^MASTODON_(ACCESS_TOKEN|CLIENT_SECRET)$|^DEVTO_API_KEY$|^BLUESKY_APP_PASSWORD$/, spec: provider("the social platform's developer settings", "", [], { family: "social" }) },
  { test: /^(R2|S3|AWS|MINIO)_(SECRET_ACCESS_KEY|ROOT_PASSWORD)$/, spec: provider("the object store (Cloudflare R2 > Manage API tokens, or MinIO admin)", "https://dash.cloudflare.com/?to=/:account/r2/api-tokens", [], { family: "storage" }) },
  {
    test: /^TURN_(SECRET|SERVER_CREDENTIAL)$/,
    spec: {
      method: "manual",
      owner: "agent",
      family: "internal",
      note: "the coturn static-auth-secret lives in turnserver.conf as well as the app env",
      steps: ["Generate a new value (openssl rand -hex 32).", "Set static-auth-secret in turnserver.conf and the app's env together, restart coturn and the app.", STORE]
    }
  },
  {
    test: /^OPENACCESS_KEY_[A-Z0-9_]+$/,
    spec: provider("the OpenAccess hub (logicsrc.com/app, site keys): mint a new key for that site", "https://logicsrc.com/docs/openaccess", [], { family: "fleet-app" })
  },
  {
    test: /(DEALDASH_COOKIE|SESSION_COOKIES|AUTO_COOKIE|SEEDBOX_.*_(AUTH|TOKEN)|SIRIUSXM_TOKEN|TUNEIN_TOKEN)$/,
    spec: { method: "manual", owner: "agent", family: "scraped-session", note: "a logged-in browser session for a third-party site", steps: ["Sign in to the site again in the scraping browser profile and copy the fresh cookie/token.", STORE, REDEPLOY] }
  },
  // ---- secrets we invent: mint a random value --------------------------------------------
  {
    // Session signers: rotating signs everybody out.
    test: /^(AUTH_SECRET|BETTER_AUTH_SECRET|NEXTAUTH_SECRET|SESSION_SECRET|COOKIE_SECRET|JWT_SIGNING_SECRET|SECRET_KEY_BASE|([A-Z0-9]+_)*(SESSION_SECRET|JWT_SECRET|OIDC_SIGNING_SECRET|CLI_SESSION_SECRET))$/,
    spec: { method: "random", family: "internal", disruptive: "signs sessions or tokens: everyone signs in again", steps: ["Redeploy every consumer so both sides use the new value."] }
  },
  {
    // Exact names, or our own *_CRON_SECRET / *_ADMIN_TOKEN style suffixes. A
    // provider prefix (META_APP_SECRET, GOOGLE_AUTH_SECRET) is THEIR secret and
    // must never be replaced with random bytes.
    test: /^(APP_SECRET|IP_HASH_SALT|RATE_LIMIT_SALT|([A-Z0-9]+_)*(CRON_SECRET|CRON_TOKEN|INTERNAL_API_KEY|ADMIN_TOKEN|WEBHOOK_SIGNING_SECRET|REPUTATION_SIGNING_SECRET|SHARED_SECRET|HMAC_SECRET|TICKET_SECRET|BRIDGE_SECRET|HOOKS_SECRET|FORM_SECRET|PARTNER_VERIFY_SECRET|SIGN_SECRET|SIGNING_SECRET|BOOTSTRAP_SECRET|HOST_TOOL_SECRET|IP_HASH_SALT))$/,
    spec: { method: "random", family: "internal", steps: ["Redeploy every consumer so both sides use the new value."] }
  },

  {
    // Our own apps issue these (listing keys, agent keys, bridge keys, admin keys).
    test: /^([A-Z0-9]+_)*(LISTING_KEY|AGENT_KEY|AGENT_WORKER_KEY|PARTNER_KEY|PROJECT_KEY|ACTOR_TOKEN(_[A-Z0-9]+)?|BRIDGE_KEY|PAYAGENT_KEY|LIBRARY_KEY|LYRICS_KEY|OWNER_KEY|ADMIN_KEY|HOUSE_API_KEY|PUBLISHER_TOKEN|ADVERTISER_TOKEN|POST_TOKEN|DEV_BOX_TOKEN|SUBMIT_TOKEN|GATEWAY_TOKEN|NOBODY_KEY|HEALTH_TOKEN_KEY|COMP_KEYS|API_KEYS|ALERT_API_KEY)$|^(ADNETWORK|BUILTINDIE|GROUPCALL|MEDIAANALYZER|UGIG_API_KEY_[A-Z0-9_]+|RSSAMPLIFIER_API|SMSHUB_API|WX93_API|SEORANK_API|BUFFEROVERRIDE|CRAWLPROOF(_API)?|MOSHPIT_API|SUBMITFLEET_SECRET)_?(KEY|TOKEN)?$/,
    spec: provider("our own app that issues it (its admin page or API: mint a new key for the same account, then revoke the old one there)", "", [], { family: "fleet-app" })
  },
  { test: /(^|_)WEBHOOK_SECRET$/, spec: provider("the service that signs the webhook (its webhook settings: regenerate/roll the signing secret)", "", [], { family: "webhook" }) },
  {
    test: /^(SMTP|IMAP)_PASS(WORD)?$|_EMAIL_PASSWORD$/,
    spec: provider("the mailbox (Forward Email > Domains > Aliases > Generate password)", "https://forwardemail.net/my-account/domains", [], { family: "email" })
  },
  // Broad fallbacks for anything provider-issued.
  {
    test: /(_API_KEY|_API_SECRET|_SECRET_KEY|_ACCESS_KEY|_TOKEN|_PRIVATE_KEY|_PASSWORD|_SECRET|_KEY|_PASS|_AUTH|_CREDENTIAL|_COOKIE|_SALT|_PEPPER)$|^(API_TOKEN|ADMIN_PASSWORD|ACCESS_PASSWORD|DASHBOARD_PASSWORD)$/,
    spec: provider("the issuing provider's dashboard (the key name's prefix names it)", "", [], { family: "other" })
  }
];

/** KEY__1 is the second copy of KEY (keyring/pull dedupe); match on KEY. */
export function baseKeyName(key: string): string {
  return key.toUpperCase().replace(/__\d+$/, "");
}

/** Names that read like credentials. Plain config (MODE, URL, *_USD) is not planned at all. */
export function looksSecret(key: string): boolean {
  return /(KEY|SECRET|TOKEN(?!S)|PASSWORD|PASSWD|_PASS$|PRIVATE|MNEMONIC|SEED_PHRASE|_SEED$|CREDENTIAL|AUTH|SALT|PEPPER|SIGNING|COOKIE|SESSION|DSN|CONNECTION_STRING|DATABASE_URL|_PEM|_P12|CERT)/i.test(key);
}

/** URLs that can carry a password in their userinfo. Turso/libsql URLs carry none. */
const CREDENTIAL_URL = /(^|_)(DATABASE|DB|POSTGRES|PG|REDIS|MONGO|MONGODB|AMQP|RABBITMQ|CONNECTION)(_URL|_URI|_STRING|_DSN)$/;

/**
 * Public halves, ssh config, browser-public values and plain config whose name
 * merely contains KEY/TOKEN/AUTH: nothing to rotate.
 */
export function isNotSecret(key: string): boolean {
  const name = baseKeyName(key);
  if (name.startsWith(ARCHIVE_PREFIX)) return true;
  if (/^SSH_.*(_PUB|CONFIG|KNOWN_HOSTS|AUTHORIZED_KEYS|_CONF)$/.test(name)) return true;
  if (/_PUBLIC_KEY(_JWK)?$|_PUBLIC$|^NEXT_PUBLIC_(?!SUPABASE_ANON_KEY)|^EXPO_PUBLIC_(?!GOOGLE_API_KEY)/.test(name)) return true;
  if (/^TURSO_|^[A-Z0-9]+_TURSO_/.test(name) && /_URL$/.test(name)) return true;
  if (CREDENTIAL_URL.test(name) && !/^TURSO_/.test(name)) return false;
  return /(_URL|_URI|_ISSUER|_SCOPES?|_CLIENT_ID|_KEY_ID|_KEY_NAME|_ACCESS_KEY_ID|_BATCH_SIZE|_CONCURRENCY|_INTERVAL_SECONDS|_ENRICH|_EMAIL|_LIFETIME|_TTL|_PER_HOUR|_DAILY_LIMIT|_SITE_KEY|_PUBLISHABLE_KEY|_KID|_CONNECTION_ID|_RP_ID|_ORIGIN|_COOKIE_SECURE|_KEY_GENERATION|_AUTH_USER|_USER|_USERNAME|_CA_CERT|_CERT|_DSN|_VERIFICATION_KEY|_GPG_KEY_ID|_KEY_CONCURRENCY|_KEY_DAILY_LIMIT)$|^(AUTH_EMAIL|CERTBOT_EMAIL|SESSION_LIFETIME|GPG_KEY_ID|AUTHOR_[A-Z_]+|SYSTEM_KEY_GENERATION)$/.test(name);
}

export function catalogSpec(key: string): RotationSpec | null {
  const name = baseKeyName(key);
  if (isNotSecret(name)) return { method: "not-secret", note: "public or plain config" };
  if (CREDENTIAL_URL.test(name)) {
    return {
      method: "manual",
      owner: "agent",
      family: "postgres",
      note: "a connection string: it changes when the password inside it rotates",
      steps: ["Rotate the role password (postgres-role rotator or the runbook); the rotator rewrites every connection string holding the old password."]
    };
  }
  const rule = CATALOG.find((r) => r.test.test(name));
  if (!rule) return null;
  const spec = { ...rule.spec, steps: rule.spec.steps ? [...rule.spec.steps] : undefined };
  if (spec.url === "") delete spec.url;
  if (!spec.steps) delete spec.steps;
  return spec;
}

/** Automatic = we can produce the new value without a person. */
export function isAutomatic(spec: RotationSpec | null): boolean {
  if (!spec || spec.never) return false;
  return spec.method === "random" || spec.method === "ssh-keygen" || spec.method === "command" || spec.method === "provider";
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
 * entries, archive records and not-secret config are never planned.
 */
export function planRotations(rows: PlanInput[], entrySpecs: Map<string, RotationSpec>): PlannedRotation[] {
  const groups = new Map<string, PlanInput[]>();
  for (const r of rows) {
    if (isRotationEntry(r.key) || r.key.startsWith(ARCHIVE_PREFIX) || r.fingerprint === EMPTY_FINGERPRINT) continue;
    const entry = entrySpecs.get(`${r.vault}\u0000${r.key}`);
    if (entry?.method === "not-secret") continue;
    if (!entry && isNotSecret(r.key)) continue;
    // Config with no instructions is not a secret to rotate; an explicit entry overrides.
    if (!entry && !looksSecret(r.key) && !catalogSpec(r.key)) continue;
    const id = `${r.key}\u0000${r.fingerprint}`;
    groups.set(id, [...(groups.get(id) ?? []), r]);
  }
  const out: PlannedRotation[] = [];
  for (const members of groups.values()) {
    const first = members[0]!;
    // An entry spec in any vault holding this value applies to all of them.
    const fromEntry = members.map((m) => entrySpecs.get(`${m.vault}\u0000${m.key}`)).find(Boolean) ?? null;
    const fromCatalog = catalogSpec(first.key);
    // An entry can add steps, but it cannot make a never-automated key (wallet, signing, Stripe) automatic.
    const spec = fromEntry && fromCatalog?.never ? { ...fromEntry, never: true, owner: fromCatalog.owner, family: fromEntry.family ?? fromCatalog.family } : fromEntry ?? fromCatalog;
    out.push({
      key: first.key,
      vaults: members.map((m) => m.vault).sort(),
      fingerprint: first.fingerprint,
      oldestUpdate: members.map((m) => isoTime(m.updatedAt)).sort()[0]!,
      method: spec?.method ?? "unknown",
      source: fromEntry ? "entry" : spec ? "catalog" : "none",
      automatic: isAutomatic(spec),
      spec
    });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key) || a.vaults[0]!.localeCompare(b.vaults[0]!));
}
