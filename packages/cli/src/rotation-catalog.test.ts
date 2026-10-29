import { describe, expect, it } from "vitest";
import { catalogSpec, isAutomatic, isNotSecret, planRotations, baseKeyName, EMPTY_FINGERPRINT } from "./rotation-catalog.js";
import { scheduledBlock } from "./rotate-keys.js";

const method = (k: string) => catalogSpec(k)?.method;

describe("catalog coverage (2026-10-29 plan)", () => {
  it("never automates money, signing, the personal vault, Stripe, npm or GitHub App keys", () => {
    for (const k of [
      "SYSTEM_MNEMONIC_SOL__1",
      "TREASURY_MNEMONIC_ETH",
      "PRIVATE_KEY",
      "LN_HSM_SECRET_HEX",
      "LNBITS_ADMIN_KEY",
      "KRAKEN_API_SECRET",
      "COINBASE_API_PRIVATE_KEY_B64",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "NPM_TOKEN",
      "GITHUB_APP_PRIVATE_KEY",
      "OPENCREDS_MASTER_PASSWORD",
      "OPENCREDS_RECOVERY_KEY",
      "W3BS_TUF_ROOT_KEY_PK8_B64",
      "DID_PRIVATE_KEY_BASE64",
      "MOSHPIT_CA_ROOT_KEY",
      "FTB_BUSINESS_PASSWORD"
    ]) {
      const s = catalogSpec(k);
      expect(s?.never, k).toBe(true);
      expect(s?.owner, k).toBe("anthony");
      expect(isAutomatic(s), k).toBe(false);
    }
  });

  it("never mints random bytes for provider secrets that look like ours", () => {
    for (const k of ["SLACK_SIGNING_SECRET", "JWT_SECRET", "SUPABASE_JWT_SECRET", "FIREFOX_JWT_SECRET", "META_APP_SECRET", "GITHUB_WEBHOOK_SECRET"]) {
      expect(method(k), k).not.toBe("random");
    }
  });

  it("routes keys with clean APIs to provider rotators", () => {
    expect(catalogSpec("RESEND_API_KEY")?.provider).toBe("resend");
    expect(catalogSpec("RESEND_PITWORLD_ADMIN_KEY")?.provider).toBe("resend");
    expect(catalogSpec("CLOUDFLARE_API_TOKEN")?.provider).toBe("cloudflare-token");
    expect(catalogSpec("COINPAY_API_KEY")?.provider).toBe("coinpay-api-key");
    expect(catalogSpec("COINPAYPORTAL_WEBHOOK_SECRET")?.provider).toBe("coinpay-webhook-secret");
    expect(catalogSpec("VAPID_PRIVATE_KEY")?.provider).toBe("vapid");
    expect(catalogSpec("VAPID_PRIVATE")?.provider).toBe("vapid");
    expect(catalogSpec("SUPABASE_DB_PASSWORD")?.provider).toBe("postgres-role");
  });

  it("classifies public config as not-secret", () => {
    for (const k of [
      "COINPAY_OAUTH_CLIENT_ID",
      "COINPAY_OAUTH_REDIRECT_URI",
      "COINPAY_OAUTH_SCOPES",
      "COINPAY_OAUTH_ISSUER",
      "STRIPE_PUBLISHABLE_KEY",
      "SUPABASE_PUBLISHABLE_KEY",
      "HCAPTCHA_SITE_KEY",
      "SENTRY_DSN",
      "EXPO_PUBLIC_SENTRY_DSN",
      "WEBAUTHN_RP_ID",
      "SESSION_COOKIE_SECURE",
      "TURSO_DATABASE_URL",
      "AUTHOR_BATCH_SIZE",
      "SYSTEM_KEY_GENERATION",
      "JWT_PUBLIC_KEY_JWK",
      "R2_ACCESS_KEY_ID",
      "__ARCHIVE__SUPABASE_SERVICE_ROLE_KEY"
    ]) {
      expect(isNotSecret(k), k).toBe(true);
    }
    // ...but a connection string can hold a password.
    expect(isNotSecret("DATABASE_URL")).toBe(false);
    expect(catalogSpec("DATABASE_URL")?.family).toBe("postgres");
    expect(isNotSecret("NEXT_PUBLIC_SUPABASE_ANON_KEY")).toBe(false);
  });

  it("gives every secret-looking name from the 2026-10-29 unknown list some instructions", () => {
    const unknownBefore = [
      "ADMIN_KEY", "ADNETWORK_KEY", "ANON_KEY", "API_KEY_SALT", "BITTORRENTED_SUPABASE_KEY", "BUILTINDIE_KEY", "CRAWLPROOF_ACTOR_TOKEN_ANTHONY",
      "CRYPTO_APIS_KEY", "DB_PASS", "DEALDASH_COOKIE", "FAL_KEY", "GROUPCALL_AGENT_WORKER_KEY", "IMAP_PASS", "IP_HASH_SALT", "OPENACCESS_KEY_UGIG_NET",
      "PAYAGENT_KEY", "PG_META_CRYPTO_KEY", "SALAD_AI_GATEWAY_KEY", "SECRET_KEY_BASE", "SEEDBOX_HTTP_AUTH", "SERVICE_ROLE_KEY", "SMTP_PASS",
      "SOCIAL_VAULT_KEY", "SUPABASE_SECRETMAT_KEY", "TOKEN_ENC_KEY", "TURN_SERVER_CREDENTIAL", "VOTE_SALT", "SP_TOKEN_PEPPER", "AUR_SSH_KEY__1"
    ];
    for (const k of unknownBefore) expect(catalogSpec(k), k).not.toBeNull();
  });

  it("strips __n duplicate suffixes before matching", () => {
    expect(baseKeyName("SYSTEM_MNEMONIC_BTC__2")).toBe("SYSTEM_MNEMONIC_BTC");
    expect(method("CRON_SECRET__1")).toBe("random");
  });

  it("marks session signers disruptive so the weekly job leaves them", () => {
    expect(catalogSpec("SESSION_SECRET")?.disruptive).toBeTruthy();
    expect(catalogSpec("CRON_SECRET")?.disruptive).toBeUndefined();
  });
});

describe("planRotations", () => {
  const row = (vault: string, key: string, fingerprint: string) => ({ vault, key, fingerprint, updatedAt: "2026-10-01T00:00:00Z" });
  it("drops not-secret, archive and empty values; an entry can declare not-secret", () => {
    const plan = planRotations(
      [row("a--prod", "COINPAY_OAUTH_CLIENT_ID", "f1"), row("a--prod", "__ARCHIVE__X", "f2"), row("a--prod", "CRON_SECRET", EMPTY_FINGERPRINT), row("a--prod", "WEIRD_TOKEN", "f3"), row("a--prod", "CRON_SECRET", "f4")],
      new Map([["a--prod\u0000WEIRD_TOKEN", { method: "not-secret" as const }]])
    );
    expect(plan.map((p) => p.key)).toEqual(["CRON_SECRET"]);
  });
});

describe("entry specs", () => {
  it("cannot make a wallet key automatic", () => {
    const plan = planRotations([{ vault: "c--prod", key: "TREASURY_MNEMONIC_SOL", fingerprint: "f", updatedAt: "" }], new Map([["c--prod\u0000TREASURY_MNEMONIC_SOL", { method: "random" as const }]]));
    expect(plan[0]!.automatic).toBe(false);
    expect(plan[0]!.spec?.never).toBe(true);
  });
  it("TURN secrets are manual (coturn config holds a copy)", () => {
    expect(catalogSpec("TURN_SERVER_CREDENTIAL")?.method).toBe("manual");
  });
});

describe("scheduledBlock", () => {
  const p = (spec: any) => ({ key: "K", vaults: ["a--prod"], fingerprint: "f", oldestUpdate: "", method: spec.method, source: "catalog" as const, automatic: isAutomatic(spec), spec });
  it("lets plain random secrets and overlapping provider rotators through, nothing else", () => {
    expect(scheduledBlock(p(catalogSpec("CRON_SECRET")))).toBeNull();
    expect(scheduledBlock(p(catalogSpec("RESEND_API_KEY")))).toBeNull();
    expect(scheduledBlock(p(catalogSpec("CLOUDFLARE_API_TOKEN")))).toBeNull();
    expect(scheduledBlock(p(catalogSpec("COINPAY_API_KEY")))).toBeNull();
    expect(scheduledBlock(p(catalogSpec("SESSION_SECRET")))).toMatch(/disruptive/);
    expect(scheduledBlock(p(catalogSpec("COINPAY_WEBHOOK_SECRET")))).toMatch(/disruptive/);
    expect(scheduledBlock(p(catalogSpec("SUPABASE_DB_PASSWORD")))).toMatch(/disruptive/);
    expect(scheduledBlock(p(catalogSpec("SSH_ID_ED25519")))).toMatch(/person/);
    expect(scheduledBlock(p(catalogSpec("SYSTEM_MNEMONIC_SOL")))).toMatch(/person|never/);
  });
});
