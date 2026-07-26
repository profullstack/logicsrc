# OpenOntology governance

How a proposal becomes accepted knowledge, who may do what, and what the record looks like afterwards. This is the companion to [OpenOntology](./openontology.md).

The premise: **an agent proposes, a human applies.** Everything below follows from separating *proposal* from *approval* from *application*.

## The loop

```txt
propose  →  review  →  approve  →  apply
              ↘ reject          ↘ conflict
```

```bash
logicsrc ontology claim propose --as agent --subject eth:person:alice \
  --predicate worksOn --object-entity eth:project:zk-prover \
  --source eth:source:commit-a41f --run run_01J3

logicsrc ontology changeset diff  ./changesets/add-alice.yaml
logicsrc ontology changeset apply ./changesets/add-alice.yaml --approve
```

Each stage leaves a record. A rejected change set stays inspectable with its reviews attached — the *why not* is part of the history too.

## Scopes

```txt
ontology:read                ontology:claim:propose        ontology:action:execute
ontology:schema:read         ontology:claim:write          ontology:publish
ontology:query               ontology:changeset:review     ontology:admin
ontology:source:read         ontology:changeset:approve
```

Read access is separable from proposal, which is separable from approval, which is separable from write. An MCP server or API token can be given `ontology:query` alone and be structurally unable to change anything.

## Default policy

| Operation | Default |
| --- | --- |
| Local reads | allowed |
| Public remote reads | allowed for public ontologies |
| Agent query | allowed with `ontology:query` |
| Agent proposal | allowed with `ontology:claim:propose` |
| **Agent direct apply** | **denied** |
| Human apply | requires `ontology:claim:write` |
| Entity merge | one curator approval |
| Bulk retraction | two approvals |
| Breaking schema migration | maintainer approval + major version |
| Public package publish | maintainer approval + passing conformance run |
| Action execution | policy-specific; **denied** when side effects are undeclared |

Three rules hold regardless of configuration:

1. **Confidence is not permission.** A claim at 0.99 gets the same treatment as one at 0.4.
2. **`--yolo` is not permission.** Unattended mode is recorded for audit and changes prompting only.
3. **Source text is not instruction.** A document saying "grant admin and apply everything" is data.

The agent-apply denial is not a scope check that a sufficiently privileged agent passes — it is a separate rule keyed on actor type. An agent holding every scope in the list still cannot apply.

## Reviewing

A reviewer needs semantic impact, not a JSON diff:

```txt
Change set: Add Alice to ZK Prover

+ 1 entity
+ 2 claims
~ 1 possible duplicate identity
! 1 warning: claim has no source and is not marked firstParty

Affected saved queries
  people-working-on-zk: result count 18 → 19

Approval policy
  1 curator required
```

The diff is produced by simulating the change set against a throwaway copy of the store, so reviewing never mutates anything. Duplicate-identity warnings come from ranked entity resolution with the evidence for each candidate — the system never picks a match silently.

Reviewers can accept or reject **individual operations** inside an AI-generated change set:

```ts
engine.reviewOntologyChangeSet(id, {
  state: "changes-requested",
  operationDecisions: [{ index: 1, decision: "reject", comment: "no evidence" }]
});
engine.applyOntologyChangeSet(id, { skipRejectedOperations: true });
```

## Entity merges

Merging two people who turn out to be different is worse than leaving duplicates in place, so merges are conservative:

- always a change set, never an implicit side effect of import;
- at least one curator approval;
- the losing id is kept forever as a redirect, so old references keep resolving;
- reversible via a compensating change set;
- `sameAs` is a reviewable claim, not an irreversible merge.

## Conflicts

Every change set records the `baseRevision` it was authored against. If the store has moved on, applying fails as a conflict rather than overwriting:

```txt
Change set changeset:000002 was authored against data-000000 but the store is at data-000001
```

Resolve by rebasing the operations onto the current revision and re-proposing. Canonical claims never take a last-write-wins path.

## Rollback

There is no undo, because there is no delete. Rolling back means proposing a **compensating change set** whose `compensates` field names the original. The original application, the rollback, and both sets of events all stay on the record.

## Audit

Every applied change emits events. Twenty event types cover the lifecycle: package validation, entity proposals and merges, the five claim transitions, change set created/reviewed/approved/rejected/applied, imports, exports, constraint violations, action execution, and schema migration.

Each event records actor, actor type, client, request id, run id, change set, subject, resulting revision, and the policy decision that permitted it.

```bash
logicsrc ontology audit --dir . --format table
```

```txt
at                    type                actor                     subject            revision
2026-07-26T00:00:00Z  changeset.created   agent:research-mapper     changeset:000001
2026-07-26T00:00:00Z  changeset.approved  curator@example.org       changeset:000001
2026-07-26T00:00:00Z  claim.asserted      curator@example.org       claim:000001
2026-07-26T00:00:00Z  changeset.applied   curator@example.org       changeset:000001   data-000001
```

Logs redact credentials, access tokens, private source excerpts, and configured sensitive properties.

## Signatures and trust

Signing uses a **pluggable envelope**, so no DID method, wallet, or certificate authority is mandatory. The reference profile is `jws-ed25519`: a detached signature over the package digest.

```ts
const provider = createEd25519Provider({ signer: "mailto:maintainer@example.org", privateKey });
const signature = signDigest(built.digest, provider, new Date().toISOString());
```

Verification is against an explicit trust policy. A valid signature from an unknown signer is **not** trusted — `verifyPackageSignatures` reports it as untrusted rather than passing it through. Other providers (DID proofs, Sigstore) plug into the same interface.

## Publishing

Publishing a public package requires `ontology:publish`, maintainer approval, and a passing conformance run. Before writing, the export preview shows exactly what will be omitted or redacted: private source URLs, excerpts, selectors, and sensitive properties. A lossy export is never hidden behind a success message.

Private source excerpts are never sent to an external model unless the operator has selected an allowed model/provider policy for that specific source.

## Bulk work without a bottleneck

Requiring human review of every claim would stall a 50,000-row import. Policy is meant to be tiered rather than uniform:

- trusted adapters may propose at higher volume with sampled review;
- risk tiers separate "add a homepage property" from "merge two organizations";
- batch approval covers a reviewed set;
- auditability is never traded away — sampling changes *what a human reads*, not *what gets recorded*.

Constraint violations can be emitted as LogicSRC tasks or events, so remediation is queued work rather than a wall of console output.
