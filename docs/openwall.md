# OpenWall

OpenWall proposes one portable message contract for reaching a person's or agent's connections, followers, following, or a service's users, with direct messages through the same contact routes.

Status: **0.1 draft proposal**, September 13, 2026. This change supplies a specification, JSON Schemas, and validation fixtures. The commands, delivery service, OpenContacts/OpenSocial adapters, and AT Protocol extension below are proposed; none is a shipped OpenWall runtime or an accepted AT Protocol standard.

Slug: `openwall`

## The experience

Unix `wall` broadcasts a notice to logged-in terminals. `write username` sends to a particular user; `mesg` controls whether a terminal accepts messages. OpenWall carries that small interface across contact networks. Receiving remains the recipient's choice.

These are proposed commands under the existing `logicsrc` CLI. `wall` prepares a private broadcast; `write` prepares a private direct message; `mesg` edits the current identity's receiving settings. Preparing a message only resolves and previews its audience. `send` dispatches the saved plan under the account's existing authorization policy.

```bash
# Resolve a service's users and preview the exact audience and routes.
logicsrc wall --from ops.example --source https://dev.example/contacts \
  --to users --scope https://dev.example/workspaces/main \
  --topic maintenance --expires-in 10m --save notice.json <<'EOF'
SERVER NOTICE
Maintenance starts in 10 minutes.
Please save your work and pause running jobs.
EOF
logicsrc wall send notice.json

# Union of explicit relationship groups, deduplicated before delivery.
logicsrc wall --from ada.example --source https://social.example/graph \
  --to connections,followers,following --topic updates \
  --expires-in 1d --text 'The new release is ready.' --save release.json

# Resolve a verified contact alias to one stable identity.
logicsrc wall write ada.example --text 'Ready when you are.' \
  --expires-in 1h --save direct.json
logicsrc wall send direct.json

# Receiving policy: these change your settings, never somebody else's.
logicsrc wall mesg off
logicsrc wall mesg on --allow connections --topic maintenance
logicsrc wall mesg show

# Public publishing must be selected explicitly.
logicsrc wall announce --public --text 'Version 1.2 is available.' \
  --expires-in 7d --save announcement.json
```

A preview shows the sender, subject text, visibility, sources and snapshot time, candidate/eligible/excluded counts, unavailable sources, selected routes, expiry, and any provider limits. A source failure produces an incomplete plan that cannot be sent; selecting a smaller audience produces a new plan. An empty eligible set is a no-op with a report. No implicit `all` audience exists. A saved plan is private and contains no credentials. CLI output MUST escape terminal control characters from message text and account labels.

## How the pieces fit

| Piece | Responsibility | Existing status in this repository |
| --- | --- | --- |
| [OpenProfile](/docs/openprofile) | Profile and external account claims, including verification | Existing specification |
| Communication Accounts | Connected identities, delegated grants, credential broker and audited provider calls | Existing scaffold in `docs/communication-accounts.md`, `packages/account-core`, and `plugins/social-accounts`; provider metadata does not establish live delivery support |
| OpenContacts | Private address book, verified identity links, group membership and preferred routes | Proposed integration role; no standalone OpenContacts specification in this checkout |
| OpenSocial | Provider graph and messaging adapter boundary | Proposed integration role; no standalone OpenSocial specification in this checkout; this name does not assert compatibility with another project's similarly named API |
| OpenWall | Message, audience selection, receiving policy and delivery outcomes | This proposal |

OpenWall can start with an address-book adapter and a social-account adapter without waiting for either proposed sibling spec. Their minimum interfaces are defined here so the names do not conceal a dependency on an undefined protocol. The existing social-post contract describes publishing; it does not become a private-message envelope.

## Identity and adapters

An **identity** is a stable DID or an HTTPS identity URI controlled by its issuer. A handle or username is user input and a display label; the sender resolves it before freezing a plan. A contact row ID is scoped to its address book and cannot be used as a global account ID. A provider account and the person owning it are distinct identities until an authenticated linking flow proves their relationship. A profile account link alone is a claim.

For AT Protocol accounts, use the DID as the canonical account identity, verify a handle against its DID document in both directions, and resolve the PDS from that document. A handle change or PDS migration does not change the DID. [AT Protocol DID specification](https://atproto.com/specs/did).

The proposed adapters expose these operations; names describe interfaces, not existing endpoints:

| Operation | Required result |
| --- | --- |
| `resolve(input, source)` | Canonical identity, verified account links, provenance and observation time; ambiguous or unverified aliases fail resolution |
| `listRelationships(actor, group, scope, cursor)` | Identity page, cursor, source, observation time, and completeness/version information when supported |
| `getRoutes(identity)` | Verified recipient-authorized routes, account identity, transport, size limits, privacy, idempotency and receipt capabilities |
| `checkReceivePolicy(sender, recipient, topic, mode)` | `allow`, `deny`, or `unknown`, with policy revision and expiry; local block reasons stay private |
| `deliver(route, delivery)` | Authenticated transport acceptance, rejection or unknown outcome; a provider message ID when available |
| `reconcile(route, deliveryId)` | A known previous outcome, or `unknown`; optional only when the route cannot support reconciliation |

A route is selected from a verified recipient association or an explicitly configured trusted service. A sender-supplied message cannot override its destination URL. Clients MUST authenticate the route's operator, validate endpoint ownership, restrict redirects and internal-network requests according to deployment policy, and use the credential broker for account authorization. Reading a graph does not grant permission to send from that account.

Delegated agents act under a grant bound to the sending identity, permitted audience/scope, topic and volume. The coordinator records the acting principal and grant in a private audit record. `sender` in JSON is not evidence of authority. For a future native HTTP adapter, discovery, scoped authentication, and signed service-to-service deliveries need their own specified profile before interoperable deployment; this proposal does not invent a universally discoverable inbox.

## Audiences and snapshots

A message has exactly one audience form:

| Audience | Meaning |
| --- | --- |
| `relationships` / `connections` | Explicit accepted connections in the named source, from the named actor's perspective; a social adapter may advertise mutual follows as its connection rule |
| `relationships` / `followers` | Identities that follow the actor |
| `relationships` / `following` | Identities the actor follows |
| `relationships` / `users` | Active members of the exact service/workspace `scope`; requires authority to enumerate and message that scope |
| `direct` | Exactly one resolved recipient identity |
| `public` | A public announcement; there is no confidential recipient list and no promise of individual delivery |

Relationship selectors carry `source`, `actor`, and `groups`, with `scope` required for `users`. `actor` normally equals the sender; acting for another account requires a corresponding grant. Multiple selectors mean union. Exclusions are applied after the union. Duplicate identities are removed, self-delivery is excluded unless directly addressed, then receiving policy and route capability are checked. Unknown groups are rejected; there is no interpretation of `users` as everyone on the internet or all customers of another service.

1. Resolve every selector, exhaust pagination, and record observation times, source revisions when available, and errors. Providers without consistent snapshots produce an explicitly labeled observation interval, not a claim of an atomic graph snapshot.
2. Freeze the candidate identities and verified account-link evidence in a private audience snapshot. Route selection sends at most once to a verified linked identity even if it occurs in several groups or networks. Without verified links, distinct accounts remain distinct and possible duplicates are shown in the preview.
3. Bind the saved plan to the exact message, snapshot and authorized routes. Store a digest over a deterministic serialization chosen and documented by the implementation; this local plan digest is not a new cross-service signature format. Altering content or adding recipients invalidates authorization for that plan.
4. Before dispatch and each retry, recheck exclusions, current membership, blocks, receiving policy, sender grants and expiry. Revoked membership or consent removes a recipient; membership uncertainty defers that delivery. New followers or users after the snapshot are never added. Refreshing or enlarging the audience creates a new plan.

Snapshots and delivery ledgers MUST stay private to the authorized sender/coordinator. Deliveries contain only the individual recipient; no address-book labels, group names, other recipients, or graph snapshots leave the coordinator. A broadcast creates individual deliveries, never a group chat. Replies go back to the sender unless the recipient separately chooses another destination.

## Receiving policy: the portable `mesg`

The baseline is `enabled: false`. An identity enables particular sender relationships and topics, optionally adds a per-sender allowlist, and may disable broadcasts independently of direct messages. An absent topic grant denies that topic; implementations may offer an explicit wildcard. The following proposed private policy illustrates the behavior (it is not an AT repository record):

```json
{
  "enabled": true,
  "allowFrom": ["connections"],
  "topics": ["maintenance"],
  "broadcasts": true,
  "direct": true,
  "readReceipts": false
}
```

Here relationships are from the **recipient's** perspective. `following` would mean senders the recipient follows. Following someone, importing their contact details, or belonging to the same service does not by itself opt either party into OpenWall broadcasts. An explicit service-notices subscription can authorize `users` delivery for its named scope and topics.

Effective permission is the intersection of the sender's grant, OpenWall receiving consent, provider restrictions, and service policy. A deny at any layer wins; `unknown` cannot be treated as consent. A block overrides an allowlist. A recipient can revoke consent or unsubscribe from a topic immediately, including for messages already queued. Quiet hours may delay an eligible notice until the next allowed window if it has not expired. A mute suppresses notifications; it is distinct from refusing storage/delivery.

A bridge to a recipient without OpenWall software needs a verifiable prior subscription or equivalent recipient-managed policy; a provider's general willingness to receive DMs is insufficient consent to bulk broadcasts. Rate caps apply per sender, recipient, topic and service. The sender sees `not-permitted`, not whether the recipient blocked them or has a particular private contact relationship. Read receipts require recipient opt-in. There is no remote equivalent of `sudo` that bypasses receiving policy.

## Message contract

The draft JSON Schema is `packages/schemas/schemas/logicsrc-openwall-message.schema.json`, exported as `@logicsrc/schemas/openwall-message`. It defines a **private sender-side job document**, not an object to publish verbatim in an AT repository or forward to every recipient. Schema identifiers are canonical names; this proposal does not deploy them to a schema host.

```json
{
  "openwall": "0.1-draft",
  "id": "urn:uuid:94d908df-2876-48f1-bec8-c931f5c847d4",
  "sender": "did:web:ops.example",
  "createdAt": "2026-09-13T12:00:00Z",
  "expiresAt": "2026-09-13T12:10:00Z",
  "visibility": "private",
  "topic": "maintenance",
  "audience": {
    "kind": "relationships",
    "selectors": [{
      "source": "https://dev.example/contacts",
      "actor": "did:web:ops.example",
      "groups": ["users"],
      "scope": "https://dev.example/workspaces/main"
    }],
    "exclude": []
  },
  "content": {
    "mediaType": "text/plain",
    "text": "SERVER NOTICE\nMaintenance starts in 10 minutes.\nPlease save your work and pause running jobs."
  }
}
```

`id` is a new UUID URN, stable across retries. `createdAt`, optional `notBefore`, and required `expiresAt` are RFC 3339 timestamps. `expiresAt` MUST be later than both creation and scheduling, with a maximum 30-day lifetime in this draft. An omitted `notBefore` means dispatch as soon as the authorized plan is ready. Receivers reject expired deliveries; scheduling, freshness and clock comparison are semantic requirements beyond JSON Schema validation.

`content.text` is plain text, limited to 4,000 Unicode code points and 16,000 UTF-8 bytes before transport-specific limits. Do not silently truncate or split it into many messages: an incompatible route reports `unsupported`. HTML, attachments and automatic execution of embedded instructions are outside this draft. Human or agent recipients receive text as data.

`visibility: private` permits only `relationships` or `direct`. A direct audience is `{ "kind": "direct", "recipient": "did:web:ada.example" }`. `visibility: public` requires `{ "kind": "public" }`. Private means access-controlled delivery to a recipient and its service operators; it does **not** promise end-to-end encryption. Routes that offer encryption must name their separately specified security profile. Never downgrade a private message to a public post on failure.

For a native transport, derive a recipient delivery containing only the message ID, sender, individual recipient, content, topic, scheduling/expiry fields, and authenticated delivery ID. Identity linkage, audience selectors and authorization tokens do not belong in that payload. A legacy provider may only accept text; its adapter keeps the correlation and consent ledger privately and must report the capabilities it cannot preserve.

## Delivery, receipts and failure

The coordinator persists the plan and per-recipient ledger before calling a provider. Its idempotency key is the tuple `(sender, message.id, canonical recipient)` and the payload binding is immutable. Reusing that key with different content or a different plan is a conflict. The delivery ID is a coordinator-assigned UUID URN, stable for all attempts to that recipient and bound in the immutable ledger to the sender/message/recipient tuple. Keep deduplication state through `expiresAt` plus at least 24 hours; late requests outside that window are rejected by expiry checks.

Route preference belongs to the recipient: for example a native inbox, then an explicitly authorized Bluesky chat account. A provider credential is never a routing preference. Fallback is allowed only within previously authorized routes after a definitive rejection establishing that nothing was accepted. A timeout after sending is **unknown**, and must not trigger a second route that might duplicate the message.

The receipt schema, `@logicsrc/schemas/openwall-receipt`, describes a private coordinator event about one recipient. Each event has a UUID `id`, `deliveryId`, `messageId`, `recipient`, increasing `sequence` per `deliveryId`, `state`, `at`, and `attempt`. `attempt` is zero before the first network send. Authentication to the coordinator's receipt API is required; a receipt file alone proves nothing. The coordinator MUST verify `deliveryId`, `messageId` and `recipient` against the immutable sender-bound ledger. Provider callbacks must be authenticated and correlated to that delivery and its authorized route. Duplicate or older event IDs/sequences cannot regress state.

| State | Meaning and permitted next steps |
| --- | --- |
| `queued` | Persisted locally; may become `sending`, `expired`, `cancelled`, or `failed` |
| `sending` | A recorded provider attempt; becomes `accepted`, `retrying`, `unknown`, or `failed` |
| `retrying` | Definitively unaccepted temporary failure; carries `nextAttemptAt` and a reason; becomes `sending`, `expired`, `cancelled`, or `failed` |
| `accepted` | Provider acknowledged storage/queueing; does not assert delivery or reading; may become `delivered`, `read`, or `failed` on a definitive downstream failure |
| `delivered` | Recipient service explicitly confirms inbox delivery; may become `read` |
| `read` | Recipient consent and transport evidence confirm reading; terminal |
| `unknown` | An attempt may have succeeded; reconcile to `accepted`, `delivered`, `read`, or a definitive failure; retry only when non-acceptance or transport idempotency is established |
| `failed` | Permanent rejection or exhausted retry budget; terminal for automatic delivery |
| `expired` | Deadline passed before another delivery attempt; terminal |
| `cancelled` | Sender stopped pending delivery; terminal |

If reconciliation proves non-acceptance while the message remains live, `unknown` may become `retrying`; otherwise it remains unresolved even after the deadline. No retry is allowed after expiry. A valid late receipt may resolve an unknown historical outcome. A provider may supply stronger evidence immediately, so a `sending` event may advance directly to `delivered` or `read`. Store the evidence rather than manufacturing intermediate acknowledgements.

Temporary network failures known to precede acceptance, `429`, and recoverable `5xx` responses use bounded exponential backoff with jitter, respecting `Retry-After` and expiry. Start at one second, cap at five minutes, and allow at most eight attempts in this draft. Authorization, policy and payload errors are permanent until an authorized new plan addresses them. An expired token may be refreshed once through the credential broker; refreshed credentials never enlarge a grant. After ambiguous acceptance, an adapter lacking provider idempotency/reconciliation reports `unknown` and stops automatic sending. Exactly-once network delivery is not promised.

```json
{
  "openwall": "0.1-draft",
  "id": "urn:uuid:963f9109-803f-4f0c-8506-10c70ec47ee6",
  "messageId": "urn:uuid:94d908df-2876-48f1-bec8-c931f5c847d4",
  "deliveryId": "urn:uuid:db925d64-4e1a-4e5a-83c1-e37b68aa5eef",
  "recipient": "did:web:ada.example",
  "sequence": 3,
  "state": "accepted",
  "at": "2026-09-13T12:00:03Z",
  "attempt": 1,
  "route": "https://chat.example",
  "providerMessageId": "provider-msg-123"
}
```

The sender sees counts by state and an explicit incomplete/unknown count. Unsupported delivery/read receipts stay unsupported; an HTTP success, public post, notification count, or relay cursor is not a read receipt. Receipt details and logs MUST not expose recipient policies or message bodies to unauthorized observers. Implementations document retention and permit deletion of content while keeping minimal deduplication tombstones.

Cancellation stops pending sends and retries; it cannot recall an already accepted provider message. Expiry bounds attempts and future display by cooperating native clients, not retention on third-party services. Deletion of a public announcement cannot guarantee removal of cached or replicated copies. Scheduled messages are not made public before `notBefore`.

## AT Protocol mapping

This is an application proposal on AT Protocol, not a request to add a broadcast primitive to its core. Reuse DIDs and graph data where applicable; specify OpenWall-specific records and service behavior under a domain-controlled Lexicon namespace. AT Protocol supports application record and RPC schemas through Lexicon/NSIDs. [Lexicon guide](https://atproto.com/guides/lexicon).

### Graph discovery

Bluesky exposes `app.bsky.graph.getFollowers` and `app.bsky.graph.getFollows` with pagination. An adapter can union/intersect their DID results, using the snapshot rules above; it cannot infer private address-book connections or a service's users from those APIs. API pages are observations of an AppView, not a globally consistent graph transaction. [Official getFollowers Lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/graph/getFollowers.json), [official getFollows Lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/graph/getFollows.json).

### Public announcements

AT repositories and their replicated records are public. An audience field in a public record cannot make it followers-only or private. OpenWall MUST NOT write private message bodies, recipient lists, contact graphs, receipts or receiving preferences into a public repository or relay stream. [Understanding AT Protocol](https://atproto.com/guides/understanding-atproto).

Propose `com.logicsrc.openwall.announcement` as a domain-controlled record containing only `messageId`, `createdAt`, optional `notBefore`, `expiresAt`, `topic` and plain `text`. All its fields are public. The namespace is provisional, not registered or published by this change, and `com.logicsrc` requires the domain owner's publication authority. Before adoption, publish and validate an actual Lexicon and establish its versioning policy. JSON Schema is not a Lexicon and cannot be sent as one.

```json
{
  "$type": "com.logicsrc.openwall.announcement",
  "messageId": "urn:uuid:5bb154dd-edb3-47b7-8fc6-4cb65a19a9f8",
  "createdAt": "2026-09-13T12:00:00Z",
  "expiresAt": "2026-09-20T12:00:00Z",
  "topic": "releases",
  "text": "Version 1.2 is available."
}
```

An OpenWall AppView may index such records and offer recipient-managed topic subscriptions. A record's AT URI and CID identify publication and its version, not individual delivery. Feed inclusion and notifications need application support; a new Lexicon does not automatically appear in Bluesky feeds or notify every follower. Projecting to `app.bsky.feed.post` is a separately authorized public-post adapter, with that record's own limits and no confidentiality claim.

### Private delivery through Bluesky chat

Bluesky's `chat.bsky.*` APIs are hosted by its separate chat service and can be reached through authenticated PDS proxying. Do not derive a private inbox from repository support or assume other AT apps implement Bluesky chat. [Official Bluesky API directory](https://github.com/bluesky-social/bsky-docs/blob/main/docs/advanced-guides/api-directory.mdx).

For each independently consented recipient, obtain the direct conversation using `chat.bsky.convo.getConvoForMembers`, then use `chat.bsky.convo.sendMessage`. The former may create a conversation despite being a query, so previews MUST NOT call it. Keep one conversation per recipient, even though current chat Lexicons also describe group conversations. The send procedure requires `convoId` and a `messageInput`; its returned message is evidence of provider acceptance. [Official conversation lookup Lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/chat/bsky/convo/getConvoForMembers.json), [official sendMessage Lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/chat/bsky/convo/sendMessage.json).

Honor the recipient's `chat.bsky.actor.declaration.allowIncoming` (`all`, `none`, `following`) plus OpenWall's broadcast consent. This chat declaration is a public provider-specific record; it does not serialize the private OpenWall policy above. Provider permission errors are authoritative and MUST NOT cause a public mention or another-account workaround. [Official chat declaration Lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/chat/bsky/actor/declaration.json).

Validate the current provider text limits and actual authentication permissions during adapter implementation. Do not assume the OpenWall message ID can be used as a provider idempotency key: the reviewed `sendMessage` input and referenced `messageInput` do not specify an OpenWall-style key. Keep the private ledger and stop on ambiguous acceptance unless reconciliation establishes the result. Do not claim private chat federation, end-to-end encryption, recipient-device delivery or read receipts based merely on using AT identities. [Official chat message definitions](https://github.com/bluesky-social/atproto/blob/main/lexicons/chat/bsky/convo/defs.json).

The long-term OpenWall native service profile could use Lexicon RPCs with AT identity authentication while storing private messages off-repository. Its inbox discovery, authorization, encryption, portability and event-stream contract require a separate reviewed specification and two interoperating implementations. This draft does not claim that profile exists today.

## Conformance and next implementation

The included schemas validate message/receipt structure, closed audience alternatives, mandatory `users` scope, public/private separation, timestamps, and receipt reason/retry fields. They cannot verify identity ownership, grants, consent, time ordering, UTF-8 byte limits, graph completeness, deduplication, transport security or state transitions. A schema-valid document alone is not permission to deliver it.

Before calling a delivery implementation conformant, its integration suite MUST demonstrate:

1. Union/deduplication across overlapping groups; pagination failure blocks an incomplete plan; `users` requires a named scope and sender authority.
2. A follow or address-book import without consent results in no delivery; a later block, unsubscribe or membership removal suppresses a queued send.
3. An unverified account link cannot redirect a message; a changed AT handle preserves the resolved DID.
4. Recipient payloads contain no other recipient or selector, and private failure cannot create a public post or group conversation.
5. Replaying a message uses its existing ledger; conflicting content is rejected; a timeout after provider acceptance cannot trigger blind resend/fallback.
6. Retry limits, `Retry-After`, cancellation and expiry are respected, including restart recovery and unknown outcomes.
7. Duplicate/out-of-order receipts do not regress state; `accepted` does not display as `read`; public publication does not fabricate per-follower receipts.

First implement local plan/preview and receiving-policy storage, then a fake inbox adapter proving these behaviors, then an explicitly consented Bluesky chat bridge. Public announcement indexing can evolve separately. A native cross-service transport and a formal OpenContacts graph/route contract follow once two implementers agree on the wire details. No remote messages are sent by this proposal or its fixtures.
