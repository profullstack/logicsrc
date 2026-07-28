import { toIri } from "./ids.js";
import { packagePrefix, OO, PROV } from "./jsonld.js";
import { OPENONTOLOGY_VERSION } from "./types.js";
import type { BuiltPackage, Claim, Entity, LoadedPackage } from "./types.js";

/**
 * RDF/Turtle export and import for the losslessly mappable core subset.
 *
 * Claims are reified — each is its own resource carrying subject, predicate,
 * object, status, time, confidence, and provenance — because a bare triple
 * cannot say "asserted by this agent, from this commit, valid since April."
 * Asserted relationship claims additionally emit the plain triple, so a
 * consumer that only wants the current graph gets one.
 */

const PREFIXES: Array<[string, string]> = [
  ["oo", OO],
  ["prov", PROV],
  ["rdf", "http://www.w3.org/1999/02/22-rdf-syntax-ns#"],
  ["rdfs", "http://www.w3.org/2000/01/rdf-schema#"],
  ["xsd", "http://www.w3.org/2001/XMLSchema#"]
];

/** Fields this profile carries. Everything else is reported as lossy. */
const LOSSLESS_CLAIM_FIELDS = new Set([
  "openontology",
  "kind",
  "id",
  "ontology",
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
  "disputes"
]);

const LOSSLESS_ENTITY_FIELDS = new Set([
  "openontology",
  "kind",
  "id",
  "type",
  "canonicalName",
  "aliases",
  "externalIds",
  "status",
  "createdAt",
  "createdBy",
  "supersededBy"
]);

export interface TurtleExport {
  turtle: string;
  lossy: Array<{ objectId: string; fields: string[] }>;
  /** Counts, so a caller can report what actually crossed the boundary. */
  counts: { entities: number; claims: number; sources: number; triples: number };
}

export function exportTurtle(pkg: BuiltPackage | LoadedPackage): TurtleExport {
  const manifest = pkg.manifest;
  const prefix = packagePrefix(pkg);
  const ns = manifest.namespace.endsWith("/") ? manifest.namespace : `${manifest.namespace}/`;
  const iri = (id: string) => `<${toIri(id, { defaultNamespace: manifest.namespace })}>`;
  const vocab = (term: string) => `<${ns}${encodeURIComponent(term)}>`;

  const lossy: TurtleExport["lossy"] = [];
  const lines: string[] = [];
  let triples = 0;

  const emit = (subject: string, pairs: Array<[string, string]>) => {
    if (pairs.length === 0) return;
    lines.push(`${subject}`);
    pairs.forEach(([predicate, object], index) => {
      triples += 1;
      lines.push(`    ${predicate} ${object}${index === pairs.length - 1 ? " ." : " ;"}`);
    });
    lines.push("");
  };

  for (const [name, uri] of PREFIXES) lines.push(`@prefix ${name}: <${uri}> .`);
  lines.push(`@prefix ns: <${ns}> .`);
  lines.push(`@prefix pkg: <${ns}> .`);
  lines.push("");
  lines.push(`# LogicSRC OpenOntology ${OPENONTOLOGY_VERSION} — ${manifest.id}@${manifest.version}`);
  lines.push(`# compact id prefix: ${prefix}`);
  lines.push("");

  for (const entity of pkg.data.entities) {
    const pairs: Array<[string, string]> = [
      ["a", vocab(entity.type)],
      ["rdfs:label", literal(entity.canonicalName)],
      ["oo:status", literal(entity.status ?? "active")],
      ["prov:generatedAtTime", typed(entity.createdAt, "xsd:dateTime")],
      ["prov:wasAttributedTo", literal(entity.createdBy)]
    ];
    for (const alias of entity.aliases ?? []) pairs.push(["oo:alias", literal(alias)]);
    for (const [namespace, value] of Object.entries(entity.externalIds ?? {})) {
      pairs.push(["oo:externalId", literal(`${namespace}:${value}`)]);
    }
    if (entity.supersededBy) pairs.push(["oo:supersededBy", iri(entity.supersededBy)]);

    emit(iri(entity.id), pairs);

    const extra = extraFields(entity as unknown as Record<string, unknown>, LOSSLESS_ENTITY_FIELDS);
    if (extra.length) lossy.push({ objectId: entity.id, fields: extra });
  }

  for (const claim of pkg.data.claims) {
    const objectTerm =
      "entity" in claim.object ? iri(claim.object.entity) : valueTerm(claim.object);

    const pairs: Array<[string, string]> = [
      ["a", "oo:Claim"],
      ["rdf:subject", iri(claim.subject)],
      ["rdf:predicate", vocab(claim.predicate)],
      ["rdf:object", objectTerm],
      ["oo:status", literal(claim.status)],
      ["prov:generatedAtTime", typed(claim.assertedAt, "xsd:dateTime")],
      ["prov:wasAttributedTo", literal(claim.assertedBy)]
    ];

    if (claim.confidence !== undefined) pairs.push(["oo:confidence", typed(String(claim.confidence), "xsd:double")]);
    if (claim.validTime?.from) pairs.push(["oo:validFrom", typed(claim.validTime.from, "xsd:dateTime")]);
    if (claim.validTime?.to) pairs.push(["oo:validTo", typed(claim.validTime.to, "xsd:dateTime")]);
    if (claim.observedAt) pairs.push(["oo:observedAt", typed(claim.observedAt, "xsd:dateTime")]);
    if (claim.runId) pairs.push(["prov:wasGeneratedBy", literal(claim.runId)]);
    for (const source of claim.sources ?? []) pairs.push(["prov:wasDerivedFrom", iri(source)]);
    for (const record of claim.evidence ?? []) pairs.push(["oo:evidence", iri(record)]);
    if (claim.supersedes) pairs.push(["oo:supersedes", iri(claim.supersedes)]);
    if (claim.disputes) pairs.push(["oo:disputes", iri(claim.disputes)]);

    emit(iri(claim.id), pairs);

    // The plain triple, for consumers that only want the accepted graph.
    if (claim.status === "asserted" && "entity" in claim.object) {
      emit(iri(claim.subject), [[vocab(claim.predicate), iri(claim.object.entity)]]);
    }

    const extra = extraFields(claim as unknown as Record<string, unknown>, LOSSLESS_CLAIM_FIELDS);
    if (extra.length) lossy.push({ objectId: claim.id, fields: extra });
  }

  for (const source of pkg.data.sources) {
    emit(iri(source.id), [
      ["a", "prov:Entity"],
      ["oo:sourceType", literal(source.sourceType)],
      ["oo:uri", literal(source.uri)],
      ["prov:generatedAtTime", typed(source.retrievedAt, "xsd:dateTime")],
      ...(source.license ? ([["oo:license", literal(source.license)]] as Array<[string, string]>) : []),
      ...(source.contentHash ? ([["oo:contentHash", literal(source.contentHash)]] as Array<[string, string]>) : [])
    ]);
  }

  return {
    turtle: `${lines.join("\n").trimEnd()}\n`,
    lossy,
    counts: {
      entities: pkg.data.entities.length,
      claims: pkg.data.claims.length,
      sources: pkg.data.sources.length,
      triples
    }
  };
}

/**
 * Import the profile `exportTurtle` produces.
 *
 * This is deliberately a parser for that profile, not a general Turtle parser:
 * it reads the reified claim shape and the entity shape, and ignores plain
 * triples (which are redundant with the claims). Anything it cannot interpret
 * is reported rather than silently dropped.
 */
export function importTurtle(
  turtle: string,
  manifest: { id: string; namespace: string; prefix?: string }
): { entities: Entity[]; claims: Claim[]; unsupported: string[] } {
  const base = manifest.namespace.endsWith("/") ? manifest.namespace : `${manifest.namespace}/`;
  const prefix = manifest.prefix ?? manifest.id;

  const compact = (value: string): string => {
    const trimmed = value.replace(/^<|>$/g, "");
    if (!trimmed.startsWith(base)) return trimmed;
    return [prefix, ...trimmed.slice(base.length).split("/").map(decodeURIComponent)].join(":");
  };
  const term = (value: string): string => {
    const trimmed = value.replace(/^<|>$/g, "");
    if (!trimmed.startsWith(base)) return trimmed;
    return decodeURIComponent(trimmed.slice(base.length));
  };

  const entities: Entity[] = [];
  const claims: Claim[] = [];
  const unsupported: string[] = [];

  for (const block of splitBlocks(turtle)) {
    const pairs = block.pairs;
    const type = pairs.find(([p]) => p === "a" || p === "rdf:type")?.[1];

    if (type === "oo:Claim") {
      const objectTerm = pairs.find(([p]) => p === "rdf:object")?.[1] ?? "";
      const claim: Claim = {
        openontology: OPENONTOLOGY_VERSION,
        kind: "Claim",
        id: compact(block.subject),
        subject: compact(pairs.find(([p]) => p === "rdf:subject")?.[1] ?? ""),
        predicate: term(pairs.find(([p]) => p === "rdf:predicate")?.[1] ?? ""),
        object: objectTerm.startsWith("<")
          ? { entity: compact(objectTerm) }
          : { value: parseLiteral(objectTerm) },
        status: (unquote(pairs.find(([p]) => p === "oo:status")?.[1] ?? '"asserted"') as Claim["status"]) ?? "asserted",
        assertedAt: unquote(pairs.find(([p]) => p === "prov:generatedAtTime")?.[1] ?? '""'),
        assertedBy: unquote(pairs.find(([p]) => p === "prov:wasAttributedTo")?.[1] ?? '""')
      };

      const confidence = pairs.find(([p]) => p === "oo:confidence")?.[1];
      if (confidence) claim.confidence = Number(unquote(confidence));
      const from = pairs.find(([p]) => p === "oo:validFrom")?.[1];
      const to = pairs.find(([p]) => p === "oo:validTo")?.[1];
      if (from || to) {
        claim.validTime = {
          ...(from ? { from: unquote(from) } : {}),
          ...(to ? { to: unquote(to) } : {})
        };
      }
      const observed = pairs.find(([p]) => p === "oo:observedAt")?.[1];
      if (observed) claim.observedAt = unquote(observed);
      const run = pairs.find(([p]) => p === "prov:wasGeneratedBy")?.[1];
      if (run) claim.runId = unquote(run);

      const sources = pairs.filter(([p]) => p === "prov:wasDerivedFrom").map(([, o]) => compact(o));
      if (sources.length) claim.sources = sources;
      const evidence = pairs.filter(([p]) => p === "oo:evidence").map(([, o]) => compact(o));
      if (evidence.length) claim.evidence = evidence;
      const supersedes = pairs.find(([p]) => p === "oo:supersedes")?.[1];
      if (supersedes) claim.supersedes = compact(supersedes);
      const disputes = pairs.find(([p]) => p === "oo:disputes")?.[1];
      if (disputes) claim.disputes = compact(disputes);

      claims.push(claim);
      continue;
    }

    if (type === "prov:Entity" || !type) continue;

    if (!type.startsWith("<")) {
      unsupported.push(`${block.subject} has unrecognized type ${type}`);
      continue;
    }

    const entity: Entity = {
      openontology: OPENONTOLOGY_VERSION,
      kind: "Entity",
      id: compact(block.subject),
      type: term(type),
      canonicalName: unquote(pairs.find(([p]) => p === "rdfs:label")?.[1] ?? '""'),
      createdAt: unquote(pairs.find(([p]) => p === "prov:generatedAtTime")?.[1] ?? '""'),
      createdBy: unquote(pairs.find(([p]) => p === "prov:wasAttributedTo")?.[1] ?? '""')
    };

    const aliases = pairs.filter(([p]) => p === "oo:alias").map(([, o]) => unquote(o));
    if (aliases.length) entity.aliases = aliases;

    const externalIds = pairs.filter(([p]) => p === "oo:externalId").map(([, o]) => unquote(o));
    if (externalIds.length) {
      entity.externalIds = Object.fromEntries(
        externalIds.map((pair) => {
          const at = pair.indexOf(":");
          return [pair.slice(0, at), pair.slice(at + 1)];
        })
      );
    }

    const status = pairs.find(([p]) => p === "oo:status")?.[1];
    if (status && unquote(status) !== "active") entity.status = unquote(status) as Entity["status"];
    const supersededBy = pairs.find(([p]) => p === "oo:supersededBy")?.[1];
    if (supersededBy) entity.supersededBy = compact(supersededBy);

    entities.push(entity);
  }

  return { entities, claims, unsupported };
}

interface Block {
  subject: string;
  pairs: Array<[string, string]>;
}

/** Split the profile's `subject\n  predicate object ;\n …  .` blocks. */
function splitBlocks(turtle: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (const raw of turtle.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("@prefix")) continue;

    if (!raw.startsWith(" ")) {
      if (current) blocks.push(current);
      current = { subject: line.replace(/\s*[;.]$/, ""), pairs: [] };
      continue;
    }
    if (!current) continue;

    const body = line.replace(/\s*[;.]$/, "");
    const space = body.indexOf(" ");
    if (space < 0) continue;
    current.pairs.push([body.slice(0, space), body.slice(space + 1).trim()]);
  }

  if (current) blocks.push(current);
  // Plain triples re-state an asserted claim, so drop those single-pair blocks.
  return blocks.filter((block) => block.pairs.some(([p]) => p === "a" || p === "rdf:type"));
}

function literal(value: string): string {
  return JSON.stringify(String(value));
}

function typed(value: string, datatype: string): string {
  return `${JSON.stringify(value)}^^${datatype}`;
}

function valueTerm(object: { value: unknown; language?: string }): string {
  if (object.language) return `${JSON.stringify(String(object.value))}@${object.language}`;
  if (typeof object.value === "number") return `${JSON.stringify(String(object.value))}^^xsd:double`;
  if (typeof object.value === "boolean") return `${JSON.stringify(String(object.value))}^^xsd:boolean`;
  return literal(String(object.value));
}

function unquote(term: string): string {
  const match = /^"((?:[^"\\]|\\.)*)"/.exec(term.trim());
  if (!match) return term.trim();
  return JSON.parse(`"${match[1]}"`) as string;
}

function parseLiteral(term: string): unknown {
  const text = unquote(term);
  if (term.includes("^^xsd:double") || term.includes("^^xsd:integer")) return Number(text);
  if (term.includes("^^xsd:boolean")) return text === "true";
  return text;
}

function extraFields(object: Record<string, unknown>, lossless: Set<string>): string[] {
  return Object.keys(object).filter((key) => !lossless.has(key) && object[key] !== undefined);
}
