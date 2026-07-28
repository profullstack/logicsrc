import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  createLibsqlStore,
  createOntologyEngine,
  loadOntologyPackage,
  localActor,
  proposerActor,
  readOnlyActor,
  type Actor,
  type OntologyEngine
} from "@logicsrc/openontology";

/**
 * The hosted OpenOntology reference service.
 *
 * Storage: Turso/libSQL when TURSO_DATABASE_URL is set, otherwise an in-memory
 * store seeded from the fixture package — which is what the public deployment
 * runs, so the explorer has real data without a database behind it.
 *
 * Auth: no token means read-only (R101/R104). A bearer token matching
 * OPENONTOLOGY_API_TOKEN is a curator; OPENONTOLOGY_AGENT_TOKEN is a proposer
 * that can create change sets but never apply them.
 */

const EXAMPLE_DIR = resolve(process.cwd(), "../../examples/openontology/ethereum-ecosystem");

export interface ServiceState {
  engine: OntologyEngine | null;
  ontologyId: string | null;
  persistence: "turso" | "memory" | "none";
  error: string | null;
  /** Set when a libSQL store needs flushing after writes. */
  flush?: () => Promise<unknown>;
}

export type Role = "reader" | "proposer" | "curator";

let cached: Promise<ServiceState> | null = null;

async function build(): Promise<ServiceState> {
  const tursoUrl = process.env.TURSO_DATABASE_URL;

  if (!existsSync(EXAMPLE_DIR)) {
    return {
      engine: null,
      ontologyId: null,
      persistence: "none",
      error: `No ontology package found at ${EXAMPLE_DIR}`
    };
  }

  try {
    const pkg = loadOntologyPackage(EXAMPLE_DIR);

    if (tursoUrl) {
      const { createClient } = (await import("@libsql/client")) as typeof import("@libsql/client");
      const client = createClient({ url: tursoUrl, authToken: process.env.TURSO_AUTH_TOKEN });
      const store = await createLibsqlStore({ client, seed: pkg });
      return {
        engine: createOntologyEngine({ store, actor: readOnlyActor("service"), client: "logicsrc-web" }),
        ontologyId: pkg.manifest.id,
        persistence: "turso",
        error: null,
        flush: () => store.flush()
      };
    }

    return {
      engine: createOntologyEngine({
        package: pkg,
        actor: readOnlyActor("service"),
        client: "logicsrc-web"
      }),
      ontologyId: pkg.manifest.id,
      persistence: "memory",
      error: null
    };
  } catch (error) {
    return { engine: null, ontologyId: null, persistence: "none", error: (error as Error).message };
  }
}

export function getService(): Promise<ServiceState> {
  if (!cached) cached = build();
  return cached;
}

/** Reset between tests. */
export function resetService(): void {
  cached = null;
  engines.clear();
}

export function actorFor(request: Request): { actor: Actor; role: Role } {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";

  const curatorToken = process.env.OPENONTOLOGY_API_TOKEN;
  const agentToken = process.env.OPENONTOLOGY_AGENT_TOKEN;

  if (curatorToken && token && token === curatorToken) {
    return { actor: localActor("api:curator"), role: "curator" };
  }
  if (agentToken && token && token === agentToken) {
    return { actor: proposerActor("agent:api"), role: "proposer" };
  }
  return { actor: readOnlyActor("api:anonymous", "service"), role: "reader" };
}

/**
 * One engine per role, all sharing the process-wide store.
 *
 * Cached rather than rebuilt per request because an engine holds the query
 * result cache that `explain` reads: a fresh engine per request would make
 * every explain a 404, and would churn event subscriptions on the store.
 */
const engines = new Map<Role, OntologyEngine>();

export async function engineFor(request: Request): Promise<{ engine: OntologyEngine; state: ServiceState } | null> {
  const state = await getService();
  if (!state.engine) return null;

  const { actor, role } = actorFor(request);
  const existing = engines.get(role);
  if (existing) return { engine: existing, state };

  const engine = createOntologyEngine({ store: state.engine.store, actor, client: "logicsrc-web" });
  engines.set(role, engine);
  return { engine, state };
}

export interface ApiErrorBody {
  error: { code: string; message: string; hint?: string };
}

export function apiError(code: string, message: string, status: number, hint?: string): Response {
  return Response.json({ error: { code, message, ...(hint ? { hint } : {}) } } satisfies ApiErrorBody, {
    status,
    headers: { "cache-control": "no-store" }
  });
}

export function apiJson(body: unknown, init: { status?: number; revision?: string } = {}): Response {
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (init.revision) headers.etag = `"${init.revision}"`;
  return Response.json(body, { status: init.status ?? 200, headers });
}

/** Map an engine error onto an HTTP status. */
export function statusForError(error: unknown): { status: number; code: string } {
  const code = (error as { code?: string }).code;
  switch (code) {
    case "OO-A-DENIED":
      return { status: 403, code };
    case "OO-A-APPROVAL-REQUIRED":
      return { status: 409, code };
    case "OO-A-NOT-FOUND":
      return { status: 404, code };
    case "OO-X-CONFLICT":
      return { status: 409, code };
    case "OO-Q-LIMIT":
      return { status: 413, code };
    default:
      return { status: 400, code: code ?? "OO-E-REQUEST" };
  }
}

export async function handle(
  request: Request,
  ontologyId: string,
  work: (engine: OntologyEngine, state: ServiceState) => Promise<Response> | Response
): Promise<Response> {
  const bound = await engineFor(request);
  if (!bound) {
    const state = await getService();
    return apiError("OO-E-UNAVAILABLE", state.error ?? "No ontology is loaded", 503);
  }
  if (bound.state.ontologyId !== ontologyId) {
    return apiError("OO-A-NOT-FOUND", `Unknown ontology ${ontologyId}`, 404, `Try ${bound.state.ontologyId}`);
  }

  try {
    return await work(bound.engine, bound.state);
  } catch (error) {
    const { status, code } = statusForError(error);
    return apiError(code, (error as Error).message, status);
  }
}

/* ── idempotency ───────────────────────────────────────────────────────── */

const idempotency = new Map<string, { at: number; body: unknown; status: number }>();
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

export function idempotentReplay(request: Request): Response | null {
  const key = request.headers.get("idempotency-key");
  if (!key) return null;
  const entry = idempotency.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > IDEMPOTENCY_TTL_MS) {
    idempotency.delete(key);
    return null;
  }
  return Response.json(entry.body, {
    status: entry.status,
    headers: { "cache-control": "no-store", "idempotency-replayed": "true" }
  });
}

export function rememberIdempotent(request: Request, body: unknown, status: number): void {
  const key = request.headers.get("idempotency-key");
  if (!key) return;
  idempotency.set(key, { at: Date.now(), body, status });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}
