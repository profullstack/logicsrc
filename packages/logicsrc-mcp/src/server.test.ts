import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createLogicSrcMcpServer } from "./server.js";

describe("LogicSRC MCP server", () => {
  it("exposes schemas, validation, and prompts over MCP", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createLogicSrcMcpServer();
    const client = new Client({ name: "test-client", version: "0.1.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const resources = await client.listResources();
    expect(resources.resources.some((resource) => resource.uri === "logicsrc://schemas/task")).toBe(true);

    const schema = await client.readResource({ uri: "logicsrc://schemas/task" });
    expect(textContent(schema.contents[0])).toContain("logicsrc.task");

    const example = await client.callTool({ name: "example_document", arguments: { kind: "task" } });
    const text = firstToolText(example);
    expect(text).toContain("Test checkout flow");

    const validation = await client.callTool({ name: "validate_document", arguments: { kind: "task", document: text, fileName: "task.json" } });
    const validationText = firstToolText(validation);
    expect(validationText).toContain('"ok": true');

    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((prompt) => prompt.name)).toContain("create-valid-task");

    await client.close();
    await server.close();
  });
});

function textContent(content: unknown) {
  return isRecord(content) && typeof content.text === "string" ? content.text : "";
}

function firstToolText(result: unknown) {
  if (!isRecord(result) || !Array.isArray(result.content)) {
    return "";
  }

  const [first] = result.content;
  return isRecord(first) && first.type === "text" && typeof first.text === "string" ? first.text : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
