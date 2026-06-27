import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCommandBoardServer } from "./index.js";

// These exercise the AgentMail routes against the default in-memory transport
// (no AGENTMAIL_BACKEND=mailu), so no live mail server is required.
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createCommandBoardServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected API server to bind to a local port");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("AgentMail API routes", () => {
  it("lists mailboxes and exposes the member address", async () => {
    const res = await fetch(`${baseUrl}/api/plugins/agentmail/mailboxes`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { address: string; mailboxes: unknown[] };
    expect(body.address).toBe("chovy@bbs.profullstack.com");
    expect(Array.isArray(body.mailboxes)).toBe(true);
  });

  it("registers agentmail in the plugin snapshot", async () => {
    const res = await fetch(`${baseUrl}/api/plugins`);
    const body = (await res.json()) as { plugins: { id: string }[] };
    expect(body.plugins.some((p) => p.id === "agentmail")).toBe(true);
  });

  it("sends a draft and stores it in Sent", async () => {
    const send = await fetch(`${baseUrl}/api/plugins/agentmail/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "qa@example.com", subject: "hi", text: "from a QA run" })
    });
    expect(send.status).toBe(201);
    const result = (await send.json()) as { messageId: string };
    expect(result.messageId).toMatch(/@/);

    const sent = await fetch(`${baseUrl}/api/plugins/agentmail/mailboxes/Sent/messages`);
    expect(sent.status).toBe(200);
    const body = (await sent.json()) as { messages: { subject: string }[] };
    expect(body.messages.some((m) => m.subject === "hi")).toBe(true);
  });

  it("accepts a 'Name <addr>' recipient string", async () => {
    const send = await fetch(`${baseUrl}/api/plugins/agentmail/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "QA Bot <qa2@example.com>", subject: "named", text: "x" })
    });
    expect(send.status).toBe(201);
  });

  it("rejects a search without a query", async () => {
    const res = await fetch(`${baseUrl}/api/plugins/agentmail/search`);
    expect(res.status).toBe(422);
  });

  it("rejects a draft with no recipient", async () => {
    const res = await fetch(`${baseUrl}/api/plugins/agentmail/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: "no recipients", text: "x" })
    });
    expect(res.status).toBe(422);
  });
});
