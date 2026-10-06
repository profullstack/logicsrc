import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createLogicSrcMcpServer } from "./server.js";

type Call = { url: string; method: string; auth: string | null; body: unknown };

/** A fake credentials app: records each request and answers like /api/keys does. */
function fakeApi(calls: Call[], status = 200, payload: unknown = { keys: [] }): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      auth: headers.get("authorization"),
      body: init?.body ? JSON.parse(String(init.body)) : undefined
    });
    return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

async function connect(env: NodeJS.ProcessEnv, doFetch: typeof fetch) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createLogicSrcMcpServer({ apiKeys: { env, fetch: doFetch } });
  const client = new Client({ name: "test-client", version: "0.1.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

function text(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  return content[0]?.text ?? "";
}

describe("API key tools", () => {
  it("lists keys with the Bearer key against LOGICSRC_API", async () => {
    const calls: Call[] = [];
    const { client, close } = await connect({ LOGICSRC_API_KEY: "lsk_person", LOGICSRC_API: "https://example.test/" }, fakeApi(calls));
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual(expect.arrayContaining(["list_api_keys", "create_api_key", "revoke_api_key"]));
    const result = await client.callTool({ name: "list_api_keys", arguments: {} });
    expect(text(result)).toContain('"keys"');
    expect(calls).toEqual([{ url: "https://example.test/api/keys", method: "GET", auth: "Bearer lsk_person", body: undefined }]);
    await close();
  });

  it("creates a read-only machine key by default and revokes by id", async () => {
    const calls: Call[] = [];
    const { client, close } = await connect({ LOGICSRC_API_KEY: "lsk_person" }, fakeApi(calls, 201, { key: { name: "dev2" }, secret: "lsk_new" }));
    await client.callTool({ name: "create_api_key", arguments: { name: "dev2", team: "acme", vaults: ["web--prod"], expires: "30d" } });
    expect(calls[0]).toMatchObject({
      url: "https://app.logicsrc.com/api/keys",
      method: "POST",
      body: { name: "dev2", kind: "machine", team: "acme", vaults: ["web--prod"], readOnly: true, expiresAt: "30d" }
    });
    await client.callTool({ name: "revoke_api_key", arguments: { id: "k/1" } });
    expect(calls[1]).toMatchObject({ url: "https://app.logicsrc.com/api/keys/k%2F1", method: "DELETE" });
    await close();
  });

  it("says what is missing instead of calling out without a key, and passes server refusals through", async () => {
    const calls: Call[] = [];
    const noKey = await connect({}, fakeApi(calls));
    const missing = await noKey.client.callTool({ name: "list_api_keys", arguments: {} });
    expect((missing as { isError?: boolean }).isError).toBe(true);
    expect(text(missing)).toContain("LOGICSRC_API_KEY is not set");
    expect(calls).toHaveLength(0);
    await noKey.close();

    const machine = await connect({ LOGICSRC_API_KEY: "lsk_machine" }, fakeApi(calls, 403, { error: "A machine API key cannot manage API keys." }));
    const refused = await machine.client.callTool({ name: "create_api_key", arguments: { name: "x", team: "acme" } });
    expect((refused as { isError?: boolean }).isError).toBe(true);
    expect(text(refused)).toContain("403");
    expect(text(refused)).toContain("machine API key cannot manage");
    await machine.close();
  });
});
