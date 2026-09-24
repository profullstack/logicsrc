/**
 * Secret categories — "is this a database password, a social login, a server
 * key or an API token?" — derived from the NAME alone.
 *
 * Names only, on purpose: `logicsrc teams secrets` lists a vault without
 * decrypting it, and `teams export` has the values in hand. If a value could
 * move a secret between categories, the same key would land in one bucket when
 * listed and another when exported, and a filter that disagrees with itself is
 * worse than no filter.
 *
 * The rules are an ordered list and the first match wins, with specific
 * services before generic words: STRIPE_WEBHOOK_SECRET is `finance` (you want
 * it when rotating Stripe), not `auth` (every webhook secret), and SMTP_HOST is
 * `email`, not `server`. Each pattern runs against the name upper-cased with
 * every non-alphanumeric run turned into "_" and padded with "_" at both ends,
 * so `_OPENAI_` is a whole token and `_COINPAY` is a token prefix
 * (COINPAYPORTAL_API_KEY). The same normaliser turns an OpenCreds item name or
 * login URL ("api.stripe.com") into tokens, so one table serves both vaults.
 */

import type { Item } from "./types.js";

export interface SecretCategory {
  /** The name typed on the command line: `--category db`. */
  id: string;
  /** One line for `logicsrc teams categories`. */
  description: string;
  /** Other words people reach for; `--category payments` means `finance`. */
  aliases: readonly string[];
  /** A few names this category catches, shown as examples. */
  examples: readonly string[];
  patterns: readonly RegExp[];
}

const rule = (
  id: string,
  description: string,
  aliases: string[],
  examples: string[],
  patterns: RegExp[],
): SecretCategory => Object.freeze({ id, description, aliases, examples, patterns });

export const SECRET_CATEGORIES: readonly SecretCategory[] = Object.freeze([
  rule("crypto", "Wallets, seed phrases, chain RPCs, exchanges", ["wallet", "wallets", "web3", "blockchain", "exchange"],
    ["SYSTEM_MNEMONIC_BTC", "SOLANA_RPC_URL", "KRAKEN_API_KEY"], [
      /_(MNEMONIC|SEED_PHRASE|WALLET|WALLETCONNECT|RPC|ALCHEMY|INFURA|HELIUS|QUICKNODE|TATUM|BLOCKFROST|BLOCKSTREAM|LNBITS|LIGHTNING|LN|EVM|SOLANA|SOL|ETH|ETHEREUM|BTC|BITCOIN|BCH|DOGE|XRP|XMR|MONERO|POLYGON|BNB|USDC|USDT|ZEROX|UNISWAP|PUMPFUN|CHANGENOW|KRAKEN|BINANCE|COINBASE|BITSTAMP|MOONPAY|SIDESHIFT|GEMINI_API_SECRET|BYBIT|OKX|KUCOIN|DEX|ARB)_/,
      /_(ETHERSCAN|BSCSCAN|POLYGONSCAN|SOLSCAN|CRYPTO_?APIS)/,
    ]),
  rule("ai", "LLM and model providers", ["llm", "ml", "model", "models"],
    ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "ELEVENLABS_API_KEY"], [
      /_(OPENAI|ANTHROPIC|CLAUDE|GEMINI|GOOGLE_AI|GROQ|GROK|XAI|MISTRAL|COHERE|DEEPSEEK|PERPLEXITY|MOONSHOT|DASHSCOPE|QWEN|ZAI|OPENROUTER|TOGETHER|FIREWORKS|REPLICATE|HUGGINGFACE|HF|ELEVENLABS|STABILITY|OLLAMA|VOYAGE|AI)_/,
    ]),
  rule("finance", "Payments, billing, banking and brokerage", ["payment", "payments", "billing", "bank", "banking", "stripe"],
    ["STRIPE_SECRET_KEY", "COINPAY_API_KEY", "PLAID_SECRET"], [
      /_(STRIPE|PAYPAL|COINPAY|SQUARE|BRAINTREE|LEMONSQUEEZY|PADDLE|GUMROAD|CHARGEBEE|REVENUECAT|PLAID|SIMPLEFIN|BTCPAY|X402|ALPACA|APCA|FINNHUB|ROBINHOOD|SHOPIFY|MERCHANT)/,
      /_(PAY|PAYMENT|PAYMENTS|PAYOUT|PAYOUTS|INVOICE)_/,
      /_(PRICE|PLAN)_/,
    ]),
  rule("email", "Sending and receiving mail", ["mail", "smtp"],
    ["RESEND_API_KEY", "SMTP_PASS", "MAILGUN_DOMAIN"], [
      /_(RESEND|MAILGUN|SENDGRID|POSTMARK|SMTP|IMAP|POP3|SES|MAILCHIMP|BREVO|SENDINBLUE|MAILJET|SPARKPOST|MAIL|EMAIL|EMAILS)_/,
    ]),
  rule("messaging", "SMS, voice, push, chat and realtime", ["sms", "phone", "push", "chat", "realtime"],
    ["TWILIO_AUTH_TOKEN", "VAPID_PRIVATE_KEY", "LIVEKIT_API_SECRET"], [
      /_(TWILIO|TELNYX|VONAGE|NEXMO|PLIVO|SMS|PHONE|VAPID|ONESIGNAL|FCM|APNS|PUSHER|SLACK|DISCORD|TELEGRAM|WHATSAPP|LIVEKIT|TURN|JITSI|AGORA)_/,
    ]),
  rule("social", "Social networks and publishing platforms", ["socials", "oauth-social"],
    ["X_CLIENT_SECRET", "REDDIT_CLIENT_ID", "META_APP_SECRET"], [
      /_(TWITTER|X|FACEBOOK|FB|META|INSTAGRAM|THREADS|LINKEDIN|REDDIT|TIKTOK|YOUTUBE|MASTODON|BLUESKY|BSKY|PINTEREST|NOSTR|FARCASTER|DEVTO|HASHNODE|MEDIUM|POSTIZ|TUMBLR|SNAPCHAT|TWITCH|KICK|LEMMY|SOCIAL)_/,
    ]),
  rule("storage", "Object storage, buckets and file/media hosts", ["s3", "bucket", "files", "media"],
    ["R2_SECRET_ACCESS_KEY", "SUPABASE_S3_SECRET_KEY", "CLOUDINARY_API_SECRET"], [
      /_(S3|R2|B2|BUCKET|STORAGE|CLOUDINARY|UPLOADTHING|BACKBLAZE|MINIO|SPACES|DROPBOX|GCS)_/,
    ]),
  rule("db", "Databases, caches and backends-as-a-service", ["database", "databases", "sql", "cache", "supabase"],
    ["DATABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "REDIS_URL"], [
      /_(DATABASE|DB|POSTGRES|POSTGRESQL|PG|PGHOST|PGUSER|PGPASSWORD|PGDATABASE|MYSQL|MARIADB|MONGO|MONGODB|REDIS|VALKEY|UPSTASH|TURSO|LIBSQL|SQLITE|SQLITECLOUD|DBSTRING|SUPABASE|NEON|PLANETSCALE|COCKROACH|CLICKHOUSE|ELASTIC|ELASTICSEARCH|SURREAL|DYNAMODB|FIRESTORE|GOTRUE)_/,
    ]),
  rule("dns", "Domains, DNS and TLS certificates", ["domain", "domains", "tls", "ssl", "certs"],
    ["PORKBUN_API_KEY", "PORKBUN_SECRET_API_KEY", "CLOUDFLARE_DNS_TOKEN"], [
      /_(PORKBUN|NAMECHEAP|GODADDY|ROUTE53|DNSIMPLE|DNS|CERTBOT|ACME|LETSENCRYPT)_/,
    ]),
  rule("analytics", "Analytics, error tracking and logging", ["monitoring", "observability", "logging", "tracking"],
    ["SENTRY_DSN", "POSTHOG_KEY", "GOOGLE_ANALYTICS_ID"], [
      /_(SENTRY|DATADOG|POSTHOG|ANALYTICS|GA|PLAUSIBLE|UMAMI|MIXPANEL|AMPLITUDE|SEGMENT|LOGTAIL|BETTERSTACK|NEW_RELIC|NEWRELIC|GRAFANA|HONEYCOMB|DATAFAST|MAXMIND)_/,
    ]),
  rule("devtools", "Source control, package registries, app stores, signing", ["dev", "git", "github", "ci", "registry"],
    ["GITHUB_TOKEN", "NPM_TOKEN", "GPG_PRIVATE_KEY"], [
      /_(GITHUB|GH|GITLAB|BITBUCKET|GITEA|NPM|PYPI|DOCKER|GHCR|AUR|CHOCOLATEY|GPG|PGP|PKG|EXPO|EAS|APPLE|CHROME|FIREFOX|EDGE|CODECOV|LINEAR|JIRA|SH1PT)_/,
    ]),
  rule("cloud", "Cloud and hosting platforms", ["hosting", "paas", "infra"],
    ["RAILWAY_API_TOKEN", "CLOUDFLARE_GLOBAL_API_TOKEN", "FIREBASE_PRIVATE_KEY"], [
      /_(AWS|GCP|GCLOUD|GOOGLE_APPLICATION_CREDENTIALS|AZURE|CLOUDFLARE|CF|DIGITALOCEAN|HETZNER|VULTR|LINODE|RAILWAY|VERCEL|NETLIFY|FLY|RENDER|HEROKU|DOPPLER|FIREBASE)_/,
    ]),
  rule("server", "Servers, SSH, hosts and proxies", ["ssh", "host", "hosts", "vps", "proxy"],
    ["SSH_PORT", "HOST_USER", "PROXY_PASSWORD"], [
      /_(SSH|HOST|HOSTNAME|SERVER|VPS|SUDO|ROOT|DROPLET|SFTP|FTP|PROXY|SEED1)_/,
      /_SEED\d+_/,
    ]),
  rule("auth", "App auth: JWT/session/encryption keys, OAuth apps, webhook and signing secrets", ["jwt", "session", "oauth", "signing", "webhook", "encryption"],
    ["JWT_SECRET", "SESSION_SECRET", "GOOGLE_CLIENT_SECRET"], [
      /_(JWT|JWKS|SESSION|AUTH|NEXTAUTH|OAUTH|CLIENT_SECRET|CLIENT_ID|ENCRYPTION|ENCRYPT|COOKIE|SIGNING|SIGN|HMAC|WEBHOOK|PEPPER|SALT|TOTP|OTP|PASSKEY|WEBAUTHN|CLERK|AUTH0|CAPTCHA|HCAPTCHA|RECAPTCHA|TURNSTILE|CRON|TICKET|VERIFY|CSRF|PASSWORD|PASS|USERNAME|LOGIN)_/,
      /_SHARED_SECRET_/,
    ]),
  rule("api", "Other third-party API keys and tokens", ["apis", "token", "tokens", "keys"],
    ["TMDB_API_KEY", "VALUESERP_API_KEY", "CAPSOLVER_API_KEY"], [
      /_(API_KEY|API_TOKEN|API_SECRET|APIKEY|ACCESS_KEY|ACCESS_TOKEN|REFRESH_TOKEN|TOKEN|KEY|SECRET|PAT|PRIVATE_KEY|SECRET_KEY|LICENSE_KEY|KEY_ID)_/,
    ]),
  rule("config", "Settings that are not secrets: URLs, ports, flags, limits, names", ["settings", "env", "public"],
    ["NODE_ENV", "PORT", "NEXT_PUBLIC_APP_URL"], [
      /^_(NEXT_PUBLIC|PUBLIC|VITE|EXPO_PUBLIC|NODE|APP)_/,
      /_(URL|URLS|URI|ORIGIN|ORIGINS|DOMAIN|NAME|ID|PORT|ENV|ENVIRONMENT|MODE|LEVEL|DEBUG|ENABLED|ENABLE|DISABLE|DISABLED|MS|SECONDS|MINUTES|TTL|LIMIT|MAX|MIN|PCT|BPS|USD|CENTS|PATH|DIR|FILE|DESCRIPTION|VERSION|REGION|CONFIG|PROJECT|MODEL|PROVIDER|FORMAT|TIMEOUT|HEADLESS|SIZE|AGENT|INTERVAL|FROM|TO|CONCURRENCY|WIDTH|HEIGHT|FPS|QUALITY|SCOPES|ROLES)_/,
    ]),
]);

/** Everything the rules did not recognise. Always a valid filter value. */
export const OTHER_CATEGORY: SecretCategory = rule("other", "Anything the rules did not recognise", ["misc", "unknown"], [], []);

export const SECRET_CATEGORY_IDS: readonly string[] = Object.freeze([...SECRET_CATEGORIES.map((c) => c.id), OTHER_CATEGORY.id]);

function tokens(text: string): string {
  return `_${text.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")}_`;
}

/** The category of one secret, from its name (an env var, an item name, a URL). */
export function categorizeSecret(...names: Array<string | undefined>): string {
  const texts = names.filter((n): n is string => Boolean(n && n.trim())).map(tokens);
  for (const category of SECRET_CATEGORIES) {
    if (texts.some((text) => category.patterns.some((p) => p.test(text)))) return category.id;
  }
  return OTHER_CATEGORY.id;
}

/**
 * The category of an OpenCreds item. The item type decides where it is
 * unambiguous (a card is money, an ssh key is a server credential); otherwise
 * the name, account provider and login hosts are classified like env names.
 */
export function categorizeItem(item: Item): string {
  if (item.type === "card") return "finance";
  switch (item.key?.keyType) {
    case "ssh": return "server";
    case "pgp": return "devtools";
    case "certificate": return "dns";
  }
  const hosts = (item.login?.uris ?? []).map((u) => {
    try {
      return new URL(u.uri.includes("://") ? u.uri : `https://${u.uri}`).hostname.replace(/^www\./, "").replace(/\.[a-z]+$/, "");
    } catch {
      return u.uri;
    }
  });
  const found = categorizeSecret(item.name, item.account?.provider, ...hosts);
  if (found !== OTHER_CATEGORY.id) return found;
  if (item.key?.keyType === "api") return "api";
  if (item.key?.keyType === "symmetric") return "auth";
  return found;
}

/**
 * Parse `--category db,social --category api` into canonical ids, accepting
 * aliases. Unknown words throw with the list of valid ones, so a typo fails
 * loudly instead of silently matching nothing.
 */
export function parseCategories(input: string | readonly string[] | undefined): Set<string> | undefined {
  if (input === undefined) return undefined;
  const words = (Array.isArray(input) ? input : [input])
    .flatMap((part) => String(part).split(","))
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
  if (words.length === 0) return undefined;
  const all = [...SECRET_CATEGORIES, OTHER_CATEGORY];
  const picked = new Set<string>();
  for (const word of words) {
    const match = all.find((c) => c.id === word || c.aliases.includes(word));
    if (!match) {
      throw new Error(`Unknown category "${word}". Choose from: ${SECRET_CATEGORY_IDS.join(", ")}.`);
    }
    picked.add(match.id);
  }
  return picked;
}

export const SIMPLE_CSV_COLUMNS = Object.freeze([
  "folder", "category", "type", "name", "username", "password", "url", "value", "totp", "notes",
] as const);

/**
 * One flat row per item, for a spreadsheet or a script: `username`/`password`
 * for anything you log in with, and `value` for the one opaque secret of the
 * rest — an env or API key, a private key, an access token, a card number.
 * Unlike Bitwarden's CSV it keeps key and account items, which is where most
 * developer secrets live. It is not an import format; export OpenCreds for that.
 */
export function toSimpleCsv(items: readonly Item[], folders: ReadonlyArray<{ id: string; name: string }>): string {
  const folderName = new Map(folders.map((f) => [f.id, f.name]));
  const lines = [csvLine(SIMPLE_CSV_COLUMNS)];
  for (const item of items) {
    const { login, key, account, card, identity } = item;
    lines.push(csvLine([
      item.folderId ? folderName.get(item.folderId) : "",
      categorizeItem(item),
      item.type,
      item.name,
      login?.username || account?.handle || account?.email || identity?.username || identity?.email || card?.cardholderName,
      login?.password || key?.passphrase || card?.code,
      login?.uris?.[0]?.uri || key?.path || account?.provider,
      key?.value || key?.privateKey || account?.accessToken || card?.number,
      login?.totp,
      item.notes,
    ]));
  }
  return `${lines.join("\n")}\n`;
}

/** One RFC 4180 CSV line; quotes a cell only when it has to. */
export function csvLine(cells: ReadonlyArray<string | number | undefined | null>): string {
  return cells
    .map((cell) => {
      const value = cell === undefined || cell === null ? "" : String(cell);
      return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    })
    .join(",");
}
