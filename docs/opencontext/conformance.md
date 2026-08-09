# Conformance

The fixtures are published in `@logicsrc/schemas` under `fixtures/opencontext/`. The schema half needs **no LogicSRC code** — only a JSON Schema validator.

```txt
fixtures/opencontext/
├── conformance.json      the manifest: what to run and what to expect
├── valid/                every fixture MUST validate
├── invalid/              every fixture MUST fail, for the stated reason
└── resolution/           self-contained projects pinning resolver behaviour
```

## What a v1 implementation must do

1. parse valid v1 manifests;
2. validate required schema rules;
3. resolve local file context;
4. enforce include/exclude scopes;
5. enforce deny-overrides-allow;
6. calculate lifecycle state;
7. process supersession;
8. apply authority precedence;
9. preserve provenance;
10. emit canonical JSON Context Bundles;
11. generate deterministic bundle digests;
12. report canonical conflicts;
13. pass the fixture suite.

## Levels

| Level | Requires |
| --- | --- |
| **Core** | Schema validation and local resolution |
| **Resolver** | Full resolution pipeline and bundles |
| **Tooling** | CLI-compatible commands, flags, and exit codes |
| **Adapter** | The [adapter contract](./adapters.md#conformance) |

## Running the schema fixtures

```json
{
  "valid":   [{ "fixture": "valid/manifest.json", "kind": "opencontext-manifest" }],
  "invalid": [{ "fixture": "invalid/object-missing-type.json",
                "kind": "opencontext-object",
                "why": "type is required" }]
}
```

Every `valid/` fixture must validate against its schema; every `invalid/` fixture must fail. Each invalid fixture violates exactly one rule and states which, so a failing run tells you *which* rule your validator missed rather than merely that something is wrong.

Any language works:

```python
import json, jsonschema

suite = json.load(open("fixtures/opencontext/conformance.json"))

for case in suite["valid"]:
    jsonschema.validate(load(case["fixture"]), schema_for(case["kind"]))

for case in suite["invalid"]:
    try:
        jsonschema.validate(load(case["fixture"]), schema_for(case["kind"]))
        raise AssertionError(f"{case['fixture']} should have failed: {case['why']}")
    except jsonschema.ValidationError:
        pass
```

## Running the resolution scenarios

Schemas cannot express "an exclusion beats an include" or "stale context still resolves". The `resolution/` scenarios do.

Each is a complete miniature project plus an `expected.json`:

```json
{
  "description": "An exclude pattern beats an include that also matches. Deny overrides allow, unconditionally.",
  "resolve": { "role": "support", "at": "2026-08-09T12:00:00Z" },
  "expect": {
    "included": ["mission", "policies.refunds"],
    "excluded": [{ "id": "policies.internal.margins", "reason": "scope-exclusion" }]
  }
}
```

| Scenario | Pins |
| --- | --- |
| `deny-overrides-allow` | An exclusion beats a matching include |
| `classification-ceiling` | Classification bounds a role regardless of scope |
| `object-permissions` | An object read grant narrows a role |
| `supersession` | Superseded versions excluded; `--include-historical` returns them |
| `lifecycle` | Expired and future excluded; stale resolved *and* warned |
| `redaction` | Redaction after authorization; disclosure of *that*, not *what* |
| `authority-conflict` | A settled conflict is still reported |
| `duplicate-canonical` | Two active canonical objects for one id is an error |

Assertion keys: `included`, `objectCount`, `includedVersions`, `excluded` (id + reason), `warnings`, `lifecycle`, `redacted`, `contentAbsent`, `contentEquals`. A scenario may also carry `validate.expectDiagnostics` and `validate.expectFailure`, and `also` for a second resolution against the same project.

## Determinism

A conforming implementation must produce an identical digest for a repeated run over unchanged sources. The suite asserts this for every scenario:

```ts
const first = (await OpenContext.load(dir)).bundle(options);
const second = (await OpenContext.load(dir)).bundle(options);
expect(second.digest).toBe(first.digest);
```

The digest covers resolved objects, computed lifecycle states, exclusions, and warnings. It excludes `generated_at`, `bundle_id`, `digest`, and `as_of` — see [authority](./authority.md#determinism) for why `as_of` is on that list.

## Running the reference suite

```bash
npm --workspace @logicsrc/opencontext test
npm --workspace @logicsrc/opencontext run bench
```

226 tests across seven files: core primitives, permissions and redaction, the resolution pipeline, security, the conformance fixtures, project-level behaviour, and the five shipped examples — which are held to `--strict` and a 100% health score, so a resolver change that quietly degrades a published example fails the build.

## Performance targets

Local projects, measured by `npm run bench` against a 1,000-object repository:

| Target | Budget |
| --- | --- |
| Manifest parse | < 100 ms |
| Validation of 1,000 objects | < 2 s |
| Id lookup after load | < 100 ms |
| Local resolution | < 2 s |
| Network calls for a local-only project | zero |

The benchmark exits non-zero on a regression, so it can gate a release rather than merely inform one.

## Claiming conformance

You may state that an implementation is "OpenContext compatible" when it passes the suite at a named level. Please say which level and which specification version, and keep the fixtures runnable in your CI so the claim stays true.

Official branding and conformance marks are reserved; truthful compatibility statements are not.
