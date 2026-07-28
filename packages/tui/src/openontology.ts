import { validateOntologyPackage, type OntologyEngine, type ValidationReport } from "@logicsrc/openontology";

/**
 * Keyboard-first OpenOntology panels.
 *
 * Rendered as plain strings so they work over SSH, in tmux, in a narrow
 * terminal, and in tests. Graph diagrams are optional in the standard; lists,
 * trees, and paths are what this shows.
 */

export type OntologyPanel = "types" | "entities" | "claims" | "sources" | "queries" | "changesets" | "violations" | "audit";

export const PANEL_KEYS: Array<{ key: string; panel: OntologyPanel | "quit" | "search"; label: string }> = [
  { key: "/", panel: "search", label: "search" },
  { key: "t", panel: "types", label: "types" },
  { key: "e", panel: "entities", label: "entities" },
  { key: "c", panel: "claims", label: "claims" },
  { key: "s", panel: "sources", label: "sources" },
  { key: "r", panel: "queries", label: "queries" },
  { key: "g", panel: "changesets", label: "change sets" },
  { key: "v", panel: "violations", label: "validate" },
  { key: "a", panel: "audit", label: "audit" },
  { key: "q", panel: "quit", label: "quit" }
];

export interface OntologyTuiOptions {
  panel?: OntologyPanel;
  /** Terminal width. Clamped to a usable minimum. */
  width?: number;
  /** Rows of detail to show. */
  rows?: number;
  selected?: string;
}

const MIN_WIDTH = 60;

export function renderOntologyTui(engine: OntologyEngine, options: OntologyTuiOptions = {}): string {
  const width = Math.max(options.width ?? 78, MIN_WIDTH);
  const rows = options.rows ?? 8;
  const panel = options.panel ?? "entities";
  const manifest = engine.getOntologyManifest();
  const schema = engine.getOntologySchema();

  const lines: string[] = [];
  const inner = width - 2;

  const rule = (left: string, right: string, fill = "─") => `${left}${fill.repeat(inner)}${right}`;
  const row = (text: string) => `│${clip(` ${text}`, inner)}│`;
  const heading = (text: string) => `├${clip(`─ ${text} `, inner, "─")}┤`;

  lines.push(rule("┌", "┐"));
  lines.push(row(`OpenOntology: ${manifest.id}@${manifest.version}   rev ${engine.store.revision()}`));
  // The key bar wraps rather than truncating: a binding you cannot see is a
  // binding you do not have.
  for (const line of wrap(PANEL_KEYS.map((entry) => `${entry.key} ${entry.label}`), inner - 1)) {
    lines.push(row(line));
  }

  lines.push(heading(panelTitle(panel)));
  for (const line of panelBody(engine, panel, { rows, selected: options.selected, width: inner })) {
    lines.push(row(line));
  }

  // Status bar: what needs a human, always visible.
  const changeSets = engine.store.listChangeSets();
  const proposed = changeSets.filter((entry) => entry.status === "proposed").length;
  const conflicted = changeSets.filter((entry) => entry.status === "conflicted").length;
  const report = validate(engine);
  const disputed = engine.store.listClaims({ status: ["disputed"] }).length;

  lines.push(heading("status"));
  lines.push(
    row(
      `${proposed} proposed   ${disputed} disputed   ${conflicted} conflicts   ` +
        `${report.counts.error} errors   ${report.counts.warning} warnings`
    )
  );
  lines.push(row(`${schema.entityTypes.length} types   ${engine.store.listEntities().length} entities   ${engine.store.listClaims({ status: ["asserted"] }).length} asserted claims`));
  lines.push(rule("└", "┘"));

  return lines.join("\n");
}

/**
 * Validate without emitting an event.
 *
 * `engine.validateOntologyPackage()` records a package.validated event, which
 * is right for a CLI run and wrong for a panel that repaints on every keypress:
 * rendering a read-only view must not write to the audit log.
 */
function validate(engine: OntologyEngine): ValidationReport {
  return validateOntologyPackage({
    manifest: engine.getOntologyManifest(),
    schema: engine.getOntologySchema(),
    data: {
      entities: engine.store.listEntities(),
      claims: engine.store.listClaims({
        status: ["asserted", "proposed", "disputed", "retracted", "superseded", "derived"]
      }),
      sources: engine.store.listSources(),
      evidence: engine.store.listEvidence()
    },
    files: []
  });
}

function panelTitle(panel: OntologyPanel): string {
  switch (panel) {
    case "types":
      return "Types";
    case "entities":
      return "Entities";
    case "claims":
      return "Claims";
    case "sources":
      return "Sources";
    case "queries":
      return "Saved queries";
    case "changesets":
      return "Change sets";
    case "violations":
      return "Validation";
    default:
      return "Audit";
  }
}

function panelBody(
  engine: OntologyEngine,
  panel: OntologyPanel,
  view: { rows: number; selected?: string; width: number }
): string[] {
  const { rows } = view;

  switch (panel) {
    case "types": {
      const counts = new Map<string, number>();
      for (const entity of engine.store.listEntities()) {
        counts.set(entity.type, (counts.get(entity.type) ?? 0) + 1);
      }
      return engine
        .getOntologySchema()
        .entityTypes.slice(0, rows)
        .map((type) => `${pad(type.id, 20)} ${String(counts.get(type.id) ?? 0).padStart(5)}  ${type.label}`);
    }

    case "entities": {
      const entities = engine.store.listEntities({ limit: rows });
      return entities.map(
        (entity) =>
          `${statusMark(entity.status ?? "active")} ${pad(entity.canonicalName, 26)} ${pad(entity.type, 14)} ${entity.id}`
      );
    }

    case "claims": {
      const claims = engine.store.listClaims({
        status: ["asserted", "proposed", "disputed", "retracted", "superseded", "derived"],
        limit: rows
      });
      return claims.map((claim) => {
        const object = "entity" in claim.object ? claim.object.entity : JSON.stringify(claim.object.value);
        const confidence = claim.confidence === undefined ? "  — " : claim.confidence.toFixed(2);
        const from = claim.validTime?.from?.slice(0, 10) ?? "—";
        // Status is never conveyed by colour alone: a glyph and the word.
        return `${statusMark(claim.status)} ${pad(claim.status, 10)} ${pad(shorten(claim.subject), 22)} ${pad(claim.predicate, 14)} ${pad(shorten(object), 22)} ${confidence} ${from} src:${claim.sources?.length ?? 0}`;
      });
    }

    case "sources": {
      return engine.store
        .listSources()
        .slice(0, rows)
        .map(
          (source) =>
            `${source.stale ? "!" : "·"} ${pad(source.sourceType, 14)} ${pad(source.license ?? "unknown", 12)} ${source.uri}`
        );
    }

    case "queries": {
      return engine
        .getOntologySchema()
        .queries.slice(0, rows)
        .map((query) => `${pad(query.id, 30)} ${query.description}`);
    }

    case "changesets": {
      const changeSets = engine.store.listChangeSets().slice(0, rows);
      if (changeSets.length === 0) return ["(no change sets in this session)"];
      return changeSets.map((changeSet) => {
        const approvals = engine.store.listApprovals(changeSet.id).length;
        const required = changeSet.requiredApprovals ?? 0;
        return `${statusMark(changeSet.status)} ${pad(changeSet.status, 10)} ${pad(changeSet.title, 34)} ops:${String(changeSet.operations.length).padStart(3)} appr:${approvals}/${required}`;
      });
    }

    case "violations": {
      const report = validate(engine);
      const findings = report.findings.filter((finding) => finding.severity !== "info").slice(0, rows);
      if (findings.length === 0) return ["✓ no errors, warnings, or policy findings"];
      return findings.map(
        (finding) => `${severityMark(finding.severity)} ${pad(finding.code, 24)} ${finding.message}`
      );
    }

    default: {
      const events = engine.listEvents({ limit: rows });
      if (events.length === 0) return ["(no events in this session)"];
      return events.map(
        (event) => `${event.at.slice(0, 19)} ${pad(event.type, 20)} ${pad(event.actor, 20)} ${event.subject ?? ""}`
      );
    }
  }
}

/** Glyphs, not colour, so the status survives a monochrome terminal. */
function statusMark(status: string): string {
  switch (status) {
    case "asserted":
    case "active":
    case "applied":
      return "✓";
    case "proposed":
      return "?";
    case "disputed":
    case "conflicted":
      return "!";
    case "retracted":
    case "rejected":
      return "×";
    case "superseded":
    case "merged":
      return "→";
    case "derived":
      return "ƒ";
    case "archived":
      return "▪";
    default:
      return "·";
  }
}

function severityMark(severity: string): string {
  return severity === "error" ? "✗" : severity === "warning" ? "!" : "·";
}

/** Pack items onto as many lines as the width needs. */
function wrap(items: string[], width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const item of items) {
    const candidate = current ? `${current}  ${item}` : item;
    if (candidate.length > width && current) {
      lines.push(current);
      current = item;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function pad(value: string, width: number): string {
  const text = String(value ?? "");
  return text.length >= width ? `${text.slice(0, Math.max(width - 1, 1))}…` : text.padEnd(width);
}

function clip(value: string, width: number, fill = " "): string {
  const text = value.length > width ? `${value.slice(0, width - 1)}…` : value;
  return text.padEnd(width, fill);
}

/** Compact ids read better in a narrow column without their prefix. */
function shorten(id: string): string {
  const parts = String(id).split(":");
  return parts.length > 2 ? parts.slice(1).join(":") : String(id);
}

/** One-line help for the panel keys, for a footer or `--help`. */
export function renderOntologyKeyHelp(): string {
  return PANEL_KEYS.map((entry) => `${entry.key}: ${entry.label}`).join("   ");
}
