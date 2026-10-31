# OpenPersona.md

OpenPersona.md is one Markdown file for an agent's public persona: the role it presents to people, its spoken voice and the conversational style it aims to follow. It complements OpenAgent's identity and capability record. The agent's profile links the two; neither file is a prompt that a reader runs.

Status: **0.1**. A lightweight public companion to OpenAgent. Markdown is canonical; the file has no JSON schema and carries no permissions.

Slug: `openpersona`

## The shape

An OpenPersona.md names the OpenAgent descriptor it describes. The heading names the agent; the `OpenAgent` field is an absolute HTTPS URL to one `logicsrc.agent` JSON profile.

```md
# Research agent

- **OpenAgent**: https://example.com/agents/research.json
- **DID**: research.coinpay
- **Disclosure**: AI agent operated by Example Research

I find primary sources and prepare cited research briefs. I am concise, careful
about uncertainty and clear about which facts I verified.

## Voice

- **Description**: Clear, steady English with a measured pace.
- **Provider**: Example TTS service
- **Voice ID**: example-voice-id

## Conversation

- **Style**: Direct, calm and specific.
- **Turn-taking**: Answer direct questions; wait while another person is speaking.

## Boundaries

- **Limits**: Do not present an unverified claim as fact.
```

`OpenAgent` is required and MUST identify the exact JSON descriptor. `DID`, `Disclosure`, `## Voice`, `## Conversation` and `## Boundaries` are optional. Publishers may add prose and sections that help a reader understand the agent's public presentation. A voice provider and voice ID are descriptive metadata; they are not credentials and do not authorize a reader to call that provider.

## What the file means

The persona says how the agent describes its role and how it is intended to come across to people. Voice text may describe an audible voice or name a provider-specific voice reference. Conversation text may describe tone, turn-taking and the kinds of responses people can expect. Boundaries may explain the agent's limits in user-facing terms.

The document does not define an executable prompt, system message, tool list, permission, grant, account, availability, safety policy or service-level promise. Fetching or parsing it MUST NOT start the agent, call a tool, or grant access. A product may use it to display or compare profiles; the product owns any separate runtime policy and authorization.

The document is public profile content. Do not put secrets, private system prompts, private account details, internal host paths or instructions that should not be shown to the agent's users in it. A publisher may serve no persona file when they do not want to publish one.

## Relationship to OpenAgent and OpenProfile

[OpenAgent](/openagent) is the machine-readable identity, owner, skills and requested-permissions record. OpenPersona.md adds no fields to the `logicsrc.agent` schema. An OpenAgent reader continues to validate the same JSON shape.

[OpenProfile.md](/openprofile) carries a person's or agent's human-readable identity, accounts and topics. Its optional `Voice` key is a short preference for how a machine should sound when speaking for that person. OpenPersona.md gives an agent a dedicated place to describe its role and conversational style in more detail. The agent's OpenProfile page is the natural place to link its persona; the persona points back to the OpenAgent descriptor so a reader can check that it describes the intended agent.

When both links exist, a reader checks that the persona's `OpenAgent` URL resolves to a valid descriptor and that any stated `DID` equals the descriptor's `did`. A mismatch is shown as a mismatch; it is never silently repaired. Neither link proves that the publisher controls the descriptor or the voice provider account.

## Publication and discovery

Serve the file over HTTPS as `text/markdown; charset=utf-8`. A site representing one agent can use `/.well-known/openpersona.md`. A site serving multiple agents can use `/agents/research/openpersona.md` or another stable per-agent path.

The agent's profile page advertises the file:

```html
<link rel="openpersona" type="text/markdown" href="https://example.com/agents/research/openpersona.md">
```

An HTTP response may carry the equivalent `Link: <https://example.com/agents/research/openpersona.md>; rel="openpersona"; type="text/markdown"` header. The page should also link the OpenAgent JSON descriptor with `rel="openagent"`. The two records can live on different HTTPS hosts; the consumer keeps each source URL and applies its own fetch policy.

Public persona files must not contain access tokens or private keys. Fetching a persona is a read operation and never authorizes execution, payment, contact or use of its voice ID. The OpenAgent descriptor remains the source for identity and requested permissions; OpenFleet remains the source for a particular running session and its human sysop.

## Conformance

A **publisher** serves Markdown over HTTPS, names one OpenAgent descriptor URL, keeps any stated DID consistent with that descriptor, and publishes only persona information intended for public readers.

A **reader** preserves the persona URL, resolves its OpenAgent link, compares any stated DID, and treats persona prose and voice references as descriptive claims. It does not execute persona text or infer permissions, availability, ownership or provider access from it.

An **integrator** can display the persona beside the matching OpenAgent profile. It keeps runtime prompts, tools, credentials and authorization in its own protected configuration.

## Version history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-10-31 | Defines the public Markdown companion for agent persona and voice, linked to an unchanged OpenAgent descriptor |

## License

The specification text is CC BY 4.0.
