---
id: knowledge.architecture
type: knowledge
layer: L2
title: System architecture
authority: canonical
owner: platform
durability: long-lived
classification: internal
canonical_source: true
updated: 2026-08-01T00:00:00Z
references: [glossary]
tags: [architecture]
---

Edge terminates TLS and routes to Core. Core owns the only writable
database. Ledger is append-only and is never written synchronously from a
request path.

The rule that matters: **nothing except Core writes to the database.** An
agent proposing a direct write from Edge is proposing an outage.
