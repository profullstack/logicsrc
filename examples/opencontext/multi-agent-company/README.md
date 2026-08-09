# Multi-agent company

One shared context repository. Five agents. Five different bundles.

```bash
opencontext validate --strict
opencontext doctor

for agent in sales-agent support-agent dev-agent finance-agent ops-agent; do
  echo "== $agent"
  opencontext resolve --agent "$agent" --explain
done
```

## What each agent gets

| Agent | Sees | Never sees |
| --- | --- | --- |
| `sales-agent` | products, customers, pricing, quoting SOP | churn risk, payroll, architecture |
| `support-agent` | products, customers, refunds, refund SOP | pricing, payroll, architecture |
| `dev-agent` | architecture, change management, decisions | customers, pricing, payroll |
| `finance-agent` | every policy including payroll, customers | architecture, runbooks, card numbers |
| `ops-agent` | procedures, runbooks, change management | customers, pricing, payroll |

## Three mechanisms doing the work

**Scope.** Each role includes only what it needs. `sales` additionally excludes
`customers.*.churn-risk`, so an inferred model score cannot leak into a customer
conversation even though `customers.*` matches it.

**Classification.** `policies.payroll` is `confidential`. Only `finance`
declares `max_classification: confidential`; every other role falls back to
`internal` and is refused. A role's own declaration wins over the one it
inherits, so a ceiling on a shared base role cannot silently cap a role that was
deliberately granted more — while requesting several roles at once still takes
the lowest of them, so combining roles never escalates.

**Redaction.** The manifest redacts `payment.card` repository-wide, so no role —
including `finance` — ever receives a card number, even from a record it is
fully entitled to read.

**Object permissions.** `policies.payroll` also carries
`permissions.read: [finance]`, so it is refused even to a role whose include
pattern matches it. Deny overrides allow, at every level.

## The point

Replace `support-agent` with a different model tomorrow. Run the same command.
The bundle is identical, and its digest proves it. The agent was replaceable;
the context was not.
