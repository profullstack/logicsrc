---
id: procedures.deploy
type: procedure
layer: L4
title: How to deploy
authority: approved
owner: operations
status: approved
durability: operational
classification: internal
canonical_source: true
updated: 2026-08-01T00:00:00Z
references: [policies.change-management]
applies_to: [operations]
---

1. Confirm the rollback plan exists before starting.
2. Deploy to one region, watch error rates for ten minutes, then continue.
3. Roll back rather than roll forward.
