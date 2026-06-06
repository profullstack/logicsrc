#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLogicSrcMcpServer } from "./server.js";

export { createLogicSrcMcpServer } from "./server.js";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createLogicSrcMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
