import { describe, expect, it } from "vitest";
import {
  catalogSpec,
  detectFormat,
  generateRandomSecret,
  isNotSecret,
  parseRotationSpec,
  planRotations,
  rotationEntryName,
  ROTATE_PREFIX,
  EMPTY_FINGERPRINT,
  isoTime
} from "./rotation-catalog.js";
import { newEd25519, specFromOptions } from "./rotate-keys.js";
import { ROTATION_ENTRY_PREFIX } from "@logicsrc/plugin-credential-sharing";

describe("catalog", () => {
  it("never automates wallet keys or keys that protect stored data", () => {
    for (const k of ["SYSTEM_MNEMONIC_SOL", "SOLANA_PRIVATE_KEY", "EVM_PRIVATE_KEY", "X402_CRAWLER_PRIVATE_KEY", "SETTINGS_ENCRYPTION_KEY", "ENCRYPTION_KEY"]) {
      expect(catalogSpec(k)?.method, k).toBe("manual");
    }
  });

  it("mints our own shared secrets automatically", () => {
    for (const k of ["CRON_SECRET", "INTERNAL_API_KEY", "NEXTAUTH_SECRET", "INFERNET_ADMIN_TOKEN"]) {
      expect(catalogSpec(k)?.method, k).toBe("random");
    }
  });

  it("never mints random values for provider-issued secrets with our-looking names", () => {
    for (const k of ["META_APP_SECRET", "GOOGLE_AUTH_SECRET", "FACEBOOK_APP_SECRET"]) expect(catalogSpec(k)?.method, k).toBe("manual");
    expect(catalogSpec("REMINDERS_CRON_SECRET")?.method).toBe("random");
    expect(catalogSpec("PIT_ADMIN_TOKEN")?.method).toBe("random");
    expect(catalogSpec("INFERNET_CLI_SESSION_SECRET")?.method).toBe("random");
  });

  it("rotates ssh private keys with ssh-keygen, never their public halves or config", () => {
    expect(catalogSpec("SSH_ID_ED25519")?.method).toBe("ssh-keygen");
    expect(catalogSpec("SSH_ID_ED25519_DEPLOY")?.method).toBe("ssh-keygen");
    expect(catalogSpec("DEPLOY_KEY")?.method).toBe("ssh-keygen");
    expect(catalogSpec("SSH_ID_ED25519_PUB")).toBeNull();
    expect(catalogSpec("SSH_CONFIG")).toBeNull();
    expect(isNotSecret("SSH_KNOWN_HOSTS")).toBe(true);
  });

  it("points provider keys at the provider, with a url", () => {
    const stripe = catalogSpec("STRIPE_SECRET_KEY");
    expect(stripe?.method).toBe("manual");
    expect(stripe?.url).toContain("stripe.com");
    expect(catalogSpec("ANTHROPIC_API_KEY")?.url).toContain("anthropic.com");
    expect(catalogSpec("SOME_VENDOR_API_KEY")?.method).toBe("manual");
  });

  it("knows nothing about plain config", () => {
    expect(catalogSpec("SOLANA_RPC_URL")).toBeNull();
    expect(catalogSpec("NODE_ENV")).toBeNull();
  });
});

describe("random secrets", () => {
  it("keep the old value's alphabet and length, never shorter than 32", () => {
    const hex = "a".repeat(64);
    expect(detectFormat(hex)).toBe("hex");
    const next = generateRandomSecret({}, hex);
    expect(next).toMatch(/^[0-9a-f]{64}$/);
    expect(next).not.toBe(hex);
    expect(generateRandomSecret({}, "short")).toHaveLength(32);
    expect(generateRandomSecret({ format: "alnum", length: 40 })).toMatch(/^[A-Za-z0-9]{40}$/);
    expect(generateRandomSecret({ format: "base64url", length: 48 })).toMatch(/^[A-Za-z0-9_-]{48}$/);
  });
});

describe("specs", () => {
  it("validate what agents will follow", () => {
    expect(parseRotationSpec('{"method":"manual","steps":["a",""," ","b"]}').steps).toEqual(["a", "b"]);
    expect(() => parseRotationSpec('{"method":"delete-everything"}')).toThrow(/method/);
    expect(() => parseRotationSpec('{"method":"command"}')).toThrow(/command/);
    expect(() => parseRotationSpec('{"method":"random","length":4}')).toThrow(/length/);
    expect(() => parseRotationSpec("not json")).toThrow(/JSON/);
  });

  it("can be built from CLI flags", () => {
    const spec = specFromOptions({ method: "manual", url: "https://x.test", step: ["one", "two"], consumer: ["dev2"], outputFormat: "json" });
    expect(spec).toMatchObject({ method: "manual", url: "https://x.test", steps: ["one", "two"], consumers: ["dev2"] });
  });

  it("are stored under the prefix the team provider hides from .env sync", () => {
    expect(ROTATE_PREFIX).toBe(ROTATION_ENTRY_PREFIX);
    expect(rotationEntryName("CRON_SECRET")).toBe("__ROTATE__CRON_SECRET");
  });
});

describe("planRotations", () => {
  const row = (vault: string, key: string, fingerprint: string, updatedAt = "2026-10-01") => ({ vault, key, fingerprint, updatedAt });

  it("rotates one value once, however many vaults hold it", () => {
    const plan = planRotations(
      [row("a--prod", "ANTHROPIC_API_KEY", "f1"), row("b--prod", "ANTHROPIC_API_KEY", "f1", "2026-09-01"), row("c--prod", "ANTHROPIC_API_KEY", "f2")],
      new Map()
    );
    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({ vaults: ["a--prod", "b--prod"], oldestUpdate: "2026-09-01", source: "catalog" });
  });

  it("prefers the entry's own instructions, and never plans rotation entries or public keys", () => {
    const plan = planRotations(
      [row("a--prod", "CRON_SECRET", "f1"), row("a--prod", "__ROTATE__CRON_SECRET", "f9"), row("a--prod", "SSH_ID_ED25519_PUB", "f8")],
      new Map([["a--prod\u0000CRON_SECRET", { method: "command" as const, command: "mint" }]])
    );
    expect(plan.map((p) => p.key)).toEqual(["CRON_SECRET"]);
    expect(plan[0]).toMatchObject({ method: "command", source: "entry", automatic: true });
  });

  it("never plans or propagates empty values, which all share one fingerprint", () => {
    const plan = planRotations([row("a--prod", "SHOPIFY_ACCESS_TOKEN", EMPTY_FINGERPRINT), row("b--prod", "OPENAI_API_KEY", EMPTY_FINGERPRINT)], new Map());
    expect(plan).toEqual([]);
  });

  it("treats trading knobs named *_SEED_* as config, not wallet seeds", () => {
    expect(planRotations([row("a--prod", "ARB_AUTO_SEED_MIN_USD", "f1")], new Map())).toEqual([]);
    expect(isoTime(1785867760)).toMatch(/^2026-/);
  });

  it("flags secret-looking keys nobody wrote instructions for, and skips plain config", () => {
    const plan = planRotations([row("a--prod", "MYSTERY_SIGNING_THING", "f1"), row("a--prod", "SNIPE_MODE", "f2"), row("a--prod", "V2_SIZE_USD", "f3")], new Map());
    expect(plan.map((p) => p.key)).toEqual(["MYSTERY_SIGNING_THING"]);
    expect(plan[0]).toMatchObject({ method: "unknown", source: "none", automatic: false });
  });
});

describe("newEd25519", () => {
  it("returns an OpenSSH keypair and leaves no files behind", () => {
    const pair = newEd25519("test");
    expect(pair.privateKey).toContain("BEGIN OPENSSH PRIVATE KEY");
    expect(pair.publicKey).toMatch(/^ssh-ed25519 \S+ test$/);
  });
});
