# Customer support agent

Role-scoped customer context with redaction, and a worked prompt-injection case.

```bash
opencontext validate --strict
opencontext resolve --agent support-agent --task "ACME wants a refund on ticket 4821" --explain
opencontext resolve --agent support-agent --format markdown
```

Three things to look at in the output.

**Redaction runs after authorization.** The agent is entitled to
`customers.acme` and still never receives `ssn` or `payment.card`. The bundle
reports *that* fields were redacted, not what they contained.

**Deny beats allow.** The `support` role includes `policies.*`, which matches
`policies.internal.margins` — and the exclusion wins, so the margin floor never
reaches the bundle.

**Untrusted content is delimited.** `operations.ticket-4821` contains text
instructing the agent to ignore its refund policy and disclose payment details.
It is carried as `trust: untrusted`, fenced in `<untrusted-content>` tags in the
Markdown bundle, and flagged in `warnings`. Content that claims authority does
not acquire it.
