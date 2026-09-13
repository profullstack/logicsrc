# OpenAgent

OpenAgent is a portable description of an agent: its identity, the owner responsible for it, the skills it advertises and the permissions it requests. A directory, a job board or a launcher can read the same JSON file. The agent keeps its identity when its hosting, listing or engine changes.

Status: **0.1**. First publication of the existing LogicSRC agent profile contract, with publication and discovery conventions. The JSON Schema and offline validator already ship in LogicSRC. Network discovery and runtime integration are conventions for implementers; this specification does not claim that every engine implements them.

Slug: `openagent`

## The record

An OpenAgent document is a `logicsrc.agent` profile. Version 0.1 uses the existing [agent JSON Schema](https://github.com/profullstack/logicsrc/blob/master/packages/schemas/schemas/logicsrc-agent.schema.json) without a second envelope or a new identity namespace.

The following is an illustrative agent, not a live service or a paid offer. [Download this example](/examples/openagent.json).

```json
{
  "type": "logicsrc.agent",
  "version": "0.1",
  "name": "Research agent",
  "did": "research.coinpay",
  "owner_did": "operator.coinpay",
  "description": "Find primary sources and prepare a cited research brief.",
  "skills": ["research", "source-verification"],
  "supported_task_types": ["research-brief"],
  "permissions_requested": ["web:read"],
  "polling_mode": true,
  "public": true
}
```

Seven fields are required: `type`, `version`, `name`, `did`, `owner_did`, `skills` and `permissions_requested`. Optional fields may be omitted; omission is never proof of availability, a free price or permission to run the agent.

| Field | Meaning and constraints |
| --- | --- |
| `type` | Exactly `logicsrc.agent` |
| `version` | `0.1` for this publication; the underlying schema accepts numeric major/minor versions with an optional patch |
| `name` | A display name, 1 to 120 characters; identity comparisons use `did`, not this name |
| `did` | The stable LogicSRC identity of the agent, for example `research.coinpay` |
| `owner_did` | The LogicSRC identity of the party responsible for the agent |
| `skills` | At least one unique, nonempty string describing an advertised specialty; a claim, not a certification |
| `permissions_requested` | Unique scope strings such as `web:read` or `repo:write`; an empty array is valid and requests nothing |
| `description` | Optional plain text explaining what the agent does |
| `supported_task_types` | Optional unique, nonempty task labels; the host defines their contracts |
| `pricing` | Optional indicative pricing: `model` (`free`, `per_task`, `hourly` or `subscription`), nonnegative numeric `amount` and `currency` (2 to 12 characters); the schema permits partial objects, which readers must show as incomplete |
| `webhook_url` | Optional absolute URI for an application-specific callback; this field does not define a transport, authentication method or task API |
| `polling_mode` | Optional boolean indicating that the agent can poll; it does not specify where or how often |
| `public` | Optional boolean, defaulting to true in the schema; publishers must still enforce access controls for private profiles |
| `logicsrc_compatibility_version` | Optional text naming the LogicSRC version the publisher claims to support |

The schema disallows extra properties. Put platform-specific data in a separate record linked by the host, rather than adding fields that existing validators reject. A reader must not silently rewrite an unsupported version to `0.1`.

### Identity and ownership

In this version, both identity fields follow the existing LogicSRC pattern `^[a-z0-9][a-z0-9._-]*\.[a-z0-9][a-z0-9._-]*$`. These are LogicSRC names such as `research.coinpay`; a W3C identifier such as `did:key:...` does not match this schema. They are not URLs. Readers must not infer a resolver or fetch an address by appending the identity to a hostname.

A profile states an ownership claim. Passing schema validation or serving the file over HTTPS does not prove control of either identity. A registry or launcher verifies the claim through its own authenticated account or identity provider before granting control. The owner's identifier is kept distinct from the human sysop of a running OpenFleet session; publishing a profile never appoints a fleet sysop.

### Skills and permissions

Skill strings are portable labels, not executable instructions or an agreed global taxonomy. A consumer can match labels it understands and show the rest as supplied. It must not invent a supported task contract from a skill name.

Permission strings follow the existing schema: a lowercase resource name, optionally followed by one colon and a lowercase action. Digits, dots, underscores and hyphens are allowed after the first letter in each part. Wildcards are not part of this profile format.

`permissions_requested` records a request. The application's actual grant, local policy and the session's inherited limits decide what may run. Reading a descriptor, seeing a skill or accepting a listing grants no access. Credentials belong in [OpenCreds](/opencreds), and delegated authorization can use [OpenAccess](/openaccess).

## Publication and discovery

Serve the JSON record over HTTPS with `Content-Type: application/json`. A domain representing one agent should serve it at `/.well-known/openagent.json`. A host with several agents serves one record per stable HTTPS URL, for example `/agents/research.json`, and links each from its own profile page or directory entry. The well-known document is a single profile, not an array or a directory.

A page about an agent can advertise the descriptor with:

```html
<link rel="openagent" type="application/json" href="https://example.com/agents/research.json">
```

An HTTP response can carry the equivalent `Link: <https://example.com/agents/research.json>; rel="openagent"; type="application/json"` header. A reader may also be handed the descriptor URL directly. Relative discovery links resolve against the page or response URL. HTTPS links may point at another host; readers retain that source and verify ownership separately.

A reader fetches the descriptor, validates it, checks the supported version and compares `did` with any identity supplied by the listing. A mismatch is an error, not an automatic rename. Keep the source URL and retrieval time beside the cached record; use HTTP validators such as ETag or Last-Modified when the publisher provides them. Two URLs with the same `did` are two sources about one agent, and conflicting ownership claims must be surfaced rather than silently combined.

Public files must contain no access tokens, private keys or private workspace paths. `public: false` is descriptive metadata, not protection for a file served without authentication. A directory must not publicly index such a record. Readers apply their own URL and network policies to descriptors, redirects and callbacks; importing a profile must not automatically call its webhook or launch a process.

## One profile, many sessions

An OpenAgent profile describes the durable agent. [OpenFleet](/openfleet) describes each running session: its human sysop, parent, engine, task and ceiling. One agent can have many sessions and each gets its own fleet member id.

OpenFleet 0.1 does not define an OpenAgent identity field. An integrating launcher keeps a mapping between the profile's `did` and the fleet's `(fleet, member)` pair in its own state. It must not treat the profile identity as a unique session id or add invented fields to the fleet contract. The profile's requested permissions never widen a fleet ceiling. Existing fleet hooks continue to work without an OpenAgent profile.

An agent orchestration swarm is a set of sessions in OpenFleet. [OpenSwarm](/openswarm) retains its peer-to-peer file-distribution meaning. An agent may operate a peer, but its profile is not a file swarm manifest.

## Profiles and rental listings

[OpenProfile.md](/openprofile) is the human-readable identity, accounts and topics for a person or an agent. OpenAgent supplies the machine-readable capability and permission contract. A host can link both from the same profile page; neither format replaces the other or proves the other's ownership claims by itself.

[OpenRental](/docs/openrental) already names agent members with `kind: "openagent"`. The member's `id` is the profile's `did`, and its HTTPS `url` points at this JSON document. A listing must check that the returned identity matches. Membership does not authorize execution or create a rental offer.

The profile's optional `pricing` is an indication, not a checkout contract. Explicit rental offers, their exact decimal-string rates and CoinPay settlement metadata belong in OpenRental. A consumer must not turn the profile's JSON number into a binding payment or charge an account merely because it fetched the file.

## Use it today

Download the sample and validate it with the existing LogicSRC validator CLI:

```sh
curl -fsS https://logicsrc.com/examples/openagent.json -o agent.json
npx --yes --package @logicsrc/validators logicsrc-validate agent agent.json
```

The same schema is exported as `@logicsrc/schemas/agent`. In a JavaScript application using `@logicsrc/validators`:

```js
import { validate } from "@logicsrc/validators";

const result = validate("agent", profile);
if (!result.ok) throw new Error(JSON.stringify(result.errors));
```

Schema validation checks the document's shape. The consumer separately checks the version, ownership, grants, current availability and any offer before running or paying an agent. The existing SDK's `LogicSrcAgent` interface is a runtime summary with `id` and `capabilities`; it is not this wire document and must not be serialized as an OpenAgent profile without an explicit mapping.

## Conformance

A **publisher** serves a schema-valid `logicsrc.agent` document, retains a stable `did`, names an owner and at least one skill, and distinguishes requested permissions from granted access. A public publisher exposes an HTTPS descriptor URL and advertises it through one of the discovery mechanisms above.

A **reader** validates the shape and supported version, preserves the source URL, checks expected identity matches, treats owner and skill claims as unverified until checked, and keeps discovery separate from execution and payment. A reader shows unsupported or incomplete fields as such instead of assuming defaults that the contract does not provide.

A **launcher** using the profile applies its own authorization and runtime policy. If it implements OpenFleet, it records each session under that specification and retains the profile-to-session mapping without weakening the inherited ceiling.

## Version history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-09-13 | Names the existing LogicSRC agent profile as OpenAgent; adds publication, discovery, conformance and bindings to OpenProfile, OpenFleet and OpenRental |

## License

The specification text is CC BY 4.0. The existing schema and implementation retain their repository licenses.
