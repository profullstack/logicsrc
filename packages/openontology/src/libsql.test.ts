import { createClient } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createOntologyEngine } from "./engine.js";
import { createLibsqlStore, migrate, searchEntities } from "./libsql.js";
import { loadPrdFixturePackage } from "./test-helpers.js";
import { localActor } from "./policy.js";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function dbUrl(): string {
  const dir = mkdtempSync(join(tmpdir(), "openontology-libsql-"));
  dirs.push(dir);
  return `file:${join(dir, "ontology.db")}`;
}

const NOW = "2026-07-26T00:00:00Z";

describe("libSQL adapter", () => {
  it("applies migrations once and is idempotent", async () => {
    const client = createClient({ url: dbUrl() });
    expect(await migrate(client)).toBeGreaterThan(0);
    expect(await migrate(client)).toBe(0);
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type IN ('table','index') ORDER BY name"
    );
    const names = tables.rows.map((row) => String(row.name));
    expect(names).toEqual(expect.arrayContaining(["claims", "entities", "status_log", "ontology_events"]));
    expect(names.filter((n) => n.startsWith("idx_claims")).length).toBeGreaterThanOrEqual(5);
    client.close();
  });

  it("seeds a package and hydrates it back identically", async () => {
    const pkg = loadPrdFixturePackage();
    const url = dbUrl();

    const store = await createLibsqlStore({ client: createClient({ url }), seed: pkg });
    expect(store.listEntities()).toHaveLength(pkg.data.entities.length);
    expect(store.listClaims({ status: ["asserted"] }).length).toBeGreaterThan(0);
    store.close();

    // Re-open against the same file: no seed, everything comes from SQL.
    const reopened = await createLibsqlStore({
      client: createClient({ url }),
      ontology: pkg.manifest.id
    });
    expect(reopened.listEntities().map((e) => e.id).sort()).toEqual(
      pkg.data.entities.map((e) => e.id).sort()
    );
    expect(reopened.getManifest().id).toBe(pkg.manifest.id);
    reopened.close();
  });

  it("persists an applied change set across a reopen", async () => {
    const pkg = loadPrdFixturePackage();
    const url = dbUrl();

    const store = await createLibsqlStore({ client: createClient({ url }), seed: pkg });
    let n = 0;
    const engine = createOntologyEngine({
      store,
      actor: localActor("curator@example.org"),
      clock: () => NOW,
      idFactory: (kind) => `${kind}:${String(++n).padStart(4, "0")}`
    });

    const changeSet = engine.createOntologyChangeSet({
      title: "persisted",
      operations: [
        {
          op: "assert-claim",
          value: {
            subject: "test:person:alice",
            predicate: "worksOn",
            object: { entity: "test:project:ledger-indexer" },
            sources: ["test:source:repo"]
          }
        }
      ]
    });
    engine.approveOntologyChangeSet(changeSet.id);
    const applied = engine.applyOntologyChangeSet(changeSet.id);

    expect(store.pending()).toBeGreaterThan(0);
    const flushed = await store.flush();
    expect(flushed.statements).toBeGreaterThan(0);
    expect(store.pending()).toBe(0);
    store.close();

    const reopened = await createLibsqlStore({
      client: createClient({ url }),
      ontology: pkg.manifest.id
    });
    const reread = createOntologyEngine({ store: reopened, actor: localActor() });
    const rows = reread.queryOntology({
      match: [{ subject: "test:person:alice", predicate: "worksOn", object: "?p" }]
    }).rows;

    expect(rows).toHaveLength(2);
    expect(reopened.getClaim(applied.addedClaims[0]!)).toBeDefined();
    expect(reopened.listChangeSets()).toHaveLength(1);
    expect(reopened.listEvents().length).toBeGreaterThan(0);
    expect(reopened.revision()).toBe("data-000001");
    reopened.close();
  });

  it("replays the append-only status log so retractions survive a reopen", async () => {
    const pkg = loadPrdFixturePackage();
    const url = dbUrl();

    const store = await createLibsqlStore({ client: createClient({ url }), seed: pkg });
    const engine = createOntologyEngine({ store, actor: localActor(), clock: () => NOW });

    const target = engine.queryOntology({
      match: [{ subject: "test:person:carol", predicate: "worksOn", object: "?p" }]
    }).rows[0]!.claims[0]!;

    const changeSet = engine.createOntologyChangeSet({
      title: "retract",
      operations: [{ op: "retract-claim", target, reason: "left the project" }]
    });
    engine.approveOntologyChangeSet(changeSet.id);
    engine.applyOntologyChangeSet(changeSet.id);
    await store.flush();
    store.close();

    const reopened = await createLibsqlStore({
      client: createClient({ url }),
      ontology: pkg.manifest.id
    });
    // The claim row is still there; its effective status came from the log.
    expect(reopened.getClaim(target)?.status).toBe("retracted");
    expect(reopened.claimHistory(target).map((h) => h.status)).toEqual(["asserted", "retracted"]);
    reopened.close();
  });

  it("keeps merge redirects resolvable after a reopen", async () => {
    const pkg = loadPrdFixturePackage();
    const url = dbUrl();

    const store = await createLibsqlStore({ client: createClient({ url }), seed: pkg });
    const engine = createOntologyEngine({ store, actor: localActor(), clock: () => NOW });
    const changeSet = engine.createOntologyChangeSet({
      title: "merge",
      operations: [{ op: "merge-entity", source: "test:person:carol", target: "test:person:bob" }]
    });
    engine.approveOntologyChangeSet(changeSet.id);
    engine.applyOntologyChangeSet(changeSet.id);
    await store.flush();
    store.close();

    const reopened = await createLibsqlStore({
      client: createClient({ url }),
      ontology: pkg.manifest.id
    });
    expect(reopened.getEntity("test:person:carol")?.id).toBe("test:person:bob");
    reopened.close();
  });

  it("indexes entities for full-text search", async () => {
    const pkg = loadPrdFixturePackage();
    const url = dbUrl();
    const client = createClient({ url });
    const store = await createLibsqlStore({ client, seed: pkg });

    const hits = await searchEntities(client, pkg.manifest.id, "Alice");
    expect(hits.map((hit) => hit.id)).toContain("test:person:alice");

    const none = await searchEntities(client, pkg.manifest.id, "nonexistentterm");
    expect(none).toHaveLength(0);
    store.close();
  });

  it("refuses to open an unknown ontology with no seed", async () => {
    await expect(
      createLibsqlStore({ client: createClient({ url: dbUrl() }), ontology: "not-there" })
    ).rejects.toThrow(/not in this database/);
  });
});
