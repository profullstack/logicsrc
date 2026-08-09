# Engineering team

Architecture knowledge, engineering policy, an incident runbook, and ADR-style
decisions — including a superseded one.

```bash
opencontext validate --strict
opencontext resolve --agent dev-agent --task "add a column to the accounts table" --explain
opencontext history decisions.2026-08-01-postgres-ha
opencontext graph --format dot > context.dot
```

The two decisions show supersession working: the February decision is retained
with `authority: historical` and `superseded_by`, and the August one supersedes
it. Default resolution returns only the current one; `--include-historical`
returns both, which is how you reconstruct what the team believed in March.

`oncall-agent` inherits everything `dev-agent` has and adds
`deploy.production`. Inheritance unions scope and can only ever narrow the
classification ceiling — it cannot widen access.
