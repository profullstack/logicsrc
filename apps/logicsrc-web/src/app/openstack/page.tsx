import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = {
  title: "OpenStack.md · LogicSRC",
  description:
    "OpenStack.md is one Markdown file that says what a piece of software is built on: languages, runtimes, every interface and what each is made of, data, services, tooling, hosting, the rules, and what it must never depend on. Read by a person in a minute, by an agent in one prompt, and inherited by the next project through Extends.",
  alternates: { canonical: "/openstack" }
};

const FILE = `# LogicSRC

- **Kind**: monorepo
- **Web**: https://logicsrc.com
- **Repo**: https://github.com/profullstack/logicsrc
- **Operator**: https://logicsrc.com/.well-known/openprofile.md
- **License**: MIT
- **Updated**: 2026-09-21

Open coordination standards for humans and AI agents, with the
reference implementation of each standard beside its text.

## Languages

- TypeScript 5.9: everything, as ES modules with \`.js\` specifiers in source

## Runtimes

- Node 24: the CLI, the MCP server, the TUI, the API and the web app's server

## Interfaces

### Web

- Next.js 16 (App Router): logicsrc.com, the specs and the blog
- React 19

### CLI

- @logicsrc/cli: \`logicsrc\`, every standard and tool as one command

### MCP

- @profullstack/logicsrc-mcp: the standards as tools, on @modelcontextprotocol/sdk 1

## Data

- Postgres (Supabase): the blog and CommandBoard
- libSQL (Turso): the credentials app

## Tooling

- npm 11 workspaces
- vitest 4: unit and contract tests

## Not

- No ORM: SQL is written by hand`;

const CHILD = `# nixamp

- **Kind**: product
- **Web**: https://nixamp.com
- **Extends**: https://profullstack.com/.well-known/openstack.md
- **Updated**: 2026-09-21

Free radio and live streams, no account needed.

## Data

- libSQL (Turso): channels, recordings and playlists

## Interfaces

### Web

- Next.js 16 (App Router)
- @profullstack/player: the player

## Not

- No client-side analytics: the stats script is enough`;

const ITEM = `- Name version (status): role

- Next.js 16 (App Router): logicsrc.com, the specs and the blog
- Playwright 1.57: end to end
- Redis (hold): the old session store, nothing new goes here
- Bun 1 (trial): the worker, to see if it holds up`;

const LAYERS: Array<[string, string]> = [
  ["Languages", "Every language source is written in, human or query."],
  ["Runtimes", "What executes it: a Node or Bun major, a browser, Deno, Electron, an edge runtime."],
  ["Interfaces", "Every way in, one ### each: web, api, cli, tui, mcp, desktop, mobile, worker, extension, bot, library."],
  ["Data", "Where state lives: databases, caches, queues, object stores, files."],
  ["Services", "Third parties the running software calls: payments, email, search, models, analytics."],
  ["Modules", "The packages the project treats as its own foundation: a house library, a shared kit."],
  ["Tooling", "What builds, tests, lints and ships it: package manager, bundler, test runner, CI."],
  ["Hosting", "Where it runs and how it is deployed."],
  ["Auth", "How a person or an agent signs in."],
  ["Conventions", "The rules the code follows that a reader could not infer."],
  ["Not", "What the project must not depend on, and why when the why is short."]
];

const READER: Array<[string, string]> = [
  ["Use what is listed", "At the versions listed, for what the role says."],
  ["Prefer a listed item", "Over a new one that does the same job. A project with vitest listed gets its tests in vitest."],
  ["Ask before adding a layer or a service", "A new database, a new third party, a new runtime is the author's decision. A small package inside an existing layer is ordinary work."],
  ["Never add anything under Not", "And never build new work on an item marked hold or leaving."],
  ["Keep the file true", "An agent that adds something, with permission, adds the bullet."]
];

const ABSENT: Array<[string, string]> = [
  ["No inventory", "A stack is the things a maintainer would name, not the lockfile. A project that needs the closure has an SBOM; this is the other file."],
  ["No pins", "A version is what the code is written against. The manifest holds the exact one, and it changes every week."],
  ["No detection", "The file is what the project says. A scanner guesses; this does not. A directory may compare the two."],
  ["No verification", "Nothing checks that a project uses what it lists. The author is the one who has to build on it."],
  ["No registry", "A stack is a file on a site or in a repository. A directory is optional."],
  ["No scoring", "The file says what is used, not whether that was wise."]
];

export default function OpenStackPage(): ReactNode {
  return (
    <SiteShell active="OpenStack.md">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenStack.md</h2>
          <p>
            One Markdown file that says what a piece of software is built on. The languages, the
            runtimes, every interface and what each is made of, the data, the services, the
            tooling, the hosting, the rules, and what it must never depend on. Read by a person in
            a minute, by an agent in one prompt, and inherited by the next project.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          Every project has a stack and nowhere to say it. The lockfile lists nine hundred
          packages and cannot tell the twelve that matter from the rest. The README says
          &quot;built with Next.js&quot; and stops. An agent handed the repository guesses the
          framework from the imports, guesses the database from a connection string, and adds a
          dependency the team took out last year, because nothing in the repository said not to.
          And a team that has settled its stack well cannot hand it to the next project except by
          copying a repository and deleting most of it.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. This site serves its own at{" "}
          <a href="/.well-known/openstack.md">/.well-known/openstack.md</a>, and that file is the
          worked example in the specification.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The file</h2>
          <p>
            <code style={mono}>OpenStack.md</code> beside the README, and{" "}
            <code style={mono}>/.well-known/openstack.md</code> on the site. One heading, an identity
            block, one line, then the layers. Abridged here; the whole file is at the link above.
          </p>
        </div>
        <pre style={pre}>{FILE}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>An item</h2>
          <p>
            One bullet per thing: the name as its maintainers spell it, the major the code is
            written against, one status word when it is not simply in use, and the role, which is
            the part no manifest has.
          </p>
        </div>
        <pre style={pre}>{ITEM}</pre>
        <p style={{ color: "#41505d" }}>
          <code style={mono}>trial</code> is being tried in one place, <code style={mono}>hold</code>{" "}
          is still present but nothing new goes on it, <code style={mono}>leaving</code> is on its way
          out. Absent means in use: build with it. A version is not a pin; the manifest holds the pin.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Eleven layers</h2>
          <p>
            Fixed section names, matched loosely, any order, every one optional. Interfaces get a{" "}
            <code style={mono}>###</code> each and may carry their own layers when one differs from
            the rest.
          </p>
        </div>
        <table style={table}>
          <tbody>
            {LAYERS.map(([name, what]) => (
              <tr key={name}>
                <td style={td}>
                  <strong>{name}</strong>
                </td>
                <td style={td}>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Extends: how a stack is shared</h2>
          <p>
            A house publishes one file. Every project under it names the parent and writes the ten
            lines that differ. A section the child writes replaces the parent&apos;s;{" "}
            <code style={mono}>Conventions</code> and <code style={mono}>Not</code> accumulate, so a
            rule a parent set cannot be silently unset.
          </p>
        </div>
        <pre style={pre}>{CHILD}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>What a reader owes the file</h2>
          <p>
            This is the rule for agents, and the reason the file exists. A person shares a stack
            by pasting the file or pointing at its URL; a repository&apos;s AGENTS.md says{" "}
            <code style={mono}>Stack: see OpenStack.md</code> once instead of restating it.
          </p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>rule</th>
              <th style={th}>meaning</th>
            </tr>
          </thead>
          <tbody>
            {READER.map(([rule, meaning]) => (
              <tr key={rule}>
                <td style={td}>
                  <strong>{rule}</strong>
                </td>
                <td style={td}>{meaning}</td>
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
            {ABSENT.map(([what, why]) => (
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
            <Link href="/docs/openstack">Specification</Link>: the file, the identity block, the
            eleven layers, interfaces, the item grammar, inheritance, the reading rule for agents,
            discovery, the derived JSON, what a directory owes a project
          </li>
          <li>
            <a href="/.well-known/openstack.md">logicsrc.com/.well-known/openstack.md</a>: this
            site&apos;s own file, the first one served
          </li>
          <li>
            <Link href="/openprd">OpenPRD</Link>, whose Tech Stack section can now say &quot;see
            OpenStack.md&quot;; <Link href="/openprofile">OpenProfile.md</Link>, the operator behind
            a project; <Link href="/docs/openserver">OpenServer</Link>, what a hosting provider
            sells where this says what a project bought
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
