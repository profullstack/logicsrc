---
id: decisions.2026-08-01-postgres-ha
type: decision
layer: L5
title: Move Core to replicated Postgres
authority: approved
owner: cto
status: accepted
version: 2
durability: permanent
classification: internal
canonical_source: true
created: 2026-08-01T00:00:00Z
updated: 2026-08-01T00:00:00Z
decision: Run Core on a primary with a synchronous replica and automated failover.
rationale:
  - A single instance made every maintenance window a customer-visible outage.
  - Read traffic had outgrown one node.
alternatives:
  - option: Shard by tenant
    rejected_because: Complexity we cannot staff, for a load we do not have yet.
consequences:
  - Writes get slower by the replication round trip. Accepted.
approved_by:
  - role: cto
    at: 2026-08-01T00:00:00Z
supersedes:
  - decisions.2026-02-01-postgres
references: [knowledge.architecture]
tags: [datastore]
---

Supersedes the original single-instance decision. Both stay in the
repository; only this one resolves by default.
