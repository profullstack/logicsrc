import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { createPluginRegistry } from "@logicsrc/plugin-core";
import { coinPayPlugin } from "@logicsrc/plugin-coinpay";
import { sh1ptPlugin } from "@logicsrc/plugin-sh1pt";
import { uGigPlugin } from "@logicsrc/plugin-ugig";
import { schemas, validate } from "@logicsrc/validators";

const registry = createPluginRegistry([coinPayPlugin, uGigPlugin, sh1ptPlugin]);

const boards = [
  { path: "/general", title: "General", description: "CommandBoard.run general discussion." },
  { path: "/gigs", title: "Gigs", description: "Paid work, uGig imports, and LogicSRC tasks." },
  { path: "/agents", title: "Agents", description: "Agent registration, runs, and capabilities." },
  { path: "/projects/sh1pt", title: "sh1pt", description: "Project actions, releases, artifacts, and delivery status." }
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

  if (request.method === "GET" && url.pathname === "/api/plugins/sh1pt/projects") {
    json(response, 200, { projects: sh1ptProjects });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/plugins/sh1pt/actions") {
    json(response, 200, { actions: sh1ptActions });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/plugins/sh1pt/actions/publish") {
    const body = await readJson(request);
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
