---
openprd: "0.3"
id: "0009"
title: "Ship the OpenErrand reference runner"
status: Draft
authors:
  - anthony@profullstack.com
created: 2026-10-04
updated: 2026-10-04
repo: profullstack/logicsrc
discussion:
implementation: packages/openerrand
tags:
  - openerrand
  - errand
  - browser-automation
  - human-gates
  - cli
supersedes:
superseded-by:
---

## Problem

OpenErrand 0.1 (docs/openerrand.md) describes an errand on a website with no
API as one JSON file, and its worked example was transcribed from `ftb` in
cli-tools, which has the same rule table compiled in. Until a runner reads the
file, the file is a description and not a program: nobody can run the example,
write a second errand, or check that a runner keeps the thirteen rules.

## Goals

- `logicsrc errand run <file>` runs any valid OpenErrand 0.1 file in headless
  Chrome and stops exactly where the spec says a person is needed.
- The FTB example runs unchanged.
- The throttle that kept `ftb` from snowballing a lockout is part of every
  errand, not of one tool.

## Non-Goals

- No document extractor beyond a `command` hook; reading a tax form is the
  principal's tool's job.
- No captcha solver, ever. Only the interface, gated by the spec.
- No run against a real government site in tests.

## Users

- A person with a form to fill on a site with no API, who wants to read what
  will be sent before it is sent.
- An agent running an errand for its human, which must hand back at every gate.
- A publisher writing an errand file who needs the page log to fix a rule.

## Requirements

- R1 [P0] `@logicsrc/openerrand` 0.1.0: load and validate with
  `@logicsrc/validators`, resolve inputs (document via an extractor hook,
  vault, prompt masked for secrets, generate, derive, candidate, literal),
  rules matched id first then label with step rules first and choices before
  text, outcomes rejected first, and the stopped reasons the spec names.
- R2 [P0] Gates: `declare` only with `--declare` after the values are shown;
  `identity-proofing` never touched (URL only), stop or hand the window over;
  `code` from the terminal or a code file, used once, a wrong code waits for
  the next; `mail` ends the run waiting with the card; `captcha` is the
  person's, and a solver interface is called only where the spec permits;
  `wait` polled, never solved.
- R3 [P0] One shared secret per run, never retried; a rejection lists the
  other candidates and `--candidate` chooses the next.
- R4 [P0] Throttle ledger: 2 runs per errand and account in 30 minutes, 4 a
  day, 2 minutes between runs on a site, lockout from the file's
  `metadata.lockout` or a default, held per site and account, never lifted by
  `--force`.
- R5 [P0] Credentials written before success: a logicsrc teams vault by
  pull, merge, push; OpenCreds read-only; else a 0600 file, said aloud.
- R6 [P0] Page log of fields only and result-page text; run record with no
  values; cards kept in the run record and `errand status`, never posted.
- R7 [P1] Rule 1 (show before run, SHA-256 change shown), rule 11 (the user
  agent drops `HeadlessChrome`, nothing more), rule 12 (dry run), rule 13
  (loop and page limits).
- R8 [P1] `logicsrc errand run|validate|status` in CLI 0.7.0; docs and the
  landing page say the runner ships.
- R9 [P1] Unit tests for the rule engine, gates, throttle, outcomes, inputs
  and captcha gating; one integration test of the FTB example in real
  headless Chrome against a local fake site with fictional data.

## UX Notes

A run prints the errand summary, the values it will use (secrets as `••••`),
each page's filled fields, and one final line on stdout (or the run record
with `--json`). A stop names the field, label, type and page, and where the
page log is.

## Tech Stack

TypeScript, NodeNext, commander 14, vitest 4, Chrome over CDP with no
dependency (ported from cli-tools' wcag.ts). Node 22+ for the global
WebSocket.

## Monetization

None. It is the reference implementation of an open standard.

## Success Metrics

- The FTB example runs end to end against the fake site, and `ftb` can later
  be reduced to the errand files plus its PDF extractor.
- A second errand can be written and run without changing the runner.

## Risks & Open Questions

- The runner has not been run against the real MyFTB; the first real run
  should be a `--dry-run`.
- Candidate order follows the spec's text (sources in order, newest year
  within each); the worked example's `ftb secrets` listing orders by year
  first. One of the two should change.
