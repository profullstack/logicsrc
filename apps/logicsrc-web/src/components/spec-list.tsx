import Link from "next/link";
import type { ReactNode } from "react";
import { familyTree, type Family, type Spec } from "@/lib/specs";

const row: React.CSSProperties = { padding: "1rem 0", borderTop: "1px solid #e3e6e0" };
const title: React.CSSProperties = { margin: "0 0 0.3rem", fontSize: "1.15rem", color: "#101418" };
const line: React.CSSProperties = { color: "#41505d", margin: 0 };
const links: React.CSSProperties = { display: "flex", gap: "0.9rem", marginTop: "0.4rem", fontSize: "0.9rem" };
const child: React.CSSProperties = { padding: "0.55rem 0 0.55rem 1.25rem", borderLeft: "2px solid #e3e6e0", marginLeft: "0.25rem" };

function SpecLinks({ spec }: { spec: Spec }): ReactNode {
  return (
    <span style={links}>
      {spec.landing ? <Link href={spec.landing}>Overview</Link> : null}
      {spec.doc ? <Link href={spec.doc}>Specification</Link> : null}
      {spec.status === "soon" ? <span style={{ color: "#5b6b7a" }}>coming soon</span> : null}
    </span>
  );
}

/** A family's specs, top-level ones first, each with the blocks that nest under it. */
export function SpecList({ family }: { family: Family }): ReactNode {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {familyTree(family).map(({ spec, children }) => (
        <li key={spec.slug} style={row}>
          <h3 style={title}>
            <Link href={spec.landing ?? spec.doc ?? "#"} style={{ color: "inherit", textDecoration: "none" }}>
              {spec.name}
            </Link>
          </h3>
          <p style={line}>{spec.line}.</p>
          <SpecLinks spec={spec} />
          {children.length > 0 ? (
            <ul style={{ listStyle: "none", margin: "0.6rem 0 0", padding: 0 }}>
              {children.map((c) => (
                <li key={c.slug} style={child}>
                  <strong style={{ color: "#101418" }}>
                    <Link href={c.landing ?? c.doc ?? "#"} style={{ color: "inherit", textDecoration: "none" }}>
                      {c.name}
                    </Link>
                  </strong>
                  <span style={{ color: "#41505d" }}>: {c.line}.</span>
                  <SpecLinks spec={c} />
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
