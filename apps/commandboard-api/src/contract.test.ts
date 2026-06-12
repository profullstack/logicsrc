import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCommandBoardServer } from "./index.js";

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

describe("CommandBoard API contracts", () => {
  it("exposes root API index", async () => {
    const response = await fetch(`${baseUrl}/`);
    const body = await response.json() as { ok: boolean; service: string; endpoints: string[] };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, service: "commandboard-api" });
    expect(body.endpoints).toEqual(expect.arrayContaining(["/health", "/api/boards", "/api/plugins"]));
  });

  it("exposes health contract", async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json() as { ok: boolean; service: string };

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, service: "commandboard-api" });
  });



  it("rejects malformed task JSON with a client error", async () => {
    const response = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json"
    });
    const body = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Invalid JSON body" });
  });

  it("exposes default plugin contract including product plugins", async () => {
    const response = await fetch(`${baseUrl}/api/plugins`);
    const body = await response.json() as {
      plugins: Array<{ id: string; enabled: boolean; capabilities: string[] }>;
      capabilities: Record<string, string[]>;
    };

    expect(response.status).toBe(200);
    expect(body.plugins.map((plugin) => plugin.id)).toEqual(["coinpay", "ugig", "sh1pt", "c0mpute", "feed-discovery", "social-accounts", "email-accounts"]);
    expect(body.plugins.find((plugin) => plugin.id === "sh1pt")).toMatchObject({
      enabled: true,
      capabilities: expect.arrayContaining(["projects.sync", "actions.publish", "deployments.status"])
    });
    expect(body.plugins.find((plugin) => plugin.id === "c0mpute")).toMatchObject({
      enabled: true,
      capabilities: expect.arrayContaining(["compute.jobs.sync", "compute.jobs.dispatch", "compute.workers.sync"])
    });
    expect(body.capabilities["actions.publish"]).toEqual(["sh1pt"]);
    expect(body.capabilities["compute.jobs.dispatch"]).toEqual(["c0mpute"]);
    expect(body.capabilities["feeds.discover"]).toEqual(["feed-discovery"]);
    expect(body.capabilities["social.post.publish"]).toEqual(["social-accounts"]);
    expect(body.capabilities["email.send"]).toEqual(["email-accounts"]);
  });

  it("exposes communication account provider contracts", async () => {
    const accountsResponse = await fetch(`${baseUrl}/api/accounts/providers`);
    const accountsBody = await accountsResponse.json() as { providers: Array<{ id: string; kind: string }> };
    const socialResponse = await fetch(`${baseUrl}/api/social/providers`);
    const socialBody = await socialResponse.json() as { providers: Array<{ id: string; kind: string }> };
    const emailResponse = await fetch(`${baseUrl}/api/email/providers`);
    const emailBody = await emailResponse.json() as { providers: Array<{ id: string; kind: string }> };

    expect(accountsResponse.status).toBe(200);
    expect(accountsBody.providers.map((provider) => provider.id)).toEqual(expect.arrayContaining(["mastodon", "gmail", "imap-smtp"]));
    expect(socialResponse.status).toBe(200);
    expect(socialBody.providers[0]).toMatchObject({ id: "mastodon", kind: "social" });
    expect(emailResponse.status).toBe(200);
    expect(emailBody.providers[0]).toMatchObject({ id: "imap-smtp", kind: "email" });
  });

  it("exposes feed discovery plugin endpoints", async () => {
    const providersResponse = await fetch(`${baseUrl}/api/feeds/providers`);
    const providersBody = await providersResponse.json() as { providers: Array<{ id: string; enabledByDefault: boolean }> };
    const discoverResponse = await fetch(`${baseUrl}/api/feeds/discover?q=microsaas&providers=manual-curated&includeUnvalidated=true`);
    const discoverBody = await discoverResponse.json() as { query: string; results: Array<{ feedUrl: string; provider: string }> };
    const invalidLimitResponse = await fetch(`${baseUrl}/api/feeds/discover?q=microsaas&limit=-1&providers=manual-curated&includeUnvalidated=true`);
    const invalidLimitBody = await invalidLimitResponse.json() as { results: Array<{ feedUrl: string; provider: string }> };
    const rssResponse = await fetch(`${baseUrl}/rss/discover/microsaas.xml?providers=manual-curated&includeUnvalidated=true`);
    const rssBody = await rssResponse.text();
    const opmlResponse = await fetch(`${baseUrl}/opml/discover/microsaas.xml?providers=manual-curated&includeUnvalidated=true`);
    const opmlBody = await opmlResponse.text();

    expect(providersResponse.status).toBe(200);
    expect(providersBody.providers.map((provider) => provider.id)).toContain("manual-curated");
    expect(discoverResponse.status).toBe(200);
    expect(discoverBody.query).toBe("microsaas");
    expect(discoverBody.results[0]).toMatchObject({ provider: "manual-curated" });
    expect(invalidLimitResponse.status).toBe(200);
    expect(invalidLimitBody.results[0]).toMatchObject({ provider: "manual-curated" });
    expect(rssResponse.status).toBe(200);
    expect(rssBody).toContain("<rss");
    expect(opmlResponse.status).toBe(200);
    expect(opmlBody).toContain("<opml");
  });

  it("exposes sh1pt project and action contracts", async () => {
    const projectsResponse = await fetch(`${baseUrl}/api/plugins/sh1pt/projects`);
    const projectsBody = await projectsResponse.json() as { projects: Array<{ id: string; board: string; status: string; actions: number }> };
    const actionsResponse = await fetch(`${baseUrl}/api/plugins/sh1pt/actions`);
    const actionsBody = await actionsResponse.json() as { actions: Array<{ id: string; title: string; publishable: boolean }> };

    expect(projectsResponse.status).toBe(200);
    expect(projectsBody.projects[0]).toMatchObject({ id: "sh1pt_project_1", board: "/projects/sh1pt", status: "active" });
    expect(actionsResponse.status).toBe(200);
    expect(actionsBody.actions[0]).toMatchObject({ id: "action_release_checklist", publishable: true });
  });

  it("accepts sh1pt action publish requests", async () => {
    const response = await fetch(`${baseUrl}/api/plugins/sh1pt/actions/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action_id: "action_release_checklist" })
    });
    const body = await response.json() as { accepted: boolean; action_id: string; board: string };

    expect(response.status).toBe(202);
    expect(body).toEqual({
      accepted: true,
      action_id: "action_release_checklist",
      board: "/projects/sh1pt"
    });
  });

  it("exposes work-in-progress c0mpute jobs and worker contracts", async () => {
    const jobsResponse = await fetch(`${baseUrl}/api/plugins/c0mpute/jobs`);
    const jobsBody = await jobsResponse.json() as { jobs: Array<{ id: string; board: string; status: string; provider: string }> };
    const workersResponse = await fetch(`${baseUrl}/api/plugins/c0mpute/workers`);
    const workersBody = await workersResponse.json() as { workers: Array<{ id: string; status: string; capacity: string }> };

    expect(jobsResponse.status).toBe(200);
    expect(jobsBody.jobs[0]).toMatchObject({ id: "compute_job_1", board: "/projects/c0mpute", status: "draft", provider: "c0mpute.com" });
    expect(workersResponse.status).toBe(200);
    expect(workersBody.workers[0]).toMatchObject({ id: "worker_pool_1", status: "preview", capacity: "wip" });
  });

  it("accepts work-in-progress c0mpute dispatch and quote requests", async () => {
    const dispatchResponse = await fetch(`${baseUrl}/api/plugins/c0mpute/jobs/dispatch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ job_id: "compute_job_1" })
    });
    const dispatchBody = await dispatchResponse.json() as { accepted: boolean; job_id: string; status: string; board: string };
    const quoteResponse = await fetch(`${baseUrl}/api/plugins/c0mpute/quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workload: "agent-run-smoke-test" })
    });
    const quoteBody = await quoteResponse.json() as { accepted: boolean; workload: string; provider: string; status: string };

    expect(dispatchResponse.status).toBe(202);
    expect(dispatchBody).toEqual({
      accepted: true,
      job_id: "compute_job_1",
      status: "queued",
      board: "/projects/c0mpute"
    });
    expect(quoteResponse.status).toBe(202);
    expect(quoteBody).toMatchObject({
      accepted: true,
      workload: "agent-run-smoke-test",
      provider: "c0mpute.com",
      status: "draft"
    });
  });

  it("rejects invalid LogicSRC task payloads", async () => {
    const response = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "logicsrc.task", title: "Incomplete" })
    });
    const body = await response.json() as { errors: unknown[] };

    expect(response.status).toBe(422);
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it("rejects malformed JSON request bodies as client errors", async () => {
    const response = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{bad"
    });
    const body = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Invalid JSON body" });
  });
});
