# Minimal

The floor: a mission, a policy, and a role that can read both.

```bash
opencontext validate --strict
opencontext resolve --role everyone --format markdown
```

Only `id` and `type` are required on a context object. Everything else in these
files — authority, owner, classification — exists so the context can be
*governed* rather than merely stored.
