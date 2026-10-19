import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { specMetadata } from "@/lib/page-meta";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";
import { ORDERS, RULES } from "./data";

export const metadata: Metadata = specMetadata(
  "/openworkflow",
  "OpenWorkflow is one JSON file that collects OpenTasks into a workflow, such as releasing a package, each task inline or referenced by URL and digest, in sequence or with dependencies, and listed by its publisher at /.well-known/openworkflow.json."
);

const EXCERPT = `"order": "sequence",
"tasks": [
  { "url": "https://w3bs.org/tasks/tk_4Hq8sP1x.json",
    "sha256": "3f1b5c0e9a0e4d7b8c2a6f5d4e3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a",
    "id": "bump-the-version", "title": "Bump the version" },
  { "url": "https://w3bs.org/tasks/tk_Lm2Rt7vQ.json",
    "sha256": "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    "id": "write-the-changelog", "title": "Write the changelog",
    "after": ["bump-the-version"] }
]`;

export default function OpenWorkflowPage(): ReactNode {
  return (
    <SiteShell active="OpenWorkflow">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenWorkflow</h2>
          <p>
            One JSON file that collects <Link href="/opentask">OpenTasks</Link> into a workflow: a
            named set of tasks a person does together, such as releasing a package or closing the
            month, in the order they do them or in any order. Each task is carried inline or
            referenced by URL with its digest, so one workflow can gather tasks from more than one
            publisher without copying them.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          One task is rarely the job. A release is a version bump in a terminal, a changelog in an
          editor and an announcement in a browser, with the second waiting on the first. Without a
          collection, a person hands an agent three files and explains the order in chat, and the
          next person has to be told again. A workflow file is that explanation written down.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. The reference publisher is <a href="https://w3bs.org/workflows">w3bs.org/workflows</a>:
          W3BS Training publishes reviewed demonstrations as OpenTasks at{" "}
          <a href="https://w3bs.org/tasks">w3bs.org/tasks</a> and gathers them into workflows. Each
          task runs under the OpenTask rules, by any conforming agent or a runner the task names,
          such as a moshscript run with <code style={mono}>moshcode run</code>. An excerpt of the
          worked example:
        </p>
        <pre style={pre}>{EXCERPT}</pre>
        <p style={{ color: "#5b6b7a" }}>
          The whole file is served at{" "}
          <a href="/examples/openworkflow/release-a-package.json">
            <code style={mono}>/examples/openworkflow/release-a-package.json</code>
          </a>
          .
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Order and references</h2>
          <p>
            Any entry may add <code style={mono}>after</code>, the ids of earlier entries that must
            finish first, and <code style={mono}>optional: true</code>, which lets a person skip it.
            A referenced task must hash to its <code style={mono}>sha256</code>, so a workflow
            someone reviewed cannot change underneath them.
          </p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>order</th>
              <th style={th}>meaning</th>
            </tr>
          </thead>
          <tbody>
            {ORDERS.map(([name, what]) => (
              <tr key={name}>
                <td style={td}>
                  <code style={mono}>{name}</code>
                </td>
                <td style={td}>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>What a runner promises</h2>
          <p>
            Every <Link href="/docs/opentask#runner-rules">OpenTask runner rule</Link> for each
            task, and five more for the workflow:
          </p>
        </div>
        <table style={table}>
          <tbody>
            {RULES.map(([rule, meaning], i) => (
              <tr key={rule}>
                <td style={td}>
                  <strong>
                    {i + 1}. {rule}
                  </strong>
                </td>
                <td style={td}>{meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Discovery</h2>
          <p>
            A publisher lists its workflows at{" "}
            <code style={mono}>/.well-known/openworkflow.json</code>, each with its id, title and
            number of tasks. This site publishes the worked example at{" "}
            <a href="/.well-known/openworkflow.json">
              <code style={mono}>/.well-known/openworkflow.json</code>
            </a>
            .
          </p>
        </div>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Where everything lives</h2>
        </div>
        <ul style={{ color: "#41505d", lineHeight: 1.9, paddingLeft: "1.1rem" }}>
          <li>
            <Link href="/docs/openworkflow">Specification</Link>: the workflow file, inline and
            referenced entries, five runner rules, the index and publishing
          </li>
          <li>
            JSON Schemas <code style={mono}>@logicsrc/schemas/openworkflow</code> and{" "}
            <code style={mono}>openworkflow-index</code>, checked by{" "}
            <code style={mono}>@logicsrc/validators</code>
          </li>
          <li>
            <Link href="/opentask">OpenTask</Link>, the task each entry is;{" "}
            <Link href="/openerrand">OpenErrand</Link>, an errand on one website with no API
          </li>
          <li>
            Published workflows: <a href="https://w3bs.org/workflows">w3bs.org/workflows</a>
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
