# OpenContext examples

Five working [OpenContext](../../docs/opencontext.md) repositories. Every one is held to `validate --strict` and a 100% health score in CI, so a resolver change that quietly degrades a published example fails the build.

| Example | Shows |
| --- | --- |
| [minimal](./minimal) | The floor: a mission, one policy, one role |
| [startup](./startup) | Every layer, L0 through L5, with pricing, SOPs, and decisions |
| [support-agent](./support-agent) | Redaction, classification, and a worked prompt-injection case |
| [engineering-team](./engineering-team) | Architecture knowledge, runbooks, ADRs, and a supersession chain |
| [multi-agent-company](./multi-agent-company) | One repository, five agents, five different bundles |

## Running one

```bash
cd minimal

npx opencontext validate --strict
npx opencontext doctor
npx opencontext resolve --role everyone --format markdown
```

Or from anywhere, since discovery searches upward:

```bash
opencontext doctor --dir examples/opencontext/multi-agent-company
```

## What to read, in order

**Start with `minimal`** to see how little is required — `id` and `type` are the only mandatory fields on an object.

**Then `multi-agent-company`**, which is the whole thesis in one repository: five agents share one context plane and each receives a different bundle. Run all five and compare:

```bash
cd multi-agent-company
for agent in sales-agent support-agent dev-agent finance-agent ops-agent; do
  echo "== $agent"
  opencontext resolve --agent "$agent" --explain
done
```

**Then `support-agent`** if you are putting an agent in front of customers. It contains a ticket whose text instructs the agent to ignore its refund policy and disclose payment details — carried as `trust: untrusted`, fenced and labelled in the Markdown bundle, and flagged in `warnings`. The SSN is removed, the card masked, and the emails hashed, all from a record the agent is fully entitled to read.

**Then `engineering-team`** for supersession as history: a February decision retained with `authority: historical` and replaced by an August one. Default resolution returns the current decision; `--include-historical` returns both.

## Verifying them yourself

```bash
npm --workspace @logicsrc/opencontext test
```

The `examples.test.ts` suite asserts that each example validates strictly, scores 100, resolves deterministically in all three formats, and — for the multi-agent example — that no role ever receives a card number, that payroll reaches only finance, and that an inferred churn score never reaches a sales conversation.
