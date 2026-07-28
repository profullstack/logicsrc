import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getService } from "@/lib/ontology-service";
import { SiteShell } from "@/components/site-shell";
import { Confidence, StatusBadge, formatObject, mono, table, td, th } from "../../../ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params
}: {
  params: Promise<{ claimId: string }>;
}): Promise<Metadata> {
  const { claimId } = await params;
  return {
    title: `${decodeURIComponent(claimId)} · OpenOntology · LogicSRC`,
    description: "A single OpenOntology claim, with the sources, evidence, and history behind it."
  };
}

export default async function ClaimPage({
  params
}: {
  params: Promise<{ claimId: string }>;
}): Promise<ReactNode> {
  const { claimId } = await params;
  const id = decodeURIComponent(claimId);
  const state = await getService();
  if (!state.engine) notFound();

  const engine = state.engine;
  const claim = engine.store.getClaim(id);
  if (!claim) notFound();

  const manifest = engine.getOntologyManifest();
  const subject = engine.store.getEntity(claim.subject);
  const object = "entity" in claim.object ? engine.store.getEntity(claim.object.entity) : null;
  const sources = (claim.sources ?? []).map((sourceId) => engine.store.getSource(sourceId)).filter(Boolean);
  const evidence = (claim.evidence ?? []).map((evidenceId) => engine.store.getEvidence(evidenceId)).filter(Boolean);
  const history = engine.store.claimHistory(claim.id);

  return (
    <SiteShell active="OpenOntology">
      <div className="band">
        <p style={{ marginBottom: "1rem" }}>
          <Link href="/openontology/explore" style={{ color: "#5b6b7a", textDecoration: "none" }}>
            ← Explorer
          </Link>
        </p>
        <div className="section-head">
          <p className="eyebrow">Claim</p>
          <h2 style={{ fontSize: "1.5rem" }}>
            {subject ? (
              <Link href={`/openontology/explore/entity/${encodeURIComponent(claim.subject)}`}>
                {subject.canonicalName}
              </Link>
            ) : (
              claim.subject
            )}{" "}
            <span style={{ color: "#5b6b7a" }}>—{claim.predicate}→</span>{" "}
            {object ? (
              <Link href={`/openontology/explore/entity/${encodeURIComponent(object.id)}`}>
                {object.canonicalName}
              </Link>
            ) : (
              formatObject(claim.object)
            )}
          </h2>
        </div>

        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.4rem 1rem", margin: 0 }}>
          <dt style={{ color: "#5b6b7a" }}>Status</dt>
          <dd style={{ margin: 0 }}>
            <StatusBadge status={claim.status} />
          </dd>
          <dt style={{ color: "#5b6b7a" }}>Confidence</dt>
          <dd style={{ margin: 0 }}>
            <Confidence value={claim.confidence} />
          </dd>
          <dt style={{ color: "#5b6b7a" }}>Valid time</dt>
          <dd style={{ margin: 0 }}>
            {claim.validTime?.from ? `${claim.validTime.from.slice(0, 10)} → ${claim.validTime.to?.slice(0, 10) ?? "present"}` : "not stated"}
            <span style={{ color: "#8a949e" }}> (when it was true in the world)</span>
          </dd>
          <dt style={{ color: "#5b6b7a" }}>Recorded</dt>
          <dd style={{ margin: 0 }}>
            {claim.assertedAt} <span style={{ color: "#8a949e" }}>(when the system learned it)</span>
          </dd>
          <dt style={{ color: "#5b6b7a" }}>Asserted by</dt>
          <dd style={{ margin: 0 }}>
            {claim.assertedBy}
            {claim.runId ? (
              <>
                {" "}
                · run <code style={mono}>{claim.runId}</code>
              </>
            ) : null}
          </dd>
          {claim.derivedFrom ? (
            <>
              <dt style={{ color: "#5b6b7a" }}>Derived from</dt>
              <dd style={{ margin: 0 }}>
                rule <code style={mono}>{claim.derivedFrom.rule ?? claim.derivedFrom.query}</code> over{" "}
                {claim.derivedFrom.inputs?.length ?? 0} input claim(s)
              </dd>
            </>
          ) : null}
          <dt style={{ color: "#5b6b7a" }}>Id</dt>
          <dd style={{ ...mono, margin: 0 }}>{claim.id}</dd>
        </dl>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Why this claim is here</h2>
          <p>Answer → claim → evidence → source. If a claim cannot show this, it should not be trusted.</p>
        </div>

        {sources.length === 0 ? (
          <p style={{ color: "#41505d" }}>
            {claim.firstParty
              ? "Declared a first-party assertion: no external source, stated explicitly rather than left blank."
              : "No sources recorded."}
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Source</th>
                  <th style={th}>Type</th>
                  <th style={th}>Licence</th>
                  <th style={th}>Retrieved</th>
                  <th style={th}>State</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source!.id}>
                    <td style={td}>
                      <a href={source!.uri} rel="noreferrer">
                        {source!.title ?? source!.id}
                      </a>
                    </td>
                    <td style={td}>{source!.sourceType}</td>
                    <td style={td}>{source!.license ?? "unknown"}</td>
                    <td style={td}>{source!.retrievedAt.slice(0, 10)}</td>
                    <td style={td}>
                      {source!.stale ? <StatusBadge status="disputed" /> : <StatusBadge status="asserted" />}
                      {source!.stale ? (
                        <span style={{ color: "#7c2d12", marginLeft: "0.4rem" }}>stale</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {evidence.length > 0 ? (
          <ul style={{ color: "#41505d", marginTop: "1rem", paddingLeft: "1.1rem" }}>
            {evidence.map((record) => (
              <li key={record!.id}>
                <code style={mono}>{record!.selector.type}</code>{" "}
                {JSON.stringify(record!.selector).replace(/[{}"]/g, "")}
                {record!.excerpt ? <> — “{record!.excerpt}”</> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="band">
        <div className="section-head">
          <h2>History</h2>
          <p>Claims are append-only: a correction adds a transition rather than editing the record.</p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>When</th>
                <th style={th}>Status</th>
                <th style={th}>By</th>
                <th style={th}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry, index) => (
                <tr key={`${entry.objectId}-${index}`}>
                  <td style={td}>{entry.at.slice(0, 19)}</td>
                  <td style={td}>
                    <StatusBadge status={String(entry.status)} />
                  </td>
                  <td style={td}>{entry.by}</td>
                  <td style={{ ...td, color: "#41505d" }}>{entry.reason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="band">
        <p style={{ color: "#5b6b7a", fontSize: "0.9rem" }}>
          Same data over the API:{" "}
          <a href={`/api/ontologies/${manifest.id}/claims/${encodeURIComponent(claim.id)}`}>
            <code style={mono}>
              /api/ontologies/{manifest.id}/claims/{claim.id}
            </code>
          </a>
        </p>
      </div>
    </SiteShell>
  );
}
