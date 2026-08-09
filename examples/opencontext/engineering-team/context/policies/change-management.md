---
id: policies.change-management
type: policy
layer: L3
title: Change management
authority: canonical
owner: cto
status: approved
durability: long-lived
classification: internal
canonical_source: true
updated: 2026-08-01T00:00:00Z
references: [knowledge.architecture]
tags: [process]
approval:
  required: true
  roles: [cto]
  minimum: 1
  approved_by:
    - role: cto
      at: 2026-08-01T00:00:00Z
---

Every production change needs a reviewed pull request and a rollback plan.

Schema migrations are additive first: add the column, backfill, switch
reads, then drop. Never drop and add in one release.
