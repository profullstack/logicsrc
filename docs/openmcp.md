# OpenMCP

OpenMCP is an open catalog protocol for MCP relays: MCP servers you can reach over HTTP. It says how a relay describes itself in one file, how a catalog lists relays it has actually reached, how a client finds a tool and calls it through a catalog or direct, and how a catalog tells subscribers what changed. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface, with a reference implementation at [github.com/logicsrc/openmcp](https://github.com/logicsrc/openmcp).

Status: **0.1**. A description of a catalog already running, published so others can run one, list in one, or be listed.

Slug: `openmcp`

## The problem

Every product that speaks MCP is a relay: an endpoint an agent can call. There are thousands, and each one is found by hand, from a README, and wired into a client's configuration by a person. There is no file a relay serves to say what it is, no way for a directory to say "this one answered yesterday", and no single door an agent can open to reach relays it has not been told about.

The pieces exist. MCP defines the handshake and `tools/list`. `/.well-known/` is where a host says things about itself. Webhooks are how a service tells another service something happened. What is missing is the one convention that puts them together for MCP, so a relay can be discovered instead of configured.

## Terms

- A **relay** is an MCP server reachable over HTTP (Streamable HTTP transport). Its **descriptor** is the file it serves about itself.
- A **catalog** is a server that keeps relay records, probes each relay, and serves the records for discovery. A catalog is also a relay.
- A **record** is a relay as a catalog holds it: the descriptor, the tools the relay reported, whether it is online, whether it is verified, and when it was last reached.
- A **client** is anything that reads a catalog: a person's terminal, a program, an agent.

## The descriptor

A relay serves a JSON document at `/.well-known/openmcp.json` on its own origin.

```json
{
  "openmcp": "0.1",
  "mcp": "https://agenticjobs.work/api/mcp",
  "name": "Agentic Jobs",
  "description": "A job board where agents apply to agents, with a person at both ends.",
  "url": "https://agenticjobs.work",
  "auth": { "kind": "bearer", "url": "https://agenticjobs.work/me/tokens", "open": ["search_jobs", "get_job"] },
  "tags": ["jobs", "hiring", "agents"],
  "operator": "https://logicsrc.com/.well-known/openprofile.md",
  "webhooks": "https://agenticjobs.work/api/v1/webhooks",
  "tools": ["search_jobs", "get_job", "apply_to_job", "post_update"],
  "catalogs": ["https://openmcp.logicsrc.com"]
}
```

The rules, and every one degrades:

1. **`mcp` is required and is the only required key.** Absolute, or relative to the descriptor's own URL. A descriptor with `mcp` alone is valid.
2. **`openmcp`** is the version of this document the descriptor follows. Absent means the current one.
3. **`name`, `description`, `url`** are for a listing: one line, a paragraph, the site behind the relay.
4. **`auth.kind`** is `none`, `bearer`, `oauth` or `api-key`. `auth.url` is where a person gets a credential. `auth.open` names the tools that work with no credential. Absent `auth` means unstated, which a reader reports rather than assumes.
5. **`tags`** are free-form and lowercase. A catalog groups by them.
6. **`operator`** is the person or organisation answerable for the relay, as an [OpenProfile.md](/openprofile) URL. An agent that meets a relay with no operator should say so.
7. **`webhooks`** is where a caller subscribes to the relay's own events, if it has any. Its shape is the relay's business; this document only defines the catalog's webhooks.
8. **`tools`** names the tools, so a catalog can index a relay it cannot reach right now. What `tools/list` says wins over this list whenever both exist.
9. **`catalogs`** names catalogs the relay is listed in, so a reader that found the relay can find more.

Unknown keys are kept. Serve it as `application/json`. The descriptor is a claim; the probe is the verification.

## The probe

A catalog builds a record by asking two questions, in order, of any URL it is handed (the descriptor, the MCP endpoint, or just the site):

1. **Does the origin serve a descriptor?** Fetch `/.well-known/openmcp.json` on the origin of the given URL. If it parses, the record is **verified**: the descriptor came from the relay itself, not from whoever registered it. If not, the given URL is taken as the MCP endpoint and the record is unverified.
2. **Does the MCP endpoint answer?** `initialize`, then `tools/list`. If both succeed, the record is **online** and its tools are what the relay reported, with their schemas. If not, the record is **offline**, its last known tools are kept and marked so, and its failure count goes up.

A catalog lists a relay only if at least one question was answered yes. It never lists a relay it could neither verify nor reach. It probes again on a schedule, and a change in online, descriptor or tools is an event.

A catalog holds no credentials for any relay. The probe is unauthenticated, so a relay whose handshake needs a credential will be listed as offline with the tools its descriptor names; the descriptor is the way such a relay is still findable.

## The record

```json
{
  "id": "agenticjobs.work",
  "source": "https://agenticjobs.work/.well-known/openmcp.json",
  "descriptor": { "...": "as served" },
  "tools": [{ "name": "search_jobs", "description": "...", "inputSchema": { "...": "..." } }],
  "server": { "name": "agenticjobs", "version": "0.15.0", "protocolVersion": "2025-06-18" },
  "verified": true,
  "online": true,
  "seenAt": "2026-09-12T18:04:11.000Z",
  "firstSeenAt": "2026-09-12T18:04:11.000Z",
  "failures": 0,
  "lastError": null,
  "via": null
}
```

`id` is a slug of the MCP endpoint's host and path with the endpoint's own name (`/mcp`, `/api/mcp`, `/v1/mcp`) dropped, stable across probes. `via` names another catalog the record was learned from, or is null when it was registered here.

## The catalog

A catalog serves the same descriptor as any relay, at its own `/.well-known/openmcp.json`, with one more key:

```json
{ "catalog": { "relays": 128, "online": 117, "api": "https://openmcp.logicsrc.com/v1", "peers": ["https://other.catalog"] } }
```

It exposes three doors to the same records.

**REST**, under `api`:

| | |
|---|---|
| `GET /v1/relays?q=&tag=&online=1&limit=` | the records, filtered |
| `POST /v1/relays {url}` | register by any URL on the relay's origin; the probe decides what is listed |
| `GET /v1/relays/:id`, `GET /v1/relays/:id/tools` | one record, its tools |
| `POST /v1/relays/:id/refresh` | probe now |
| `DELETE /v1/relays/:id` | admin |
| `GET /v1/tools?q=` | every online relay's tools that match, with where each lives |
| `POST /v1/relays/:id/call {tool, arguments, token?}` | forward one call; the relay's result comes back whole |
| `POST /v1/webhooks`, `GET /v1/webhooks/:id`, `DELETE /v1/webhooks/:id` | subscriptions |
| `GET /v1/peers`, `POST /v1/peers`, `DELETE /v1/peers`, `POST /v1/peers/sync` | peering (admin) |

**MCP**, at the catalog's own `mcp` endpoint, with these tools: `list_relays`, `get_relay`, `find_tool`, `call_tool`, `register_relay`, `refresh_relay`, `subscribe`, `unsubscribe`, `list_peers`. `call_tool` forwards a call to a relay; the caller's credential for that relay travels in the arguments as `token` and is never kept. An agent that can reach one catalog can reach every relay in it.

**Webhooks**, out. A subscription is a URL, a secret, a list of events and optionally a list of relay ids. The events:

| event | when |
|---|---|
| `relay.registered` | a relay was listed for the first time |
| `relay.updated` | its descriptor or tools changed |
| `relay.online` | it answered after not answering |
| `relay.offline` | it stopped answering |
| `relay.removed` | it was removed |

A delivery is one `POST` of `{id, event, at, catalog, relay}` with headers `X-OpenMCP-Event`, `X-OpenMCP-Delivery` and `X-OpenMCP-Signature: sha256=<hex HMAC-SHA256 of the raw body under the secret>`. A receiver verifies the signature over the raw body before reading it. Three attempts, then the failure is recorded; fifty consecutive failures and the subscription is inactive but still listed, so its owner can see why. The subscription id is unguessable and is the only handle on it; the secret is shown once.

Registration is open. Anyone may register any relay, because nothing a registrant types is listed: the probe is. Removing a relay and changing peers need the catalog's admin credential.

## Peering

A catalog may name other catalogs as peers and learn their relays. A relay learned from a peer is still probed here before it is listed, is marked `via` the peer, and is never allowed to overwrite a record that was registered here directly. Catalogs of catalogs, with no catalog required to trust another.

## The client

A conforming client:

1. Reads a catalog over REST or over its MCP endpoint; the two answer the same questions.
2. Treats `online` and `verified` as two facts and shows both. A verified offline relay is real and down; an online unverified relay answers but has not said who it is.
3. Calls a relay's tool through the catalog with `call`, or direct with a plain MCP client once it has the record, and passes its own credential for the relay either way. The catalog never has it.
4. Verifies every webhook delivery's signature over the raw body before acting on it.
5. Reports absence as absence: an unstated `auth`, an unstated `operator`.

## What is deliberately absent

**No registry of names.** A relay's id is derived from its endpoint; nobody owns a name, and two catalogs derive the same id for the same relay.

**No trust score.** `verified` and `online` are facts a catalog checked. Whether a relay is good is the reader's judgement, with the operator's profile as the place to start.

**No credentials in the catalog.** Not for probing, not for forwarding. A relay that needs a credential to be listed serves a descriptor.

**No new transport.** Relays are Streamable HTTP MCP, as MCP defines it. The catalog adds discovery, not protocol.

## Serving one

By hand, or `openmcp descriptor <mcp url>` prints a template. [agenticjobs](https://agenticjobs.work), [tsbb](https://tsbb.dev) and [myna](https://mynaposter.com) serve one. The reference catalog runs on Node 24 with one SQLite file: `openmcp serve`.

## The reference implementation

[github.com/logicsrc/openmcp](https://github.com/logicsrc/openmcp) is the catalog server and the client, published as `@logicsrc/openmcp`, and [openmcp.logicsrc.com](https://openmcp.logicsrc.com) is a live catalog running it. One line installs the `openmcp` command under your home directory, with no root and no package manager, fetching Node 24 if the box does not have it:

```sh
curl -fsSL https://openmcp.logicsrc.com/install.sh | sh
```

`openmcp update` re-runs the installer; `openmcp uninstall` removes exactly the paths it wrote, from a manifest, with no network. The live catalog is the default target; `OPENMCP_CATALOG` or `--catalog` points the client at another.

## Related standards

- [OpenProfile.md](/openprofile): the `operator` behind a relay.
- [OpenCreds](/opencreds): where the credential a client passes to a relay is kept.
- [Model Context Protocol](https://modelcontextprotocol.io): what a relay speaks.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-12 | First publication: the descriptor, the probe, the record, the three doors, webhooks, peering. |

## License

The specification text is CC BY 4.0. The reference implementation is MIT.
