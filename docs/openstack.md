# OpenStack.md

OpenStack.md is one Markdown file that says what a piece of software is built on: the languages, the runtimes, every interface it has and what each one is made of, the data it keeps, the services it leans on, the tooling, the hosting, the rules, and what it must never depend on. It is written by the people who chose the stack, read by a person in a minute and by an agent in one prompt, and copied by the next project that wants the same stack. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. A description of a file logicsrc.com serves about itself, published so any project can serve one and any agent can read it.

Slug: `openstack`

## The problem

Every project has a stack and nowhere to say it. The lockfile lists nine hundred packages and cannot tell the twelve that matter from the rest. The README says "built with Next.js" and stops. The PRD named the stack once, in a section nobody reopened. An agent handed the repository reads `package.json`, guesses the framework from the imports, guesses the database from a connection string, and then adds a dependency the team took out last year, because nothing in the repository said not to.

The other direction is worse. A team that has settled on a stack, and has settled it well, cannot hand it to the next project except by copying a repository and deleting most of it. A person who wants to tell an agent "build it the way we build things" has to type the way out, every time, from memory.

The pieces exist. Package manifests know the versions. `/.well-known/` is where a site says things about itself. `AGENTS.md` and its cousins are where an agent is told how to behave in a repository. What is missing is the one file that says what the thing is built on, in a shape a person, an agent and a directory all read the same way, that a project can point at instead of restating, and that one project can inherit from another.

## Terms

- A **stack** is what a piece of software is built on, as chosen: the few dozen things a maintainer would name, not the transitive closure of the lockfile.
- A **project** is the thing the file describes: a product, a site, a service, a library, a tool, a monorepo, an agent.
- An **interface** is one way in to the project: a web app, an API, a CLI, a TUI, an MCP server, a desktop app, a mobile app, a worker, a browser extension, a bot. A project has one or many, and each may be built differently.
- A **layer** is one section of the file: languages, runtimes, data, services, and so on.
- An **item** is one bullet in a layer: a thing the project uses, with a version, a status and a role.
- A **reader** is anything that takes a stack from the file by the rules below: a person, an agent, a directory, a scaffold.
- A **parent** is another OpenStack.md this one extends.

## The file

One Markdown file named `OpenStack.md`, beside the README in the repository, and at `/.well-known/openstack.md` on the project's site. This is the file logicsrc.com serves about itself:

```markdown
# LogicSRC

- **Kind**: monorepo
- **Web**: https://logicsrc.com
- **Repo**: https://github.com/profullstack/logicsrc
- **Operator**: https://logicsrc.com/.well-known/openprofile.md
- **License**: MIT
- **Updated**: 2026-09-21

Open coordination standards for humans and AI agents, with the reference implementation of each standard beside its text.

## Languages

- TypeScript 5.9: everything, as ES modules with `.js` specifiers in source
- SQL: Postgres migrations under `supabase/`

## Runtimes

- Node 24: the CLI, the MCP server, the TUI, the API and the web app's server
- Browser: the web app and the two PWAs

## Interfaces

### Web

- Next.js 16 (App Router): logicsrc.com, the specs and the blog
- React 19
- marked 18: renders the specs from `docs/*.md`, sanitised with sanitize-html

### CLI

- @logicsrc/cli: `logicsrc`, every standard and tool as one command

### TUI

- @logicsrc/tui: plain Node, no terminal framework

### MCP

- @profullstack/logicsrc-mcp: the standards, schemas and validators as tools, on @modelcontextprotocol/sdk 1 with zod 4

### API

- @logicsrc/commandboard-api: the CommandBoard.run REST reference service, plugins loaded through @logicsrc/plugin-core

### Credentials app

- Express 4: team credential sharing on libSQL, passkeys with SimpleWebAuthn 13, CoinPay OAuth, `lsk_` keys for the CLI

## Data

- Postgres (Supabase): the blog and CommandBoard
- libSQL (Turso): the credentials app, a local file in development

## Services

- CoinPay: payments and OAuth sign-in
- x402 (@profullstack/x402-gateway): paid crawling of the site, settled by CoinPay in USDC
- crawlproof.com: stats and audits

## Modules

- @profullstack/stack 0.1: feedback widget, CoinPay client, Supabase glue
- @logicsrc/schemas, @logicsrc/validators: the JSON schemas and their validation, shared by every interface

## Tooling

- npm 11 workspaces: `apps/*`, `packages/*`, `plugins/*`
- vitest 4: unit and contract tests
- Playwright 1.57: end to end
- GitHub Actions: build, schema fixtures and contract tests on Node 24

## Hosting

- Railway: one service per app; the apex proxies `/cli`, `/auth` and `/api` to the credentials app and CommandBoard

## Auth

- Passkeys and email with password in the credentials app; sessions; `lsk_` API keys for the CLI

## Conventions

- A spec is one entry in `apps/logicsrc-web/src/lib/specs.ts` plus `docs/<slug>.md`; the sidebar, `/docs`, the sitemap and `llms.txt` read that registry
- Specs are Markdown first; any JSON is derived from the Markdown and never the reverse
- No em dashes in published text

## Not

- No ORM: SQL is written by hand
- No CSS framework: one stylesheet
- No `.env` in production: secrets are Railway variables, pulled from the team vault
```

That file is served at [logicsrc.com/.well-known/openstack.md](https://logicsrc.com/.well-known/openstack.md) and is the thing this specification describes.

## The rules

Every rule degrades: a reader that does not understand a section or a key keeps it and moves on, and a file that omits a section has not said anything about that layer.

### 1. One `#` heading is the name

The first level-one heading is the project's name. There is exactly one.

### 2. An identity block follows the name

A list of `- **Key**: value` bullets directly under the heading. The keys:

| key | meaning |
| --- | --- |
| `Kind` | One of `product`, `site`, `service`, `library`, `tool`, `monorepo`, `agent`. What the file describes as a whole. |
| `Web` | The project's home page. |
| `Repo` | Where the source is, when it is anywhere. |
| `Operator` | The person or organisation answerable for it, as an [OpenProfile.md](/openprofile) URL. |
| `License` | The SPDX identifier of the code's license. |
| `Extends` | The URL or relative path of a parent OpenStack.md this one inherits from (rule 7). |
| `Updated` | The date the file was last true, `YYYY-MM-DD`. |

Every key is optional. Unknown keys are kept. Absent is unstated, never `none`.

### 3. One prose line is the headline

The first paragraph after the identity block, one or two sentences on what the project is. A reader with room for one line shows this one.

### 4. Layers are `##` sections with fixed names

A reader normalises the heading text, case-insensitively, to one of:

| section | what goes in it |
| --- | --- |
| `Languages` | Every language source is written in, human or query. |
| `Runtimes` | What executes it: a Node or Bun major, a browser, Deno, Electron, a JVM, an edge runtime. |
| `Interfaces` | Every way in, one `###` each (rule 6). |
| `Data` | Where state lives: databases, caches, queues, object stores, files. |
| `Services` | Third parties the running software calls: payments, email, search, models, analytics. |
| `Modules` | The packages the project treats as its own foundation: a house library, a shared kit, a framework of frameworks. |
| `Tooling` | What builds, tests, lints and ships it: package manager, bundler, test runner, CI. |
| `Hosting` | Where it runs and how it is deployed. |
| `Auth` | How a person or an agent signs in. |
| `Conventions` | The rules the code follows that a reader could not infer: layout, naming, what goes where, what a spec or a migration must do. |
| `Not` | What the project must not depend on, and why when the why is short. |

Aliases are read: `Language`, `Runtime`, `Storage`, `Databases`, `Dependencies`, `Packages`, `Infrastructure`, `Deploy`, `Deployment`, `Authentication`, `Rules`, `Never`, `Avoid`. A heading that matches nothing is kept under its own name. Order does not matter; the order above is the one to write.

### 5. An item is one bullet: name, version, status, role

```
- Name version (status): role
```

- **Name** is the thing as its maintainers spell it: `Next.js`, `Postgres`, `@profullstack/stack`. It may be a Markdown link, and the link is the thing's home. A parenthesised qualifier directly after the name belongs to the name: `Postgres (Supabase)`, `Next.js (App Router)`.
- **Version** is the major, or major and minor, the project relies on: `16`, `5.9`, `1.57`. It is what the code is written against, not a pin; the manifest holds the pin. Absent means any current version.
- **Status** is one word in parentheses, when the item is not simply in use: `trial` for something being tried in one place, `hold` for something still present that new work must not add to, `leaving` for something being removed. Absent means in use: build with it.
- **Role** follows the colon: what the item does here, in a phrase. It is the part a reader most needs and the part no manifest has.

A bullet with no colon is a name alone, and that is allowed.

### 6. Interfaces are `###` sections under `## Interfaces`

One per way in, named for what it is. A reader normalises the heading to one of `web`, `api`, `cli`, `tui`, `mcp`, `desktop`, `mobile`, `worker`, `extension`, `bot`, `library`, and keeps any other name as given, so `### Credentials app` above is an interface called `credentials-app`.

Each interface holds items by rule 5. It may also hold its own `####` layers with the names of rule 4, when one interface differs from the rest: a desktop app on Electron under a `#### Runtimes` of its own, a mobile app with a `#### Data` that is SQLite. An interface that says nothing about a layer inherits the project's section of the same name.

### 7. `Extends` inherits a parent file

A file that names a parent starts as a copy of it. Then:

- A section the child writes **replaces** the parent's section of the same name.
- `Conventions` and `Not` **accumulate**: the child's bullets are added to the parent's, never subtracting. A rule a parent set cannot be silently unset; a child that must break one says so in its own `Conventions`.
- The identity block and the headline are the child's own; nothing there inherits.
- A parent may itself extend another. A reader follows the chain and stops at a URL it has already seen.

This is how a stack is shared. A house publishes one file, every project under it writes `- **Extends**: https://example.com/.well-known/openstack.md` and the ten lines that differ, and a change to the house stack reaches every project on its next read.

### 8. A reader given the file builds with it

This is the rule for agents, and it is the reason the file exists:

1. **Use what is listed**, at the versions listed, for what the role says.
2. **Prefer a listed item over a new one** that does the same job. A project with `vitest` listed gets its tests in vitest, not in whatever the agent last used.
3. **Ask before adding a layer or a service.** A new database, a new third party, a new runtime is a decision the file's author owns. Adding a small package inside an existing layer is ordinary work.
4. **Never add anything under `Not`**, and never build new work on an item marked `hold` or `leaving`.
5. **Keep the file true.** An agent that adds something under rule 3, with permission, adds the bullet.

A person shares a stack with an agent by pasting the file or by pointing at its URL, and a repository's `AGENTS.md`, `CLAUDE.md` or equivalent says `Stack: see OpenStack.md` once instead of restating it.

### 9. Discovery

A reader finds the file four ways, in this order:

1. `OpenStack.md` at the root of the repository, beside the README. In a monorepo each app may carry its own, extending the root's.
2. `/.well-known/openstack.md` on the project's site, served as `text/markdown`.
3. `<link rel="openstack" href="...">` in the site's HTML, or a `Link: <...>; rel="openstack"` header on any response, when the file lives elsewhere.
4. A platform path for projects it hosts, of the form `/<project>/openstack.md`, when the platform serves one.

A file fetched from `/.well-known/` on the project's own origin, or from the repository the identity block names, is the project's own statement. One found anywhere else is a claim about the project by whoever serves it.

## Derived JSON

A reader that wants structure derives it from the Markdown, and a site may serve the result at `/.well-known/openstack.json`. The JSON is never the source: a project whose JSON and Markdown disagree is read from the Markdown.

```json
{
  "openstack": "0.1",
  "name": "LogicSRC",
  "kind": "monorepo",
  "web": "https://logicsrc.com",
  "repo": "https://github.com/profullstack/logicsrc",
  "operator": "https://logicsrc.com/.well-known/openprofile.md",
  "license": "MIT",
  "extends": null,
  "updated": "2026-09-21",
  "line": "Open coordination standards for humans and AI agents, with the reference implementation of each standard beside its text.",
  "languages": [
    { "name": "TypeScript", "version": "5.9", "status": null, "role": "everything, as ES modules with .js specifiers in source", "url": null }
  ],
  "runtimes": [
    { "name": "Node", "version": "24", "status": null, "role": "the CLI, the MCP server, the TUI, the API and the web app's server", "url": null }
  ],
  "interfaces": {
    "web": {
      "items": [
        { "name": "Next.js (App Router)", "version": "16", "status": null, "role": "logicsrc.com, the specs and the blog", "url": null }
      ]
    },
    "cli": { "items": [ { "name": "@logicsrc/cli", "version": null, "status": null, "role": "logicsrc, every standard and tool as one command", "url": null } ] }
  },
  "data": [],
  "services": [],
  "modules": [],
  "tooling": [],
  "hosting": [],
  "auth": [],
  "conventions": [ "A spec is one entry in apps/logicsrc-web/src/lib/specs.ts plus docs/<slug>.md" ],
  "not": [ "No ORM: SQL is written by hand" ],
  "sections": {}
}
```

- Every layer of rule 4 is an array of items; `conventions` and `not` are arrays of strings, since those bullets are sentences, not things.
- `interfaces` is an object keyed by the normalised interface name; each value has `items` and, when the interface wrote its own layers, those layers by name.
- `sections` holds any heading that matched nothing, keyed by its text.
- A reader that resolved `Extends` serves the merged result and keeps `extends` pointing at the parent, so the next reader can see where the rest came from.

## Directories

A directory reading stacks:

1. **Reads the file from the project's own origin or repository**, and shows one found elsewhere as a claim.
2. **Keys a project by `Web`**, then by `Repo`, so one project with a site and a repository is one project.
3. **Shows an item as the file said it**, version, status and role together, and unstated as unstated.
4. **Resolves `Extends`** before listing, and shows which items came from a parent.
5. **Lets a reader ask by item**: every project on Next.js 16, every project that lists Postgres under Data, every project whose `Not` names an ORM. That is the query a person choosing a stack actually has, and the one no lockfile answers.

## What is deliberately absent

**No inventory.** A stack is the things a maintainer would name, not the lockfile. A project that needs the closure has an SBOM; this is the other file.

**No pins.** A version is what the code is written against. The manifest and the lockfile hold the exact one, and they are the ones that change every week.

**No detection.** The file is what the project says. A scanner that reads headers and script tags guesses; this does not guess. A directory may compare the two and say where they differ.

**No verification.** Nothing checks that a project uses what it lists. It is the author's statement, and the author is the one who has to build on it.

**No registry.** A stack is a file on a site or in a repository. A directory is optional, and two projects with the same name on two origins are two projects.

**No scoring.** The file says what is used; it does not say whether that was wise.

## Relationship to other standards

- [OpenPRD](/openprd) has a `## Tech Stack` section per requirement document. A PRD that says `See OpenStack.md` there has said it once for every PRD in the project.
- [OpenProfile.md](/openprofile) is the `Operator`, the person or organisation behind the project.
- [OpenSite](/docs/opensite) is the card a reader draws for the project's pages; this is what the pages are built on.
- [OpenServer](/docs/openserver) is what a hosting provider sells; `Hosting` here is what a project bought.
- [OpenAgent](/openagent) describes an agent; a project whose `Kind` is `agent` describes what the agent is built on, and its OpenAgent file may link here.
- `AGENTS.md`, `CLAUDE.md` and their cousins tell an agent how to behave in a repository. They name the stack by linking here, and keep the rest.
- humans.txt has a `TECHNOLOGY` block, free text. It is the closest earlier idea: a site saying what it is made of, in a file a person can read. This is that block with a shape.
- CycloneDX and SPDX are the inventory. ThoughtWorks' Technology Radar is where `trial` and `hold` come from. `.tool-versions` and `mise.toml` pin the runtimes and say nothing else. StackShare kept stacks in a database nobody else could serve; this puts the stack on the project's own origin.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-21 | First publication: the file, the identity block, eleven layers, interfaces as sections, the item grammar with version and status, inheritance through `Extends`, the reading rule for agents, discovery, derived JSON, what a directory owes a project. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
