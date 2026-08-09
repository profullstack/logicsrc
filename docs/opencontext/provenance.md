# Provenance

Provenance answers **"who says so, and when did we last check"**.

That is a different question from "is it true" ([authority](./authority.md)) and from "may you read it" ([permissions](./permissions.md)). An object can be canonical and unattributable, or perfectly attributed and merely observed.

> **Provenance survives resolution.** Summarising or reformatting content may not erase its origin, because an agent that cannot cite its sources cannot be audited or corrected.

## Declaring it

Two ways, and the difference matters.

```yaml
# This object *is* the origin. A mission statement written here has no upstream.
canonical_source: true
```

```yaml
# This object mirrors a fact that lives somewhere else.
sources:
  - uri: git://github.com/acme/context/policies/refunds.md
    type: document
    retrieved_at: 2026-08-09T15:00:00Z
    digest: sha256:9f2c1ab…
    trust: trusted
    author: support
```

| Field | Notes |
| --- | --- |
| `uri` | Where it came from. The scheme tells a reader which system to go argue with when the fact is wrong. |
| `type` | `canonical-record`, `document`, `conversation`, `observation`, `api`, `inference`. |
| `retrieved_at` | When these bytes were last read. |
| `digest` | `sha256:<64 hex>` over the retrieved bytes. |
| `trust` | Trust of this specific origin, when it differs from the object's. |

More than one source is normal — the same fact may be mirrored from a CRM and confirmed in a policy document.

## Requiring it

```yaml
provenance:
  required: true
  digest: sha256
  require_digest: false
```

Every resolved object must then declare a source or `canonical_source: true`:

```txt
✗ missing-provenance: policies.refunds declares no source, and provenance.required is true.
    → Add sources: [...], or canonical_source: true if this object is itself the origin.
```

### Judged against what the author wrote

The loader attaches a `file://` source with a digest to every file-backed object, so a bundle is attributable even when the author declared nothing. That is *added* provenance, and it is deliberately **not** what the requirement is checked against.

If it were, `provenance.required` would always pass and mean nothing. The check runs against the authored document, so "this pricing came from the CRM" is something a human has to say.

## Integrity digests

```yaml
sources:
  - uri: https://example.com/handbook.md
    digest: sha256:9f2c1ab…
```

A digest lets a consumer detect that a remote source **changed under them** — the difference between stale context and silently wrong context.

```yaml
provenance:
  require_digest: true    # every remote source must carry one
```

```txt
✗ missing-digest: policies.handbook: remote source https://example.com/h.md has no
  integrity digest.
    → Add digest: sha256:<hex>, so a change at the source is detectable.
```

## In the bundle

Provenance is flattened into its own top-level list, so it stands on its own even when content was summarised:

```json
{
  "objects": [ { "id": "policies.refunds", "content": "Refunds within 30 days." } ],
  "provenance": [
    {
      "id": "policies.refunds",
      "canonical_source": true,
      "sources": [
        { "uri": "file://context/policies/refunds.md",
          "type": "document",
          "retrieved_at": "2026-08-09T14:00:00Z",
          "digest": "sha256:4c6959f2…",
          "trust": "trusted" }
      ]
    }
  ]
}
```

Query it:

```bash
opencontext bundle --role support | jq '.provenance[] | {id, sources: [.sources[].uri]}'
```

## Provenance and trust

Attribution is not endorsement. Naming a source makes a claim **checkable**; it does not make it true.

```yaml
id: operations.ticket-4821
authority: observed        # we saw it
trust: untrusted           # a stranger wrote it
sources:
  - uri: https://support.example.com/tickets/4821
    type: conversation
    trust: untrusted
```

An origin of type `conversation` or `observation` is a reason to keep the object's authority low. See [security](./security.md).

## Provenance and decisions

The two together are what make an agent's decision reconstructable a year later:

```yaml
id: decisions.2026-08-09-refund-4821
type: decision
decision: Credited against the next invoice.
bundle:
  bundle_id: ocb_37c04d801d013b07
  digest: sha256:37c04d80…
```

The bundle digest proves **which context was in front of the decider**; the provenance inside that bundle proves **where each piece came from**. Neither is enough alone.

## Checklist

- [ ] `provenance.required: true` in production repositories.
- [ ] Objects mirroring another system name it in `sources`, with the right scheme.
- [ ] Objects authored here declare `canonical_source: true` rather than a fake source.
- [ ] Remote sources carry digests; `require_digest: true` where it matters.
- [ ] `type` reflects the real origin — `conversation` and `observation` are not `canonical-record`.
- [ ] Decision records cite the bundle they were made from.
