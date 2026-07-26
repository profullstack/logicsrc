import { toIri } from "./ids.js";
import { OPENONTOLOGY_VERSION } from "./types.js";
import type { BuiltPackage, Claim, Entity, LoadedPackage } from "./types.js";

export const OO = "https://logicsrc.com/ns/openontology#";
export const PROV = "http://www.w3.org/ns/prov#";

/**
 * JSON-LD 1.1 context for the core model.
 *
 * Provenance terms deliberately alias W3C PROV-O where the semantics really
 * match (R67/R134) rather than inventing parallel vocabulary.
 */
export function buildContext(manifest: { namespace: string }): Record<string, unknown> {
  return {
    "@version": 1.1,
    oo: OO,
    prov: PROV,
    rdfs: "http://www.w3.org/2000/01/rdf-schema#",
    xsd: "http://www.w3.org/2001/XMLSchema#",
    ns: manifest.namespace.endsWith("/") ? manifest.namespace : `${manifest.namespace}/`,
    id: "@id",
    type: "@type",
    label: { "@id": "rdfs:label" },
    alias: { "@id": "oo:alias", "@container": "@set" },
    externalId: { "@id": "oo:externalId", "@container": "@index" },
    status: { "@id": "oo:status" },
    Claim: "oo:Claim",
    subject: { "@id": "rdf:subject", "@type": "@id" },
    predicate: { "@id": "rdf:predicate", "@type": "@id" },
    object: { "@id": "rdf:object" },
    confidence: { "@id": "oo:confidence", "@type": "xsd:double" },
    validFrom: { "@id": "oo:validFrom", "@type": "xsd:dateTime" },
    validTo: { "@id": "oo:validTo", "@type": "xsd:dateTime" },
    observedAt: { "@id": "oo:observedAt", "@type": "xsd:dateTime" },
    assertedAt: { "@id": "prov:generatedAtTime", "@type": "xsd:dateTime" },
    assertedBy: { "@id": "prov:wasAttributedTo", "@type": "@id" },
    source: { "@id": "prov:wasDerivedFrom", "@type": "@id", "@container": "@set" },
    evidence: { "@id": "oo:evidence", "@type": "@id", "@container": "@set" },
    run: { "@id": "prov:wasGeneratedBy", "@type": "@id" },
    supersedes: { "@id": "oo:supersedes", "@type": "@id" },
    disputes: { "@id": "oo:disputes", "@type": "@id" },
    rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  };
}

/** Fields the JSON-LD profile represents losslessly. Anything else is reported. */
const LOSSLESS_ENTITY_FIELDS = new Set([
  "openontology",
  "kind",
  "id",
  "type",
  "canonicalName",
  "labels",
  "aliases",
  "externalIds",
  "status",
  "createdAt",
  "createdBy",
  "supersededBy"
]);

const LOSSLESS_CLAIM_FIELDS = new Set([
  "openontology",
  "kind",
  "id",
  "subject",
  "predicate",
  "object",
  "status",
  "confidence",
  "validTime",
  "observedAt",
  "assertedAt",
  "assertedBy",
  "runId",
  "sources",
  "evidence",
  "supersedes",
  "disputes",
  "ontology"
]);

export interface JsonLdExport {
  document: Record<string, unknown>;
  /** Fields dropped by this profile, reported rather than silently lost (R135). */
  lossy: Array<{ objectId: string; fields: string[] }>;
}

/**
 * The compact prefix bound to this package's namespace.
 *
 * Canonicalizing `ethereum:person:alice` to an IRI drops the prefix, so
 * reversing an IRI back to a compact id needs the binding. A package declares
 * it via a Namespace object whose uri is the package namespace; otherwise the
 * package id is the prefix (the plain "package-qualified" reading).
 */
export function packagePrefix(pkg: BuiltPackage | LoadedPackage): string {
  const declared = pkg.schema.namespaces.find((ns) => ns.uri === pkg.manifest.namespace);
  return declared?.prefix ?? pkg.manifest.id;
}

export function exportJsonLd(pkg: BuiltPackage | LoadedPackage): JsonLdExport {
  const manifest = pkg.manifest;
  const iri = (id: string) => toIri(id, { defaultNamespace: manifest.namespace });
  const lossy: JsonLdExport["lossy"] = [];

  const graph: Array<Record<string, unknown>> = [];

  for (const entity of pkg.data.entities) {
    const node: Record<string, unknown> = {
      id: iri(entity.id),
      type: iri(`${entityTypePrefix(manifest.id)}:${entity.type}`),
      label: entity.canonicalName,
      status: entity.status ?? "active",
      "prov:generatedAtTime": entity.createdAt,
      "prov:wasAttributedTo": entity.createdBy
    };
    if (entity.aliases?.length) node.alias = entity.aliases;
    if (entity.externalIds) node.externalId = entity.externalIds;
    if (entity.labels) node["rdfs:label"] = languageArray(entity.labels);
    if (entity.supersededBy) node["oo:supersededBy"] = { id: iri(entity.supersededBy) };

    const extra = extraFields(entity as unknown as Record<string, unknown>, LOSSLESS_ENTITY_FIELDS);
    if (extra.length) lossy.push({ objectId: entity.id, fields: extra });

    graph.push(node);
  }

  for (const claim of pkg.data.claims) {
    const node: Record<string, unknown> = {
      id: iri(claim.id),
      type: "Claim",
      subject: iri(claim.subject),
      predicate: iri(`${entityTypePrefix(manifest.id)}:${claim.predicate}`),
      status: claim.status,
      assertedAt: claim.assertedAt,
      assertedBy: claim.assertedBy
    };

    node.object =
      "entity" in claim.object
        ? { id: iri(claim.object.entity) }
        : literal(claim.object);

    if (claim.confidence !== undefined) node.confidence = claim.confidence;
    if (claim.validTime?.from) node.validFrom = claim.validTime.from;
    if (claim.validTime?.to) node.validTo = claim.validTime.to;
    if (claim.observedAt) node.observedAt = claim.observedAt;
    if (claim.runId) node.run = claim.runId;
    if (claim.sources?.length) node.source = claim.sources.map(iri);
    if (claim.evidence?.length) node.evidence = claim.evidence.map(iri);
    if (claim.supersedes) node.supersedes = iri(claim.supersedes);
    if (claim.disputes) node.disputes = iri(claim.disputes);

    const extra = extraFields(claim as unknown as Record<string, unknown>, LOSSLESS_CLAIM_FIELDS);
    if (extra.length) lossy.push({ objectId: claim.id, fields: extra });

    graph.push(node);
  }

  for (const source of pkg.data.sources) {
    graph.push({
      id: iri(source.id),
      type: "prov:Entity",
      "oo:sourceType": source.sourceType,
      "oo:uri": source.uri,
      "prov:generatedAtTime": source.retrievedAt,
      ...(source.license ? { "oo:license": source.license } : {}),
      ...(source.contentHash ? { "oo:contentHash": source.contentHash } : {})
    });
  }

  return {
    document: {
      "@context": pkg.context ?? buildContext(manifest),
      "@graph": graph
    },
    lossy
  };
}

/**
 * Import the reified profile produced by `exportJsonLd`, so a package can make
 * the JSON → JSON-LD → JSON round trip the conformance suite asserts.
 */
export function importJsonLd(
  document: Record<string, unknown>,
  manifest: { id: string; namespace: string; version?: string; prefix?: string }
): { entities: Entity[]; claims: Claim[] } {
  const base = manifest.namespace.endsWith("/") ? manifest.namespace : `${manifest.namespace}/`;
  const prefix = manifest.prefix ?? manifest.id;
  const compact = (value: string): string => {
    if (!value.startsWith(base)) return value;
    const segments = value.slice(base.length).split("/").map(decodeURIComponent);
    return [prefix, ...segments].join(":");
  };

  const graph = (document["@graph"] as Array<Record<string, unknown>>) ?? [];
  const entities: Entity[] = [];
  const claims: Claim[] = [];

  for (const node of graph) {
    const type = node.type as string | undefined;
    const id = compact(String(node.id));

    if (type === "Claim") {
      const object = node.object as Record<string, unknown>;
      const claim: Claim = {
        openontology: OPENONTOLOGY_VERSION,
        kind: "Claim",
        id,
        subject: compact(String(node.subject)),
        predicate: compact(String(node.predicate)).split(":").pop() as string,
        object:
          object && typeof object === "object" && "id" in object
            ? { entity: compact(String(object.id)) }
            : { value: (object as { "@value"?: unknown })?.["@value"] ?? object },
        status: (node.status as Claim["status"]) ?? "asserted",
        assertedAt: String(node.assertedAt),
        assertedBy: String(node.assertedBy)
      };
      if (node.confidence !== undefined) claim.confidence = Number(node.confidence);
      if (node.validFrom || node.validTo) {
        claim.validTime = {
          ...(node.validFrom ? { from: String(node.validFrom) } : {}),
          ...(node.validTo ? { to: String(node.validTo) } : {})
        };
      }
      if (node.observedAt) claim.observedAt = String(node.observedAt);
      if (node.run) claim.runId = String(node.run);
      if (node.source) claim.sources = (node.source as string[]).map(compact);
      if (node.evidence) claim.evidence = (node.evidence as string[]).map(compact);
      if (node.supersedes) claim.supersedes = compact(String(node.supersedes));
      if (node.disputes) claim.disputes = compact(String(node.disputes));
      claims.push(claim);
      continue;
    }

    if (type === "prov:Entity" || !type) continue;

    const entity: Entity = {
      openontology: OPENONTOLOGY_VERSION,
      kind: "Entity",
      id,
      type: compact(String(type)).split(":").pop() as string,
      canonicalName: String(node.label ?? id),
      createdAt: String(node["prov:generatedAtTime"] ?? ""),
      createdBy: String(node["prov:wasAttributedTo"] ?? "")
    };
    if (node.alias) entity.aliases = node.alias as string[];
    if (node.externalId) entity.externalIds = node.externalId as Record<string, string>;
    if (node.status && node.status !== "active") entity.status = node.status as Entity["status"];
    entities.push(entity);
  }

  return { entities, claims };
}

function literal(object: { value: unknown; datatype?: string; language?: string }): unknown {
  if (object.language) return { "@value": object.value, "@language": object.language };
  return object.value;
}

function languageArray(labels: Record<string, string>): Array<{ "@value": string; "@language": string }> {
  return Object.entries(labels).map(([language, value]) => ({ "@value": value, "@language": language }));
}

function extraFields(object: Record<string, unknown>, lossless: Set<string>): string[] {
  return Object.keys(object).filter((key) => !lossless.has(key) && object[key] !== undefined);
}

function entityTypePrefix(packageId: string): string {
  return packageId;
}
