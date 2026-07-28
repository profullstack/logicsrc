import type { Client, InArgs } from "@libsql/client";
import { revisionId } from "./ids.js";
import { createMemoryStore, type OntologyStore } from "./store.js";
import type { LoadedPackage } from "./types.js";

/**
 * SQLite / Turso storage adapter.
 *
 * The engine's store interface is synchronous by design — a query evaluator
 * that awaits per triple pattern is unusable. So this adapter:
 *
 *   1. hydrates the whole package into the in-memory read model at open,
 *   2. serves reads from it synchronously,
 *   3. records every mutation as a pending SQL statement, and
 *   4. writes them in one transaction when you `flush()`.
 *
 * Callers that mutate MUST await `flush()` for durability; the REST layer does
 * so after every applied change set. Everything persisted is append-only, so a
 * crash before flush loses the last change set rather than corrupting history.
 *
 * At the reference target (~100k claims) hydration is a handful of queries.
 * Beyond that, an adapter that pushes evaluation into SQL is the right answer —
 * which is exactly why the store is an interface.
 */

export const MIGRATIONS: Array<{ version: number; name: string; statements: string[] }> = [
  {
    version: 1,
    name: "initial",
    statements: [
      `CREATE TABLE IF NOT EXISTS ontologies (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        manifest TEXT NOT NULL,
        schema_json TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS entities (
        ontology TEXT NOT NULL,
        id TEXT NOT NULL,
        type TEXT NOT NULL,
        canonical_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        superseded_by TEXT,
        visibility TEXT NOT NULL DEFAULT 'public',
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        document TEXT NOT NULL,
        PRIMARY KEY (ontology, id)
      )`,
      `CREATE TABLE IF NOT EXISTS aliases (
        ontology TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        alias TEXT NOT NULL,
        PRIMARY KEY (ontology, entity_id, alias)
      )`,
      `CREATE TABLE IF NOT EXISTS external_ids (
        ontology TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        namespace TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (ontology, entity_id, namespace)
      )`,
      `CREATE TABLE IF NOT EXISTS claims (
        ontology TEXT NOT NULL,
        id TEXT NOT NULL,
        subject TEXT NOT NULL,
        predicate TEXT NOT NULL,
        object_entity TEXT,
        object_value TEXT,
        status TEXT NOT NULL,
        confidence REAL,
        valid_from TEXT,
        valid_to TEXT,
        observed_at TEXT,
        asserted_at TEXT NOT NULL,
        asserted_by TEXT NOT NULL,
        run_id TEXT,
        change_set TEXT,
        visibility TEXT NOT NULL DEFAULT 'public',
        document TEXT NOT NULL,
        PRIMARY KEY (ontology, id)
      )`,
      `CREATE TABLE IF NOT EXISTS claim_sources (
        ontology TEXT NOT NULL,
        claim_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        PRIMARY KEY (ontology, claim_id, source_id)
      )`,
      `CREATE TABLE IF NOT EXISTS sources (
        ontology TEXT NOT NULL,
        id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        uri TEXT NOT NULL,
        retrieved_at TEXT NOT NULL,
        content_hash TEXT,
        license TEXT,
        visibility TEXT NOT NULL DEFAULT 'public',
        stale INTEGER NOT NULL DEFAULT 0,
        document TEXT NOT NULL,
        PRIMARY KEY (ontology, id)
      )`,
      `CREATE TABLE IF NOT EXISTS evidence (
        ontology TEXT NOT NULL,
        id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        document TEXT NOT NULL,
        PRIMARY KEY (ontology, id)
      )`,
      // Append-only status log: claims and entities are never updated in place.
      `CREATE TABLE IF NOT EXISTS status_log (
        ontology TEXT NOT NULL,
        kind TEXT NOT NULL,
        object_id TEXT NOT NULL,
        status TEXT NOT NULL,
        at TEXT NOT NULL,
        by TEXT NOT NULL,
        change_set TEXT,
        reason TEXT,
        seq INTEGER PRIMARY KEY AUTOINCREMENT
      )`,
      `CREATE TABLE IF NOT EXISTS changesets (
        ontology TEXT NOT NULL,
        id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        base_revision TEXT,
        result_revision TEXT,
        document TEXT NOT NULL,
        PRIMARY KEY (ontology, id)
      )`,
      `CREATE TABLE IF NOT EXISTS reviews (
        ontology TEXT NOT NULL,
        id TEXT NOT NULL,
        change_set TEXT NOT NULL,
        reviewer TEXT NOT NULL,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        document TEXT NOT NULL,
        PRIMARY KEY (ontology, id)
      )`,
      `CREATE TABLE IF NOT EXISTS approvals (
        ontology TEXT NOT NULL,
        id TEXT NOT NULL,
        change_set TEXT NOT NULL,
        approver TEXT NOT NULL,
        created_at TEXT NOT NULL,
        document TEXT NOT NULL,
        PRIMARY KEY (ontology, id)
      )`,
      `CREATE TABLE IF NOT EXISTS ontology_events (
        ontology TEXT NOT NULL,
        id TEXT NOT NULL,
        type TEXT NOT NULL,
        at TEXT NOT NULL,
        actor TEXT NOT NULL,
        change_set TEXT,
        subject TEXT,
        revision TEXT,
        document TEXT NOT NULL,
        seq INTEGER PRIMARY KEY AUTOINCREMENT
      )`,
      // R185: the indexes the query evaluator and lookups actually need.
      "CREATE INDEX IF NOT EXISTS idx_entities_type ON entities (ontology, type)",
      "CREATE INDEX IF NOT EXISTS idx_entities_status ON entities (ontology, status)",
      "CREATE INDEX IF NOT EXISTS idx_entities_name ON entities (ontology, canonical_name)",
      "CREATE INDEX IF NOT EXISTS idx_aliases_alias ON aliases (ontology, alias)",
      "CREATE INDEX IF NOT EXISTS idx_external_ids ON external_ids (ontology, namespace, value)",
      "CREATE INDEX IF NOT EXISTS idx_claims_subject ON claims (ontology, subject)",
      "CREATE INDEX IF NOT EXISTS idx_claims_predicate ON claims (ontology, predicate)",
      "CREATE INDEX IF NOT EXISTS idx_claims_object ON claims (ontology, object_entity)",
      "CREATE INDEX IF NOT EXISTS idx_claims_sp ON claims (ontology, subject, predicate)",
      "CREATE INDEX IF NOT EXISTS idx_claims_status ON claims (ontology, status)",
      "CREATE INDEX IF NOT EXISTS idx_claims_valid ON claims (ontology, valid_from, valid_to)",
      "CREATE INDEX IF NOT EXISTS idx_claims_asserted ON claims (ontology, asserted_at)",
      "CREATE INDEX IF NOT EXISTS idx_claim_sources ON claim_sources (ontology, source_id)",
      "CREATE INDEX IF NOT EXISTS idx_status_log_object ON status_log (ontology, kind, object_id)",
      "CREATE INDEX IF NOT EXISTS idx_events_type ON ontology_events (ontology, type)",
      "CREATE INDEX IF NOT EXISTS idx_events_changeset ON ontology_events (ontology, change_set)"
    ]
  },
  {
    version: 2,
    name: "full-text-search",
    statements: [
      // R186: label, alias, and description search.
      `CREATE VIRTUAL TABLE IF NOT EXISTS entity_fts USING fts5(
        entity_id UNINDEXED,
        ontology UNINDEXED,
        canonical_name,
        aliases,
        description,
        tokenize = 'unicode61'
      )`
    ]
  }
];

export interface LibsqlStoreOptions {
  client: Client;
  /** Ontology id. Defaults to the package manifest id. */
  ontology?: string;
  /** Seed the database from this package when it holds no rows for the id. */
  seed?: LoadedPackage;
}

export interface LibsqlStore extends OntologyStore {
  /** Persist everything buffered since the last flush, in one transaction. */
  flush(): Promise<{ statements: number }>;
  /** Pending statement count — 0 means everything is durable. */
  pending(): number;
  close(): void;
}

export async function migrate(client: Client): Promise<number> {
  await client.execute(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)"
  );
  const applied = await client.execute("SELECT version FROM schema_migrations");
  const have = new Set(applied.rows.map((row) => Number(row.version)));

  let count = 0;
  for (const migration of MIGRATIONS) {
    if (have.has(migration.version)) continue;
    for (const statement of migration.statements) {
      await client.execute(statement);
    }
    await client.execute({
      sql: "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
      args: [migration.version, migration.name, new Date().toISOString()]
    });
    count += 1;
  }
  return count;
}

/** Open (and if needed seed) a libSQL-backed store. */
export async function createLibsqlStore(options: LibsqlStoreOptions): Promise<LibsqlStore> {
  const { client, seed } = options;
  await migrate(client);

  const ontology = options.ontology ?? seed?.manifest.id;
  if (!ontology) throw new Error("createLibsqlStore needs an ontology id or a seed package");

  const existing = await client.execute({
    sql: "SELECT manifest, schema_json, revision FROM ontologies WHERE id = ?",
    args: [ontology]
  });

  if (existing.rows.length === 0) {
    if (!seed) throw new Error(`Ontology ${ontology} is not in this database and no seed was given`);
    await seedPackage(client, ontology, seed);
  }

  const hydrated = await hydrate(client, ontology);
  const memory = createMemoryStore(hydrated.pkg);

  // Replay the append-only status log so effective statuses match the database.
  for (const transition of hydrated.transitions) {
    if (transition.kind === "claim") {
      try {
        memory.setClaimStatus(transition.transition);
      } catch {
        // A transition for a claim that is no longer present is not fatal.
      }
    } else {
      memory.setEntityStatus(transition.transition);
    }
  }

  for (let i = 0; i < hydrated.revision; i += 1) memory.bumpRevision();
  for (const changeSet of hydrated.changeSets) memory.putChangeSet(changeSet);
  for (const review of hydrated.reviews) memory.putReview(review);
  for (const approval of hydrated.approvals) memory.putApproval(approval);
  for (const event of hydrated.events) memory.appendEvent(event);

  const pendingStatements: Array<{ sql: string; args: InArgs }> = [];
  const enqueue = (sql: string, args: InArgs) => pendingStatements.push({ sql, args });

  const store: LibsqlStore = {
    ...memory,

    addEntity(entity) {
      memory.addEntity(entity);
      enqueue(
        `INSERT INTO entities (ontology, id, type, canonical_name, status, superseded_by, visibility, created_at, created_by, document)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ontology,
          entity.id,
          entity.type,
          entity.canonicalName,
          entity.status ?? "active",
          entity.supersededBy ?? null,
          entity.visibility ?? "public",
          entity.createdAt,
          entity.createdBy,
          JSON.stringify(entity)
        ]
      );
      for (const alias of entity.aliases ?? []) {
        enqueue("INSERT OR IGNORE INTO aliases (ontology, entity_id, alias) VALUES (?, ?, ?)", [
          ontology,
          entity.id,
          alias
        ]);
      }
      for (const [namespace, value] of Object.entries(entity.externalIds ?? {})) {
        enqueue(
          "INSERT OR REPLACE INTO external_ids (ontology, entity_id, namespace, value) VALUES (?, ?, ?, ?)",
          [ontology, entity.id, namespace, value]
        );
      }
      enqueue(
        "INSERT INTO entity_fts (entity_id, ontology, canonical_name, aliases, description) VALUES (?, ?, ?, ?, ?)",
        [entity.id, ontology, entity.canonicalName, (entity.aliases ?? []).join(" "), ""]
      );
    },

    updateEntityMetadata(id, patch) {
      const updated = memory.updateEntityMetadata(id, patch);
      enqueue(
        "UPDATE entities SET canonical_name = ?, status = ?, superseded_by = ?, document = ? WHERE ontology = ? AND id = ?",
        [
          updated.canonicalName,
          updated.status ?? "active",
          updated.supersededBy ?? null,
          JSON.stringify(updated),
          ontology,
          updated.id
        ]
      );
      return updated;
    },

    appendClaim(claim) {
      memory.appendClaim(claim);
      const objectEntity = "entity" in claim.object ? claim.object.entity : null;
      const objectValue = "entity" in claim.object ? null : JSON.stringify(claim.object.value);
      enqueue(
        `INSERT INTO claims (ontology, id, subject, predicate, object_entity, object_value, status, confidence,
                             valid_from, valid_to, observed_at, asserted_at, asserted_by, run_id, change_set, visibility, document)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ontology,
          claim.id,
          claim.subject,
          claim.predicate,
          objectEntity,
          objectValue,
          claim.status,
          claim.confidence ?? null,
          claim.validTime?.from ?? null,
          claim.validTime?.to ?? null,
          claim.observedAt ?? null,
          claim.assertedAt,
          claim.assertedBy,
          claim.runId ?? null,
          claim.changeSet ?? null,
          claim.visibility ?? "public",
          JSON.stringify(claim)
        ]
      );
      for (const source of claim.sources ?? []) {
        enqueue(
          "INSERT OR IGNORE INTO claim_sources (ontology, claim_id, source_id) VALUES (?, ?, ?)",
          [ontology, claim.id, source]
        );
      }
    },

    setClaimStatus(transition) {
      memory.setClaimStatus(transition);
      enqueue(
        "INSERT INTO status_log (ontology, kind, object_id, status, at, by, change_set, reason) VALUES (?, 'claim', ?, ?, ?, ?, ?, ?)",
        [
          ontology,
          transition.objectId,
          String(transition.status),
          transition.at,
          transition.by,
          transition.changeSet ?? null,
          transition.reason ?? null
        ]
      );
    },

    setEntityStatus(transition) {
      memory.setEntityStatus(transition);
      enqueue(
        "INSERT INTO status_log (ontology, kind, object_id, status, at, by, change_set, reason) VALUES (?, 'entity', ?, ?, ?, ?, ?, ?)",
        [
          ontology,
          transition.objectId,
          String(transition.status),
          transition.at,
          transition.by,
          transition.changeSet ?? null,
          transition.reason ?? null
        ]
      );
    },

    addSource(source) {
      memory.addSource(source);
      enqueue(
        `INSERT OR REPLACE INTO sources (ontology, id, source_type, uri, retrieved_at, content_hash, license, visibility, stale, document)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ontology,
          source.id,
          source.sourceType,
          source.uri,
          source.retrievedAt,
          source.contentHash ?? null,
          source.license ?? null,
          source.visibility ?? "public",
          source.stale ? 1 : 0,
          JSON.stringify(source)
        ]
      );
    },

    addEvidence(record) {
      memory.addEvidence(record);
      enqueue("INSERT OR REPLACE INTO evidence (ontology, id, source_id, document) VALUES (?, ?, ?, ?)", [
        ontology,
        record.id,
        record.source,
        JSON.stringify(record)
      ]);
    },

    putChangeSet(changeSet) {
      memory.putChangeSet(changeSet);
      enqueue(
        `INSERT OR REPLACE INTO changesets (ontology, id, title, status, created_at, created_by, base_revision, result_revision, document)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ontology,
          changeSet.id,
          changeSet.title,
          changeSet.status,
          changeSet.createdAt,
          changeSet.createdBy,
          changeSet.baseRevision ?? null,
          changeSet.resultRevision ?? null,
          JSON.stringify(changeSet)
        ]
      );
    },

    putReview(review) {
      memory.putReview(review);
      enqueue(
        `INSERT OR REPLACE INTO reviews (ontology, id, change_set, reviewer, state, created_at, document)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [ontology, review.id, review.changeSet, review.reviewer, review.state, review.createdAt, JSON.stringify(review)]
      );
    },

    putApproval(approval) {
      memory.putApproval(approval);
      enqueue(
        `INSERT OR REPLACE INTO approvals (ontology, id, change_set, approver, created_at, document)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [ontology, approval.id, approval.changeSet, approval.approver, approval.createdAt, JSON.stringify(approval)]
      );
    },

    appendEvent(event) {
      memory.appendEvent(event);
      enqueue(
        `INSERT INTO ontology_events (ontology, id, type, at, actor, change_set, subject, revision, document)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ontology,
          event.id,
          event.type,
          event.at,
          event.actor,
          event.changeSet ?? null,
          event.subject ?? null,
          event.revision ?? null,
          JSON.stringify(event)
        ]
      );
    },

    bumpRevision() {
      const revision = memory.bumpRevision();
      enqueue("UPDATE ontologies SET revision = revision + 1, updated_at = ? WHERE id = ?", [
        new Date().toISOString(),
        ontology
      ]);
      return revision;
    },

    pending: () => pendingStatements.length,

    async flush() {
      if (pendingStatements.length === 0) return { statements: 0 };
      const batch = pendingStatements.splice(0, pendingStatements.length);
      await client.batch(
        batch.map((statement) => ({ sql: statement.sql, args: statement.args })),
        "write"
      );
      return { statements: batch.length };
    },

    close() {
      client.close();
    }
  };

  return store;
}

async function seedPackage(client: Client, ontology: string, pkg: LoadedPackage): Promise<void> {
  const statements: Array<{ sql: string; args: InArgs }> = [
    {
      sql: "INSERT INTO ontologies (id, version, manifest, schema_json, revision, updated_at) VALUES (?, ?, ?, ?, 0, ?)",
      args: [
        ontology,
        pkg.manifest.version,
        JSON.stringify(pkg.manifest),
        JSON.stringify(pkg.schema),
        new Date().toISOString()
      ]
    }
  ];

  for (const entity of pkg.data.entities) {
    statements.push({
      sql: `INSERT INTO entities (ontology, id, type, canonical_name, status, superseded_by, visibility, created_at, created_by, document)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        ontology,
        entity.id,
        entity.type,
        entity.canonicalName,
        entity.status ?? "active",
        entity.supersededBy ?? null,
        entity.visibility ?? "public",
        entity.createdAt,
        entity.createdBy,
        JSON.stringify(entity)
      ]
    });
    statements.push({
      sql: "INSERT INTO entity_fts (entity_id, ontology, canonical_name, aliases, description) VALUES (?, ?, ?, ?, ?)",
      args: [entity.id, ontology, entity.canonicalName, (entity.aliases ?? []).join(" "), ""]
    });
    for (const alias of entity.aliases ?? []) {
      statements.push({
        sql: "INSERT OR IGNORE INTO aliases (ontology, entity_id, alias) VALUES (?, ?, ?)",
        args: [ontology, entity.id, alias]
      });
    }
    for (const [namespace, value] of Object.entries(entity.externalIds ?? {})) {
      statements.push({
        sql: "INSERT OR REPLACE INTO external_ids (ontology, entity_id, namespace, value) VALUES (?, ?, ?, ?)",
        args: [ontology, entity.id, namespace, value]
      });
    }
  }

  for (const claim of pkg.data.claims) {
    statements.push({
      sql: `INSERT INTO claims (ontology, id, subject, predicate, object_entity, object_value, status, confidence,
                                valid_from, valid_to, observed_at, asserted_at, asserted_by, run_id, change_set, visibility, document)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        ontology,
        claim.id,
        claim.subject,
        claim.predicate,
        "entity" in claim.object ? claim.object.entity : null,
        "entity" in claim.object ? null : JSON.stringify(claim.object.value),
        claim.status,
        claim.confidence ?? null,
        claim.validTime?.from ?? null,
        claim.validTime?.to ?? null,
        claim.observedAt ?? null,
        claim.assertedAt,
        claim.assertedBy,
        claim.runId ?? null,
        claim.changeSet ?? null,
        claim.visibility ?? "public",
        JSON.stringify(claim)
      ]
    });
    for (const source of claim.sources ?? []) {
      statements.push({
        sql: "INSERT OR IGNORE INTO claim_sources (ontology, claim_id, source_id) VALUES (?, ?, ?)",
        args: [ontology, claim.id, source]
      });
    }
  }

  for (const source of pkg.data.sources) {
    statements.push({
      sql: `INSERT INTO sources (ontology, id, source_type, uri, retrieved_at, content_hash, license, visibility, stale, document)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        ontology,
        source.id,
        source.sourceType,
        source.uri,
        source.retrievedAt,
        source.contentHash ?? null,
        source.license ?? null,
        source.visibility ?? "public",
        source.stale ? 1 : 0,
        JSON.stringify(source)
      ]
    });
  }

  for (const record of pkg.data.evidence) {
    statements.push({
      sql: "INSERT INTO evidence (ontology, id, source_id, document) VALUES (?, ?, ?, ?)",
      args: [ontology, record.id, record.source, JSON.stringify(record)]
    });
  }

  // Batched so a partial seed cannot leave a half-populated ontology behind.
  for (let i = 0; i < statements.length; i += 200) {
    await client.batch(statements.slice(i, i + 200), "write");
  }
}

async function hydrate(client: Client, ontology: string) {
  const [meta, entities, claims, sources, evidence, log, changeSets, reviews, approvals, events] =
    await Promise.all([
      client.execute({ sql: "SELECT manifest, schema_json, revision FROM ontologies WHERE id = ?", args: [ontology] }),
      client.execute({ sql: "SELECT document FROM entities WHERE ontology = ?", args: [ontology] }),
      client.execute({ sql: "SELECT document FROM claims WHERE ontology = ?", args: [ontology] }),
      client.execute({ sql: "SELECT document FROM sources WHERE ontology = ?", args: [ontology] }),
      client.execute({ sql: "SELECT document FROM evidence WHERE ontology = ?", args: [ontology] }),
      client.execute({
        sql: "SELECT kind, object_id, status, at, by, change_set, reason FROM status_log WHERE ontology = ? ORDER BY seq",
        args: [ontology]
      }),
      client.execute({ sql: "SELECT document FROM changesets WHERE ontology = ?", args: [ontology] }),
      client.execute({ sql: "SELECT document FROM reviews WHERE ontology = ?", args: [ontology] }),
      client.execute({ sql: "SELECT document FROM approvals WHERE ontology = ?", args: [ontology] }),
      client.execute({ sql: "SELECT document FROM ontology_events WHERE ontology = ? ORDER BY seq", args: [ontology] })
    ]);

  const row = meta.rows[0];
  if (!row) throw new Error(`Ontology ${ontology} disappeared while hydrating`);

  const docs = <T>(result: { rows: Array<Record<string, unknown>> }): T[] =>
    result.rows.map((r) => JSON.parse(String(r.document)) as T);

  const pkg: LoadedPackage = {
    manifest: JSON.parse(String(row.manifest)) as LoadedPackage["manifest"],
    schema: JSON.parse(String(row.schema_json)) as LoadedPackage["schema"],
    data: {
      entities: docs(entities),
      claims: docs(claims),
      sources: docs(sources),
      evidence: docs(evidence)
    },
    files: []
  };

  return {
    pkg,
    revision: Number(row.revision ?? 0),
    transitions: log.rows.map((r) => ({
      kind: String(r.kind) as "claim" | "entity",
      transition: {
        objectId: String(r.object_id),
        status: String(r.status) as never,
        at: String(r.at),
        by: String(r.by),
        changeSet: r.change_set ? String(r.change_set) : undefined,
        reason: r.reason ? String(r.reason) : undefined
      }
    })),
    changeSets: docs<LoadedPackage["data"]["entities"][number] & never>(changeSets) as never[],
    reviews: docs(reviews) as never[],
    approvals: docs(approvals) as never[],
    events: docs(events) as never[]
  };
}

/** Full-text entity search backed by FTS5 (R186). */
export async function searchEntities(
  client: Client,
  ontology: string,
  query: string,
  limit = 20
): Promise<Array<{ id: string; canonicalName: string; rank: number }>> {
  const result = await client.execute({
    sql: `SELECT entity_id, canonical_name, rank FROM entity_fts
          WHERE ontology = ? AND entity_fts MATCH ?
          ORDER BY rank LIMIT ?`,
    args: [ontology, query, limit]
  });
  return result.rows.map((row) => ({
    id: String(row.entity_id),
    canonicalName: String(row.canonical_name),
    rank: Number(row.rank ?? 0)
  }));
}

export { revisionId };
