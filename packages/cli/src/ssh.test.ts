import { userInfo } from "node:os";
import { describe, expect, it } from "vitest";
import { keysToHoldBack, sshVaultUser, SSH_PROJECT } from "./ssh.js";
import { vaultName } from "./teams.js";

describe("ssh vault addressing", () => {
  it("defaults to this machine's username", () => {
    expect(sshVaultUser()).toBe(userInfo().username.toLowerCase());
  });

  it("slugifies a username into the vault charset", () => {
    expect(sshVaultUser("Anthony_Young")).toBe("anthony-young");
    expect(sshVaultUser("anthony@profullstack.com")).toBe("anthony-profullstack-com");
  });

  it("rejects a username with nothing usable in it", () => {
    expect(() => sshVaultUser("!!!")).toThrow(/Could not work out a username/);
  });

  it("produces a vault name teams vaults can split back into project and env", () => {
    expect(vaultName(SSH_PROJECT, sshVaultUser("anthony"))).toBe("ssh--anthony");
  });
});

describe("overwrite hold-back", () => {
  const entries = [
    { key: "SSH_CONFIG", op: "add" as const, destructive: false },
    { key: "SSH_ID_ED25519", op: "update" as const, destructive: true }
  ];

  it("holds back files that already differ on the far side", () => {
    expect(keysToHoldBack(entries, false)).toEqual(["SSH_ID_ED25519"]);
  });

  it("overwrites everything once --force is given", () => {
    expect(keysToHoldBack(entries, true)).toEqual([]);
  });

  it("never holds back a file that is only being added", () => {
    expect(keysToHoldBack([entries[0]], false)).toEqual([]);
  });
});
