import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createLogicSrcMcpServer } from "./server.js";

const text = (r: unknown) => ((r as { content: Array<{ text: string }> }).content[0]?.text ?? "");

async function connect(o: { cli?: string[][]; fetched?: Array<{ url: string; method: string; body: unknown }> } = {}) {
  const runCli = async (args: string[]) => {
    o.cli?.push(args);
    return { code: 0, stdout: JSON.stringify([{ key: "OPENAI_API_KEY", status: "would-rotate" }]), stderr: "Dry run. Apply with --approve." };
  };
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    o.fetched?.push({ url: String(input), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  const [c, s] = InMemoryTransport.createLinkedPair();
  const server = createLogicSrcMcpServer({ apiKeys: { env: { LOGICSRC_API_KEY: "lsk_person" }, fetch: fetchFn }, rotation: { runCli } });
  const client = new Client({ name: "t", version: "0.1.0" });
  await server.connect(s);
  await client.connect(c);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

describe("rotation tools", () => {
  it("rotate_keys is a dry run by default and passes desktop/propagate through to the CLI", async () => {
    const cli: string[][] = [];
    const { client, close } = await connect({ cli });
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["rotation_plan", "rotation_set", "rotate_keys", "rotation_runs"]));
    const out = text(await client.callTool({ name: "rotate_keys", arguments: { team: "profullstack", keys: ["OPENAI_API_KEY"], desktop: "bonita", propagate: true } }));
    expect(out).toContain("would-rotate");
    expect(cli[0]).toEqual(["teams", "rotate-keys", "profullstack", "--key", "OPENAI_API_KEY", "--propagate", "--desktop", "bonita", "--format", "json"]);
    await client.callTool({ name: "rotate_keys", arguments: { team: "profullstack", project: "b1dz", env: "prod", approve: true } });
    expect(cli[1]).toEqual(["teams", "rotate-keys", "profullstack", "b1dz", "prod", "--approve", "--format", "json"]);
    await close();
  });

  it("rejects shell-ish arguments", async () => {
    const cli: string[][] = [];
    const { client, close } = await connect({ cli });
    const r = await client.callTool({ name: "rotate_keys", arguments: { team: "profullstack", desktop: "bonita; rm -rf ~" } });
    expect((r as { isError?: boolean }).isError).toBe(true);
    expect(cli).toEqual([]);
    await close();
  });

  it("rotation_plan and rotation_set go through the CLI; queue and server plan go to the API", async () => {
    const cli: string[][] = [];
    const fetched: Array<{ url: string; method: string; body: unknown }> = [];
    const { client, close } = await connect({ cli, fetched });
    await client.callTool({ name: "rotation_plan", arguments: { team: "profullstack", project: "b1dz" } });
    expect(cli[0]).toEqual(["teams", "rotation", "profullstack", "b1dz", "--format", "json"]);
    await client.callTool({ name: "rotation_set", arguments: { team: "profullstack", project: "b1dz", env: "prod", key: "OPENAI_API_KEY", spec: { method: "desktop", recipe: "openai" } } });
    expect(cli[1]).toEqual(["teams", "rotation-set", "profullstack", "b1dz", "prod", "OPENAI_API_KEY", "--json", '{"method":"desktop","recipe":"openai"}', "--output", "json"]);
    await client.callTool({ name: "rotation_plan", arguments: { team: "profullstack", source: "server", keys: ["A"] } });
    expect(fetched[0]!.url).toBe("https://app.logicsrc.com/api/credshare/teams/profullstack/rotation?key=A");
    await client.callTool({ name: "rotate_keys", arguments: { team: "profullstack", keys: ["OPENAI_API_KEY"], queue: true, desktop: "bonita" } });
    expect(fetched[1]).toMatchObject({ method: "POST", url: "https://app.logicsrc.com/api/credshare/teams/profullstack/rotation/runs", body: { keys: ["OPENAI_API_KEY"], approve: false, desktop: "bonita" } });
    expect(cli.length).toBe(2);
    await close();
  });
});
