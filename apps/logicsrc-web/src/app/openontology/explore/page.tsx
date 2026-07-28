import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getService } from "@/lib/ontology-service";
import { SiteShell } from "@/components/site-shell";
import { CLAIM_STATUS, card, mono, table, th, td, StatusBadge } from "../ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Explore · OpenOntology · LogicSRC",
  description:
    "A read-only explorer over the OpenOntology example package: entity types, entities, claims with provenance, and the saved queries that answer real questions.",
  alternates: { canonical: "/openontology/explore" }
};

export default async function ExplorePage(): Promise<ReactNode> {
  const state = await getService();

  if (!state.engine) {
    return (
      <SiteShell active="OpenOntology">
        <div className="band">
          <div className="section-head">
            <h2>Explorer unavailable</h2>
            <p>{state.error ?? "No ontology package is loaded."}</p>
          </div>
        </div>
      </SiteShell>
    );
  }

  const engine = state.engine;
  const manifest = engine.getOntologyManifest();
  const schema = engine.getOntologySchema();
  const entities = engine.store.listEntities();

  const byType = new Map<string, number>();
  for (const entity of entities) byType.set(entity.type, (byType.get(entity.type) ?? 0) + 1);

  const allClaims = engine.store.listClaims({
    status: ["asserted", "proposed", "disputed", "retracted", "superseded", "derived"]
  });
  const byStatus = new Map<string, number>();
  for (const claim of allClaims) byStatus.set(claim.status, (byStatus.get(claim.status) ?? 0) + 1);

  const needsReview = allClaims.filter(
    (claim) => claim.status === "proposed" || claim.status === "disputed"
  );

  return (
    <SiteShell active="OpenOntology">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">Read-only explorer · fixture data</p>
          <h2>{manifest.name}</h2>
          <p>{manifest.description}</p>
        </div>
        <p style={{ color: "#5b6b7a", fontSize: "0.95rem" }}>
          <code style={mono}>
            {manifest.id}@{manifest.version}
          </code>{" "}
          · {manifest.license} · revision <code style={mono}>{engine.store.revision()}</code> ·{" "}
          {state.persistence === "turso" ? "Turso/libSQL" : "in-memory"} ·{" "}
          <a href={`/api/ontologies/${manifest.id}/manifest`}>REST</a>{" "}
          <a href="/api/ontologies/openapi">OpenAPI</a>
        </p>
        <p style={{ color: "#5b6b7a", fontSize: "0.95rem" }}>
          Every person, organization, and project below is <strong>fictional</strong>. The package
          exists to demonstrate the contract.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Claims by status</h2>
          <p>
            A clean graph makes uncertain things look settled, so status is never hidden. Only{" "}
            <strong>asserted</strong> claims are the current accepted view.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
          {CLAIM_STATUS.map((status) => (
            <div key={status.id} style={{ ...card, minWidth: "9rem" }}>
              <StatusBadge status={status.id} />
              <div style={{ fontSize: "1.6rem", fontWeight: 600, color: "#101418" }}>
                {byStatus.get(status.id) ?? 0}
              </div>
              <div style={{ color: "#5b6b7a", fontSize: "0.85rem" }}>{status.meaning}</div>
            </div>
          ))}
        </div>
        {needsReview.length > 0 ? (
          <p style={{ marginTop: "1rem", color: "#41505d" }}>
            {needsReview.length} claim{needsReview.length === 1 ? "" : "s"} awaiting a human decision:{" "}
            {needsReview.slice(0, 5).map((claim, index) => (
              <span key={claim.id}>
                {index > 0 ? ", " : ""}
                <Link href={`/openontology/explore/claim/${encodeURIComponent(claim.id)}`}>{claim.id}</Link>
              </span>
            ))}
          </p>
        ) : null}
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Entity types</h2>
          <p>The identity-bearing nouns of this domain, and how many of each exist.</p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Type</th>
                <th style={th}>Count</th>
                <th style={th}>Description</th>
              </tr>
            </thead>
            <tbody>
              {schema.entityTypes.map((type) => (
                <tr key={type.id}>
                  <td style={td}>
                    <Link href={`/openontology/explore?type=${encodeURIComponent(type.id)}`}>
                      <code style={mono}>{type.id}</code>
                    </Link>
                  </td>
                  <td style={td}>{byType.get(type.id) ?? 0}</td>
                  <td style={{ ...td, color: "#41505d" }}>{type.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Entities</h2>
          <p>Every entity keeps its id when its name changes, and after a merge the old id still resolves.</p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Type</th>
                <th style={th}>Status</th>
                <th style={th}>Id</th>
              </tr>
            </thead>
            <tbody>
              {entities.slice(0, 40).map((entity) => (
                <tr key={entity.id}>
                  <td style={td}>
                    <Link href={`/openontology/explore/entity/${encodeURIComponent(entity.id)}`}>
                      {entity.canonicalName}
                    </Link>
                  </td>
                  <td style={td}>{entity.type}</td>
                  <td style={td}>
                    <StatusBadge status={entity.status ?? "active"} />
                  </td>
                  <td style={{ ...td, ...mono, color: "#5b6b7a" }}>{entity.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {entities.length > 40 ? (
          <p style={{ color: "#5b6b7a", marginTop: "0.75rem" }}>
            Showing 40 of {entities.length}. The full list is at{" "}
            <a href={`/api/ontologies/${manifest.id}/entities?limit=200`}>
              <code style={mono}>/api/ontologies/{manifest.id}/entities</code>
            </a>
            .
          </p>
        ) : null}
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Saved queries</h2>
          <p>The questions this ontology already knows how to answer.</p>
        </div>
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {schema.queries.map((query) => (
            <div key={query.id} style={card}>
              <strong style={{ color: "#101418" }}>{query.label ?? query.id}</strong>
              <div style={{ color: "#41505d", margin: "0.25rem 0" }}>{query.description}</div>
              <code style={{ ...mono, color: "#5b6b7a" }}>
                POST /api/ontologies/{manifest.id}/query {"{"} &quot;savedQuery&quot;: &quot;{query.id}&quot; {"}"}
              </code>
            </div>
          ))}
        </div>
      </div>
    </SiteShell>
  );
}
