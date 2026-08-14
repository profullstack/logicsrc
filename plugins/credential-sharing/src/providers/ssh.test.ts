import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decodeSshFile, encodeSshFile, isPassphraseless, readSshDirectory, secretNameForPath, sshProvider } from "./ssh.js";

const PRIVATE_KEY = ["-----BEGIN OPENSSH PRIVATE KEY-----", "b3BlbnNzaC1rZXktdjEAAAAABG5vbmU=", "-----END OPENSSH PRIVATE KEY-----", ""].join("\n");
const PUBLIC_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample anthony@dev\n";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "logicsrc-ssh-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(relPath: string, body: string, mode = 0o600): void {
  const target = join(dir, relPath);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, body);
  chmodSync(target, mode);
}

describe("ssh directory scanning", () => {
  it("picks up key pairs and config, and skips host-specific files", () => {
    write("id_ed25519", PRIVATE_KEY, 0o600);
    write("id_ed25519.pub", PUBLIC_KEY, 0o644);
    write("config", "Host dev\n  User anthony\n", 0o600);
    write("known_hosts", "github.com ssh-ed25519 AAAAC3Nz\n", 0o644);
    write("authorized_keys", PUBLIC_KEY, 0o600);

    const bag = readSshDirectory(dir);
    expect(Object.keys(bag).sort()).toEqual(["SSH_CONFIG", "SSH_ID_ED25519", "SSH_ID_ED25519_PUB"]);
    expect(decodeSshFile("SSH_ID_ED25519", bag.SSH_ID_ED25519)).toMatchObject({ path: "id_ed25519", mode: 0o600, kind: "private-key" });
    expect(decodeSshFile("SSH_ID_ED25519_PUB", bag.SSH_ID_ED25519_PUB)).toMatchObject({ mode: 0o644, kind: "public-key" });
  });

  it("includes opted-in files by name", () => {
    write("authorized_keys", PUBLIC_KEY, 0o600);
    expect(Object.keys(readSshDirectory(dir, new Set(["authorized_keys"])))).toEqual(["SSH_AUTHORIZED_KEYS"]);
  });

  it("recurses into subdirectories and keeps paths distinct", () => {
    write("keys/work_ed25519", PRIVATE_KEY);
    const bag = readSshDirectory(dir);
    expect(Object.keys(bag)).toEqual(["SSH_KEYS_WORK_ED25519"]);
    expect(decodeSshFile("SSH_KEYS_WORK_ED25519", bag.SSH_KEYS_WORK_ED25519).path).toBe("keys/work_ed25519");
  });

  it("ignores files that are neither key material nor ssh config", () => {
    write("notes.txt", "just a scratch file\n");
    expect(readSshDirectory(dir)).toEqual({});
  });

  it("returns an empty bag for a directory that does not exist", () => {
    expect(readSshDirectory(join(dir, "missing"))).toEqual({});
  });
});

describe("ssh file envelopes", () => {
  it("round-trips path, mode, kind and body", () => {
    const file = { path: "keys/id_rsa", mode: 0o600, kind: "private-key" as const, body: PRIVATE_KEY };
    expect(decodeSshFile("SSH_KEYS_ID_RSA", encodeSshFile(file))).toEqual(file);
  });

  it("rejects a value that is not an envelope", () => {
    expect(() => decodeSshFile("SSH_CONFIG", "Host dev\n")).toThrow(/not a logicsrc ssh file envelope/);
  });

  it("refuses an envelope from a newer logicsrc", () => {
    expect(() => decodeSshFile("SSH_CONFIG", JSON.stringify({ v: 99, path: "config", body: "x" }))).toThrow(/newer logicsrc/);
  });

  it("names secrets legibly and stably", () => {
    expect(secretNameForPath("id_ed25519.pub")).toBe("SSH_ID_ED25519_PUB");
    expect(secretNameForPath("config")).toBe("SSH_CONFIG");
  });
});

describe("ssh provider writes", () => {
  it("restores files with their permission bits, tightening a loose existing file", async () => {
    const endpoint = { provider: "ssh", path: dir };
    write("id_ed25519", "stale\n", 0o644);
    const upserts = {
      SSH_ID_ED25519: encodeSshFile({ path: "id_ed25519", mode: 0o600, kind: "private-key", body: PRIVATE_KEY }),
      SSH_KEYS_WORK: encodeSshFile({ path: "keys/work", mode: 0o600, kind: "private-key", body: PRIVATE_KEY })
    };

    const results = await sshProvider.write({ endpoint, upserts, deletes: [], dryRun: false });
    expect(results.every((result) => result.applied)).toBe(true);
    expect(readFileSync(join(dir, "id_ed25519"), "utf8")).toBe(PRIVATE_KEY);
    expect(statSync(join(dir, "id_ed25519")).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, "keys/work")).mode & 0o777).toBe(0o600);
  });

  it("writes nothing on a dry run", async () => {
    const endpoint = { provider: "ssh", path: dir };
    const upserts = { SSH_CONFIG: encodeSshFile({ path: "config", mode: 0o600, kind: "config", body: "Host dev\n" }) };
    const results = await sshProvider.write({ endpoint, upserts, deletes: [], dryRun: true });
    expect(results).toEqual([{ key: "SSH_CONFIG", applied: false }]);
    expect(readSshDirectory(dir)).toEqual({});
  });

  it("refuses a path that escapes the ssh directory", async () => {
    const endpoint = { provider: "ssh", path: dir };
    const upserts = { SSH_ESCAPE: encodeSshFile({ path: "../escaped", mode: 0o600, kind: "other", body: "nope" }) };
    const [result] = await sshProvider.write({ endpoint, upserts, deletes: [], dryRun: false });
    expect(result.applied).toBe(false);
    expect(result.error).toMatch(/resolves outside/);
  });

  it("never deletes local key files", async () => {
    const endpoint = { provider: "ssh", path: dir };
    write("id_ed25519", PRIVATE_KEY);
    const [result] = await sshProvider.write({ endpoint, upserts: {}, deletes: ["SSH_ID_ED25519"], dryRun: false });
    expect(result.applied).toBe(false);
    expect(readFileSync(join(dir, "id_ed25519"), "utf8")).toBe(PRIVATE_KEY);
  });
});

describe("passphrase detection", () => {
  it("flags an unencrypted OpenSSH key", () => {
    expect(isPassphraseless(PRIVATE_KEY)).toBe(true);
  });

  it("does not flag an encrypted OpenSSH key", () => {
    const encrypted = PRIVATE_KEY.replace("b3BlbnNzaC1rZXktdjEAAAAABG5vbmU=", Buffer.concat([
      Buffer.from("openssh-key-v1\0", "latin1"),
      Buffer.from([0, 0, 0, 10]),
      Buffer.from("aes256-ctr", "latin1")
    ]).toString("base64"));
    expect(isPassphraseless(encrypted)).toBe(false);
  });

  it("does not flag a non-key body", () => {
    expect(isPassphraseless(PUBLIC_KEY)).toBe(false);
  });
});
