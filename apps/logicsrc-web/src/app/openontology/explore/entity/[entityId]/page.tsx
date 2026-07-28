import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getService } from "@/lib/ontology-service";
import { SiteShell } from "@/components/site-shell";
import { CLAIM_STATUS, Confidence, StatusBadge, formatObject, mono, table, td, th } from "../../../ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params
}: {
  params: Promise<{ entityId: string }>;
}): Promise<Metadata> {
  const { entityId } = await params;
  const id = decodeURIComponent(entityId);
  const state = await getService();
  const entity = state.engine?.store.getEntity(id);
  return {
    title: `${entity?.canonicalName ?? id} · OpenOntology · LogicSRC`,
    description: entity
      ? `${entity.canonicalName} (${entity.type}) and the source-backed claims about it.`
      : "OpenOntology entity"
  };
}

export default async function EntityPage({
  params
}: {
  params: Promise<{ entityId: string }>;
}): Promise<ReactNode> {
  const { entityId } = await params;
  const id = decodeURIComponent(entityId);
  const state = await getService();
  if (!state.engine) notFound();

  const engine = state.engine;
  const entity = engine.store.getEntity(id);
  if (!entity) notFound();

  const manifest = engine.getOntologyManifest();
  const claims = engine.store.listClaims({ subject: entity.id, status: CLAIM_STATUS.map((s) => s.id) as never });
  const incoming = engine.store
    .listClaims({ status: ["asserted"] })
    .filter((claim) => "entity" in claim.object && claim.object.entity === entity.id);

  return (
    <SiteShell active="OpenOntology">
      <div className="band">
        <p style={{ marginBottom: "1rem" }}>
          <Link href="/openontology/explore" style={{ color: "#5b6b7a", textDecoration: "none" }}>
            ← Explorer
          </Link>
        </p>
        <div className="section-head">
          <p className="eyebrow">{entity.type}</p>
          <h2>{entity.canonicalName}</h2>
        </div>

        {entity.id !== id ? (
          <p style={{ color: "#7c2d12", background: "#ffedd5", padding: "0.6rem 0.9rem", borderRadius: "0.4rem" }}>
            <code style={mono}>{id}</code> was merged into this entity. The old id still resolves —
            merges keep redirects rather than breaking references.
          </p>
        ) : null}

        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.4rem 1rem", margin: 0 }}>
          <dt style={{ color: "#5b6b7a" }}>Id</dt>
          <dd style={{ ...mono, margin: 0 }}>{entity.id}</dd>
          <dt style={{ color: "#5b6b7a" }}>Status</dt>
          <dd style={{ margin: 0 }}>
            <StatusBadge status={entity.status ?? "active"} />
          </dd>
          {entity.aliases?.length ? (
            <>
              <dt style={{ color: "#5b6b7a" }}>Aliases</dt>
              <dd style={{ margin: 0 }}>{entity.aliases.join(", ")}</dd>
            </>
          ) : null}
          {entity.externalIds && Object.keys(entity.externalIds).length > 0 ? (
            <>
              <dt style={{ color: "#5b6b7a" }}>External ids</dt>
              <dd style={{ margin: 0 }}>
                {Object.entries(entity.externalIds).map(([namespace, value]) => (
                  <code key={namespace} style={{ ...mono, marginRight: "0.75rem" }}>
                    {namespace}:{value}
                  </code>
                ))}
              </dd>
            </>
          ) : null}
          <dt style={{ color: "#5b6b7a" }}>Created</dt>
          <dd style={{ margin: 0 }}>
            {entity.createdAt} by {entity.createdBy}
          </dd>
        </dl>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Claims about this entity</h2>
          <p>
            Each row shows status, confidence, the domain time it covers, and how many sources back
            it. Nothing here is presented as settled unless it says <strong>asserted</strong>.
          </p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Status</th>
                <th style={th}>Predicate</th>
                <th style={th}>Object</th>
                <th style={th}>Confidence</th>
                <th style={th}>Valid from</th>
                <th style={th}>Recorded</th>
                <th style={th}>Sources</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((claim) => (
                <tr key={claim.id}>
                  <td style={td}>
                    <StatusBadge status={claim.status} />
                  </td>
                  <td style={td}>
                    <Link href={`/openontology/explore/claim/${encodeURIComponent(claim.id)}`}>
                      {claim.predicate}
                    </Link>
                  </td>
                  <td style={{ ...td, ...mono }}>
                    {"entity" in claim.object ? (
                      <Link href={`/openontology/explore/entity/${encodeURIComponent(claim.object.entity)}`}>
                        {claim.object.entity}
                      </Link>
                    ) : (
                      formatObject(claim.object)
                    )}
                  </td>
                  <td style={td}>
                    <Confidence value={claim.confidence} />
                  </td>
                  <td style={td}>{claim.validTime?.from?.slice(0, 10) ?? "—"}</td>
                  <td style={td}>{claim.assertedAt.slice(0, 10)}</td>
                  <td style={td}>{claim.sources?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {incoming.length > 0 ? (
        <div className="band">
          <div className="section-head">
            <h2>Referenced by</h2>
            <p>Asserted claims elsewhere in the graph that point at this entity.</p>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Subject</th>
                  <th style={th}>Predicate</th>
                  <th style={th}>Claim</th>
                </tr>
              </thead>
              <tbody>
                {incoming.slice(0, 25).map((claim) => (
                  <tr key={claim.id}>
                    <td style={td}>
                      <Link href={`/openontology/explore/entity/${encodeURIComponent(claim.subject)}`}>
                        {engine.store.getEntity(claim.subject)?.canonicalName ?? claim.subject}
                      </Link>
                    </td>
                    <td style={td}>{claim.predicate}</td>
                    <td style={{ ...td, ...mono }}>
                      <Link href={`/openontology/explore/claim/${encodeURIComponent(claim.id)}`}>{claim.id}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="band">
        <p style={{ color: "#5b6b7a", fontSize: "0.9rem" }}>
          Same data over the API:{" "}
          <a href={`/api/ontologies/${manifest.id}/entities/${encodeURIComponent(entity.id)}`}>
            <code style={mono}>
              /api/ontologies/{manifest.id}/entities/{entity.id}
            </code>
          </a>
        </p>
      </div>
    </SiteShell>
  );
}
