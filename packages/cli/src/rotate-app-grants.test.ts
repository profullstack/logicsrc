// A rotation re-seals the new value to every app that holds the old one
// through a logicsrc app grant, reading each grant's own vault and name.
import { describe, expect, it } from "vitest";
import { createSealer } from "@profullstack/sealed-secrets";
import { encryptValue, fingerprintValue, generateVaultKey } from "@logicsrc/plugin-credential-sharing";
import { resealAppGrants } from "./rotate-keys.js";

describe("resealAppGrants", () => {
  it("seals the new value to the app's inbox and delivers it with the new fingerprint", async () => {
    const appSealer = createSealer({ app: "meshhook", scope: "workflow_secrets" });
    const inbox = await appSealer.createSeal("correct horse battery staple", "mh-user-1");
    const dek = await generateVaultKey();
    const fresh = "cp_live_rotated_fixture";
    const delivered: Array<{ id: string; sealed: string; fingerprint: string }> = [];
    const client = {
      listAppGrants: async (fp: string) => ({
        grants: fp === "fp-old"
          ? [{ id: "g1", app_name: "MeshHook", origin: "https://meshhook.com", key_name: "COINPAY_API_KEY", vault_id: "v1", source_name: "COINPAY_API_KEY", fingerprint: "fp-old", status: "active",
               recipient: { format: "sealed-secrets/inbox-v2", app: "meshhook", scope: "workflow_secrets", user_id: "mh-user-1", inbox_public_key: inbox.seal.inbox_public_key } },
             { id: "g2", app_name: "Other", origin: "https://other.example", key_name: "K", vault_id: "v-locked", source_name: "K", fingerprint: "fp-old", status: "active",
               recipient: { format: "sealed-secrets/inbox-v2", app: "x", scope: "y", user_id: "u", inbox_public_key: inbox.seal.inbox_public_key } }]
          : []
      }),
      listSecrets: async () => ({ secrets: [{ name: "COINPAY_API_KEY", ...(await encryptValue(fresh, dek)), fingerprint: fingerprintValue(fresh) }] }),
      deliverAppGrant: async (id: string, sealed: string, fingerprint: string) => {
        delivered.push({ id, sealed, fingerprint });
        return { ok: true, delivered: true };
      }
    };
    const team = { client: client as never, vaults: [{ id: "v1", name: "meshhook--prod", project: "meshhook", env: "prod", secrets: [] }], dek: async () => dek };

    const report = await resealAppGrants(team, "fp-old");
    expect(report).toEqual(["meshhook.com:COINPAY_API_KEY updated", "other.example:K not updated (no access to its vault)"]);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]!.fingerprint).toBe(fingerprintValue(fresh));
    const entry = JSON.parse(delivered[0]!.sealed.slice("sealed:v2:".length));
    const { patch } = await appSealer.openInbox(inbox.dek, inbox.seal, [entry], "mh-user-1");
    expect(patch).toEqual({ COINPAY_API_KEY: fresh });
  });

  it("does nothing for a client without app grants (older servers, test fakes)", async () => {
    expect(await resealAppGrants({ client: {} as never, vaults: [], dek: async () => "" }, "fp")).toEqual([]);
  });
});
