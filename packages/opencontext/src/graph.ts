/**
 * The context graph.
 *
 * Relationships are what turn a folder of documents into something you can
 * reason about: which policy supersedes which, what a decision was based on,
 * who owns a cluster of knowledge, and which objects nothing points at. The
 * graph is also how orphan detection and impact analysis get their answers.
 */

import type { ContextStore, LoadedObject } from "./types.js";
import { parseRef } from "./ids.js";

export type EdgeKind =
  | "references"
  | "depends_on"
  | "supersedes"
  | "superseded_by"
  | "conflicts_with"
  | "owns"
  | "sourced_from"
  | "applies_to";

export interface GraphNode {
  id: string;
  type: string;
  layer?: string;
  authority?: string;
  owner?: string;
  title?: string;
  /** Node exists only as the target of an edge — a dangling reference. */
  missing?: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface ContextGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphOptions {
  /** Limit to a subtree rooted at these ids. */
  roots?: string[];
  depth?: number;
  /** Include owner and source nodes, not only object-to-object edges. */
  includeOwners?: boolean;
  includeSources?: boolean;
}

export function buildGraph(store: ContextStore, options: GraphOptions = {}): ContextGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  const ensure = (id: string, entry?: LoadedObject): void => {
    if (nodes.has(id)) return;
    if (entry) {
      nodes.set(id, {
        id,
        type: entry.object.type,
        layer: entry.object.layer,
        authority: entry.object.authority,
        owner: entry.object.owner,
        title: entry.object.title
      });
    } else {
      nodes.set(id, { id, type: "unknown", missing: true });
    }
  };

  for (const entry of store.objects) {
    ensure(entry.object.id, entry);
  }

  const link = (from: string, ref: string, kind: EdgeKind): void => {
    const parsed = parseRef(ref);
    if (!parsed) return;
    if (!nodes.has(parsed.id)) ensure(parsed.id, store.byId.get(parsed.id)?.at(-1));
    edges.push({ from, to: parsed.id, kind });
  };

  for (const entry of store.objects) {
    const object = entry.object;
    for (const ref of object.references ?? []) link(object.id, ref, "references");
    for (const ref of object.depends_on ?? []) link(object.id, ref, "depends_on");
    for (const ref of object.supersedes ?? []) link(object.id, ref, "supersedes");
    for (const ref of object.conflicts_with ?? []) link(object.id, ref, "conflicts_with");
    if (object.superseded_by) link(object.id, object.superseded_by, "superseded_by");

    if (options.includeOwners && object.owner) {
      const ownerId = `owner:${object.owner}`;
      if (!nodes.has(ownerId)) nodes.set(ownerId, { id: ownerId, type: "owner", title: object.owner });
      edges.push({ from: ownerId, to: object.id, kind: "owns" });
    }

    if (options.includeSources) {
      for (const source of object.sources ?? []) {
        const sourceId = `source:${source.uri}`;
        if (!nodes.has(sourceId)) nodes.set(sourceId, { id: sourceId, type: "source", title: source.uri });
        edges.push({ from: object.id, to: sourceId, kind: "sourced_from" });
      }
    }
  }

  let graph: ContextGraph = {
    nodes: [...nodes.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
    edges: edges.sort((a, b) => `${a.from}${a.kind}${a.to}`.localeCompare(`${b.from}${b.kind}${b.to}`))
  };

  if (options.roots && options.roots.length > 0) {
    graph = subgraph(graph, options.roots, options.depth ?? 2);
  }

  return graph;
}

/** Everything within `depth` hops of `roots`, in either direction. */
export function subgraph(graph: ContextGraph, roots: string[], depth: number): ContextGraph {
  const keep = new Set(roots);
  let frontier = new Set(roots);

  for (let step = 0; step < depth; step += 1) {
    const next = new Set<string>();
    for (const edge of graph.edges) {
      if (frontier.has(edge.from) && !keep.has(edge.to)) next.add(edge.to);
      if (frontier.has(edge.to) && !keep.has(edge.from)) next.add(edge.from);
    }
    if (next.size === 0) break;
    for (const id of next) keep.add(id);
    frontier = next;
  }

  return {
    nodes: graph.nodes.filter((node) => keep.has(node.id)),
    edges: graph.edges.filter((edge) => keep.has(edge.from) && keep.has(edge.to))
  };
}

const EDGE_STYLE: Record<EdgeKind, string> = {
  references: 'color="#6b7280"',
  depends_on: 'color="#2563eb"',
  supersedes: 'color="#7c3aed",style=bold',
  superseded_by: 'color="#7c3aed",style=dashed',
  conflicts_with: 'color="#dc2626",style=bold',
  owns: 'color="#059669",style=dotted',
  sourced_from: 'color="#9ca3af",style=dotted',
  applies_to: 'color="#6b7280",style=dashed'
};

export function renderDot(graph: ContextGraph): string {
  const lines: string[] = ["digraph opencontext {", "  rankdir=LR;", '  node [shape=box,fontname="Helvetica"];'];

  for (const node of graph.nodes) {
    const label = node.title ? `${node.id}\\n${node.title}` : node.id;
    const attrs = node.missing
      ? 'style="dashed",color="#dc2626"'
      : node.authority === "canonical"
        ? 'style="filled",fillcolor="#e0e7ff"'
        : "";
    lines.push(`  ${quote(node.id)} [label=${quote(label)}${attrs ? `,${attrs}` : ""}];`);
  }

  for (const edge of graph.edges) {
    lines.push(`  ${quote(edge.from)} -> ${quote(edge.to)} [label=${quote(edge.kind)},${EDGE_STYLE[edge.kind]}];`);
  }

  lines.push("}");
  return `${lines.join("\n")}\n`;
}

export function renderGraphText(graph: ContextGraph): string {
  const lines: string[] = [];
  const outgoing = new Map<string, GraphEdge[]>();
  for (const edge of graph.edges) {
    const list = outgoing.get(edge.from);
    if (list) list.push(edge);
    else outgoing.set(edge.from, [edge]);
  }

  for (const node of graph.nodes) {
    const edges = outgoing.get(node.id) ?? [];
    const marker = node.missing ? " (missing)" : "";
    lines.push(`${node.id}${marker}${node.title ? `  — ${node.title}` : ""}`);
    for (const edge of edges) {
      lines.push(`  ${edge.kind.padEnd(16)} -> ${edge.to}`);
    }
  }

  if (lines.length === 0) lines.push("(no context objects)");
  return `${lines.join("\n")}\n`;
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}
