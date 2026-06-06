import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { accessSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let server: ChildProcessWithoutNullStreams;
const port = 4291;
const baseUrl = `http://127.0.0.1:${port}`;

beforeAll(async () => {
  accessSync(new URL("../dist/index.html", import.meta.url));
  server = spawn(process.execPath, ["server.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      COINPAY_API_KEY: "",
      COINPAY_API_URL: "https://coinpayportal.example"
    }
  });

  await waitForServer();
});

afterAll(() => {
  server?.kill();
});

describe("LogicSRC web contracts", () => {
  it("serves SPA routes from the built app shell", async () => {
    for (const route of ["/", "/openspec", "/credential-sharing", "/docs", "/blog", "/hire-us", "/about", "/terms", "/privacy"]) {
      const response = await fetch(`${baseUrl}${route}`);
      const text = await response.text();

      expect(response.status, route).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(text).toContain('<div id="app"></div>');
    }
  });

  it("serves sitemap.xml as XML with canonical routes", async () => {
    const response = await fetch(`${baseUrl}/sitemap.xml`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(text).toContain("<loc>https://logicsrc.com/openspec</loc>");
    expect(text).toContain("<loc>https://logicsrc.com/credential-sharing</loc>");
    expect(text).toContain("<loc>https://logicsrc.com/hire-us</loc>");
    expect(text).toContain("<loc>https://logicsrc.com/blog</loc>");
  });

  it("serves blog/rss.xml as RSS XML", async () => {
    const response = await fetch(`${baseUrl}/blog/rss.xml`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(text).toContain("<rss version=\"2.0\"");
    expect(text).toContain("<title>LogicSRC OpenSpec Compatibility</title>");
    expect(text).toContain("<title>LogicSRC Credential Sharing OpenSpec</title>");
  });

  it("does not create CoinPay checkout without server credentials", async () => {
    const response = await fetch(`${baseUrl}/api/hire-us/coinpay-checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({ success: false, error: "CoinPay checkout is not configured" });
  });
});

async function waitForServer() {
  let lastError: unknown;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  throw new Error(`LogicSRC web server did not start: ${String(lastError)}`);
}
