import Link from "next/link";
import type { ReactNode } from "react";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../app/openontology/ui";

/**
 * One landing page shape for the specifications that are a section of
 * OpenProfile.md (OpenBroadcast, OpenGuest). The section lives in the
 * person's profile file; the page says what the section's keys mean and
 * what the other half is.
 */

export type ProfileSection = {
  name: string;
  slug: string;
  /** The `## Heading` in the profile. */
  section: string;
  tagline: string;
  problem: ReactNode;
  /** The example section, Markdown. */
  sample: string;
  /** Key, values, meaning. */
  keys: Array<[string, string, string]>;
  /** How a platform matches this section against its counterpart. */
  matching: string;
  absent: Array<[string, string]>;
  /** The other half: name and slug. */
  counterpart: [string, string];
};

export function ProfileSectionPage({ spec }: { spec: ProfileSection }): ReactNode {
  const [otherName, otherSlug] = spec.counterpart;
  return (
    <SiteShell active={spec.name}>
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface · OpenProfile.md section</p>
          <h2>{spec.name}</h2>
          <p>{spec.tagline}</p>
        </div>
        <p style={{ color: "#41505d" }}>{spec.problem}</p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. A <code style={mono}>## {spec.section}</code> section in a person&apos;s or
          a show&apos;s <Link href="/openprofile">OpenProfile.md</Link>, matched against{" "}
          <Link href={`/${otherSlug}`}>{otherName}</Link>. Every key is optional and kept as
          written; what is not written is unstated, and a platform never fills it in.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The section</h2>
        </div>
        <pre style={pre}>{spec.sample}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The keys</h2>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Key</th>
              <th style={th}>Values</th>
              <th style={th}>Meaning</th>
            </tr>
          </thead>
          <tbody>
            {spec.keys.map(([key, values, meaning]) => (
              <tr key={key}>
                <td style={td}>
                  <code style={mono}>{key}</code>
                </td>
                <td style={td}>{values}</td>
                <td style={td}>{meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Matching</h2>
        </div>
        <p style={{ color: "#41505d" }}>{spec.matching}</p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>What is deliberately absent</h2>
        </div>
        <table style={table}>
          <tbody>
            {spec.absent.map(([what, why]) => (
              <tr key={what}>
                <td style={td}>
                  <strong>{what}</strong>
                </td>
                <td style={td}>{why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Where everything lives</h2>
        </div>
        <ul style={{ color: "#41505d", lineHeight: 1.9, paddingLeft: "1.1rem" }}>
          <li>
            <Link href={`/docs/${spec.slug}`}>Specification</Link>: the section, every key,
            matching, discovery
          </li>
          <li>
            <Link href={`/${otherSlug}`}>{otherName}</Link>: the other half of the
            broadcaster-and-guest framework
          </li>
          <li>
            <Link href="/openprofile">OpenProfile.md</Link>: the file the section lives in, found
            at <code style={mono}>/.well-known/openprofile.md</code> or through{" "}
            <code style={mono}>rel=&quot;openprofile&quot;</code>
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
