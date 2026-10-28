import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createLogicSrcMcpServer } from "./server.js";

type Call = { url: string; method: string; body: unknown };
const PUB = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFK+fzMc3AneHlJ9+KGxhlTbhQDv4xlwE0oNmVCPpEL1 throwaway@test";
const entry = { id: "e1", name: "id_ed25519", type: "ssh-ed25519", filename: "id_ed25519", publicKey: PUB, fingerprint: "SHA256:abc", comment: "", createdAt: "2026-10-28T00:00:00Z", updatedAt: "2026-10-28T00:00:00Z", deletedAt: null };

function fakeApi(calls: Call[], payload: (url: string) => unknown): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(payload(String(input))), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

async function connect(doFetch: typeof fetch) {
  const [c, s] = InMemoryTransport.createLinkedPair();
  const server = createLogicSrcMcpServer({ apiKeys: { env: { LOGICSRC_API_KEY: "lsk_person" }, fetch: doFetch } });
  const client = new Client({ name: "t", version: "0.1.0" });
  await server.connect(s);
  await client.connect(c);
  return { client, close: async () => { await client.close(); await server.close(); } };
}
const text = (r: unknown) => ((r as { content: Array<{ text: string }> }).content[0]?.text ?? "");

describe("keyring tools", () => {
  it("lists public halves and exports authorized_keys", async () => {
    const calls: Call[] = [];
    const { client, close } = await connect(fakeApi(calls, () => ({ meta: null, entries: [entry] })));
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["list_keyring_keys", "show_keyring_key", "export_authorized_keys", "add_keyring_key_ciphertext", "remove_keyring_key", "keyring_restore_instructions"]));
    expect(text(await client.callTool({ name: "list_keyring_keys", arguments: {} }))).toContain("SHA256:abc");
    expect(text(await client.callTool({ name: "export_authorized_keys", arguments: {} }))).toBe(PUB);
    expect(calls[0]!.url).toBe("https://app.logicsrc.com/api/keyring");
    await close();
  });

  it("refuses a plaintext private key and never relays one back", async () => {
    const calls: Call[] = [];
    const { client, close } = await connect(fakeApi(calls, () => ({ entry: { ...entry, publicKey: "-----BEGIN OPENSSH PRIVATE KEY-----" } })));
    const bad = await client.callTool({
      name: "add_keyring_key_ciphertext",
      arguments: { entry: { ...entry, deletedAt: undefined, envelope: { id: "e1", type: 5, ciphertext: Buffer.from("-----BEGIN OPENSSH PRIVATE KEY-----").toString("base64"), iv: "AAAAAAAAAAAAAAAA" } } }
    });
    expect((bad as { isError?: boolean }).isError).toBe(true);
    expect(calls).toHaveLength(0);
    const shown = await client.callTool({ name: "show_keyring_key", arguments: { name: "id_ed25519" } });
    expect((shown as { isError?: boolean }).isError).toBe(true);
    expect(text(shown)).not.toContain("BEGIN OPENSSH");
    await close();
  });

  it("restore instructions name the default file and the fingerprint", async () => {
    const { client, close } = await connect(fakeApi([], () => ({ entry })));
    const out = text(await client.callTool({ name: "keyring_restore_instructions", arguments: { name: "id_ed25519" } }));
    expect(out).toContain("logicsrc keyring restore id_ed25519");
    expect(out).toContain("~/.ssh/id_ed25519");
    await close();
  });
});
