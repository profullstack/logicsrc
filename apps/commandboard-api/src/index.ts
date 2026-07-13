import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { createPluginRegistry } from "@logicsrc/plugin-core";
import { agentMailPlugin, DraftError, MailAccessError, parseAddress, type Draft, type MailAddress } from "@logicsrc/plugin-agentmail";
import { c0mputePlugin } from "@logicsrc/plugin-c0mpute";
import { coinPayPlugin } from "@logicsrc/plugin-coinpay";
import { emailAccountsPlugin, listEmailAccountProviders } from "@logicsrc/plugin-email-accounts";
import { discoverFeeds, feedDiscoveryPlugin, listFeedProviders, renderAtom, renderJsonFeed, renderOpml, renderRss, type FeedKind } from "@logicsrc/plugin-feed-discovery";
import { sh1ptPlugin } from "@logicsrc/plugin-sh1pt";
import { listSocialAccountProviders, socialAccountsPlugin } from "@logicsrc/plugin-social-accounts";
import { uGigPlugin } from "@logicsrc/plugin-ugig";
import { schemas, validate } from "@logicsrc/validators";
import { buildAgentMailService, mailIdentity } from "./agentmail.js";

const registry = createPluginRegistry([coinPayPlugin, uGigPlugin, sh1ptPlugin, c0mputePlugin, feedDiscoveryPlugin, socialAccountsPlugin, emailAccountsPlugin, agentMailPlugin]);

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

class InvalidJsonBodyError extends Error {
  constructor() {
    super("Invalid JSON body");
    this.name = "InvalidJsonBodyError";
  }
}

export function createCommandBoardServer() {
  return createServer(async (request, response) => {
    try {
      await route(request, response);
    } catch (error) {
      if (error instanceof InvalidJsonBodyError) {
        json(response, 400, { error: error.message });
        return;
      }
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
      endpoints: ["/health", "/api/boards", "/api/tasks", "/api/plugins", "/api/schemas", "/api/accounts/providers", "/api/accounts", "/api/social/providers", "/api/email/providers", "/api/feeds/discover", "/api/feeds/providers", "/api/plugins/agentmail/mailboxes", "/api/plugins/agentmail/mailboxes/:mailbox/messages", "/api/plugins/agentmail/mailboxes/:mailbox/messages/:uid", "/api/plugins/agentmail/search", "/api/plugins/agentmail/messages", "/rss/discover/:keyword.xml", "/opml/discover/:keyword.xml", "/atom/discover/:keyword.xml", "/json-feed/discover/:keyword.json"]
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
    let body: unknown;
    try {
      body = await readJson(request);
    } catch {
      json(response, 400, { error: "Invalid JSON body" });
      return;
    }

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
    if (formattedDiscover.format === "invalid-encoding") {
      json(response, 400, { error: "Invalid path encoding" });
      return;
    }

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

  if (url.pathname === "/api/plugins/agentmail" || url.pathname.startsWith("/api/plugins/agentmail/")) {
    await handleAgentMail(request, response, url);
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
    let body: unknown;
    try {
      body = await readJson(request);
    } catch {
      json(response, 400, { error: "Invalid JSON body" });
      return;
    }
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
    let body: unknown;
    try {
      body = await readJson(request);
    } catch {
      json(response, 400, { error: "Invalid JSON body" });
      return;
    }
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

// AgentMail routes (the @logicsrc/plugin-agentmail surface), backed by the
// agentbbs Mailu server. The acting member comes from the x-agentmail-member
// header (falling back to the configured service identity). Access/draft errors
// map to 402/422 instead of the generic 500 the outer handler would produce.
const AGENTMAIL_PREFIX = "/api/plugins/agentmail";

async function handleAgentMail(request: IncomingMessage, response: ServerResponse, url: URL) {
  const memberHeader = request.headers["x-agentmail-member"];
  const member = Array.isArray(memberHeader) ? memberHeader[0] : memberHeader;
  const service = buildAgentMailService(mailIdentity(member));
  const sub = url.pathname.slice(AGENTMAIL_PREFIX.length); // e.g. "/mailboxes/INBOX/messages"
  const method = request.method ?? "GET";

  try {
    if (method === "GET" && (sub === "" || sub === "/" || sub === "/mailboxes")) {
      json(response, 200, { address: service.address(), mailboxes: await service.mailboxes() });
      return;
    }

    if (method === "GET" && sub === "/search") {
      const query = url.searchParams.get("q") ?? url.searchParams.get("query");
      if (!query) {
        json(response, 422, { error: "Expected ?q=" });
        return;
      }
      const mailbox = url.searchParams.get("mailbox") ?? undefined;
      const limit = numberParam(url.searchParams.get("limit"));
      json(response, 200, { messages: await service.search(query, { mailbox, limit }) });
      return;
    }

    if (method === "POST" && sub === "/messages") {
      let body: unknown;
      try {
        body = await readJson(request);
      } catch {
        json(response, 400, { error: "Invalid JSON body" });
        return;
      }
      if (!isRecord(body)) {
        json(response, 422, { error: "Draft body must be an object" });
        return;
      }
      const draft: Draft = {
        to: coerceAddresses(body.to),
        cc: body.cc !== undefined ? coerceAddresses(body.cc) : undefined,
        bcc: body.bcc !== undefined ? coerceAddresses(body.bcc) : undefined,
        subject: typeof body.subject === "string" ? body.subject : "",
        text: typeof body.text === "string" ? body.text : "",
        html: typeof body.html === "string" ? body.html : undefined,
        inReplyTo: typeof body.inReplyTo === "string" ? body.inReplyTo : undefined
      };
      json(response, 201, await service.send(draft));
      return;
    }

    // /mailboxes/{mailbox}/messages[/{uid}]
    const msgMatch = /^\/mailboxes\/([^/]+)\/messages(?:\/(\d+))?$/.exec(sub);
    if (msgMatch) {
      const mailbox = decodeURIComponent(msgMatch[1]);
      const uid = msgMatch[2] ? Number(msgMatch[2]) : undefined;

      if (uid === undefined) {
        if (method !== "GET") {
          json(response, 405, { error: "Method not allowed" });
          return;
        }
        const limit = numberParam(url.searchParams.get("limit"));
        json(response, 200, { mailbox, messages: await service.list(mailbox, limit) });
        return;
      }

      if (method === "GET") {
        const peek = url.searchParams.get("peek") === "true";
        const message = await service.read(mailbox, uid, { peek });
        if (!message) {
          json(response, 404, { error: `no message uid ${uid} in ${mailbox}` });
          return;
        }
        json(response, 200, { message });
        return;
      }

      if (method === "PATCH") {
        let body: unknown;
        try {
          body = await readJson(request);
        } catch {
          json(response, 400, { error: "Invalid JSON body" });
          return;
        }
        if (!isRecord(body)) {
          json(response, 422, { error: "Expected { seen?, flagged? }" });
          return;
        }
        await service.setFlags(mailbox, uid, {
          seen: typeof body.seen === "boolean" ? body.seen : undefined,
          flagged: typeof body.flagged === "boolean" ? body.flagged : undefined
        });
        json(response, 200, { ok: true });
        return;
      }

      if (method === "DELETE") {
        await service.delete(mailbox, uid);
        json(response, 200, { ok: true });
        return;
      }

      json(response, 405, { error: "Method not allowed" });
      return;
    }

    json(response, 404, { error: "Not found" });
  } catch (error) {
    if (error instanceof MailAccessError) {
      json(response, 402, { error: error.message });
      return;
    }
    if (error instanceof DraftError) {
      json(response, 422, { error: error.message });
      return;
    }
    json(response, 502, { error: error instanceof Error ? error.message : String(error) });
  }
}

// Accepts a recipient field as a string, "Name <addr>", an array of those, or
// {name?,address} objects, and normalizes to MailAddress[].
function coerceAddresses(input: unknown): MailAddress[] {
  const one = (v: unknown): MailAddress | null => {
    if (typeof v === "string") return parseAddress(v);
    if (isRecord(v) && typeof v.address === "string") {
      return typeof v.name === "string" ? { name: v.name, address: v.address } : { address: v.address };
    }
    return null;
  };
  const list = Array.isArray(input) ? input : input === undefined || input === null ? [] : [input];
  return list.map(one).filter((a): a is MailAddress => a !== null);
}

function text(response: ServerResponse, status: number, contentType: string, body: string) {
  response.writeHead(status, { "content-type": contentType });
  response.end(body);
}

const MAX_BODY_BYTES = 1_048_576; // 1 MB

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error("Request body too large");
    }
    chunks.push(Buffer.from(chunk));
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new InvalidJsonBodyError();
    }
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberParam(value: string | null) {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
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
    return formattedDiscoverMatch("rss", rss[1]);
  }
  const opml = /^\/opml\/discover\/(.+)\.xml$/.exec(pathname) ?? /^\/rss\/discover\/(.+)\.opml$/.exec(pathname);
  if (opml) {
    return formattedDiscoverMatch("opml", opml[1]);
  }
  const atom = /^\/atom\/discover\/(.+)\.xml$/.exec(pathname);
  if (atom) {
    return formattedDiscoverMatch("atom", atom[1]);
  }
  const jsonFeed = /^\/json-feed\/discover\/(.+)\.json$/.exec(pathname);
  if (jsonFeed) {
    return formattedDiscoverMatch("json-feed", jsonFeed[1]);
  }
  return undefined;
}

function formattedDiscoverMatch(format: "rss" | "opml" | "atom" | "json-feed", encodedKeyword: string) {
  try {
    return { format, keyword: decodeURIComponent(encodedKeyword) };
  } catch (error) {
    if (error instanceof URIError) {
      return { format: "invalid-encoding" as const };
    }
    throw error;
  }
}

export function startCommandBoardServer(port = readPort(process.env.PORT, 4010)) {
  const server = createCommandBoardServer();
  server.listen(port, () => {
    console.log(`CommandBoard.run API listening on http://localhost:${port}`);
  });
  return server;
}

export function readPort(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startCommandBoardServer();
}
