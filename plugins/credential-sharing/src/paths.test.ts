// Where the identity and the vault live.
//
// These used to be three different answers. The identity was under
// `~/.logicsrc`, the CLI config beside it, and the credential store resolved
// against `process.cwd()` — so the vault was wherever you were standing when
// you ran the command. Running the CLI inside a git checkout wrote a directory
// literally named `credentials/vault` into that repo's working tree: untracked,
// unignored, one `git add -A` from being published.
//
// There is one vault per user, per machine. That is what these pin.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { logicsrcHome, identityPath, legacyLogicsrcHome } from "./identity.js";
import { defaultCredentialHome } from "./store.js";

const ENV_KEYS = ["LOGICSRC_HOME", "XDG_CONFIG_HOME", "HOME", "LOGICSRC_CREDENTIAL_HOME", "LOGICSRC_IDENTITY_FILE"] as const;

let saved: Record<string, string | undefined>;
let sandbox: string;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  sandbox = mkdtempSync(join(tmpdir(), "logicsrc-paths-"));
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.HOME = sandbox;
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(sandbox, { recursive: true, force: true });
});

describe("logicsrc home", () => {
  it("defaults to ~/.config/logicsrc", () => {
    expect(logicsrcHome()).toBe(join(sandbox, ".config", "logicsrc"));
  });

  it("honours XDG_CONFIG_HOME", () => {
    process.env.XDG_CONFIG_HOME = join(sandbox, "xdg");
    expect(logicsrcHome()).toBe(join(sandbox, "xdg", "logicsrc"));
  });

  it("lets LOGICSRC_HOME override everything", () => {
    process.env.LOGICSRC_HOME = join(sandbox, "explicit");
    expect(logicsrcHome()).toBe(join(sandbox, "explicit"));
  });
});

describe("the credential store", () => {
  it("never resolves against the working directory", () => {
    // The regression this exists for. Whatever the cwd is, the vault is not
    // under it — a `.logicsrc/` appearing inside a project is the bug.
    const home = defaultCredentialHome();
    expect(home).toBe(join(sandbox, ".config", "logicsrc", "credentials"));
    expect(home.startsWith(process.cwd())).toBe(false);
  });

  it("is the same store no matter where the CLI is run from", () => {
    const before = defaultCredentialHome();
    const elsewhere = mkdtempSync(join(tmpdir(), "logicsrc-cwd-"));
    const original = process.cwd();
    try {
      process.chdir(elsewhere);
      expect(defaultCredentialHome()).toBe(before);
    } finally {
      process.chdir(original);
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it("still takes an explicit LOGICSRC_CREDENTIAL_HOME", () => {
    process.env.LOGICSRC_CREDENTIAL_HOME = join(sandbox, "vol", "creds");
    expect(defaultCredentialHome()).toBe(join(sandbox, "vol", "creds"));
  });

  it("sits beside the identity, under one home", () => {
    expect(defaultCredentialHome()).toBe(join(logicsrcHome(), "credentials"));
    expect(identityPath()).toBe(join(logicsrcHome(), "identity.json"));
  });
});

describe("migrating off ~/.logicsrc", () => {
  it("moves the old directory, keeping the identity key", () => {
    // The secret key is the whole account: losing it loses every team vault
    // the member was ever given. So this is a move, not a fresh start.
    const legacy = legacyLogicsrcHome();
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, "identity.json"), '{"keys":{"secretKey":"kept"}}');

    const home = logicsrcHome();
    expect(existsSync(legacy)).toBe(false);
    expect(JSON.parse(readFileSync(join(home, "identity.json"), "utf8")).keys.secretKey).toBe("kept");
  });

  it("leaves the old directory alone once the new one exists", () => {
    // Two directories both claiming to be the identity is the state where a
    // login writes one and a read finds the other. Whatever is already at the
    // new path wins; the legacy one is not merged over it.
    const legacy = legacyLogicsrcHome();
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, "identity.json"), '{"keys":{"secretKey":"old"}}');
    const home = join(sandbox, ".config", "logicsrc");
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, "identity.json"), '{"keys":{"secretKey":"current"}}');

    logicsrcHome();
    expect(JSON.parse(readFileSync(join(home, "identity.json"), "utf8")).keys.secretKey).toBe("current");
    expect(existsSync(legacy)).toBe(true);
  });

  it("does nothing when there is no legacy directory", () => {
    const home = logicsrcHome();
    expect(existsSync(legacyLogicsrcHome())).toBe(false);
    expect(home).toBe(join(sandbox, ".config", "logicsrc"));
  });
});
