# OpenConnection

OpenConnection is a setup token you paste. A person signs in at a **bridge**, the service that already holds their connections to somewhere, and asks it for a token. They paste that token into any app. The app claims it once, receives an access URL, and from then on reads and writes through the bridge with a bearer the bridge can revoke. No client registration, no redirect URI, no key for the app to keep, which is what a browser extension, a script or a spreadsheet needs. It is the protocol [SimpleFIN](https://www.simplefin.org/protocol.html) uses for bank accounts, written down so the same door works for anything a bridge holds: social accounts, a writer, a calendar, a wallet. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. A description of a door already open at one bridge, published so any bridge can open one and any app can walk through it.

Slug: `openconnection`

## The problem

An app that wants to act through a person's accounts has one road today: OAuth. That road assumes the app can register with every provider, keep a client secret, host a redirect URI and survive a browser round trip. A browser extension can do none of those safely. A shell script cannot. A spreadsheet cannot. So those apps ask for the person's password instead, or for a personal API key pasted into a settings field, and the key they get is the whole account, forever, with no list anywhere of who holds one.

SimpleFIN solved this for bank data with something smaller than OAuth: the bank gives the person a token, the person gives it to the app, the app trades it once for a credential scoped to that person and that app, and the bank keeps the list. The shape has nothing to do with money. It is missing only the general description, the browser-safe bearer, and the vocabulary that lets a bridge say what it bridges.

## Terms

- A **bridge** is a service that holds a person's connections to somewhere and lets apps act through it. Its **descriptor** is the file it serves about itself.
- A **person** is whoever signs in at the bridge. An agent or an organisation is a person here.
- An **app** is anything that holds a claimed token: an extension, a script, a desktop program, another service.
- A **setup token** is what the person copies from the bridge and pastes into the app. It is used once.
- A **claim** is the app trading the setup token for access.
- An **access URL** is the base every request goes to, and a **token** is the bearer that goes with it.
- A **scope** is a `resource:action` string, the same vocabulary [OpenAccess](/openaccess) uses.
- A **profile** names which resources a bridge serves under the access URL: `finance`, `social`, or one of its own.

## The descriptor

A bridge serves a JSON document at `/.well-known/openconnection.json` on its own origin.

```json
{
  "bridge": {
    "name": "myna",
    "web": "https://mynaposter.com",
    "operator": "https://mynaposter.com/.well-known/openprofile.md"
  },
  "versions": ["1"],
  "setup": "https://mynaposter.com/connect",
  "profiles": ["social"],
  "scopes": {
    "accounts:read": "The networks and handles this person connected",
    "analyze:create": "Read a product page into a name, description, audience and features",
    "write:create": "Draft posts and comments in this person's voice",
    "suggest:create": "Suggest subreddits, hashtags, keywords and forums for a product",
    "activity:write": "Record a post the app made with the person's own hands",
    "posts:create": "Queue a post for the bridge's own poster"
  },
  "posts": false,
  "updated": "2026-09-13T06:00:00Z"
}
```

The smallest valid descriptor is a bridge with a name and a setup URL:

```json
{ "bridge": { "name": "myna" }, "setup": "https://mynaposter.com/connect" }
```

- **`bridge`** is who runs it. `web` is the site, `operator` the person or organisation answerable, as an [OpenProfile.md](/openprofile) URL.
- **`versions`** lists the protocol versions the access URL speaks; this document is `1`. Absent means `1`.
- **`setup`** is the page where a signed-in person gets a setup token. An app links to it; a person is never asked to type it.
- **`profiles`** names the resource sets served under the access URL. `finance` is SimpleFIN's account set, unchanged. `social` is defined below. A bridge may name a profile of its own by URL.
- **`scopes`** is every scope the bridge can put in a token, each with one line for the person to read at issuance.
- **`posts`** is whether the bridge will post on the person's behalf when asked. Absent means no, and a bridge that never holds a social credential says so by leaving it out.

## The setup token

A setup token is the base64url encoding of a **claim URL**, with no padding. Decoded, it is an `https` URL on the bridge's origin whose path ends in an opaque secret:

```
https://mynaposter.com/openconnection/claim/2f9c7d1e-b8b6-4dc5-9a9a-9a0f7f7b1c3a
```

The person gets one at `setup` after choosing the scopes it carries. A setup token:

1. **Is used once.** The first claim wins. A second claim of the same token is refused with `403` and `{"error": "claimed"}`, and the bridge tells the person, because a token claimed twice was seen by someone it was not meant for.
2. **Is short-lived.** The bridge chooses the window and shows it beside the token; fifteen minutes is a reasonable default. An expired token is refused with `410` and `{"error": "expired"}`.
3. **Carries its scopes.** What the person chose at issuance is what the claim yields. An app cannot ask for more at claim time; it asks the person for a new token.
4. **Is the whole address.** An app given a setup token needs nothing else, not the descriptor, not a host name. The claim URL is in the token.

## The claim

The app makes one request:

```
POST https://mynaposter.com/openconnection/claim/2f9c7d1e-…
Content-Type: application/json

{ "app": { "name": "DefPromo", "url": "https://defpromo.com", "version": "1.5.0" } }
```

No credential goes with it. The body is optional and names the app so the person can recognise it later on the bridge's list of connected apps; a claim with no body is listed as an unnamed app with the time it claimed.

The bridge answers:

```json
{
  "access_url": "https://mynaposter.com/openconnection/v1",
  "token": "oc_9k2…",
  "auth": "bearer",
  "scopes": ["accounts:read", "analyze:create", "write:create", "suggest:create", "activity:write"],
  "profiles": ["social"],
  "expires": null,
  "principal": { "name": "Anthony", "openprofile": "https://mynaposter.com/u/anthony/openprofile.md" }
}
```

- **`access_url`** is the base for every request that follows.
- **`token`** is the bearer. The app stores it as it would a password and never shows it.
- **`auth`** is `bearer` unless the bridge says otherwise. SimpleFIN puts Basic credentials in the access URL itself, which a browser's `fetch` refuses outright; a bridge serving browsers uses `bearer`, and a bridge that also speaks SimpleFIN may answer `"auth": "basic"` with the credentials in `access_url` for clients that expect that.
- **`expires`** is when the token stops working on its own, ISO 8601, or `null` for until revoked.
- **`principal`** is who the app is now acting for, as far as the person chose to say.

Refusals: `403 claimed`, `404 unknown`, `410 expired`, each as `{"error": "<code>", "message": "…"}`.

## Requests

Every request after the claim goes to a path under `access_url` and carries the token:

```
GET https://mynaposter.com/openconnection/v1/accounts
Authorization: Bearer oc_9k2…
```

Two endpoints exist in every profile:

- **`GET /info`** returns `{ "versions", "profiles", "scopes", "principal", "app", "issued", "expires" }`: what this token is, for whom, and what it may do.
- **`GET /accounts`** returns `{ "accounts": [ … ], "errlist": [ … ] }`. An account is what the bridge is connected to on the person's behalf: a bank account, a social handle, a calendar. Each is `{ "id", "kind", "name", "org": { "name", "url" }, "url", "updated" }`, and a profile adds keys. `errlist` carries `{ "code", "msg", "account_id" }` for a connection the bridge could not read, so a stale account is reported rather than silently dropped.

And one the app uses to leave:

- **`DELETE /`** revokes the token the request carries. The app forgets it.

The rules, and every one degrades:

1. **The token is the credential.** No request needs anything else, and no request works without it. A missing or unknown token is `401` with `{"error": "unauthorized"}`.
2. **Revocation is `401 revoked`.** A person revokes an app at the bridge, and the app's next request is refused with `{"error": "revoked"}`. The app forgets the token and links the person to `setup` for a new one. It never retries a revoked token.
3. **Scopes are enforced by the bridge.** A request outside the token's scopes is `403` with `{"error": "scope", "scope": "posts:create"}`, naming the scope that was missing, so the app can ask the person for exactly that.
4. **The person's credentials never cross.** A bridge hands an app the result of acting, never the password, cookie or OAuth token behind an account. An app that needs one of those is asking for the wrong thing.
5. **The bridge keeps the list.** For each person it shows every app holding a token, by the name the app gave at claim, with when it claimed and when it last called, and a revoke control beside each. That list is the reason this is safer than a pasted API key.
6. **Rate limits are the bridge's.** `429` with `Retry-After`, and the app waits that long.
7. **Absent is unstated.** A missing key in any response means the bridge did not say, never that the value is empty or false.
8. **Unknown keys are kept.** A bridge says more than a profile names, and an app passes it through under the bridge's own key.

## The `social` profile

A bridge that holds a person's social accounts and can write in their voice serves these under the access URL. The first bridge serving it is [mynaposter.com](https://mynaposter.com); the first app claiming it is [DefPromo](https://defpromo.com), a browser extension that used to ask for the person's own OpenAI key and a scraper key instead.

An account in this profile is a network the person connected: `{ "id": "bluesky:chovy.bsky.social", "kind": "social", "network": "bluesky", "handle": "chovy.bsky.social", "name": "Chovy", "org": { "name": "Bluesky", "url": "https://bsky.app" }, "url": "https://bsky.app/profile/chovy.bsky.social", "updated": "…" }`.

- **`POST /analyze`** with `{ "url" }`, scope `analyze:create`. The bridge reads the page the way a directory does: the site's [OpenProfile.md](/openprofile) and `llms.txt` first, its HTML only when it must, and answers `{ "name", "description", "audience", "features": [ … ], "tone", "read_from": ["openprofile" | "llms" | "html"] }`. A project starts from what the site says about itself.
- **`POST /write`** with `{ "kind": "post" | "comment", "network", "count", "project": { "name", "description", "audience", "features", "tone", "url" }, "context": { "title", "content", "url" }, "include_link", "title" }`, scope `write:create`. `context` is the post being replied to when `kind` is `comment`. `network` lets the bridge apply that network's length and house rules. Answers `{ "variations": [ "…" ], "title", "usage": { "input", "output", "cost" } }`. `title` is present when asked for and the network wants one.
- **`POST /suggest`** with `{ "project" }`, scope `suggest:create`. Answers `{ "subreddits": [ … ], "hashtags": [ … ], "keywords": [ … ], "forums": [ { "name", "url" } ] }`. Where a bridge can read a directory such as [nichedb.dev](https://nichedb.dev), the forums are real places, not guesses.
- **`POST /activity`** with `{ "network", "kind", "url", "text", "project", "at" }`, scope `activity:write`, and **`GET /activity`**. The app made a post with the person's own hands, in their own browser, and tells the bridge so the person's history, recap and analytics see it. The bridge answers `{ "id" }`.
- **`POST /posts`** with `{ "network", "text", "title", "url", "when" }`, scope `posts:create`, only when the descriptor says `"posts": true`. The bridge's own poster queues it and answers `{ "id", "status": "queued" }`. A bridge that never holds a social credential never serves this, and says so by leaving `posts` out of its descriptor.

## The `finance` profile

SimpleFIN 1.0 and 2.0, unchanged: `GET /accounts` with `start-date`, `end-date`, `pending`, `account`, `balances-only` and `version`, answering an account set with balances and transactions. A SimpleFIN bridge is an OpenConnection bridge whose descriptor says `"profiles": ["finance"]` and whose claim answers `"auth": "basic"`. Nothing in this document asks it to change.

## Discovery

An app finds a bridge two ways:

1. The person pastes a setup token. The claim URL is inside it. This is the normal way and needs no descriptor.
2. `/.well-known/openconnection.json` on the bridge's origin, when the app wants to link the person to `setup` or read what the bridge can do before asking.

A descriptor is **verified** when it was fetched from `/.well-known/` on the origin the access URL is on. A claim URL on some other origin than its descriptor is a claim about the bridge by whoever hosts it.

## With OpenAccess

[OpenAccess](/openaccess) is the door for an app that can register: it keeps a key, serves a descriptor, and receives a grant the person can carry between apps. OpenConnection is the door for an app that cannot. They share the scope vocabulary, and a bridge that is also an OpenAccess app may make the claimed token an OpenAccess JWT, so a resource that already verifies those needs no second path. The app claiming it need not know or care.

## What is deliberately absent

**No client registration.** The app is named by what it says at claim, and the person judges that name on the bridge's list. A bridge that wants registered apps runs OpenAccess beside this.

**No redirect, no browser round trip.** The person moves the token by hand. That is the feature.

**No refresh token.** A token lives until it expires or is revoked. When it does, the person pastes a new setup token, which takes as long as the first one did.

**No credentials passed through.** The app acts through the bridge or not at all.

**No posting unless declared.** A bridge says `"posts": true` or it does not post.

## Running one

A bridge needs a table of setup tokens (secret, person, scopes, expiry, claimed at, claimed by), a table of access tokens (person, app name, scopes, issued, last used, revoked at), a page at `setup`, a list page with revoke, and the profile's endpoints. The first one took an afternoon.

## Related standards

- [OpenAccess](/openaccess): the registered door, same scopes.
- [OpenProfile.md](/openprofile): the `operator` behind a bridge and the `principal` an app acts for.
- [OpenMCP](/openmcp): a bridge that is also an MCP relay lists itself there; an OpenConnection token works as its bearer.
- [SimpleFIN](https://www.simplefin.org/protocol.html): the `finance` profile, and the protocol this generalises.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-13 | First publication: the descriptor, the setup token, the claim, eight rules, the `social` and `finance` profiles, discovery, with OpenAccess. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
