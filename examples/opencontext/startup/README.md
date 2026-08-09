# Startup

A young company with products, pricing, procedures, and decisions — every layer
from L0 mission to L5 decisions.

```bash
opencontext validate --strict
opencontext doctor

opencontext resolve --agent sales-agent --task "quote 20 lanes for a new customer" --explain
opencontext resolve --agent dev-agent --explain
```

The two agents share one repository and receive different context. The sales
agent gets pricing and the quoting SOP; the dev agent gets decisions and never
sees the pricing policy.
