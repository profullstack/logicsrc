---
id: policies.payroll
type: policy
layer: L3
title: Payroll
authority: canonical
owner: finance
status: approved
durability: long-lived
classification: confidential
canonical_source: true
updated: 2026-08-01T00:00:00Z
permissions:
  read: [finance]
tags: [finance]
---

Payroll runs on the 25th.

Confidential, and additionally restricted with an object-level read grant —
so even a role whose include pattern matches `policies.*` is refused.
