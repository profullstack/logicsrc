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
tags: [architecture]
---

Ingest normalises carrier feeds. Core holds shipment state. Alerts is a
stateless evaluator over Core.

Only Core writes to the database.
