import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import { createServer, type Server, type IncomingMessage } from "node:http";
import { createCredShareApi, type CredShareRequest } from "./router.js";
import { createMemoryCredShareStore } from "./store.js";
import {
  TeamClient,
  generateIdentityKeyPair,
  generateVaultKey,
  wrapVaultKey,
  unwrapVaultKey,
  encryptValue,
  decryptValue,
  fingerprintValue
} from "@logicsrc/plugin-credential-sharing";

/**
 * True end-to-end test: the real HTTP server + the real TeamClient + real
 * libsodium crypto. Alice shares a .env with Bob purely through the server, and
 * we assert the server never held plaintext while Bob still recovers the values.
 */
describe("credshare end-to-end (server + client + crypto)", () => {
  let server: Server;
  let apiUrl: string;

  beforeAll(async () => {
    // Hermetic server: real router + memory store, no email transport (so the
    // dev-code echo path is deterministic and independent of ambient env).
    const api = createCredShareApi({ store: createMemoryCredShareStore() });
    server = createServer(async (request, response) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      const method = request.method ?? "GET";
      let body: unknown;
      if (method === "POST" || method === "PUT" || method === "PATCH") {
        body = await readBody(request);
      }
      const header = request.headers["authorization"];
      const token = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
      const req: CredShareRequest = { method, path: url.pathname.replace(/^\/api\/credshare/, "") || "/", query: url.searchParams, body, token };
      const result = await api.handle(req);
      response.writeHead(result.status, { "content-type": "application/json" });
      response.end(JSON.stringify(result.body));
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function readBody(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString("utf8");
    return text ? JSON.parse(text) : undefined;
  }

  async function loginClient(email: string) {
    const client = new TeamClient({ apiUrl });
    const req = await client.requestLoginCode(email);
    const verify = await client.verifyLoginCode(email, req.devCode!);
    client.setToken(verify.token);
    return client;
  }

  it("shares an env bundle from Alice to Bob without the server ever seeing plaintext", async () => {
    const secretEnv = { DATABASE_URL: "postgres://user:pw@host/db", STRIPE_KEY: "sk_live_deadbeef" };

    // --- Alice sets up ---
    const alice = await loginClient("alice@acme.dev");
    const aliceKeys = await generateIdentityKeyPair();
    await alice.uploadPublicKey(aliceKeys.publicKey);
    await alice.createTeam("acme-e2e", "Acme");
    const { vault } = await alice.createVault("acme-e2e", "prod");

    // Alice mints the vault DEK, wraps it to herself, and pushes ciphertext.
    const dek = await generateVaultKey();
    await alice.putGrant(vault.id, "alice@acme.dev", await wrapVaultKey(dek, aliceKeys.publicKey));
    const upserts = [] as Array<{ name: string; nonce: string; ciphertext: string; fingerprint: string }>;
    for (const [name, value] of Object.entries(secretEnv)) {
      const sealed = await encryptValue(value, dek);
      upserts.push({ name, ...sealed, fingerprint: fingerprintValue(value) });
    }
    await alice.putSecrets(vault.id, upserts, []);

    // The server must only hold ciphertext — assert no plaintext leaks over the wire.
    const stored = await alice.listSecrets(vault.id);
    for (const s of stored.secrets) {
      expect(s.ciphertext).not.toContain("postgres://");
      expect(s.ciphertext).not.toContain("sk_live");
    }

    // --- Bob joins ---
    const bob = await loginClient("bob@acme.dev");
    const bobKeys = await generateIdentityKeyPair();
    await bob.uploadPublicKey(bobKeys.publicKey);
    const invite = await alice.invite("acme-e2e", "bob@acme.dev");
    await bob.acceptInvite(invite.token!);

    // --- Alice grants Bob: look up Bob's pubkey, re-wrap the DEK to it ---
    const bobUser = await alice.lookupUser("bob@acme.dev");
    const aliceDek = await unwrapVaultKey((await alice.getMyGrant(vault.id)).wrappedDek, aliceKeys);
    await alice.putGrant(vault.id, "bob@acme.dev", await wrapVaultKey(aliceDek, bobUser.publicKey!));

    // --- Bob pulls + decrypts on his machine ---
    const bobDek = await unwrapVaultKey((await bob.getMyGrant(vault.id)).wrappedDek, bobKeys);
    const bobSecrets = await bob.listSecrets(vault.id);
    const recovered: Record<string, string> = {};
    for (const s of bobSecrets.secrets) {
      recovered[s.name] = await decryptValue({ nonce: s.nonce, ciphertext: s.ciphertext }, bobDek);
    }
    expect(recovered).toEqual(secretEnv);
  });

  it("denies decryption to a member who has not been granted the DEK", async () => {
    const alice = await loginClient("alice2@acme.dev");
    const aliceKeys = await generateIdentityKeyPair();
    await alice.uploadPublicKey(aliceKeys.publicKey);
    await alice.createTeam("acme-e2e-2", "Acme2");
    const { vault } = await alice.createVault("acme-e2e-2", "prod");
    const dek = await generateVaultKey();
    await alice.putGrant(vault.id, "alice2@acme.dev", await wrapVaultKey(dek, aliceKeys.publicKey));

    const carol = await loginClient("carol@acme.dev");
    await carol.uploadPublicKey((await generateIdentityKeyPair()).publicKey);
    const invite = await alice.invite("acme-e2e-2", "carol@acme.dev");
    await carol.acceptInvite(invite.token!);

    // Carol is a member (can see ciphertext) but has no grant → cannot get a DEK.
    await expect(carol.getMyGrant(vault.id)).rejects.toThrow();
  });
});
