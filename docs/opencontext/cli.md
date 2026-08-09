# CLI reference

```bash
npx @logicsrc/opencontext <command>       # standalone
logicsrc context <command>      # inside the LogicSRC CLI
```

Both call the same implementation, so they cannot drift. The specification treats CLI behaviour — flags, output shapes, exit codes — as a conformance surface.

The manifest is discovered by searching upward from the working directory, so commands work from anywhere inside a project.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | ok |
| `1` | invalid — validation failed, conflicts found, health below minimum |
| `2` | usage — bad flag, unknown role or agent |
| `3` | not found — no manifest, no such object |

## Global flags

```txt
-C, --dir <path>       project directory or manifest path (default: search upward)
--format <format>      table, json, yaml, markdown, ndjson
--output <file>        write to a file instead of stdout
--offline              never reach the network
--at <timestamp>       resolve as of an RFC 3339 instant or YYYY-MM-DD date
```

`--at 2026-08-09` is read as the *end* of that day, so it includes everything that happened during it.

Human-readable output is the default; `--format json` is the automation contract. There is no telemetry, and no network call for a local-only project.

## `init`

```bash
opencontext init [dir] [--id acme] [--name "ACME Corporation"] [--yes] [--force]
```

Creates a project that passes `validate --strict` and scores 100% on `doctor` with no edits — including two roles with genuinely different scopes, so the permission model is visible from the start.

`--yes` takes every default, suitable for agents and scripts. Existing files are kept unless `--force`.

## `validate`

```bash
opencontext validate [--strict]
```

Checks the manifest, object schemas, ids, references, supersession chains, role graph, permissions, provenance, and secrets.

`--strict` additionally fails on warnings and requires namespaced extensions.

Errors name the file, line, field, expected value, actual value, and a remediation:

```txt
✗ context/policies/refunds.md:3: policies.refunds: authority must be equal to one of the allowed values
    field: authority
    expected: ["canonical","approved","reference","observed","inferred","historical"]
    actual:   gospel
    → Use one of the listed values.
```

## `doctor`

```bash
opencontext doctor [--strict] [--min-score 90]
```

Validation plus the questions that need a clock: what is stale, expired, overdue for review, orphaned, unowned, or broken.

```txt
OpenContext Health
────────────────────────────────
Mission                 ✓ canonical
Brand                   ✓ current
Pricing                 ✓ current
Engineering SOPs        ⚠ stale

Orphaned context        7
Conflicting context     2
Expired context         4
Stale context           3
Missing owners          3
Broken sources          1

Context health: 91%
```

## `get`

```bash
opencontext get <id> [--agent a] [--role r...]
opencontext get policies.refunds@2
```

Prints one object, subject to authorization. A denied read and a missing object are reported identically.

## `list`

```bash
opencontext list [--agent a] [--role r...] [--type policy] [--layer L3]
                 [--authority canonical] [--owner support] [--tag refunds]
                 [--include-historical]
```

```txt
id                  type       layer  authority  owner     state
------------------  ---------  -----  ---------  --------  -------
mission             mission    L0     canonical  founders  current
policies.refunds    policy     L3     canonical  support   current
procedures.refund   procedure  L4     approved   support   stale
```

Objects the scope cannot read never appear, not even as a row of metadata.

## `search`

```bash
opencontext search "refund policy" [--agent a] [--role r...] [--limit 20] [--type policy]
```

Lexical search over ids, titles, tags, summaries, and content. Results pass authorization **before** any content is returned.

## `resolve`

```bash
opencontext resolve --agent support-agent --task "Customer ACME requested a refund" --explain
opencontext resolve --role support --task "continue ticket 4821" --format markdown
```

```txt
--agent <agent>          the consumer to resolve for
--role <role...>         resolve for these roles
--task <task>            drives relevance ranking
--explain                why each object was included, excluded, or outranked
--include-historical     include superseded and expired context
--limit <n>              keep the N most relevant; the rest are reported as excluded
--min-relevance <n>      drop objects scoring below this
--include <pattern...>   narrow the scope further; can never widen it
```

With `--explain` and no `--format`, the human explanation is printed. Otherwise the bundle is emitted as JSON (default), YAML, or Markdown.

## `bundle`

```bash
opencontext bundle --agent support-agent --format json --output bundle.json
```

The same resolution as `resolve`, always emitting the full bundle document. Useful as a CI artifact.

## `conflicts`

```bash
opencontext conflicts [--strict]
```

Duplicate canonical objects, declared conflicts, duplicate ids, broken supersession, and multiple active versions. `--strict` exits non-zero on any finding, not only errors.

## `stale`

```bash
opencontext stale [--strict] [--at 2026-12-01]
```

Context past its freshness window, expired, not yet valid, or overdue for review.

## `history`

```bash
opencontext history pricing.enterprise
```

```txt
History of pricing.enterprise

  v1  superseded  canonical  2026-01-01T00:00:00Z  → superseded by pricing.enterprise
  v2  current     canonical  2026-08-01T00:00:00Z

Commits:
  9f2c1ab3  2026-08-01  Dana Okafor  Raise enterprise floor to $2,500
```

Declared version history first — that is what the organization believed and when. Git commits follow, when git is available; without it, declared history is still shown.

## `diff`

```bash
opencontext diff pricing.enterprise@1 pricing.enterprise@2
```

```txt
~ pricing.enterprise  (changed)
    authority:
      - reference
      + canonical
    content:
      - Enterprise plans start at $1,800/month.
      + Enterprise plans start at $2,500/month.
```

Compares the fields whose change is a governance event, not every byte.

## `graph`

```bash
opencontext graph [--root policies.refunds] [--depth 2] [--owners] [--sources]
opencontext graph --format dot > context.dot
```

References, supersession, conflicts, dependencies, ownership, and sources. Text, JSON, and Graphviz DOT.

## `schema`

```bash
opencontext schema              # list the published schemas
opencontext schema object       # print one
```

## `add` and `supersede`

```bash
opencontext add policies.returns --type policy --title Returns --content "Within 14 days."
opencontext supersede policies.refunds --content "Within 60 days." --dry-run
```

```txt
--type <type>        required for add
--title, --content, --layer, --authority, --owner
--file <path>        where to write it
--promote            permit canonical or approved authority
--dry-run            show what would be written
```

Writes validate authorization and schema before touching disk. Promotion to `canonical` or `approved` requires `--promote` — it is a governance act, not a side effect of writing. Superseding leaves the previous version on disk.

## `version`

```bash
opencontext version    # the supported specification version
```

## CI

```yaml
- run: npx @logicsrc/opencontext validate --strict
- run: npx @logicsrc/opencontext doctor --strict
- run: npx @logicsrc/opencontext bundle --role support --output bundle.json
```

Common gates:

```bash
opencontext conflicts --strict                    # reject duplicate canonical policies
opencontext stale --strict                        # reject expired required context
opencontext doctor --strict --min-score 95        # enforce a health floor
```

## Piping

Output is stdout, diagnostics are stderr, and a closed pipe (`opencontext list | head`) exits cleanly rather than printing a stack trace.

```bash
opencontext list --format ndjson | jq -r 'select(.lifecycle=="stale") | .id'
opencontext bundle --role support | jq '.digest'
```
