---
id: decisions.2026-08-01-agent-roles
type: decision
layer: L5
title: Give every agent a role, never a bespoke prompt
authority: approved
owner: founders
status: accepted
durability: permanent
classification: internal
canonical_source: true
created: 2026-08-01T00:00:00Z
updated: 2026-08-01T00:00:00Z
decision: Every agent is onboarded by assigning it a role in opencontext.yaml.
rationale:
  - A bespoke prompt per agent is context that only exists inside that agent.
  - Roles make offboarding a one-line revocation instead of an investigation.
  - Two agents in the same role provably receive the same context.
alternatives:
  - option: Hand-written system prompts per agent
    rejected_because: The organization's knowledge ends up inside vendors we do not control.
consequences:
  - Adding an agent means editing the manifest, which is reviewed like code.
approved_by:
  - role: founders
    at: 2026-08-01T00:00:00Z
references: [organization]
tags: [governance, agents]
---

This is the decision that makes the rest of the repository worth maintaining.
