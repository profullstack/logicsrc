import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryCredShareStore } from "./store.js";
import { createCredShareApi, type CredShareRequest } from "./router.js";

function api() {
  return createCredShareApi({ store: createMemoryCredShareStore() });
}

async function login(app: ReturnType<typeof createCredShareApi>, email: string): Promise<string> {
  const req = await app.handle(reqOf("POST", "/auth/request", { body: { email } }));
  const code = (req.body as { devCode: string }).devCode;
  const verify = await app.handle(reqOf("POST", "/auth/verify", { body: { email, code } }));
  return (verify.body as { token: string }).token;
}

function reqOf(method: string, path: string, opts: { body?: unknown; token?: string; query?: Record<string, string> } = {}): CredShareRequest {
  return {
    method,
    path,
    query: new URLSearchParams(opts.query ?? {}),
    body: opts.body,
    token: opts.token
  };
}

describe("credshare API", () => {
  let app: ReturnType<typeof createCredShareApi>;
  beforeEach(() => {
    app = api();
  });

  it("issues a token via the email-code flow and rejects a bad code", async () => {
    const request = await app.handle(reqOf("POST", "/auth/request", { body: { email: "Owner@Example.com" } }));
    expect(request.status).toBe(200);
    const code = (request.body as { devCode: string }).devCode;
    expect(code).toMatch(/^\d{6}$/);

    const bad = await app.handle(reqOf("POST", "/auth/verify", { body: { email: "owner@example.com", code: "000000" } }));
    expect(bad.status).toBe(401);

    const good = await app.handle(reqOf("POST", "/auth/verify", { body: { email: "owner@example.com", code } }));
    expect(good.status).toBe(200);
    expect((good.body as { user: { email: string } }).user.email).toBe("owner@example.com");
  });

  it("rejects protected routes without a token", async () => {
    const res = await app.handle(reqOf("GET", "/teams"));
    expect(res.status).toBe(401);
  });

  it("runs the full invite → accept → push → grant → pull loop", async () => {
    const ownerToken = await login(app, "owner@example.com");
    const bobToken = await login(app, "bob@example.com");

    // Both members upload public keys.
    await app.handle(reqOf("POST", "/keys", { token: ownerToken, body: { publicKey: "OWNER_PUBKEY_B64" } }));
    await app.handle(reqOf("POST", "/keys", { token: bobToken, body: { publicKey: "BOB_PUBKEY_B64" } }));

    // Owner creates a team + vault.
    const team = await app.handle(reqOf("POST", "/teams", { token: ownerToken, body: { slug: "acme", name: "Acme" } }));
    expect(team.status).toBe(201);
    const vaultRes = await app.handle(reqOf("POST", "/teams/acme/vaults", { token: ownerToken, body: { name: "prod" } }));
    const vaultId = (vaultRes.body as { vault: { id: string } }).vault.id;

    // Owner self-grants (wraps DEK to own key) and pushes ciphertext.
    await app.handle(reqOf("POST", `/vaults/${vaultId}/grants`, { token: ownerToken, body: { email: "owner@example.com", wrappedDek: "DEK_SEALED_TO_OWNER" } }));
    const push = await app.handle(
      reqOf("PUT", `/vaults/${vaultId}/secrets`, {
        token: ownerToken,
        body: { upserts: [{ name: "DATABASE_URL", nonce: "n1", ciphertext: "c1", fingerprint: "fp1" }] }
      })
    );
    expect(push.status).toBe(200);

    // Bob can't access yet — no grant.
    const bobEarly = await app.handle(reqOf("GET", `/vaults/${vaultId}/grant`, { token: bobToken }));
    expect(bobEarly.status).toBe(403);

    // Owner invites Bob; Bob accepts.
    const invite = await app.handle(reqOf("POST", "/teams/acme/invites", { token: ownerToken, body: { email: "bob@example.com" } }));
    expect(invite.status).toBe(201);
    const inviteToken = (invite.body as { token: string }).token;
    const accept = await app.handle(reqOf("POST", "/invites/accept", { token: bobToken, body: { token: inviteToken } }));
    expect(accept.status).toBe(200);

    // Bob is now a member and can read ciphertext, but still needs a grant to decrypt.
    const members = await app.handle(reqOf("GET", "/teams/acme/members", { token: bobToken }));
    expect((members.body as { members: unknown[] }).members).toHaveLength(2);

    // Owner grants Bob (re-wraps DEK to Bob's pubkey).
    const grantBob = await app.handle(reqOf("POST", `/vaults/${vaultId}/grants`, { token: ownerToken, body: { email: "bob@example.com", wrappedDek: "DEK_SEALED_TO_BOB" } }));
    expect(grantBob.status).toBe(201);

    // Bob pulls his wrapped DEK and the ciphertext.
    const bobGrant = await app.handle(reqOf("GET", `/vaults/${vaultId}/grant`, { token: bobToken }));
    expect((bobGrant.body as { wrappedDek: string }).wrappedDek).toBe("DEK_SEALED_TO_BOB");
    const secrets = await app.handle(reqOf("GET", `/vaults/${vaultId}/secrets`, { token: bobToken }));
    expect((secrets.body as { secrets: { name: string }[] }).secrets[0].name).toBe("DATABASE_URL");
  });

  it("stops a non-admin from inviting and enforces invite-email match", async () => {
    const ownerToken = await login(app, "owner@example.com");
    const bobToken = await login(app, "bob@example.com");
    const eveToken = await login(app, "eve@example.com");
    await app.handle(reqOf("POST", "/keys", { token: bobToken, body: { publicKey: "BOB" } }));
    await app.handle(reqOf("POST", "/teams", { token: ownerToken, body: { slug: "acme", name: "Acme" } }));

    // Invite Bob as a plain member; Bob accepts.
    const inv = await app.handle(reqOf("POST", "/teams/acme/invites", { token: ownerToken, body: { email: "bob@example.com" } }));
    await app.handle(reqOf("POST", "/invites/accept", { token: bobToken, body: { token: (inv.body as { token: string }).token } }));

    // Bob (member) cannot invite.
    const bobInvite = await app.handle(reqOf("POST", "/teams/acme/invites", { token: bobToken, body: { email: "carol@example.com" } }));
    expect(bobInvite.status).toBe(403);

    // Eve can't accept Bob's-email invite.
    const inv2 = await app.handle(reqOf("POST", "/teams/acme/invites", { token: ownerToken, body: { email: "carol@example.com" } }));
    const eveAccept = await app.handle(reqOf("POST", "/invites/accept", { token: eveToken, body: { token: (inv2.body as { token: string }).token } }));
    expect(eveAccept.status).toBe(403);
  });

  it("blocks a non-member from a team's vault entirely", async () => {
    const ownerToken = await login(app, "owner@example.com");
    const strangerToken = await login(app, "stranger@example.com");
    await app.handle(reqOf("POST", "/teams", { token: ownerToken, body: { slug: "acme" } }));
    const v = await app.handle(reqOf("POST", "/teams/acme/vaults", { token: ownerToken, body: { name: "prod" } }));
    const vaultId = (v.body as { vault: { id: string } }).vault.id;

    const stranger = await app.handle(reqOf("GET", `/vaults/${vaultId}/secrets`, { token: strangerToken }));
    expect(stranger.status).toBe(403);
    const strangerMembers = await app.handle(reqOf("GET", "/teams/acme/members", { token: strangerToken }));
    expect(strangerMembers.status).toBe(403);
  });
});
