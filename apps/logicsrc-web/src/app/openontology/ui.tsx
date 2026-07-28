import type { CSSProperties, ReactNode } from "react";

/** Shared presentation for the OpenOntology explorer. */

export const card: CSSProperties = {
  border: "1px solid #e3e6e0",
  borderRadius: "0.6rem",
  padding: "0.9rem 1.05rem",
  background: "#fff"
};

export const mono: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.85rem"
};

export const table: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.92rem"
};

export const th: CSSProperties = {
  textAlign: "left",
  padding: "0.5rem 0.75rem 0.5rem 0",
  borderBottom: "1px solid #d7dbd4",
  color: "#5b6b7a",
  fontWeight: 600,
  whiteSpace: "nowrap"
};

export const td: CSSProperties = {
  padding: "0.5rem 0.75rem 0.5rem 0",
  borderBottom: "1px solid #eceee9",
  verticalAlign: "top"
};

export const pre: CSSProperties = {
  ...mono,
  background: "#101418",
  color: "#e8eef5",
  padding: "1rem 1.1rem",
  borderRadius: "0.6rem",
  overflowX: "auto",
  lineHeight: 1.6,
  margin: 0
};

export const CLAIM_STATUS: Array<{ id: string; label: string; glyph: string; meaning: string }> = [
  { id: "asserted", label: "asserted", glyph: "✓", meaning: "Current accepted view" },
  { id: "proposed", label: "proposed", glyph: "?", meaning: "Suggested, not accepted" },
  { id: "disputed", label: "disputed", glyph: "!", meaning: "Contradicted" },
  { id: "retracted", label: "retracted", glyph: "×", meaning: "Withdrawn, kept on record" },
  { id: "superseded", label: "superseded", glyph: "→", meaning: "Replaced by a later claim" },
  { id: "derived", label: "derived", glyph: "ƒ", meaning: "Produced by a rule" }
];

const TONE: Record<string, { fg: string; bg: string; glyph: string }> = {
  asserted: { fg: "#14532d", bg: "#dcfce7", glyph: "✓" },
  active: { fg: "#14532d", bg: "#dcfce7", glyph: "✓" },
  applied: { fg: "#14532d", bg: "#dcfce7", glyph: "✓" },
  proposed: { fg: "#1e3a8a", bg: "#dbeafe", glyph: "?" },
  disputed: { fg: "#7c2d12", bg: "#ffedd5", glyph: "!" },
  retracted: { fg: "#7f1d1d", bg: "#fee2e2", glyph: "×" },
  rejected: { fg: "#7f1d1d", bg: "#fee2e2", glyph: "×" },
  superseded: { fg: "#3f3f46", bg: "#e4e4e7", glyph: "→" },
  merged: { fg: "#3f3f46", bg: "#e4e4e7", glyph: "→" },
  derived: { fg: "#4c1d95", bg: "#ede9fe", glyph: "ƒ" },
  archived: { fg: "#3f3f46", bg: "#e4e4e7", glyph: "▪" }
};

/**
 * Status badge.
 *
 * Colour is never the only signal: every badge carries a glyph and the word,
 * so it survives a monochrome screen and a colour-blind reader.
 */
export function StatusBadge({ status }: { status: string }): ReactNode {
  const tone = TONE[status] ?? { fg: "#3f3f46", bg: "#e4e4e7", glyph: "·" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        padding: "0.1rem 0.45rem",
        borderRadius: "0.35rem",
        background: tone.bg,
        color: tone.fg,
        fontSize: "0.8rem",
        fontWeight: 600,
        whiteSpace: "nowrap"
      }}
    >
      <span aria-hidden="true">{tone.glyph}</span>
      {status}
    </span>
  );
}

/** Confidence with its number spelled out — never a bare bar. */
export function Confidence({ value }: { value?: number }): ReactNode {
  if (value === undefined) return <span style={{ color: "#8a949e" }}>not stated</span>;
  return (
    <span title="Confidence is metadata, not proof">
      {value.toFixed(2)}
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: "3rem",
          height: "0.4rem",
          marginLeft: "0.4rem",
          borderRadius: "0.2rem",
          background: "#e4e4e7",
          verticalAlign: "middle"
        }}
      >
        <span
          style={{
            display: "block",
            width: `${Math.round(value * 100)}%`,
            height: "100%",
            borderRadius: "0.2rem",
            background: "#5b6b7a"
          }}
        />
      </span>
    </span>
  );
}

export function formatObject(object: { entity?: string; value?: unknown }): string {
  if (object.entity) return object.entity;
  return typeof object.value === "string" ? object.value : JSON.stringify(object.value);
}
