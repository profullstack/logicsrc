/**
 * End-to-end CLI tests.
 *
 * The specification treats the CLI as a conformance surface — flags, output
 * shapes and exit codes — so these drive the real binary through a child
 * process rather than calling the functions underneath it. A masked value that
 * is only masked in the library is not masked.
 */

import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL("./cli.ts", import.meta.url));
const PASSWORD = "correct horse battery staple";
const EXPORT_PASSPHRASE = "opencreds-fixture";

let home: string;
let session: string;

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Run the CLI through tsx, so the test exercises the same source the build emits. */
async function cli(args: string[], input?: string, env: Record<string, string> = {}): Promise<RunResult> {
  try {
    const child = execFileAsync("npx", ["tsx", CLI, "--home", home, ...args], {
      env: { ...process.env, ...env },
    });
    if (input !== undefined) {
      child.child.stdin?.end(input);
    }
    const { stdout, stderr } = await child;
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", code: e.code ?? 1 };
  }
}

function authed(args: string[], input?: string): Promise<RunResult> {
  return cli(args, input, { OPENCREDS_SESSION: session });
}

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), "opencreds-cli-"));

  const init = await cli(["init", "--password-stdin", "--iterations", "100000"], PASSWORD);
  expect(init.code, init.stderr).toBe(0);
  expect(init.stdout).toMatch(/Recovery key/);

  const unlock = await cli(["unlock", "--password-stdin"], PASSWORD);
  expect(unlock.code, unlock.stderr).toBe(0);
  session = unlock.stdout.trim().replace(/^export OPENCREDS_SESSION="/, "").replace(/"$/, "");
  expect(session.length).toBeGreaterThan(20);
}, 120_000);

afterAll(() => {
  if (home) rmSync(home, { recursive: true, force: true });
});

describe("the vault lifecycle", () => {
  it("refuses to re-init over an existing vault, with the refused exit code", async () => {
    // C30 — 4 is "needs a confirmation that was not given".
    const result = await cli(["init", "--password-stdin"], PASSWORD);
    expect(result.code).toBe(4);
    expect(result.stderr).toMatch(/already exists/);
  });

  it("reports status while locked, with counts and no values", async () => {
    // C34.
    const result = await cli(["status", "--json"]);
    expect(result.code).toBe(0);
    const status = JSON.parse(result.stdout);
    expect(status.present).toBe(true);
    expect(status.unlocked).toBe(false);
    expect(status.namespace).toBe("opencreds");
    expect(status.profile).toBe("user");
  });
});

describe("items", () => {
  it("adds one of every type", async () => {
    const added = [
      await authed(["add", "login", "--name", "GitHub", "--username", "anthony", "--password", "hunter2", "--url", "https://github.com"]),
      await authed(["add", "card", "--name", "Visa", "--number", "4242424242424242", "--code", "123"]),
      await authed(["add", "identity", "--name", "Me", "--first-name", "Anthony", "--ssn", "000-00-0000"]),
      await authed(["add", "note", "--name", "WiFi", "--notes", "on the router"]),
      await authed(["add", "key", "--name", "deploy", "--key-type", "ssh", "--private-key", "-----BEGIN-----", "--mode", "0600"]),
      await authed(["add", "account", "--name", "Stripe", "--provider", "stripe", "--access-token", "sk_live_x", "--scope", "charges:write"]),
    ];
    for (const result of added) expect(result.code, result.stderr).toBe(0);

    const status = JSON.parse((await cli(["status", "--json"])).stdout);
    expect(status.itemCount).toBe(6);
    expect(status.types).toEqual({ login: 1, card: 1, identity: 1, note: 1, key: 1, account: 1 });
  }, 60_000);

  it("never prints a secret in list output, including --json", async () => {
    // C31, C32 — a pipeline is not an authorization.
    const plain = await authed(["list"]);
    expect(plain.stdout).toContain("GitHub");
    expect(plain.stdout).not.toContain("hunter2");

    const json = await authed(["list", "--json"]);
    expect(json.stdout).not.toContain("hunter2");
    expect(json.stdout).not.toContain("4242424242424242");
    expect(json.stdout).not.toContain("sk_live_x");
    expect(json.stdout).not.toContain("000-00-0000");
    // Non-secret fields are still there, or the output would be useless.
    expect(json.stdout).toContain("anthony");
  });

  it("masks a whole item on get, and reveals exactly one named field", async () => {
    const masked = await authed(["get", "GitHub"]);
    expect(masked.stdout).not.toContain("hunter2");
    expect(masked.stdout).toContain("anthony");

    const revealed = await authed(["get", "GitHub", "--field", "login.password", "--reveal"]);
    expect(revealed.stdout.trim()).toBe("hunter2");
  });

  it("refuses --reveal without a field", async () => {
    const result = await authed(["get", "GitHub", "--reveal"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/--reveal needs --field/);
  });

  it("filters by type and searches by name", async () => {
    const logins = await authed(["list", "--type", "login"]);
    expect(logins.stdout).toContain("GitHub");
    expect(logins.stdout).not.toContain("Visa");

    const search = await authed(["list", "--search", "vis"]);
    expect(search.stdout).toContain("Visa");
    expect(search.stdout).not.toContain("GitHub");
  });

  it("rejects an unknown type with the usage exit code", async () => {
    const result = await authed(["list", "--type", "passport"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/Unknown type/);
  });

  it("records the replaced password in history when one is edited", async () => {
    const edit = await authed(["edit", "login", "GitHub", "--password", "hunter3"]);
    expect(edit.code, edit.stderr).toBe(0);

    const revealed = await authed(["get", "GitHub", "--field", "login.password", "--reveal"]);
    expect(revealed.stdout.trim()).toBe("hunter3");

    const json = JSON.parse((await authed(["get", "GitHub"])).stdout);
    expect(json.history).toHaveLength(1);
    // Even in history, the old value is masked.
    expect(json.history[0].password).not.toBe("hunter2");
  }, 30_000);
});

describe("export and import", () => {
  it("exports an encrypted database that holds no plaintext secret", async () => {
    const out = join(home, "vault.opencreds");
    const result = await authed(["export", "--out", out, "--passphrase-stdin"], EXPORT_PASSPHRASE);
    expect(result.code, result.stderr).toBe(0);

    const raw = readFileSync(out, "utf8");
    expect(raw).not.toContain("hunter3");
    expect(raw).not.toContain("4242424242424242");
    const db = JSON.parse(raw);
    expect(db.protected).toBe(true);
    expect(db.manifest.itemCount).toBe(6);
  }, 60_000);

  it("refuses a plaintext export without --yes", async () => {
    // C24, C30 — exit 4 is "refused".
    const result = await authed(["export", "--plaintext", "--out", join(home, "leak.json")]);
    expect(result.code).toBe(4);
    expect(result.stderr).toMatch(/needs --yes/);
    expect(result.stdout).toMatch(/cannot be un-leaked/);
  });

  it("writes a plaintext export when told to, and labels it unprotected", async () => {
    const out = join(home, "plain.json");
    const result = await authed(["export", "--plaintext", "--yes", "--out", out]);
    expect(result.code, result.stderr).toBe(0);
    const db = JSON.parse(readFileSync(out, "utf8"));
    expect(db.protected).toBe(false);
    expect(JSON.stringify(db)).toContain("hunter3");
  }, 30_000);

  it("previews an import and writes nothing on --dry-run", async () => {
    // C33.
    const before = JSON.parse((await cli(["status", "--json"])).stdout).itemCount;
    const result = await authed(
      ["import", join(home, "vault.opencreds"), "--dry-run", "--passphrase-stdin"],
      EXPORT_PASSPHRASE,
    );
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/Manifest {4}verified/);
    expect(result.stdout).toMatch(/Nothing written/);
    expect(JSON.parse((await cli(["status", "--json"])).stdout).itemCount).toBe(before);
  }, 60_000);

  it("writes nothing when the manifest disagrees with the payload", async () => {
    // C23, C30 — exit 3 is a crypto failure, and nothing is imported.
    const tampered = join(home, "tampered.opencreds");
    const db = JSON.parse(readFileSync(join(home, "vault.opencreds"), "utf8"));
    db.manifest.itemCount = 99;
    writeFileSync(tampered, JSON.stringify(db));

    const before = JSON.parse((await cli(["status", "--json"])).stdout).itemCount;
    const result = await authed(["import", tampered, "--passphrase-stdin"], EXPORT_PASSPHRASE);
    expect(result.code).toBe(3);
    expect(JSON.parse((await cli(["status", "--json"])).stdout).itemCount).toBe(before);
  }, 60_000);

  it("imports a Bitwarden CSV and reports the rows it skipped", async () => {
    const csv = join(home, "bitwarden.csv");
    writeFileSync(
      csv,
      [
        "folder,favorite,type,name,notes,login_uri,login_username,login_password,login_totp",
        "Imported,1,login,GitLab,,https://gitlab.com,anthony,glpat-xxx,",
        ",,,,,,,,",
        "",
      ].join("\n"),
    );

    const result = await authed(["import", csv]);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/Bitwarden CSV/);
    expect(result.stdout).toMatch(/Skipped {5}1 rows/);
    expect(result.stdout).toMatch(/Empty row/);

    const list = await authed(["list", "--search", "GitLab"]);
    expect(list.stdout).toContain("GitLab");
  }, 60_000);

  it("skips a duplicate id rather than overwriting, by default", async () => {
    const before = JSON.parse((await cli(["status", "--json"])).stdout).itemCount;
    const result = await authed(["import", join(home, "vault.opencreds"), "--passphrase-stdin"], EXPORT_PASSPHRASE);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/6 skipped \(skip\)/);
    expect(JSON.parse((await cli(["status", "--json"])).stdout).itemCount).toBe(before);
  }, 60_000);
});

describe("validate", () => {
  it("exits 0 on a conforming document", async () => {
    const result = await cli(["validate", join(home, "plain.json")]);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/conforming OpenCreds database/);
  });

  it("exits 2 with a pointer at the problem", async () => {
    // C30 — 2 is a validation failure.
    const broken = join(home, "broken.json");
    const db = JSON.parse(readFileSync(join(home, "plain.json"), "utf8"));
    db.items[0].login = { ...db.items[0].login, uris: [{ uri: "https://x", match: "fuzzy" }] };
    db.items[0].type = "login";
    writeFileSync(broken, JSON.stringify(db));

    const result = await cli(["validate", broken]);
    expect(result.code).toBe(2);
    expect(result.stdout).toMatch(/uris\/0\/match/);
    expect(result.stdout).toMatch(/not a valid match rule/);
  });

  it("exits 2 on a file that is not JSON at all", async () => {
    const notJson = join(home, "notes.txt");
    writeFileSync(notJson, "just some text");
    const result = await cli(["validate", notJson]);
    expect(result.code).toBe(2);
  });
});
