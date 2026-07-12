# OpenPRD

OpenPRD is a lightweight, open standard for **product requirements documents** authored by humans or AI agents. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Where [OpenSpec](./openspec-comparison.md) models a *change* as a multi-file bundle (proposal + design + specs + tasks + deltas), OpenPRD deliberately models a *product decision* as **one Markdown file**. It answers "what are we building and why", not "how the change is structured for implementation". The single-file shape is the point: it is the low-ceremony front door that a `prd` CLI command can produce in one step.

## Privacy

**PRD documents are private by convention.** Only this standard is published. Generated PRDs live under a repo-local `prd/` directory that SHOULD be listed in `.gitignore`. Tools that write OpenPRD documents MUST NOT publish them anywhere by default.

## File layout

```txt
prd/
  <slug>/
    prd.md          # one OpenPRD document (front-matter manifest + body)
```

- `<slug>` is a kebab-case identifier, unique within the repo, and equal to the manifest `id`.
- A repo MAY contain many PRDs; each is a self-contained directory so attachments (mockups, notes) can sit beside `prd.md`.

## Manifest (front-matter)

Every `prd.md` opens with a YAML front-matter block validated by
[`openprd-prd.schema.json`](../packages/schemas/schemas/openprd-prd.schema.json):

```yaml
---
openprd: "0.1"        # standard version (required)
id: park-service-expansion   # kebab-case slug == directory name (required)
title: Parked-domain service expansion   # (required)
status: draft         # draft | review | active | shipped | archived (required)
owner: did:key:…      # optional DID/handle of the accountable owner
repo: moshcoder/moshcoding    # optional target repo (owner/name)
created: 2026-07-12   # optional ISO date
updated: 2026-07-12   # optional ISO date
tags: [growth, monetization]  # optional labels
supersedes: [old-slug]        # optional ids this PRD replaces
---
```

## Body sections

The body is Markdown with a fixed, ordered set of `##` sections. All are required (a section MAY be a single line such as `_None._`), which keeps every PRD skimmable and diffable:

1. `## Problem` — the user/business problem, and why it matters now.
2. `## Goals` — what success looks like, as outcomes (not features).
3. `## Non-Goals` — explicitly out of scope, to bound the work.
4. `## Users` — who this is for; personas or segments.
5. `## Requirements` — numbered `R1`, `R2`, … each prefixed with a priority tag `[P0]`/`[P1]`/`[P2]`. One capability per line.
6. `## UX Notes` — flows, states, and constraints that shape the experience.
7. `## Success Metrics` — how the goals will be measured.
8. `## Risks & Open Questions` — known risks and decisions still owed.

### Minimal example

```markdown
---
openprd: "0.1"
id: launch-flip
title: Coming-soon → live launch flip
status: draft
---

## Problem
Parked domains have no one-click path from coming-soon to a live site.

## Goals
Owners flip a domain live and notify its waitlist in a single action.

## Non-Goals
_Building the live site itself._

## Users
Domain owners running parked pages on the service.

## Requirements
- R1 [P0] A per-domain "go live" action publishes/redirects the domain.
- R2 [P0] Flipping live emails that domain's waitlist.
- R3 [P1] The action is reversible within a grace window.

## UX Notes
One button on the domain's admin row; confirm dialog shows the waitlist size.

## Success Metrics
Time-to-live per domain; waitlist → visit conversion after launch.

## Risks & Open Questions
- Email deliverability on bulk launch sends.
- Should redirects preserve `?dn=` analytics?
```

## Relationship to LogicSRC

OpenPRD is intentionally decoupled from the rest of LogicSRC: a PRD is just a file and needs no service to exist. When coordination is wanted, a PRD's `Requirements` map cleanly onto LogicSRC `task` documents (each `R#` → one task), and the PRD `owner`/`repo` reuse LogicSRC identity and repo conventions. That bridge is optional and lives in tooling, not in this standard.

## Conformance

A document conforms to OpenPRD `0.1` when:

- it lives at `prd/<slug>/prd.md`,
- its front-matter validates against `openprd-prd.schema.json`,
- `id` equals `<slug>`, and
- all eight body sections are present in order.
