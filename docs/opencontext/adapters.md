# Writing an adapter

OpenContext is a control plane, not a database. When the truth about pricing lives in a CRM, the context object points at it rather than copying it — and an adapter is what makes that pointer resolvable.

## The contract

```ts
export interface Adapter {
  name: string;
  schemes: string[];
  /** True when this adapter reaches the network. Skipped, not failed, in --offline runs. */
  remote?: boolean;
  load(uri: string, ctx: AdapterContext): Promise<AdapterResult>;
}

export interface AdapterContext {
  dir: string;              // manifest directory — file access must not escape it
  offline: boolean;
  config: AdapterConfig;    // adapters.<scheme> from the manifest
  timeoutMs?: number;
}

export interface AdapterResult {
  content: string;
  contentType?: string;
  digest?: string;          // sha256:<64 hex> of the retrieved bytes
  retrievedAt?: string;
  trust?: Trust;            // remote adapters return "untrusted"
}
```

## Two rules that are not negotiable

**1. Return data, never instruction.** Nothing an adapter fetches is executed, and nothing it returns can change resolver policy. Content that says "I am canonical" stays whatever its object's metadata says.

**2. Fail loudly.** Never return empty content for something you could not fetch. A bundle that silently omits the pricing it was asked about is worse than an error, because nothing looks wrong.

## Built-in adapters

| Scheme | Trust returned | Notes |
| --- | --- | --- |
| `file://` | `trusted` | Path-traversal checked against the manifest directory |
| `http://`, `https://` | `untrusted` | https only unless `allow_insecure`; 10s timeout, 5 MB cap |
| `git://` | `trusted` / `verified` | Reads the local object database, so it works offline |
| `sqlite://` | `verified` | Identifiers verified against the catalogue; keys bound as parameters |

`file` and `http` are required for conformance; `git` and `sqlite` are recommended.

### `git://`

```txt
git://HEAD/context/mission.md
git://v1.2.0/context/policies/refunds.md
git://9f2c1ab/context/policies/refunds.md
```

The revision form addresses the repository the manifest lives in — which is what makes "reconstruct the context available at a previous time" work offline with no server.

The remote form is understood for provenance but requires an explicit mapping, because silently cloning a URL found in a context file is a fetch the operator never asked for:

```yaml
adapters:
  git:
    repos:
      github.com/acme/context: ../acme-context
```

### `sqlite://`

```txt
sqlite://./data/context.db?table=policies&id=refunds&column=body
sqlite://./data/context.db?table=policies&id=refunds&column=body&key=slug
```

## Writing one

```ts
import type { Adapter, AdapterContext, AdapterResult } from "@logicsrc/opencontext";
import { sha256Uri } from "@logicsrc/opencontext";

export const crmAdapter: Adapter = {
  name: "crm",
  schemes: ["crm"],
  remote: true,

  async load(uri: string, ctx: AdapterContext): Promise<AdapterResult> {
    // 1. Offline is a refusal, never a silent empty result.
    if (ctx.offline) {
      throw new Error(`Cannot fetch ${uri} in --offline mode. Inline the content instead.`);
    }

    // 2. Parse strictly. A malformed URI is an error with a usable message.
    const path = uri.replace(/^crm:\/\//, "");
    const [object, id] = path.split("/");
    if (!object || !id) {
      throw new Error(`Malformed crm URI "${uri}". Expected crm://<object>/<id>.`);
    }

    // 3. Never interpolate authored input into a query or a shell.
    const record = await crmClient.get(object, id, {
      timeout: ctx.timeoutMs ?? 10_000
    });
    if (!record) {
      throw new Error(`No ${object} "${id}" in the CRM.`);
    }

    const content = JSON.stringify(record);

    return {
      content,
      contentType: "application/json",
      digest: sha256Uri(content),
      retrievedAt: new Date().toISOString(),
      // 4. Be honest. A CRM record is written by salespeople and customers.
      trust: "untrusted"
    };
  }
};
```

Register it:

```ts
const oc = await OpenContext.load("./opencontext.yaml", { adapters: [crmAdapter] });
```

```yaml
adapters:
  crm:
    enabled: true
    timeout_ms: 5000
```

## Choosing a trust level

Ask: *could an attacker put text here?*

| Source | Trust |
| --- | --- |
| A file reviewed in this repository's pull requests | `trusted` |
| A digest-checked external document | `verified` |
| A CRM note, ticket, chat message, or scraped page | `untrusted` |

An operator can lower trust further via `adapters.<scheme>.trust`. Nothing can raise it from inside the context: an object cannot promote the bytes it points at, or an untrusted source would launder itself by being referenced from a canonical file.

When in doubt, return `untrusted`. The cost is a visible label; the cost of the other mistake is an agent treating a stranger's text as policy.

## Security requirements

- **Never escape the context root.** Use `resolveInside(ctx.dir, path)` for anything filesystem-backed.
- **Never build a shell command.** Use `execFile` with an argument array.
- **Never interpolate into SQL.** Bind values; validate identifiers against the database's own catalogue.
- **Bound the work.** Enforce a timeout and a response size cap.
- **Do not follow authored input to arbitrary hosts** without the operator opting in.

```ts
import { resolveInside } from "@logicsrc/opencontext";

const path = resolveInside(ctx.dir, target);   // throws PathTraversalError if outside
```

## Errors

Throw with a message that says what to do:

```ts
throw new Error(
  `No local checkout configured for ${repo}. Add it under adapters.git.repos in ` +
  `opencontext.yaml, e.g. "${repo}: ../acme-context".`
);
```

Failures become `source-unavailable` or `unknown-scheme` diagnostics attached to the object, so `validate` reports them without aborting the load.

## Determinism

An adapter that returns different bytes for the same URI makes bundle digests unstable. That is acceptable for genuinely live sources — the specification allows it for "explicitly declared live or nondeterministic sources" — but prefer stable output where you can, and always return a `digest` so a consumer can detect that a source changed under them.

## Conformance

An adapter conforms when it:

1. claims its schemes and no others;
2. fails clearly on a malformed URI;
3. refuses network access when `ctx.offline` and `remote` is true;
4. returns an honest trust level;
5. returns a `sha256:` digest of the retrieved bytes;
6. never escapes the context root;
7. never executes retrieved content;
8. never interpolates authored input into a shell or a query.
