# Ethereum Ecosystem Ontology (example)

A demonstration package for [LogicSRC OpenOntology](../../../docs/openontology.md): an open map of
people, organizations, projects, codebases, research topics, protocols, networks, layer 2s,
applications, funding programs, publications, and events.

> **Every person, organization, project, and source in this package is fictional.** It exists to
> demonstrate the contract, not to describe anyone real. Automated tests never depend on live
> public profiles, and nothing here implies endorsement by any real project or person.

The Ethereum framing is an *example*, not part of the core vocabulary. Delete this directory and
every core OpenOntology test still passes.

## What it covers

| | |
| --- | --- |
| Entity types | 12 |
| Relationship types | 17 |
| Entities | 63 |
| Claims | 169 |
| Sources | 25 |
| Evidence records | 31 |
| Saved queries | 5 |

Every claim lifecycle state appears at least once: `asserted`, `proposed` (an agent extraction
awaiting review), `disputed` (with the counter-claim that disputes it), `retracted` (kept on the
record, out of the current view), `superseded` (an affiliation that ended and what replaced it),
and `derived` (with its rule and input claims).

`changesets/merge-haddad.yaml` is a pending merge proposal for a deliberate near-duplicate identity
— the kind of thing entity resolution surfaces and a curator decides.

## Try it

```bash
logicsrc ontology validate . --strict
logicsrc ontology inspect .
logicsrc ontology query list --dir .

# three hops: network → layer 2 → application → maintaining organization
logicsrc ontology query run orgs-behind-a-network --dir .

# what still needs a human decision
logicsrc ontology query run claims-needing-review --dir . --status proposed,disputed

# why does the ontology say this?
logicsrc ontology query explain orgs-behind-a-network --dir . --row 0

# what a reviewer sees for the pending merge
logicsrc ontology changeset diff changesets/merge-haddad.yaml --dir .
```

## Regenerating

The package files are generated so the data stays internally consistent and the digest stays
deterministic:

```bash
node tools/generate.mjs
logicsrc ontology validate . --strict
```

Edit `tools/generate.mjs`, not the generated `schema/` and `data/` files.
