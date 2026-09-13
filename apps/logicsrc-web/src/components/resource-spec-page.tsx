import Link from "next/link";
import type { ReactNode } from "react";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../app/openontology/ui";

/**
 * One landing page shape for the five OpenServer resource specifications
 * (OpenCPU, OpenMemory, OpenDisk, OpenGPU, OpenBandwidth). Each page is
 * the same five bands with different words, so the words live in the page
 * and the bands live here.
 */

export type ResourceSpec = {
  /** Display name, e.g. "OpenCPU". */
  name: string;
  /** URL slug under /docs and /, e.g. "opencpu". */
  slug: string;
  /** The block key on an OpenServer offer, e.g. "compute". */
  block: string;
  /** One line under the title. */
  tagline: string;
  /** Two or three sentences on why the resource needs its own words. */
  problem: ReactNode;
  /** The example block, pretty-printed JSON. */
  sample: string;
  /** The smallest valid block, one line of JSON. */
  smallest: string;
  /** Field name, values, meaning. */
  fields: Array<[string, string, string]>;
  /** What a directory does with the block. */
  directory: Array<[string, string]>;
  /** What is deliberately absent, and why. */
  absent: Array<[string, string]>;
};

const SIBLINGS: Array<[string, string]> = [
  ["OpenCPU", "opencpu"],
  ["OpenMemory", "openmemory"],
  ["OpenDisk", "opendisk"],
  ["OpenGPU", "opengpu"],
  ["OpenBandwidth", "openbandwidth"]
];

export function ResourceSpecPage({ spec }: { spec: ResourceSpec }): ReactNode {
  const wellKnown = `/.well-known/${spec.slug}.json`;
  return (
    <SiteShell active={spec.name}>
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface · OpenServer resource</p>
          <h2>{spec.name}</h2>
          <p>{spec.tagline}</p>
        </div>
        <p style={{ color: "#41505d" }}>{spec.problem}</p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. The <code style={mono}>{spec.block}</code> block of an{" "}
          <Link href="/docs/openserver">OpenServer</Link> offer, written down on its own. A provider
          that sells only this resource lists it as an offer and may serve the same document at{" "}
          <code style={mono}>{wellKnown}</code>. Every rule degrades: the smallest valid block is{" "}
          <code style={mono}>{spec.smallest}</code>.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The {spec.block} block</h2>
          <p>
            Every key is the provider&apos;s claim, in fixed units. <code style={mono}>range</code>{" "}
            is the part a buyer can dial at checkout: the field, its bounds, the step and what a
            step costs.
          </p>
        </div>
        <pre style={pre}>{spec.sample}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Fields</h2>
          <p>Absent means unstated, never a default. A reader says so beside the number.</p>
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
            {spec.fields.map(([key, values, meaning]) => (
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
          <h2>What a directory does with it</h2>
        </div>
        <table style={table}>
          <tbody>
            {spec.directory.map(([what, how]) => (
              <tr key={what}>
                <td style={td}>
                  <strong>{what}</strong>
                </td>
                <td style={td}>{how}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
            <Link href={`/docs/${spec.slug}`}>Specification</Link>: the block, every rule and how
            it degrades, the resource as its own offer, what a directory owes a provider
          </li>
          <li>
            <Link href="/docs/openserver">OpenServer</Link>: the descriptor at{" "}
            <code style={mono}>/.well-known/openserver.json</code> that this block sits in, and the
            directory that reads it
          </li>
          <li>
            The five resources of a purchase:{" "}
            {SIBLINGS.map(([name, slug], i) => (
              <span key={slug}>
                {i > 0 ? ", " : ""}
                {slug === spec.slug ? <strong>{name}</strong> : <Link href={`/${slug}`}>{name}</Link>}
              </span>
            ))}
            , each with the same <code style={mono}>range</code> shape
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
