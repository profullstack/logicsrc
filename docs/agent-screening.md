# AgentByte Plugin Spec

Status: coming soon

Slug: `agentbyte`

AgentByte is a working-title LogicSRC plugin spec for interoperable screening workflows in the AI era. It is intended for candidate screening, contractor qualification, agent capability checks, team upskilling, and marketplace trust.

The spec assumes both humans and AI agents may participate. AI assistance is not treated as cheating by default; it is declared, measured, constrained, and audited by policy.

## Goals

- Turn job descriptions, project needs, and role requirements into structured screening plans.
- Support human, AI-assisted human, autonomous agent, and hybrid candidate modes.
- Record what tools, models, prompts, files, repos, and external resources were used.
- Produce portable scorecards, evidence, transcripts, artifacts, and replayable audit logs.
- Let products implement screening without owning the standard.

## Core Objects

```txt
screening_profile
screening_plan
screening_session
screening_question
screening_challenge
screening_answer
screening_artifact
screening_scorecard
screening_policy
screening_proctor_event
screening_model_use
screening_decision
```

## Candidate Modes

```txt
human_only
human_ai_assisted
agent_only
human_agent_pair
team
```

## Policy Fields

```txt
ai_allowed
allowed_models
blocked_models
allowed_tools
blocked_tools
internet_allowed
repo_access
time_limit_seconds
recording_required
human_attestation_required
agent_attestation_required
evidence_required
```

## CLI Spec

Command namespace:

```bash
logicsrc agentbyte <command>
```

Required commands:

```txt
plan create
plan get
session start
session submit
session score
session audit
policy validate
artifact attach
export scorecard
```

Examples:

```bash
logicsrc agentbyte plan create --role "AI Engineer" --repo profullstack/logicsrc
logicsrc agentbyte session start --plan plan_123 --candidate did:agent.qa
logicsrc agentbyte session submit --session ssn_123 --artifact ./patch.diff
logicsrc agentbyte session audit --session ssn_123 --format markdown
```

## TUI Spec

Required panes:

```txt
plans
sessions
live transcript
questions/challenges
artifacts
model/tool use
scorecard
audit events
policy violations
```

Required actions:

```txt
start session
pause session
attach artifact
request clarification
mark evidence
score criterion
flag policy event
export scorecard
```

## SDK Spec

All SDKs should expose the same conceptual API:

```txt
createPlan(input)
getPlan(id)
startSession(planId, candidate)
submitAnswer(sessionId, answer)
attachArtifact(sessionId, artifact)
recordModelUse(sessionId, modelUse)
scoreSession(sessionId, scorecard)
exportAudit(sessionId)
```

### Rust

Package target: `agentbyte`

```rust
let client = ScreeningClient::new(config);
let plan = client.create_plan(plan_input).await?;
let session = client.start_session(&plan.id, candidate).await?;
```

### Bun

Package target: `@profullstack/agentbyte-bun`

```ts
const client = new ScreeningClient({ apiKey });
const plan = await client.createPlan(input);
const session = await client.startSession(plan.id, candidate);
```

### Node

Package target: `@profullstack/agentbyte-node`

```ts
import { ScreeningClient } from "@profullstack/agentbyte-node";

const client = new ScreeningClient({ apiKey });
await client.recordModelUse(sessionId, modelUse);
```

### Python

Package target: `profullstack-agentbyte`

```python
client = ScreeningClient(api_key=api_key)
plan = client.create_plan(input)
session = client.start_session(plan["id"], candidate)
```

### curl

HTTP surface:

```bash
curl -X POST "$LOGICSRC_API/agentbyte/plans" \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d @plan.json
```

Required endpoints:

```txt
POST /agentbyte/plans
GET /agentbyte/plans/:id
POST /agentbyte/sessions
GET /agentbyte/sessions/:id
POST /agentbyte/sessions/:id/answers
POST /agentbyte/sessions/:id/artifacts
POST /agentbyte/sessions/:id/model-use
POST /agentbyte/sessions/:id/score
GET /agentbyte/sessions/:id/audit
```

## PWA Spec

Required views:

```txt
plan builder
candidate intake
live screening room
challenge workspace
model/tool-use disclosure
artifact review
scorecard editor
audit timeline
decision packet
```

Required states:

```txt
draft
scheduled
active
paused
submitted
scoring
reviewed
decided
disputed
archived
```

## MCP Spec

Resources:

```txt
agentbyte://plans
agentbyte://sessions
agentbyte://policies
agentbyte://scorecards
agentbyte://audits/{session_id}
```

Tools:

```txt
create_agentbyte_plan
start_agentbyte_session
submit_agentbyte_answer
attach_agentbyte_artifact
record_agentbyte_model_use
score_agentbyte_session
export_agentbyte_audit
```

Prompts:

```txt
create-agentbyte-plan
review-agentbyte-artifacts
summarize-agentbyte-audit
draft-agentbyte-decision
```

## Minimum Audit Event Shape

```json
{
  "type": "logicsrc.event",
  "version": "0.1",
  "event_id": "evt_screening_123",
  "event_type": "screening.model_use.recorded",
  "resource_type": "screening_session",
  "resource_id": "ssn_123",
  "actor_did": "candidate.example",
  "created_at": "2026-01-01T00:00:00.000Z",
  "metadata": {
    "model": "provider/model",
    "purpose": "answer_assistance",
    "policy_allowed": true
  }
}
```
