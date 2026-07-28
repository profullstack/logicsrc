import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as listOntologies } from "../src/app/api/ontologies/route";
import { GET as getManifest } from "../src/app/api/ontologies/[ontologyId]/manifest/route";
import { GET as getSchema } from "../src/app/api/ontologies/[ontologyId]/schema/route";
import { GET as listEntities } from "../src/app/api/ontologies/[ontologyId]/entities/route";
import { GET as getEntity } from "../src/app/api/ontologies/[ontologyId]/entities/[entityId]/route";
import { GET as listClaims } from "../src/app/api/ontologies/[ontologyId]/claims/route";
import { GET as getClaim } from "../src/app/api/ontologies/[ontologyId]/claims/[claimId]/route";
import { POST as runQuery } from "../src/app/api/ontologies/[ontologyId]/query/route";
import { POST as explain } from "../src/app/api/ontologies/[ontologyId]/explain/route";
import { POST as validate } from "../src/app/api/ontologies/[ontologyId]/validate/route";
import { GET as listChangeSets, POST as createChangeSet } from "../src/app/api/ontologies/[ontologyId]/changesets/route";
import { POST as approve } from "../src/app/api/ontologies/[ontologyId]/changesets/[changeSetId]/approve/route";
import { POST as apply } from "../src/app/api/ontologies/[ontologyId]/changesets/[changeSetId]/apply/route";
import { GET as events } from "../src/app/api/ontologies/[ontologyId]/events/route";
import { GET as openapi } from "../src/app/api/ontologies/openapi/route";
import { resetService } from "../src/lib/ontology-service";

/**
 * Contract tests for the OpenOntology reference API.
 *
 * They call the route handlers directly, so they exercise the real request →
 * policy → engine → response path without needing a listening server.
 */

const ONTOLOGY = "ethereum-ecosystem";
const CURATOR = "curator-token";
const AGENT = "agent-token";

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

function request(
  path: string,
  init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {}
): Request {
  return new Request(`https://logicsrc.com${path}`, {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      ...(init.headers ?? {})
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) })
  });
}

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

beforeEach(() => {
  process.env.OPENONTOLOGY_API_TOKEN = CURATOR;
  process.env.OPENONTOLOGY_AGENT_TOKEN = AGENT;
  resetService();
});

afterEach(() => {
  delete process.env.OPENONTOLOGY_API_TOKEN;
  delete process.env.OPENONTOLOGY_AGENT_TOKEN;
  resetService();
});

describe("reads", () => {
  it("lists the ontologies it serves", async () => {
    const response = await listOntologies();
    expect(response.status).toBe(200);
    const payload = await body<{ ontologies: Array<{ id: string }>; persistence: string }>(response);
    expect(payload.ontologies[0]?.id).toBe(ONTOLOGY);
    expect(["memory", "turso"]).toContain(payload.persistence);
  });

  it("serves the manifest with a revision ETag", async () => {
    const response = await getManifest(request(`/api/ontologies/${ONTOLOGY}/manifest`), params({ ontologyId: ONTOLOGY }));
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toMatch(/data-\d+/);
    expect((await body<{ id: string }>(response)).id).toBe(ONTOLOGY);
  });

  it("404s an unknown ontology and names one that exists", async () => {
    const response = await getManifest(request("/api/ontologies/nope/manifest"), params({ ontologyId: "nope" }));
    expect(response.status).toBe(404);
    const payload = await body<{ error: { code: string; hint?: string } }>(response);
    expect(payload.error.code).toBe("OO-A-NOT-FOUND");
    expect(payload.error.hint).toContain(ONTOLOGY);
  });

  it("serves the schema layer", async () => {
    const response = await getSchema(request(`/api/ontologies/${ONTOLOGY}/schema`), params({ ontologyId: ONTOLOGY }));
    const payload = await body<{ entityTypes: unknown[]; relationships: unknown[] }>(response);
    expect(payload.entityTypes.length).toBeGreaterThanOrEqual(10);
    expect(payload.relationships.length).toBeGreaterThanOrEqual(12);
  });

  it("lists and paginates entities", async () => {
    const response = await listEntities(
      request(`/api/ontologies/${ONTOLOGY}/entities?type=Person&limit=3`),
      params({ ontologyId: ONTOLOGY })
    );
    const payload = await body<{ total: number; entities: Array<{ type: string }> }>(response);
    expect(payload.entities).toHaveLength(3);
    expect(payload.entities.every((entity) => entity.type === "Person")).toBe(true);
    expect(payload.total).toBeGreaterThan(3);
  });

  it("returns ranked matches with evidence when searching", async () => {
    const response = await listEntities(
      request(`/api/ontologies/${ONTOLOGY}/entities?q=Avery`),
      params({ ontologyId: ONTOLOGY })
    );
    const payload = await body<{ matches: Array<{ id: string; matchedOn: string; evidence: string }> }>(response);
    expect(payload.matches[0]?.id).toContain("avery");
    expect(payload.matches[0]?.matchedOn).toBeTruthy();
  });

  it("returns an entity with its claims", async () => {
    const response = await getEntity(
      request(`/api/ontologies/${ONTOLOGY}/entities/eth:person:avery-lindqvist`),
      params({ ontologyId: ONTOLOGY, entityId: "eth:person:avery-lindqvist" })
    );
    const payload = await body<{ entity: { canonicalName: string }; claims: unknown[] }>(response);
    expect(payload.entity.canonicalName).toBe("Avery Lindqvist");
    expect(payload.claims.length).toBeGreaterThan(0);
  });

  it("filters claims by status", async () => {
    const asserted = await listClaims(
      request(`/api/ontologies/${ONTOLOGY}/claims?status=asserted&limit=500`),
      params({ ontologyId: ONTOLOGY })
    );
    const proposed = await listClaims(
      request(`/api/ontologies/${ONTOLOGY}/claims?status=proposed&limit=500`),
      params({ ontologyId: ONTOLOGY })
    );
    const a = await body<{ total: number }>(asserted);
    const p = await body<{ total: number }>(proposed);
    expect(a.total).toBeGreaterThan(p.total);
    expect(p.total).toBeGreaterThanOrEqual(1);
  });

  it("returns a claim with its history, sources, and evidence", async () => {
    const list = await listClaims(
      request(`/api/ontologies/${ONTOLOGY}/claims?limit=1`),
      params({ ontologyId: ONTOLOGY })
    );
    const { claims } = await body<{ claims: Array<{ id: string }> }>(list);
    const id = claims[0]!.id;

    const response = await getClaim(
      request(`/api/ontologies/${ONTOLOGY}/claims/${id}`),
      params({ ontologyId: ONTOLOGY, claimId: id })
    );
    const payload = await body<{ claim: { id: string }; history: unknown[]; sources: unknown[] }>(response);
    expect(payload.claim.id).toBe(id);
    expect(payload.history.length).toBeGreaterThanOrEqual(1);
    expect(payload.sources.length).toBeGreaterThanOrEqual(1);
  });
});

describe("query and explain", () => {
  it("runs a saved query and returns claim ids per row", async () => {
    const response = await runQuery(
      request(`/api/ontologies/${ONTOLOGY}/query`, {
        method: "POST",
        body: { savedQuery: "orgs-behind-a-network" }
      }),
      params({ ontologyId: ONTOLOGY })
    );
    const payload = await body<{ rows: Array<{ claims: string[] }>; resultId: string }>(response);
    expect(payload.rows.length).toBeGreaterThan(0);
    expect(payload.rows[0]!.claims).toHaveLength(4);
  });

  it("runs an ad-hoc triple-pattern query", async () => {
    const response = await runQuery(
      request(`/api/ontologies/${ONTOLOGY}/query`, {
        method: "POST",
        body: {
          query: {
            match: [{ subject: "?person", predicate: "worksOn", object: "?project" }],
            select: ["?person", "?project"],
            include: { claimStatus: ["asserted"] },
            limit: 5
          }
        }
      }),
      params({ ontologyId: ONTOLOGY })
    );
    const payload = await body<{ rows: unknown[] }>(response);
    expect(payload.rows).toHaveLength(5);
  });

  it("rejects a query with neither savedQuery nor query", async () => {
    const response = await runQuery(
      request(`/api/ontologies/${ONTOLOGY}/query`, { method: "POST", body: {} }),
      params({ ontologyId: ONTOLOGY })
    );
    expect(response.status).toBe(422);
  });

  it("explains a row down to its sources", async () => {
    const queried = await runQuery(
      request(`/api/ontologies/${ONTOLOGY}/query`, { method: "POST", body: { savedQuery: "funded-work" } }),
      params({ ontologyId: ONTOLOGY })
    );
    const { resultId } = await body<{ resultId: string }>(queried);

    const response = await explain(
      request(`/api/ontologies/${ONTOLOGY}/explain`, { method: "POST", body: { resultId, row: 0 } }),
      params({ ontologyId: ONTOLOGY })
    );
    const payload = await body<{ claims: Array<{ sources: unknown[] }>; ontology: string }>(response);
    expect(payload.ontology).toContain(ONTOLOGY);
    expect(payload.claims[0]!.sources.length).toBeGreaterThan(0);
  });

  it("validates the package", async () => {
    const response = await validate(
      request(`/api/ontologies/${ONTOLOGY}/validate`, { method: "POST", body: { strict: true } }),
      params({ ontologyId: ONTOLOGY })
    );
    const payload = await body<{ ok: boolean; counts: { error: number } }>(response);
    expect(payload.ok).toBe(true);
    expect(payload.counts.error).toBe(0);
  });
});

describe("governance and permissions", () => {
  const operations = [
    {
      op: "assert-claim",
      value: {
        subject: "eth:person:avery-lindqvist",
        predicate: "worksOn",
        object: { entity: "eth:project:docs-portal" },
        sources: ["eth:source:roadmap-2026"]
      }
    }
  ];

  it("denies an anonymous proposal and names the missing scope", async () => {
    const response = await createChangeSet(
      request(`/api/ontologies/${ONTOLOGY}/changesets`, { method: "POST", body: { title: "x", operations } }),
      params({ ontologyId: ONTOLOGY })
    );
    expect(response.status).toBe(403);
    const payload = await body<{ error: { code: string; message: string } }>(response);
    expect(payload.error.code).toBe("OO-A-DENIED");
    expect(payload.error.message).toContain("ontology:claim:propose");
  });

  it("lets an agent token propose but never apply", async () => {
    const created = await createChangeSet(
      request(`/api/ontologies/${ONTOLOGY}/changesets`, {
        method: "POST",
        token: AGENT,
        body: { title: "agent proposal", operations, runId: "run_api_1" }
      }),
      params({ ontologyId: ONTOLOGY })
    );
    expect(created.status).toBe(201);
    const { changeSet } = await body<{ changeSet: { id: string; status: string } }>(created);
    expect(changeSet.status).toBe("proposed");

    const applied = await apply(
      request(`/api/ontologies/${ONTOLOGY}/changesets/${changeSet.id}/apply`, { method: "POST", token: AGENT }),
      params({ ontologyId: ONTOLOGY, changeSetId: changeSet.id })
    );
    expect(applied.status).toBe(403);
    expect((await body<{ error: { message: string } }>(applied)).error.message).toMatch(/never apply directly/);
  });

  it("returns the semantic diff alongside a proposal", async () => {
    const created = await createChangeSet(
      request(`/api/ontologies/${ONTOLOGY}/changesets`, {
        method: "POST",
        token: CURATOR,
        body: { title: "with diff", operations }
      }),
      params({ ontologyId: ONTOLOGY })
    );
    const payload = await body<{ diff: { summary: { claimsAdded: number } } }>(created);
    expect(payload.diff.summary.claimsAdded).toBe(1);
  });

  it("runs the curator loop: propose → approve → apply", async () => {
    const created = await createChangeSet(
      request(`/api/ontologies/${ONTOLOGY}/changesets`, {
        method: "POST",
        token: CURATOR,
        body: { title: "curator loop", operations }
      }),
      params({ ontologyId: ONTOLOGY })
    );
    const { changeSet } = await body<{ changeSet: { id: string } }>(created);

    const approved = await approve(
      request(`/api/ontologies/${ONTOLOGY}/changesets/${changeSet.id}/approve`, { method: "POST", token: CURATOR }),
      params({ ontologyId: ONTOLOGY, changeSetId: changeSet.id })
    );
    expect(approved.status).toBe(201);

    const applied = await apply(
      request(`/api/ontologies/${ONTOLOGY}/changesets/${changeSet.id}/apply`, { method: "POST", token: CURATOR }),
      params({ ontologyId: ONTOLOGY, changeSetId: changeSet.id })
    );
    expect(applied.status).toBe(200);
    const payload = await body<{ revision: string; addedClaims: string[] }>(applied);
    expect(payload.revision).toMatch(/^data-\d+$/);
    expect(payload.addedClaims).toHaveLength(1);
  });

  it("requires approval for a merge, then allows it", async () => {
    const mergeOps = [
      { op: "merge-entity", source: "eth:person:s-haddad", target: "eth:person:samir-haddad" }
    ];
    const created = await createChangeSet(
      request(`/api/ontologies/${ONTOLOGY}/changesets`, {
        method: "POST",
        token: CURATOR,
        body: { title: "merge", operations: mergeOps }
      }),
      params({ ontologyId: ONTOLOGY })
    );
    const { changeSet } = await body<{ changeSet: { id: string } }>(created);

    const tooSoon = await apply(
      request(`/api/ontologies/${ONTOLOGY}/changesets/${changeSet.id}/apply`, { method: "POST", token: CURATOR }),
      params({ ontologyId: ONTOLOGY, changeSetId: changeSet.id })
    );
    expect(tooSoon.status).toBe(409);

    await approve(
      request(`/api/ontologies/${ONTOLOGY}/changesets/${changeSet.id}/approve`, { method: "POST", token: CURATOR }),
      params({ ontologyId: ONTOLOGY, changeSetId: changeSet.id })
    );
    const applied = await apply(
      request(`/api/ontologies/${ONTOLOGY}/changesets/${changeSet.id}/apply`, { method: "POST", token: CURATOR }),
      params({ ontologyId: ONTOLOGY, changeSetId: changeSet.id })
    );
    expect(applied.status).toBe(200);
  });

  it("replays a POST carrying the same Idempotency-Key", async () => {
    const key = "idem-1";
    const first = await createChangeSet(
      request(`/api/ontologies/${ONTOLOGY}/changesets`, {
        method: "POST",
        token: CURATOR,
        headers: { "idempotency-key": key },
        body: { title: "idempotent", operations }
      }),
      params({ ontologyId: ONTOLOGY })
    );
    const second = await createChangeSet(
      request(`/api/ontologies/${ONTOLOGY}/changesets`, {
        method: "POST",
        token: CURATOR,
        headers: { "idempotency-key": key },
        body: { title: "idempotent", operations }
      }),
      params({ ontologyId: ONTOLOGY })
    );

    expect(second.headers.get("idempotency-replayed")).toBe("true");
    const a = await body<{ changeSet: { id: string } }>(first);
    const b = await body<{ changeSet: { id: string } }>(second);
    expect(b.changeSet.id).toBe(a.changeSet.id);
  });

  it("rejects a change set with no operations", async () => {
    const response = await createChangeSet(
      request(`/api/ontologies/${ONTOLOGY}/changesets`, {
        method: "POST",
        token: CURATOR,
        body: { title: "empty", operations: [] }
      }),
      params({ ontologyId: ONTOLOGY })
    );
    expect(response.status).toBe(422);
  });

  it("lists change sets with their approval counts", async () => {
    await createChangeSet(
      request(`/api/ontologies/${ONTOLOGY}/changesets`, {
        method: "POST",
        token: CURATOR,
        body: { title: "listed", operations }
      }),
      params({ ontologyId: ONTOLOGY })
    );
    const response = await listChangeSets(
      request(`/api/ontologies/${ONTOLOGY}/changesets`),
      params({ ontologyId: ONTOLOGY })
    );
    const payload = await body<{ changeSets: Array<{ title: string; approvals: number }> }>(response);
    expect(payload.changeSets.some((entry) => entry.title === "listed")).toBe(true);
  });
});

describe("events", () => {
  it("returns the event log as JSON", async () => {
    const response = await events(
      request(`/api/ontologies/${ONTOLOGY}/events?limit=10`),
      params({ ontologyId: ONTOLOGY })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("streams Server-Sent Events when asked", async () => {
    const controller = new AbortController();
    const response = await events(
      new Request(`https://logicsrc.com/api/ontologies/${ONTOLOGY}/events`, {
        headers: { accept: "text/event-stream" },
        signal: controller.signal
      }),
      params({ ontologyId: ONTOLOGY })
    );

    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const reader = response.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("event: ");
    controller.abort();
    await reader.cancel();
  });
});

describe("openapi", () => {
  it("describes every implemented path and points at the published schemas", async () => {
    const response = await openapi();
    const document = await body<{ openapi: string; paths: Record<string, unknown> }>(response);

    expect(document.openapi).toBe("3.1.0");
    for (const path of [
      "/ontologies",
      "/ontologies/{ontologyId}/manifest",
      "/ontologies/{ontologyId}/schema",
      "/ontologies/{ontologyId}/entities",
      "/ontologies/{ontologyId}/entities/{entityId}",
      "/ontologies/{ontologyId}/claims",
      "/ontologies/{ontologyId}/claims/{claimId}",
      "/ontologies/{ontologyId}/query",
      "/ontologies/{ontologyId}/explain",
      "/ontologies/{ontologyId}/validate",
      "/ontologies/{ontologyId}/changesets",
      "/ontologies/{ontologyId}/changesets/{changeSetId}",
      "/ontologies/{ontologyId}/changesets/{changeSetId}/review",
      "/ontologies/{ontologyId}/changesets/{changeSetId}/approve",
      "/ontologies/{ontologyId}/changesets/{changeSetId}/apply",
      "/ontologies/{ontologyId}/events"
    ]) {
      expect(document.paths, `missing ${path}`).toHaveProperty([path]);
    }

    expect(JSON.stringify(document)).toContain("https://logicsrc.com/schemas/openontology/claim.schema.json");
  });
});
