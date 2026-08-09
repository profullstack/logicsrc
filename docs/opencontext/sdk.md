# TypeScript SDK

```bash
npm install @logicsrc/opencontext
```

Node.js 22+, Bun, and compatible modern server runtimes. ESM.

```ts
import { OpenContext } from "@logicsrc/opencontext";

const oc = await OpenContext.load("./opencontext.yaml");

const result = await oc.resolve({
  agent: "support-agent",
  task: "Handle ACME refund"
});

console.log(result.bundle);
```

The resolver core is importable without the CLI, so an agent runtime can embed resolution without taking a dependency on argument parsing or terminal output. Every method the class wraps is also exported as a free function.

## `OpenContext.load`

```ts
static load(pathOrDir?: string, options?: {
  offline?: boolean;      // skip adapters that reach the network
  loadContent?: boolean;  // resolve content_uri (default true)
  adapters?: Adapter[];   // additional adapters
}): Promise<OpenContext>
```

Accepts a manifest path or a directory. A directory searches upward, so `load()` with no argument works from anywhere inside a project.

## `resolve`

```ts
oc.resolve({
  agent: "support-agent",
  role: ["support"],
  task: "Handle ACME refund",
  at: "2026-08-09T15:00:00Z",
  includeHistorical: false,
  explain: true,
  limit: 20,
  minRelevance: 2,
  include: ["policies.*"],
  requested: ["policies.refunds"]
}): { bundle, excluded, scopeSummary }
```

`bundle()` returns just the bundle when the exclusion detail is not needed.

```ts
const bundle = oc.bundle({ agent: "support-agent", task: "refund" });
bundle.digest;      // sha256:… deterministic for the same inputs and sources
bundle.objects;     // authorized, valid, redacted, ordered by layer
bundle.warnings;    // stale, conflicts, missing provenance, untrusted content
bundle.provenance;  // survives compilation
```

## `validate` and `doctor`

```ts
const findings = oc.validate({ strict: true });   // Diagnostic[]
const report = oc.doctor({ at: "2026-12-01" });   // DiagnosticReport

import { hasFailure } from "@logicsrc/opencontext";
if (hasFailure(findings, "error")) process.exit(1);
```

## `list`, `get`, `search`

```ts
oc.list({ scope, type: "policy", layer: "L3", includeSuperseded: false });
oc.get("policies.refunds");
oc.get("policies.refunds@2", { scope });
oc.search("refund policy", { scope, limit: 20 });
```

`get` returns `null` both when the object does not exist **and** when the scope may not read it — deliberately indistinguishable, so probing for ids reveals nothing. `list` and `search` apply the same filter before returning any metadata.

## `scope`

```ts
const scope = oc.scope({ agent: "support-agent" });
const combined = oc.scope({ role: ["support", "finance"] });

scope.include;            // effective patterns
scope.maxClassification;  // effective ceiling
scope.permissions;        // capability strings
scope.principals;         // matched against object-level permissions
```

## `history`, `diff`, `graph`

```ts
const history = await oc.history("pricing.enterprise");
const diffs = oc.diff("pricing.enterprise@1", "pricing.enterprise@2");
const graph = oc.graph({ roots: ["policies.refunds"], depth: 2, includeOwners: true });
```

## Writes

```ts
oc.add({ id: "policies.returns", type: "policy", content: "Within 14 days." });

oc.supersede("policies.refunds", {
  scope,
  changes: { content: "Within 60 days." },
  allowPromotion: true
});

const oc2 = await oc.reload();
```

Writes validate authorization and schema before persisting, and throw `WriteDeniedError` otherwise. Promotion to `canonical` or `approved` requires `allowPromotion: true`. `add` refuses to overwrite; use `supersede`.

The store is a snapshot — call `reload()` after writing.

## `registerAdapter`

```ts
import { OpenContext, type Adapter } from "@logicsrc/opencontext";

const crmAdapter: Adapter = {
  name: "crm",
  schemes: ["crm"],
  remote: true,
  async load(uri, ctx) {
    if (ctx.offline) throw new Error(`Cannot fetch ${uri} in offline mode.`);
    const record = await fetchFromCrm(uri);
    return {
      content: JSON.stringify(record),
      contentType: "application/json",
      trust: "untrusted"   // it is data from another system
    };
  }
};

const oc = await OpenContext.load("./opencontext.yaml", { adapters: [crmAdapter] });
```

See [adapters](./adapters.md).

## Rendering

```ts
import { renderBundle, renderExplanation, renderHealth } from "@logicsrc/opencontext";

renderBundle(bundle, "json" | "yaml" | "markdown");
renderExplanation(bundle, excluded);
renderHealth(report, oc.store);
```

`renderBundle(bundle, "markdown")` is what you paste into a system prompt: it groups by layer, and fences and labels untrusted content. See [security](./security.md).

## Errors

| Error | Meaning |
| --- | --- |
| `ManifestNotFoundError` | No manifest here or in any parent |
| `ManifestInvalidError` | Manifest failed schema or cross-field rules; carries `diagnostics` |
| `UnknownConsumerError` | Agent or role not defined |
| `UnknownSchemeError` | No adapter claims the URI scheme |
| `PathTraversalError` | A source resolves outside the context root |
| `OfflineError` | A remote fetch was attempted in offline mode |
| `WriteDeniedError` | Authorization, schema, or promotion guard refused a write |
| `ContextParseError` | A document failed to parse; carries `file` and `line` |

## Free functions

```ts
import {
  loadStore, resolve, validateStore, doctor, search, buildGraph, history, diffObjects,
  authorize, resolveScope, applyRedactions, computeLifecycle,
  resolveSupersession, detectConflicts, compareCandidates,
  digestBundle, canonicalJson, bundleIdFromDigest,
  initProject, AdapterRegistry
} from "@logicsrc/opencontext";
```

Useful when embedding one part of the pipeline — for example authorizing a set of candidates your own retriever produced, without adopting the loader.

## Types

```ts
import type {
  Manifest, ContextObject, ContextBundle, BundledObject,
  EffectiveScope, RoleDefinition, Diagnostic, DiagnosticReport,
  Layer, Authority, Trust, Durability, Classification, LifecycleState,
  Adapter, AdapterResult, ResolveOptions
} from "@logicsrc/opencontext";
```

## Worked example: an agent handoff

```ts
import { OpenContext, renderBundle } from "@logicsrc/opencontext";

const oc = await OpenContext.load("./opencontext.yaml");

const { bundle } = oc.resolve({
  role: "support",
  task: "continue ticket 4821",
  explain: true
});

const systemPrompt = renderBundle(bundle, "markdown");

// Record which context the decision was made from.
await recordDecision({
  id: `decisions.${today}-refund-4821`,
  type: "decision",
  title: "Refund ticket 4821",
  decision: "Credited against the next invoice.",
  bundle: { bundle_id: bundle.bundle_id, digest: bundle.digest }
});
```

Replace the model tomorrow and run the same code: the bundle is identical, and its digest proves it.
