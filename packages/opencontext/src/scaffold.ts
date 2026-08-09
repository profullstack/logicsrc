/**
 * `opencontext init`.
 *
 * The generated project must pass `validate --strict` and `doctor --strict`
 * with no edits. That is a hard requirement, not a nicety: a scaffold that
 * emits warnings teaches people on their first minute that warnings are normal
 * and can be ignored, which is precisely the habit this specification exists to
 * break.
 *
 * So every generated object has an owner, declares itself canonical source
 * material, and is reachable from at least one role — and the two generated
 * roles have genuinely different scopes, so the permission model is visible
 * from the start rather than something you read about later.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface InitOptions {
  /** Namespace id. Defaults to the directory name, slugified. */
  id?: string;
  name?: string;
  /** Skip prompts and take every default. Suitable for agents and scripts. */
  yes?: boolean;
  force?: boolean;
  /** Creation time. Injectable so tests can generate a byte-identical project. */
  now?: Date;
}

export interface InitResult {
  dir: string;
  created: string[];
  skipped: string[];
}

export function initProject(target: string, options: InitOptions = {}): InitResult {
  const dir = resolve(target);
  const id = slugify(options.id ?? dir.split(/[/\\]/).filter(Boolean).at(-1) ?? "context");
  const name = options.name ?? titleize(id);
  const created: string[] = [];
  const skipped: string[] = [];

  const files = scaffoldFiles(id, name, options.now ?? new Date());

  for (const [relativePath, contents] of Object.entries(files)) {
    const path = join(dir, relativePath);
    if (existsSync(path) && !options.force) {
      skipped.push(relativePath);
      continue;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, "utf8");
    created.push(relativePath);
  }

  return { dir, created, skipped };
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug.length > 0 ? slug : "context";
}

function titleize(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * The generated files.
 *
 * `now` is stamped into every `updated` field so a freshly created project is
 * genuinely current. Hardcoding a date would make `doctor` report the scaffold
 * as stale the moment the default ttl elapsed — teaching, on minute one, that
 * warnings are background noise.
 */
export function scaffoldFiles(id: string, name: string, now: Date = new Date()): Record<string, string> {
  const timestamp = now.toISOString();
  const day = timestamp.slice(0, 10);

  return {
    "opencontext.yaml": manifestTemplate(id, name),
    "context/mission.md": missionTemplate(name, timestamp),
    "context/organization.md": organizationTemplate(name, timestamp),
    "context/glossary.md": glossaryTemplate(timestamp),
    "context/policies/refunds.md": refundPolicyTemplate(timestamp),
    "context/sops/refund.md": refundSopTemplate(timestamp),
    [`context/decisions/${day}-adopt-opencontext.md`]: decisionTemplate(name, timestamp, day),
    "README.md": readmeTemplate(name)
  };
}

function manifestTemplate(id: string, name: string): string {
  return `opencontext: "1.0"
id: ${id}
name: ${name}

# Single documents. Each key becomes a resolvable object id.
context:
  mission: ./context/mission.md
  organization: ./context/organization.md
  glossary: ./context/glossary.md

# Globs that expand to many objects. The key namespaces their ids, so
# ./context/policies/refunds.md is resolvable as policies.refunds.
collections:
  policies: ./context/policies/**
  procedures: ./context/sops/**
  decisions: ./context/decisions/**

# Scope is opt-in: a role sees only what it includes, and an exclude always
# wins over an include. These two roles differ on purpose — compare their
# bundles with \`opencontext resolve --role support --explain\`.
roles:
  support:
    description: Front-line customer support.
    include:
      - mission
      - organization
      - glossary
      - policies.*
      - procedures.*
    exclude:
      - policies.internal.*
    permissions:
      - customer.read
      - ticket.write
    max_classification: internal

  engineering:
    description: Engineers, who need decisions and terminology but not customer policy.
    include:
      - mission
      - organization
      - glossary
      - decisions.*
    permissions:
      - repo.write
    max_classification: internal

agents:
  support-agent:
    roles: [support]
  dev-agent:
    roles: [engineering]

authority:
  precedence:
    - canonical
    - approved
    - reference
    - observed
    - inferred
    - historical

freshness:
  default_ttl: 180d

provenance:
  required: true

audit:
  context_reads: false
  context_writes: true
  decisions: true

health:
  minimum_score: 90
  require_owner: true
`;
}

function missionTemplate(name: string, updated: string): string {
  return `---
id: mission
type: mission
layer: L0
title: Why ${name} exists
authority: canonical
owner: founders
durability: permanent
classification: public
canonical_source: true
updated: ${updated}
tags: [mission]
---

${name} exists to _______________.

Replace this with the one thing that would still be true if every product,
process, and person changed. Agents read this first, and it is what keeps a
replacement agent behaving like it works here rather than anywhere.
`;
}

function organizationTemplate(name: string, updated: string): string {
  return `---
id: organization
type: identity
layer: L1
title: How ${name} is organized
authority: canonical
owner: founders
durability: long-lived
classification: internal
canonical_source: true
updated: ${updated}
tags: [organization, identity]
---

## Teams

- **support** — customer-facing, owns the refund policy and its SOP.
- **engineering** — builds and runs the product.

## Who decides what

Record decisions as decision objects under \`context/decisions/\`, so the
reasoning survives the people who were in the room.
`;
}

function glossaryTemplate(updated: string): string {
  return `---
id: glossary
type: glossary
layer: L1
title: Terminology
authority: canonical
owner: founders
durability: long-lived
classification: internal
canonical_source: true
updated: ${updated}
tags: [glossary, terminology]
---

Terms here mean exactly what this file says they mean, including to agents.
Shared vocabulary is the cheapest possible alignment mechanism.

- **Context object** — one durable unit of context with a stable id.
- **Bundle** — the authorized, resolved context handed to one consumer for one task.
- **Canonical** — this organization's own source of truth for a fact.
`;
}

function refundPolicyTemplate(updated: string): string {
  return `---
id: policies.refunds
type: policy
layer: L3
title: Refund policy
authority: canonical
owner: support
status: approved
version: 1
durability: long-lived
classification: internal
canonical_source: true
updated: ${updated}
tags: [refunds, policy, support]
applies_to: [support]
---

Refund requests are accepted within 30 days of purchase.

Refunds outside that window require an exception approved by the support lead.
`;
}

function refundSopTemplate(updated: string): string {
  return `---
id: procedures.refund
type: procedure
layer: L4
title: How to process a refund
authority: approved
owner: support
status: approved
durability: operational
classification: internal
canonical_source: true
updated: ${updated}
references: [policies.refunds]
tags: [refunds, sop, support]
applies_to: [support]
---

1. Confirm the purchase date against the refund policy.
2. If it is inside the window, issue the refund and note the ticket.
3. If it is outside the window, escalate to the support lead — do not decide alone.
`;
}

function decisionTemplate(name: string, updated: string, day: string): string {
  return `---
id: decisions.${day}-adopt-opencontext
type: decision
layer: L5
title: Adopt OpenContext for shared context
authority: approved
owner: founders
status: accepted
canonical_source: true
created: ${updated}
updated: ${updated}
decision: Keep mission, policy, procedure, and decisions in an OpenContext repository.
rationale:
  - Agents and employees change; the organization's knowledge should not leave with them.
  - Context should be reviewable in pull requests like the rest of the system.
  - No hosted account is required, so the context stays portable.
approved_by:
  - role: founders
tags: [governance]
---

${name} adopted OpenContext so that replacing an agent, a model, or a person
does not mean re-teaching the organization to whoever arrives next.
`;
}

function readmeTemplate(name: string): string {
  return `# ${name} context

Durable, portable, permissioned context for humans and AI agents, described with
[OpenContext](https://logicsrc.com/opencontext).

\`\`\`bash
opencontext validate --strict
opencontext doctor
opencontext resolve --role support --task "customer asked for a refund" --explain
\`\`\`

Two roles are defined, \`support\` and \`engineering\`, and they resolve to
different bundles. Compare them:

\`\`\`bash
opencontext resolve --role support --format markdown
opencontext resolve --role engineering --format markdown
\`\`\`

Edit the context, not the bundle. The bundle is an output.
`;
}
