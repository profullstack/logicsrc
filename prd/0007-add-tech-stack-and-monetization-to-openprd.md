---
openprd: "0.3"
id: "0007"
title: Add Tech Stack and Monetization sections to OpenPRD
status: Draft
authors:
  - anthony@profullstack.com
repo: profullstack/logicsrc
created: 2026-09-06
updated: 2026-09-06
discussion:
implementation:
tags:
  - openprd
  - standards
  - monetization
supersedes:
superseded-by:
---

# Add Tech Stack and Monetization sections to OpenPRD

## Problem

OpenPRD 0.2 fixes eight sections, and two questions that decide whether a
product decision is a good one are missing from all of them.

The first is what the thing is built on. Requirements cannot be costed without
it, so the stack gets picked in the first implementation PR instead, by
whoever opens it, and the PRD that was supposed to record the *why* is silent
on the most expensive choice in the change.

The second is how it earns. Every section in 0.2 is about the user and none is
about the business. A PRD can be filled out completely, reviewed, accepted, and
shipped without anyone writing down who pays. Across the fleet that is exactly
the question that goes unanswered until after launch.

## Goals

- A reader of any OpenPRD 0.3 document can tell what it will be built on and
  how it earns without leaving the file.
- The stack and the revenue model are settled at review time, when changing
  them is still cheap, rather than in the implementing PR.
- "This does not earn on its own" stays a legitimate answer, said out loud
  rather than by omission.
- Every document already written against 0.2 keeps conforming, untouched.

## Non-Goals

- No financial modelling: the section states a model, not a forecast, and
  nothing validates the numbers.
- No architecture review: `Tech Stack` names what will be used, it is not an
  ADR and does not replace one.
- No forced migration. Collections adopt 0.3 per document, or never.
- No front-matter change. Both additions are body sections; the schema is
  untouched.

## Users

- **Authors** — human or agent — who now have somewhere to put two decisions
  that were previously made in silence.
- **Reviewers**, who get a costable stack and a stated revenue model in the
  document they are already reading.
- **Third-party implementers** of the standard, who need to know that a
  document is judged against the version it declares.

## Requirements

- R1 [P0] `## Tech Stack` and `## Monetization` are required body sections in
  OpenPRD 0.3, in that order, between `## UX Notes` and `## Success Metrics`.
- R2 [P0] Both accept `_None._`, like every other section.
- R3 [P0] A document is validated against the section list its own `openprd:`
  key fixes, so a `0.2` document is still held to eight sections and still
  conforms.
- R4 [P0] `logicsrc prd new` scaffolds ten stub sections, and the shipped
  template carries both.
- R5 [P1] The conformance bundle proves both directions: a 0.3 document missing
  `Monetization` fails with `OP-C-SECTION-MISSING`, and a 0.2 document with
  eight sections passes.
- R6 [P1] The specification states the compatibility rule and how to adopt 0.3
  in an existing collection.
- R7 [P2] `draft_prd` and `review_prd` on the MCP surface ask for both
  sections, and `review_prd` challenges a stack too vague to cost and a
  monetization answer that dodges who pays.

## UX Notes

Nothing about authoring changes: the sections appear in the template and in
`logicsrc prd new` output, with the same `_TODO:` placeholders as the rest.

The failure a validator produces for a 0.3 document that predates the change is
the ordinary `OP-C-SECTION-MISSING`, naming the section and listing what the
declared version requires — so the fix is visible in the message, and the
alternative fix (leave it at 0.2) is a one-line edit.

## Tech Stack

No new dependency. TypeScript in `packages/openprd` (the section list moves
from one constant to a version-keyed lookup), the existing JSON Schema in
`packages/schemas` — unchanged, since the front-matter is unchanged — the
Markdown fixtures beside it, the Next.js landing page in `apps/logicsrc-web`,
and the MCP surface in `packages/logicsrc-mcp`. Vitest covers it.

## Monetization

_None._ OpenPRD is an open standard published to be copied and cited; it is not
sold and carries no plan, meter, or SKU. It earns indirectly, by making the
LogicSRC standards surface worth adopting — and, from this change onward, by
making sure every product decision downstream of it has answered the revenue
question in writing.

## Success Metrics

- Every PRD written in this repo from 0007 onward declares `0.3` and fills both
  sections.
- The conformance bundle's 0.2 fixture keeps passing, unedited, across future
  releases: the proof that the version rule holds.
- Reviews stop discovering the stack in the implementation PR.

## Risks & Open Questions

- Ten required sections is more ceremony, and ceremony gets skipped. If
  `Monetization` becomes reflexive `_None._` on every PRD, the section has
  failed and should be reconsidered rather than left as decoration.
- Version-aware validation means two live section lists forever. A third
  addition would make three; at that point the rule needs a real deprecation
  policy rather than a growing lookup.
- Open: whether this repo's own 0001-0006 should be migrated to 0.3 or left as
  the standing evidence that 0.2 documents still conform. Left at 0.2 for now.
