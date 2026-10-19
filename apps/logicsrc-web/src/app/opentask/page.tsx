import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { specMetadata } from "@/lib/page-meta";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";
import { ACTIONS, RULES, SENSITIVITY } from "./data";

export const metadata: Metadata = specMetadata(
  "/opentask",
  "OpenTask is one JSON file that describes a task a person does on a computer so an agent can do it again: the goal, the apps, the parameters and how sensitive each is, the steps as meaning rather than coordinates, where a runner stops, what it asks before doing, and how to tell the task worked."
);

const EXCERPT = `"parameters": [
  { "name": "task_title", "description": "The title of the reviewed task to export",
    "sensitivity": "public", "example": "Empty the trash" }
],
"steps": [
  { "n": 2, "action": "click", "app": "TronBrowser",
    "target": { "role": "link", "name": "{{task_title}}" }, "evidence": "inferred" },
  { "n": 3, "action": "click", "app": "TronBrowser",
    "target": { "role": "button", "name": "Export as moshscript" }, "evidence": "inferred" }
],
"stop_conditions": ["an unexpected dialog appears", "a credential or payment prompt appears"],
"approvals": ["before typing a confirmation code"],
"success": { "check": "A .mosh file named after the task is in Downloads.", "evidence": "artifact" }`;

export default function OpenTaskPage(): ReactNode {
  return (
    <SiteShell active="OpenTask">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenTask</h2>
          <p>
            One JSON file that describes a task a person does on a computer, written down so an
            agent can do it again: the goal, the apps, the values it needs, the steps as meaning
            (focus this window, press this button, type this value), where an agent must stop and
            what it must ask before doing. A person reads it and knows what an agent will try. An
            agent reads the same file, looks at the screen before every action and stops where the
            file says to.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          Agents that drive a desktop learn from demonstrations, and every recorder keeps its own
          format. The formats that travel are replays: clicks at pixel positions and the keystrokes
          typed. A replay breaks when a window moves, does something else when the screen differs,
          and carries every password the person typed. It cannot say &quot;stop if a payment prompt
          appears&quot;, because it never knew what was on the screen. OpenTask keeps the meaning
          and drops the rest: no coordinates, no typed text, only named parameters.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. The reference publisher is W3BS Training: it records a demonstration, a
          person reviews it, and the reviewed task is published as an OpenTask at{" "}
          <a href="https://w3bs.org/tasks">w3bs.org/tasks</a>. A task can name the runners that
          carry it out; moshscript, run with <code style={mono}>moshcode run</code>, is one. An
          excerpt of the worked example, a task demonstrated in W3BS Training:
        </p>
        <pre style={pre}>{EXCERPT}</pre>
        <p style={{ color: "#5b6b7a" }}>
          The whole file is served at{" "}
          <a href="/examples/opentask/export-a-task-as-moshscript.json">
            <code style={mono}>/examples/opentask/export-a-task-as-moshscript.json</code>
          </a>
          .
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Steps without coordinates</h2>
          <p>
            A step names what it acted on: an app, a window, a control&apos;s role and visible
            name. A file that carries <code style={mono}>x</code>, <code style={mono}>y</code> or a
            bounding box is invalid, and typed text is always a{" "}
            <code style={mono}>{"{{placeholder}}"}</code>. Each step says whether the recorder{" "}
            <code style={mono}>observed</code> it or someone <code style={mono}>inferred</code> it.
            The actions:
          </p>
        </div>
        <p>
          {ACTIONS.map((action, i) => (
            <span key={action}>
              {i > 0 ? " " : null}
              <code style={mono}>{action}</code>
            </span>
          ))}
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Parameters</h2>
          <p>A parameter names a value, never holds one. Its sensitivity decides where it may go.</p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>class</th>
              <th style={th}>meaning</th>
            </tr>
          </thead>
          <tbody>
            {SENSITIVITY.map(([name, what]) => (
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
          <p>Seven rules, the same for an agent with a desktop tool, a moshscript or an MCP server.</p>
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
          <h2>Not</h2>
        </div>
        <p style={{ color: "#41505d" }}>
          Not a replay and not a recording: the recording never travels with the file. Not a place
          for anyone&apos;s data: a personal or secret parameter never has an example, and window
          titles are removed unless a person kept each one. Not a website errand filled field by
          field in a headless browser; that is <Link href="/openerrand">OpenErrand</Link>. Not the{" "}
          <code style={mono}>logicsrc.task</code> schema, which is a paid task on a work board.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Where everything lives</h2>
        </div>
        <ul style={{ color: "#41505d", lineHeight: 1.9, paddingLeft: "1.1rem" }}>
          <li>
            <Link href="/docs/opentask">Specification</Link>: the task file, parameters, steps,
            window titles, capture, source, runners, seven runner rules, publishing and a worked
            example
          </li>
          <li>
            JSON Schema <code style={mono}>@logicsrc/schemas/opentask</code>, checked by{" "}
            <code style={mono}>@logicsrc/validators</code>
          </li>
          <li>
            <Link href="/openworkflow">OpenWorkflow</Link>, a collection of OpenTasks;{" "}
            <Link href="/openerrand">OpenErrand</Link>, the sibling for one errand on a website
            with no API
          </li>
          <li>
            Published tasks: <a href="https://w3bs.org/tasks">w3bs.org/tasks</a>
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
