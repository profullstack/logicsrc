# Versioning and migration policy

## Three things are versioned

| | Field | Example |
| --- | --- | --- |
| The **specification** | `opencontext:` in the manifest | `"1.0"` |
| A **context object** | `version:` | `3` |
| The **reference implementation** | npm package version | `0.1.0` |

They move independently. A specification version is a contract; a package version is a release.

## Specification versioning

Semantic versioning.

| Change | Bump | Example |
| --- | --- | --- |
| New optional field, new diagnostic code, new adapter scheme | **minor** | adding `summary` |
| Clarification with no behavioural change | **patch** | tightening prose |
| New required field, removed field, changed default, changed resolution semantics | **major** | making `owner` required |

An implementation **must refuse a major version it does not support** rather than attempt a partial parse:

```txt
✗ Manifest declares OpenContext 2.0, but this implementation supports 1.0.
    → Set opencontext: "1.0", or use a runtime that implements 2.x.
```

A minor version is forward-compatible: a 1.0 runtime reading a 1.1 manifest ignores fields it does not know, and preserves unknown extensions.

Major breaking changes require a new major specification version. There is no silent semantic drift within a major line — if resolution would return different context for the same repository, that is a major change.

## Extensions instead of forks

Before proposing a field, try an extension:

```yaml
extensions:
  com.example.risk:
    score: 0.25
```

Namespaced keys never collide, survive resolution, land in the bundle, and do not invalidate a document in any conforming implementation. If an extension proves broadly useful, propose it for the next minor version.

`--strict` rejects extension keys that are not reverse-DNS namespaced, which is the only way an extension can fail validation.

## Object versioning

`version` is monotonic within an id and is referenced as `id@version`.

Bump it when the **meaning** changes — a new refund window, a changed approval threshold. Do not bump it for a typo; edit in place and update `updated`.

Supersession is declared, never inferred from the number:

```yaml
id: pricing.enterprise
version: 2
supersedes: [pricing.enterprise@1]
```

The previous version stays on disk. See [lifecycle](./lifecycle.md#versions-and-supersession).

## Renaming an id

An id is the contract other objects, roles, and bundles reference. Renaming is a breaking change.

Prefer supersession:

```yaml
# context/policies/returns.md — the new id
id: policies.returns
supersedes: [policies.refunds]
```

The old object remains resolvable in historical queries, and `history policies.returns` still surfaces the chain. A hard rename silently breaks every `references`, every role `include`, and every archived bundle digest.

## Migrating between minor versions

1. Read the changelog.
2. Bump `opencontext:` in the manifest.
3. Run `opencontext validate --strict`.
4. Run `opencontext doctor --strict`.
5. Compare a bundle digest before and after — an unchanged digest proves resolution did not drift.

```bash
opencontext bundle --role support --output before.json
# bump the version
opencontext bundle --role support --output after.json
diff <(jq .digest before.json) <(jq .digest after.json)
```

That last step is the point of deterministic digests: a migration that changes what agents see is visible rather than assumed.

## Deprecation

A field deprecated in a minor version keeps working for the remainder of the major line. Deprecations are announced in the changelog, surfaced as `info` diagnostics where a validator can detect them, and only removed in the next major version.

## Implementation versioning

`@logicsrc/opencontext` follows semantic versioning independently. A patch may fix a resolver bug that changes output — if a bug caused an object to be wrongly included, fixing it changes bundles and digests. Such fixes are called out in the changelog, because a digest change is exactly what a consumer might otherwise treat as tampering.

## Schema stability

Schemas are published at stable paths and shipped with releases:

```txt
https://logicsrc.com/schemas/opencontext/manifest.schema.json
https://logicsrc.com/schemas/opencontext/object.schema.json
https://logicsrc.com/schemas/opencontext/bundle.schema.json
https://logicsrc.com/schemas/opencontext/role.schema.json
https://logicsrc.com/schemas/opencontext/provenance.schema.json
https://logicsrc.com/schemas/opencontext/decision.schema.json
https://logicsrc.com/schemas/opencontext/diagnostic.schema.json
https://logicsrc.com/schemas/opencontext/audit-event.schema.json
```

Each is self-contained — no cross-file `$ref` — so a third-party implementation can fetch one file and validate against it with no further resolution. Diagnostic codes and bundle exclusion reasons are closed sets, and adding a value to either is a minor change.

## Governance

Before v1.0 GA, the project defines specification maintainers, a public issue tracker, an RFC process, this versioning policy, a deprecation policy, a security disclosure process, a conformance policy, and an extension registration process.
