---
openprd: "0.3"
id: "0001"
title: Expand the parked-domain service
status: Draft
authors:
  - anthony@profullstack.com
created: 2026-07-12
updated: 2026-07-12
repo: profullstack/logicsrc
tags:
  - growth
---

## Problem

The thing is broken and it costs us money every week.

## Goals

_None._

## Non-Goals

_None._

## Users

_None._

## Requirements

- R1 [P0] The service MUST resolve a parked domain within 200 ms at p95.
- R2 [P1] The service SHOULD report per-domain hit counts.
- R3 [P2] The service MAY expose a JSON feed of recent lookups.

## UX Notes

_None._

## Tech Stack

TypeScript on Node 22, Postgres, and the existing Cloudflare worker. No new
runtime.

## Monetization

Bundled into the existing Pro plan at $19/mo; no separate SKU.

## Success Metrics

_None._

## Risks & Open Questions

_None._

