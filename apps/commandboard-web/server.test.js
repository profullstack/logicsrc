import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCommandBoardWebServer } from "./server.js";

let server;
let baseUrl;

beforeAll(async () => {
  server = createCommandBoardWebServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected web server to bind to a local port");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("CommandBoard web server", () => {
  it("rejects malformed path encoding as a client error", async () => {
    const response = await fetch(`${baseUrl}/%E0%A4%A`);
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(body).toBe("Invalid path encoding");
  });
});
