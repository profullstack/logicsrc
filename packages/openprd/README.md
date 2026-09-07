# @logicsrc/openprd

Reference implementation of [OpenPRD](https://logicsrc.com/docs/openprd), a
lightweight open standard for product requirements documents authored by humans
or AI agents.

A repo keeps a numbered, committed collection under `prd/` — one Markdown file
per product decision, with YAML front-matter, a fixed set of body sections, and
an enforced lifecycle. Where a change-oriented format models a *change* as a
multi-file bundle, OpenPRD models a *product decision* as one numbered file you
can read a year later to recover the *why*.

**A PRD is just a file.** Nothing here is required for a document to conform;
this package exists to check and generate them.

## Install

```bash
npm install @logicsrc/openprd
```

Or use it through the LogicSRC CLI, which wraps this package as `logicsrc prd`.

## Usage

```js
import { parsePrd, validatePrdDocument, loadPrdCollection, SECTIONS } from "@logicsrc/openprd";

const doc = parsePrd(source, "0001-expand-the-service.md");
const findings = validatePrdDocument(doc, { strict: true });

// Collection-level rules: contiguous numbering, unique ids, resolvable
// supersession links, a fresh index.
const collection = loadPrdCollection("prd");
```

## The ten sections (OpenPRD 0.3)

`Problem`, `Goals`, `Non-Goals`, `Users`, `Requirements`, `UX Notes`,
`Tech Stack`, `Monetization`, `Success Metrics`, `Risks & Open Questions` — in
that order, all required. A section may be a single line such as `_None._`, but
it may not be missing. That is what keeps every PRD skimmable and diffable.

### Versioning

A document is validated against the section list its own `openprd:` key fixes,
not against the newest version:

| Version | Sections |
| --- | --- |
| `0.2` | eight |
| `0.3` | ten — adds `Tech Stack` and `Monetization` after `UX Notes` |

So a `0.2` document keeps conforming. `sectionsForVersion(version)` exposes the
rule directly.

## Conformance

A document conforms when it lives at `prd/<id>-<slug>.md` with a four-digit id,
its front-matter validates against `openprd-prd.schema.json`, `id` equals the
filename's numeric prefix, and every body section for its declared version is
present in order.

Everything else the validator reports is lint — an empty section, a requirement
missing its priority tag, numbering that skips, a stale index, a one-sided
supersession link. Findings carry stable codes (`OP-C-SECTION-ORDER`,
`OP-L-REQ-DUPLICATE`, …), the file, the line, and a remediation hint. `strict`
promotes lint to errors.

## Links

- [Specification](https://logicsrc.com/docs/openprd)
- [Overview](https://logicsrc.com/openprd)
- [Conformance fixtures](https://github.com/profullstack/logicsrc/tree/master/packages/schemas/fixtures/openprd)

MIT © Profullstack, Inc.
