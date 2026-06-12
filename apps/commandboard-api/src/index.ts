import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { createPluginRegistry } from "@logicsrc/plugin-core";
import { c0mputePlugin } from "@logicsrc/plugin-c0mpute";
import { coinPayPlugin } from "@logicsrc/plugin-coinpay";
import { emailAccountsPlugin, listEmailAccountProviders } from "@logicsrc/plugin-email-accounts";
import { discoverFeeds, feedDiscoveryPlugin, listFeedProviders, renderAtom, renderJsonFeed, renderOpml, renderRss, type FeedKind } from "@logicsrc/plugin-feed-discovery";
import { sh1ptPlugin } from "@logicsrc/plugin-sh1pt";
import { listSocialAccountProviders, socialAccountsPlugin } from "@logicsrc/plugin-social-accounts";
import { uGigPlugin } from "@logicsrc/plugin-ugig";
import { schemas, validate } from "@logicsrc/validators";

const registry = createPluginRegistry([coinPayPlugin, uGigPlugin, sh1ptPlugin, c0mputePlugin, feedDiscoveryPlugin, socialAccountsPlugin, emailAccountsPlugin]);

const boards = [
  { path: "/general", title: "General", description: "CommandBoard.run general discussion." },
  { path: "/gigs", title: "Gigs", description: "Paid work, uGig imports, and LogicSRC tasks." },
  { path: "/agents", title: "Agents", description: "Agent registration, runs, and capabilities." },
  { path: "/projects/sh1pt", title: "sh1pt", description: "Project actions, releases, artifacts, and delivery status." },
  { path: "/projects/c0mpute", title: "c0mpute", description: "Compute jobs, worker pools, usage, and settlement status." }
];

const tasks = [
  {
    id: "task_123",
    type: "logicsrc.task",
    version: "0.1",
    title: "Test checkout flow",
    description: "Verify checkout flow across desktop and mobile.",
    board: "/qa",
    creator_did: "anthony.coinpay",
    status: "funded",
    budget: { amount: 25, currency: "USDC" },
    agent_allowed: true,
    human_allowed: true
  }
];

const sh1ptProjects = [
  { id: "sh1pt_project_1", board: "/projects/sh1pt", status: "active", actions: 5 },
  { id: "sh1pt_project_2", board: "/projects/crawlproof", status: "active", actions: 2 }
];

const sh1ptActions = [
  { id: "action_release_checklist", title: "Release checklist", publishable: true },
  { id: "action_deploy_preview", title: "Deploy preview", publishable: true }
];

const c0mputeJobs = [
  { id: "compute_job_1", board: "/projects/c0mpute", status: "draft", workload: "agent-run-smoke-test", provider: "c0mpute.com" },
  { id: "compute_job_2", board: "/projects/c0mpute", status: "queued", workload: "openspec-index-build", provider: "c0mpute.com" }
];

const c0mputeWorkers = [
  { id: "worker_pool_1", region: "us-west", status: "preview", capacity: "wip" }
];

export function createCommandBoardServer() {
  return createServer(async (request, response) => {
    try {
      await route(request, response);
    } catch (error) {
      json(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

async function route(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && url.pathname === "/") {
    json(response, 200, {
      ok: true,
      service: "commandboard-api",
      endpoints: ["/health", "/api/boards", "/api/tasks", "/api/plugins", "/api/schemas", "/api/accounts/providers", "/api/accounts", "/api/social/providers", "/api/email/providers", "/api/feeds/discover", "/api/feeds/providers", "/rss/discover/:keyword.xml", "/opml/discover/:keyword.xml", "/atom/discover/:keyword.xml", "/json-feed/discover/:keyword.json"]
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    json(response, 200, { ok: true, service: "commandboard-api" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/boards") {
    json(response, 200, { boards });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tasks") {
    json(response, 200, { tasks });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tasks") {
    const body = await readJson(request);
    const result = validate("task", body);
    if (!result.ok) {
      json(response, 422, { errors: result.errors });
      return;
    }

    if (!isRecord(body)) {
      json(response, 422, { error: "Task body must be an object" });
      return;
    }

    const task = { id: `task_${Date.now()}`, ...body };
    tasks.push(task as (typeof tasks)[number]);
    json(response, 201, { task });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/plugins") {
    json(response, 200, registry.snapshot());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/accounts/providers") {
    const kind = url.searchParams.get("kind");
    const providers = [...listSocialAccountProviders(), ...listEmailAccountProviders()].filter((provider) => !kind || provider.kind === kind);
    json(response, 200, { providers });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/accounts") {
    json(response, 200, { accounts: [] });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/social/providers") {
    json(response, 200, { providers: listSocialAccountProviders() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/social/accounts") {
    json(response, 200, { accounts: [] });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/email/providers") {
    json(response, 200, { providers: listEmailAccountProviders() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/email/accounts") {
    json(response, 200, { accounts: [] });
    return;
  }

  if (request.method === "GET" && (url.pathname === "/api/feeds/providers" || url.pathname === "/api/rss/providers")) {
    json(response, 200, { providers: listFeedProviders() });
    return;
  }

  if (request.method === "GET" && (url.pathname === "/api/feeds/discover" || url.pathname === "/api/rss/discover")) {
    const query = url.searchParams.get("q");
    if (!query) {
      json(response, 422, { error: "Expected q query parameter" });
      return;
    }
    const result = await discoverFeeds({
      q: query,
      type: (url.searchParams.get("type") ?? "all") as FeedKind | "all",
      limit: numberParam(url.searchParams.get("limit")),
      providers: listParam(url.searchParams.get("providers")),
      includeUnvalidated: url.searchParams.get("includeUnvalidated") === "true"
    });
    json(response, 200, result);
    return;
  }

  const formattedDiscover = matchFormattedDiscoverPath(url.pathname);
  if (request.method === "GET" && formattedDiscover) {
    const result = await discoverFeeds({
      q: formattedDiscover.keyword,
      type: "all",
      limit: numberParam(url.searchParams.get("limit")),
      providers: listParam(url.searchParams.get("providers")),
      includeUnvalidated: url.searchParams.get("includeUnvalidated") === "true"
    });
    if (formattedDiscover.format === "rss") {
      text(response, 200, "application/rss+xml; charset=utf-8", renderRss(result));
      return;
    }
    if (formattedDiscover.format === "opml") {
      text(response, 200, "text/x-opml; charset=utf-8", renderOpml(result));
      return;
    }
    if (formattedDiscover.format === "atom") {
      text(response, 200, "application/atom+xml; charset=utf-8", renderAtom(result));
      return;
    }
    text(response, 200, "application/feed+json; charset=utf-8", renderJsonFeed(result));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/plugins/sh1pt/projects") {
    json(response, 200, { projects: sh1ptProjects });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/plugins/sh1pt/actions") {
    json(response, 200, { actions: sh1ptActions });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/plugins/sh1pt/actions/publish") {
    let body: unknown;
    try {
      body = await readJson(request);
    } catch {
      json(response, 400, { error: "Invalid JSON body" });
      return;
    }

    if (!isRecord(body) || typeof body.action_id !== "string") {
      json(response, 422, { error: "Expected action_id" });
      return;
    }

    json(response, 202, {
      accepted: true,
      action_id: body.action_id,
      board: typeof body.board === "string" ? body.board : "/projects/sh1pt"
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/plugins/c0mpute/jobs") {
    json(response, 200, { jobs: c0mputeJobs });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/plugins/c0mpute/workers") {
    json(response, 200, { workers: c0mputeWorkers });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/plugins/c0mpute/jobs/dispatch") {
    const body = await readJson(request);
    if (!isRecord(body) || typeof body.job_id !== "string") {
      json(response, 422, { error: "Expected job_id" });
      return;
    }

    json(response, 202, {
      accepted: true,
      job_id: body.job_id,
      status: "queued",
      board: typeof body.board === "string" ? body.board : "/projects/c0mpute"
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/plugins/c0mpute/quotes") {
    const body = await readJson(request);
    if (!isRecord(body) || typeof body.workload !== "string") {
      json(response, 422, { error: "Expected workload" });
      return;
    }

    json(response, 202, {
      accepted: true,
      quote_id: `quote_${Date.now()}`,
      workload: body.workload,
      provider: "c0mpute.com",
      status: "draft"
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/schemas") {
    json(response, 200, { schemas: Object.keys(schemas) });
    return;
  }

  json(response, 404, { error: "Not found" });
}

function json(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data, null, 2));
}

function text(response: ServerResponse, status: number, contentType: string, body: string) {
  response.writeHead(status, { "content-type": contentType });
  response.end(body);
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberParam(value: string | null) {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function listParam(value: string | null) {
  return value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function matchFormattedDiscoverPath(pathname: string) {
  const rss = /^\/rss\/discover\/(.+)\.xml$/.exec(pathname);
  if (rss) {
    return { format: "rss" as const, keyword: decodeURIComponent(rss[1]) };
  }
  const opml = /^\/opml\/discover\/(.+)\.xml$/.exec(pathname) ?? /^\/rss\/discover\/(.+)\.opml$/.exec(pathname);
  if (opml) {
    return { format: "opml" as const, keyword: decodeURIComponent(opml[1]) };
  }
  const atom = /^\/atom\/discover\/(.+)\.xml$/.exec(pathname);
  if (atom) {
    return { format: "atom" as const, keyword: decodeURIComponent(atom[1]) };
  }
  const jsonFeed = /^\/json-feed\/discover\/(.+)\.json$/.exec(pathname);
  if (jsonFeed) {
    return { format: "json-feed" as const, keyword: decodeURIComponent(jsonFeed[1]) };
  }
  return undefined;
}

export function startCommandBoardServer(port = Number(process.env.PORT ?? 4010)) {
  const server = createCommandBoardServer();
  server.listen(port, () => {
    console.log(`CommandBoard.run API listening on http://localhost:${port}`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startCommandBoardServer();
}
