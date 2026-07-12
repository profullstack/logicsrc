# OpenPRD

OpenPRD is a lightweight, open standard for **product requirements documents** authored by humans or AI agents, maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

It borrows the shape of a BIP/EIP/DIP process: a repo keeps a **numbered, committed collection** of PRDs under `prd/`, each one a single Markdown file with a fixed set of sections and a lifecycle. Where [OpenSpec](./openspec-comparison.md) models a *change* as a multi-file bundle, OpenPRD models a *product decision* as **one numbered file** you can read a year from now to recover the *why*.

Tools such as the moshcode CLI consume this standard to publish PRDs into whatever repo you're working in.

## When to write one

Write a PRD when a change introduces or reshapes a product capability — a new feature, surface, or user-facing behavior whose requirements deserve to be agreed *before* code lands. Small, obvious changes just get a PR. If you're unsure, write a short one; three paragraphs is fine.

## Directory layout

```txt
prd/
  README.md            # index of PRDs (generated/maintained by tooling)
  0000-template.md     # the OpenPRD template — copy to start a new PRD
  0001-<slug>.md       # numbered PRDs, one file each
  0002-<slug>.md
```

- PRDs are **committed to the repo** (public within that repo) — like `dips/`, not gitignored.
- One file per PRD: `prd/<id>-<slug>.md`, where `<id>` is the four-digit number and `<slug>` is a kebab-case summary of the title.

## Numbering

Four-digit, zero-padded, monotonically increasing, no gaps: `0001`, `0002`, `0003`. `0000` is reserved for the template. Assign the next free number when the PRD is created — don't reserve in advance.

## Lifecycle

```txt
Draft  →  Review  →  Accepted  →  Final
                  ↘  Rejected
                  ↘  Withdrawn
                  ↘  Superseded by NNNN
```

- **Draft** — author is still iterating.
- **Review** — open for discussion (typically on the PR that introduces the PRD).
- **Accepted** — requirements agreed; implementation may begin.
- **Final** — implementation shipped; the PRD is now historical record. Don't edit a Final PRD except for typos — open a follow-up that supersedes it.
- **Rejected / Withdrawn / Superseded** — kept on disk; the *why* is part of the record.

Status lives in the front-matter and is the source of truth.

## Manifest (front-matter)

Every PRD opens with a YAML front-matter block validated by
[`openprd-prd.schema.json`](../packages/schemas/schemas/openprd-prd.schema.json):

```yaml
---
openprd: "0.2"            # standard version (required)
id: "0001"               # 4-digit number == filename prefix (required)
title: Expand the parked-domain service   # imperative title (required)
status: Draft            # Draft|Review|Accepted|Final|Rejected|Withdrawn|Superseded (required)
authors:                 # at least one
  - anthony@profullstack.com
repo: moshcoder/moshcoding   # optional target repo (owner/name)
created: 2026-07-12      # optional ISO date
updated: 2026-07-12      # optional ISO date
discussion:              # optional URL to the PR/issue/thread
implementation:          # optional URL to the impl PR/tracking issue
tags: [growth]           # optional labels
supersedes:              # optional 4-digit id this PRD replaces
superseded-by:           # optional 4-digit id that replaces this PRD
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

See [`0000-template.md`](./openprd/0000-template.md) for the copy-paste template.

## Relationship to LogicSRC

OpenPRD is intentionally decoupled from the rest of LogicSRC: a PRD is just a file and needs no service to exist. When coordination is wanted, a PRD's `Requirements` map cleanly onto LogicSRC `task` documents (each `R#` → one task), and `owner`/`repo` reuse LogicSRC identity and repo conventions. That bridge is optional and lives in tooling, not in this standard.

## Conformance

A document conforms to OpenPRD `0.2` when:

- it lives at `prd/<id>-<slug>.md` with a four-digit `<id>`,
- its front-matter validates against `openprd-prd.schema.json`,
- `id` equals the filename's numeric prefix, and
- all eight body sections are present in order.
