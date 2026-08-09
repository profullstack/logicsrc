# OpenPRD and OpenTopology integration

| Specification | Primary question |
| --- | --- |
| [OpenPRD](../openprd.md) | What are we building and why? |
| OpenTopology | How is the system organized? |
| [OpenContext](../opencontext.md) | What does everyone need to know? |

```txt
OpenPRD       -> intent / requirements
OpenTopology  -> architecture / relationships
OpenContext   -> knowledge / policy / operational context
LogicSRC      -> execution by humans and agents
```

**OpenContext must remain independently usable.** These integrations are optional, and nothing in resolution depends on them.

## Linking

```yaml
opencontext: "1.0"
id: acme

related:
  prd: ./openprd.yaml
  topology: ./opentopology.yaml
  ontology: ./openontology.yaml
```

## Referencing by stable id

Once linked, context objects can cite requirements and components by their stable ids:

```yaml
id: decisions.2026-08-09-postgres-ha
type: decision
title: Move Core to replicated Postgres
decision: Run Core on a primary with a synchronous replica.
extensions:
  com.logicsrc.openprd:
    requirements: ["0004-R3"]
  com.logicsrc.opentopology:
    components: [core, ledger]
```

Cross-specification references use the extension mechanism rather than first-class fields, which keeps them genuinely optional: a runtime that knows nothing about OpenPRD preserves the extension and resolves the object normally.

## Where each belongs

The boundary that matters in practice:

| Question | Lives in |
| --- | --- |
| Why are we building this? | OpenPRD |
| What are the requirements? | OpenPRD |
| Which services exist and how do they talk? | OpenTopology |
| What does this component own? | OpenTopology |
| What is our refund policy? | OpenContext |
| How does support process a refund? | OpenContext |
| Why did we choose this database? | OpenContext (a decision record) |
| What is the current incident state? | OpenContext (L5 operational) |

A useful test: **would this still matter after the feature shipped?** If yes, it is context. If it describes the work rather than the organization, it is a PRD.

## Complementary, not overlapping

OpenPRD documents are numbered proposals with a lifecycle (`Draft → Review → Accepted → Final`). OpenContext objects are durable knowledge with authority, scope, and supersession. A PRD can *become* context — an accepted decision inside a PRD is worth extracting into a decision record, so agents receive it without reading the whole proposal.

OpenOntology models entities and source-backed claims. Where OpenContext says "this is our refund policy and support may read it", OpenOntology says "Avery works on the ZK Prover, and here is the commit that says so". A repository can use both: OpenContext for governed prose and policy, OpenOntology for structured facts.

## Using them together

```bash
logicsrc prd list                  # what we are building
logicsrc context list --role eng   # what an engineer needs to know
logicsrc ontology query run …      # structured facts
```

All three are local-first, schema-first, and usable without a hosted account — and each is independently adoptable. Start with whichever answers the question that is currently costing you.
