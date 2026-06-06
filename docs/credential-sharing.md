# Credential Sharing OpenSpec

Status: coming soon

Slug: `credential-sharing`

Credential Sharing is a LogicSRC OpenSpec for portable, auditable secret synchronization across local files and infrastructure providers. It is intended to replace closed, proprietary credential-sharing workflows with a provider-neutral contract.

LogicSRC defines the open objects, CLI commands, SDK calls, TUI states, PWA states, provider adapter capabilities, and audit records. External products may consume this contract, but LogicSRC does not call out to product-specific commands.

## First Providers

```txt
env
doppler
railway
github-secrets
```

- `.env`: read, diff, redact, and write local environment files.
- Doppler: sync project/config scoped secrets.
- Railway: sync service variables.
- GitHub Secrets: sync repository, organization, and environment secrets.

## Core Objects

```txt
credential_provider
credential_source
credential_target
credential_key
credential_fingerprint
credential_policy
credential_diff
credential_sync_plan
credential_sync_run
credential_approval
credential_rollback
credential_audit_event
```

## CLI Spec

Command namespace:

```bash
logicsrc credentials <command>
```

Required commands:

```txt
providers
inspect
plan
diff
approve
sync
rollback
audit
export
```

Examples:

```bash
logicsrc credentials providers
logicsrc credentials plan --from env --to railway
logicsrc credentials plan --from doppler --to github-secrets
logicsrc credentials diff --from env --to doppler --redact
logicsrc credentials sync --plan cred_plan_123 --approve
logicsrc credentials audit --run cred_run_123 --format markdown
```

## Security Rules

- Raw secret values must never be printed by default.
- Audit logs should store key names, targets, timestamps, actor identity, and value fingerprints, not raw values.
- Every write operation should support dry-run mode.
- Provider adapters must declare read/write capabilities before a plan is generated.
- Destructive changes require explicit approval.
- Rollbacks must be represented as new sync plans rather than hidden mutation history.

## SDK Spec

All SDKs should expose the same conceptual API:

```txt
listCredentialProviders()
inspectCredentialSource(source)
createCredentialSyncPlan(input)
diffCredentialTargets(planId)
approveCredentialSync(planId, approval)
runCredentialSync(planId)
rollbackCredentialSync(runId)
exportCredentialAudit(runId)
```

## Provider Adapter Contract

Provider adapters implement the LogicSRC credential provider contract:

```txt
provider.id
provider.capabilities
provider.auth_requirements
provider.inspect()
provider.diff()
provider.write()
provider.rollback()
provider.audit()
```

The adapter boundary lets tools such as a PWA, TUI, CI workflow, or external CLI consume the same open standard without making LogicSRC depend on any specific product.
