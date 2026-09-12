# OpenAccess

OpenAccess is OAuth 2.1 with a grant you can carry. A person, an agent or an organisation keeps one account at a **hub**; every app they use keeps its own users and links each one to that account once. What the hub holds for them, the permissions they gave each app and the subscriptions they paid for, is theirs, not the app's: a grant can be handed down to an agent narrower than it was received, and a subscription bought in one app is honoured in every app that says it honours that product. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface, with a reference implementation at [github.com/logicsrc/openaccess](https://github.com/logicsrc/openaccess) and a hub running at [openaccess.logicsrc.com](https://openaccess.logicsrc.com).

Status: **0.1**. A description of a hub already running, published so others can run one, link to one, or honour what one says.

Slug: `openaccess`

## The problem

Every app has a permissions model and a billing model, and no two agree. In one company's fifteen repositories we counted twelve permission vocabularies: `payments:create` in one, `invoice.write` in the next, `owner|admin|member` redeclared five times, a bag of untyped booleans in another, and not one of them shared a validator. An agent that works across those apps holds twelve credentials and understands none of them. A person who pays for one product pays again for the same thing next door, because the subscription lives in the seller's table and nowhere else.

The pieces exist. OAuth 2.1 says how an app asks a person for permission and how a token carries the answer. `/.well-known/` is where a host says things about itself. Webhooks are how a service tells another service something happened. What is missing is the convention that makes the grant and the entitlement the person's, portable across apps, with the app's own users left exactly where they are.

## Terms

- A **hub** is an OAuth 2.1 authorization server that also keeps grants and entitlements for its principals. Anyone can run one.
- A **principal** is a person, an agent or an organisation with an account at a hub. Identified by the hub's `iss` and a stable `sub`. Optionally an [OpenProfile.md](/openprofile) URL.
- An **app** is an OAuth client and resource server at once. It keeps its own users. Its **descriptor** is the file it serves about itself.
- A **link** joins one app user to one principal. It is made by the authorization flow and undone by either side.
- A **scope** is a `resource:action` string an app defines in its descriptor.
- A **grant** is what a principal gave one app: scopes, limits, an expiry. A grant can be delegated to a narrower child.
- A **product** is something an app sells, named by the seller's host and a slug: `agenticjobs.work/pro`.
- An **entitlement** is a principal's standing with a product: active, trialing, past due, cancelled or expired. It is honoured by every app whose descriptor names the product.
- A **token** is a signed JWT an app verifies against the hub's keys, offline.

## The app descriptor

An app serves a JSON document at `/.well-known/openaccess.json` on its own origin.

```json
{
  "openaccess": "0.1",
  "name": "Agentic Jobs",
  "url": "https://agenticjobs.work",
  "operator": "https://profullstack.com/.well-known/openprofile.md",
  "redirect_uris": ["https://agenticjobs.work/api/v1/openaccess/callback"],
  "jwks": { "keys": [{ "kty": "OKP", "crv": "Ed25519", "kid": "2026-09", "x": "..." }] },
  "scopes": {
    "jobs:read": "See job posts and applicants",
    "jobs:apply": "Apply to jobs on your behalf",
    "inbox:write": "Reply in your inbox"
  },
  "offers": [
    {
      "product": "agenticjobs.work/pro",
      "name": "Pro",
      "price": "9 USD/month",
      "links": {
        "pay": "https://agenticjobs.work/pay/pro?principal={principal}",
        "cancel": "https://agenticjobs.work/me/billing",
        "manage": "https://agenticjobs.work/me/billing",
        "upgrade": "https://agenticjobs.work/pay/team?principal={principal}",
        "promote": "https://agenticjobs.work/?ref={principal}"
      }
    }
  ],
  "honours": ["agenticjobs.work/pro", "profullstack.com/all-access"],
  "webhooks": "https://agenticjobs.work/api/v1/openaccess/events",
  "hubs": ["https://openaccess.logicsrc.com"]
}
```

The rules, and every one degrades:

1. **`scopes` is the registry.** A scope is lowercase `resource:action`, two or three segments. An app understands exactly the scopes its descriptor names, each with one line a person can read on a consent screen. Four scopes are reserved and need no listing: `openid`, `profile`, `email`, and `entitlements`, which lets the app read the principal's standing with the products it honours.
2. **A hub never narrows silently.** A request for a scope the descriptor does not name is refused with `invalid_scope` and the offending name. A token's `scope` is what was asked for, or the flow failed.
3. **`redirect_uris`** are exact, https, on the app's origin or a loopback. The house path is `/api/v1/openaccess/callback`.
4. **`jwks`** is the app's credential. An app that calls the hub as itself signs a client assertion with one of these keys (`private_key_jwt`); there is no shared secret to leak. An app with no `jwks` is a public client: it links people with PKCE and cannot report entitlements.
5. **`offers`** are the products this app sells. `product` is `<host>/<slug>` and the host must be the descriptor's own origin. `price` is `<amount> <currency>/<period>` or `free`. `links` are where a person goes to `pay`, `cancel`, `manage`, `upgrade` or `promote`; `{principal}` in a link is replaced with the principal's `sub`, so a sale or a referral can be attributed. `promote` is the link a subscriber hands to someone else.
6. **`honours`** names the products this app treats as paid beyond its own offers, which it honours without saying so. An app that honours `profullstack.com/all-access` gives that entitlement's holder whatever it gives its own subscribers. Honouring is the app's promise; the hub only reports.
7. **`webhooks`** is where the hub tells the app what changed. Required for an app with `jwks`; a public client hears nothing and reads the token instead.
8. **`operator`** is the person or organisation answerable for the app, as an OpenProfile.md URL.
9. **`hubs`** names hubs the app accepts tokens from. A token from any other issuer is refused.

Unknown keys are kept. Serve it as `application/json`. The descriptor is a claim; the probe is the verification: a hub registers an app by fetching the descriptor from the app's own origin, and lists nothing it typed.

## The hub

A hub serves the standard `/.well-known/oauth-authorization-server` and its own `/.well-known/openaccess.json`, which repeats the OAuth metadata and adds where the rest lives:

```json
{
  "openaccess": "0.1",
  "issuer": "https://openaccess.logicsrc.com",
  "authorization_endpoint": "https://openaccess.logicsrc.com/authorize",
  "token_endpoint": "https://openaccess.logicsrc.com/token",
  "device_authorization_endpoint": "https://openaccess.logicsrc.com/device",
  "introspection_endpoint": "https://openaccess.logicsrc.com/introspect",
  "revocation_endpoint": "https://openaccess.logicsrc.com/revoke",
  "userinfo_endpoint": "https://openaccess.logicsrc.com/userinfo",
  "jwks_uri": "https://openaccess.logicsrc.com/.well-known/jwks.json",
  "code_challenge_methods_supported": ["S256"],
  "grant_types_supported": ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"],
  "token_endpoint_auth_methods_supported": ["none", "private_key_jwt"],
  "operator": "https://logicsrc.com/.well-known/openprofile.md",
  "hub": { "api": "https://openaccess.logicsrc.com/v1", "mcp": "https://openaccess.logicsrc.com/mcp", "apps": 12, "principals": 340 }
}
```

How a person signs in to a hub is the hub's business. The reference hub uses a magic link and no password.

## The flows

**Linking** is OAuth 2.1 authorization code with PKCE, unchanged. The app sends the person to `authorization_endpoint` with `client_id` (the app's id at the hub, a slug of its host), `redirect_uri`, `scope`, `state` and `code_challenge`. The hub shows the app, its operator, each scope's line from the descriptor, and which honoured products the app will see. The person approves. The app exchanges the code for tokens. The app stores `sub` beside its own user id: that is the link, and the app's user table is otherwise untouched.

**Devices and terminals** use the device authorization flow (RFC 8628): a CLI or an agent without a browser shows a code, the person approves it at the hub, and the token arrives at the terminal.

**Delegation** is the part OAuth lacks. A token whose scope includes `grants:delegate` may mint a child grant:

```
POST /v1/grants
Authorization: Bearer <the parent token>
{ "for": "https://bot.example/.well-known/openprofile.md", "scope": "jobs:read jobs:apply", "limits": { "per_call": "5 USD", "per_day": "50 USD" }, "expires_in": 604800 }
```

The child's scopes are a subset of the parent's, its limits no larger, its expiry no later. `for` names who will hold it: an OpenProfile URL for an agent, or absent for a bare bearer. The answer is a refresh token the child redeems at `token_endpoint` like any other, with the same `client_id` as the parent. Revoking a grant revokes every child under it. Delegation can chain, and every token names its `grant`, so an app can always see the path back to the person.

**Entitlements** are reported by the seller and read by everyone who honours the product. When a person pays, the seller calls the hub as itself:

```
POST /v1/entitlements
Authorization: Bearer <client assertion, private_key_jwt>
{ "sub": "oa_7f3c...", "product": "agenticjobs.work/pro", "status": "active", "period": { "start": "2026-09-12T00:00:00Z", "end": "2026-10-12T00:00:00Z" }, "receipt": "https://agenticjobs.work/receipts/inv_991" }
```

The hub records it, tells every app that honours the product, and from then on every token it issues to such an app carries the product in `entitlements`. The seller alone can change an entitlement's status. When the person cancels from the hub, the hub sends the seller `entitlement.cancel_requested` and shows the person the seller's `cancel` link; the entitlement stays active until the seller reports otherwise, because the seller has the money and the terms.

## The token

An access token is a JWT signed by the hub with EdDSA (Ed25519), verified offline against `jwks_uri`, or by `introspection_endpoint` when the app prefers.

```json
{
  "iss": "https://openaccess.logicsrc.com",
  "sub": "oa_7f3c9e2a",
  "aud": "agenticjobs.work",
  "iat": 1757700000,
  "exp": 1757703600,
  "scope": "openid email jobs:read jobs:apply entitlements",
  "grant": "g_2b1e...",
  "parent": "g_0a9d...",
  "holder": "https://bot.example/.well-known/openprofile.md",
  "limits": { "per_call": "5 USD", "per_day": "50 USD" },
  "entitlements": ["agenticjobs.work/pro"],
  "openaccess": "0.1"
}
```

`aud` is the app's id, and an app refuses a token for anyone else. `grant` is the handle an app uses to look the grant up or to hear about it. `parent` is present on a delegated token, and `holder` names who holds it when the delegation named one. `limits` are for the app to enforce; the hub only guarantees a child never exceeds its parent. A limit is `<amount> <currency>` (ISO 4217, or a CAIP-19 asset id) or `<n> calls`, over `per_call`, `per_day` (a rolling day) or `lifetime`. `entitlements` lists the honoured products the principal holds active at issue; it is a snapshot, and a webhook or a fresh token is how an app learns of a change. Access tokens are short; refresh tokens rotate and a reused one revokes the grant.

## Webhooks

The hub tells an app what changed with one `POST` of `{id, event, at, hub, sub, grant?, entitlement?}` to the descriptor's `webhooks` URL, with headers `X-OpenAccess-Event`, `X-OpenAccess-Delivery` and `X-OpenAccess-Signature: ed25519=<base64url signature of the raw body under the hub's key>`. No shared secret: a receiver verifies against `jwks_uri`, the same key that signs tokens.

| event | to whom | when |
|---|---|---|
| `link.created`, `link.removed` | the app | a person linked or unlinked |
| `grant.created`, `grant.updated`, `grant.revoked` | the app | a grant for it changed; a child grant carries `parent` |
| `entitlement.activated`, `entitlement.updated`, `entitlement.cancelled`, `entitlement.expired` | every app honouring the product | the seller reported a change |
| `entitlement.cancel_requested` | the seller | the person asked to cancel at the hub |

Three attempts, then the failure is recorded; fifty consecutive failures and deliveries to that app pause, still listed, so its operator can see why.

## The hub's own doors

Beyond the OAuth endpoints, a hub exposes the same records over REST under `hub.api` and over MCP at `hub.mcp`, for a bearer of the principal's own token.

| | REST | MCP tool |
|---|---|---|
| Who am I, what do I hold | `GET /v1/me` | `whoami` |
| My grants, and revoke one | `GET /v1/grants`, `DELETE /v1/grants/:id` | `my_grants`, `revoke_grant` |
| Hand a narrower grant to an agent | `POST /v1/grants` | `delegate_grant` |
| My entitlements, pay, cancel | `GET /v1/entitlements`, `POST /v1/entitlements/:id/cancel` | `my_entitlements`, `cancel_entitlement` |
| The apps, and register one | `GET /v1/apps`, `POST /v1/apps {url}`, `GET /v1/apps/:id` | `list_apps`, `get_app`, `register_app` |
| Does this principal hold this product | `GET /v1/check?product=` | `check_entitlement` |

Registering an app is open, because nothing the registrant types is listed: the hub fetches the descriptor from the app's origin, and the app proves it is itself by signing with a key that descriptor names. Refreshing re-reads the descriptor; a scope removed from it is removed from every grant.

## The app

A conforming app:

1. Serves its descriptor and keeps `scopes` honest: every scope it checks is listed, with a line a person can read.
2. Links with PKCE, stores `sub` beside its own user, and refuses a token whose `aud` is not itself or whose `iss` is not in its `hubs`.
3. Reads `scope`, `limits` and `entitlements` from the token and enforces them; a limit the hub carried is the app's to apply.
4. Treats an honoured entitlement exactly as it treats its own subscriber, whoever sold it.
5. Reports its own sales and cancellations to the hub as itself, promptly, and answers `entitlement.cancel_requested` with a real cancellation.
6. Verifies every webhook signature against the hub's keys before acting on it.
7. Reports absence as absence: a token with no `entitlements` claim means the app did not ask, not that the person has none.

## What is deliberately absent

**No passwords.** A hub signs people in however it likes; the reference uses a magic link. An app never sees a hub credential.

**No money.** The hub records that a person is entitled; the seller charged them, by card, by CoinPay, by invoice, by nothing. The hub is the ledger of standing, not of payment.

**No roles.** `owner`, `admin`, `member` are an app's local bundles of scopes. What crosses the wire is the scopes, so two apps can mean the same thing by the same string.

**No trust score.** `verified` means the descriptor came from the app's origin. Whether to link an app is the person's judgement, with the operator's profile as the place to start.

**No silent narrowing.** A scope is granted or the request fails with its name. A system that returns `200 OK` with fewer scopes than asked for has broken a person's invoicing before, and will again.

## Serving one

By hand, or `openaccess descriptor https://your.site` prints a template and `openaccess keygen` makes the key it names. [agenticjobs](https://agenticjobs.work) is first in line. The reference hub runs on Node 24 with one SQLite file: `npx @logicsrc/openaccess serve`.

## Related standards

- [OpenProfile.md](/openprofile): the `operator` behind an app, and the identity of an agent that holds a delegated grant.
- [OpenMCP](/openmcp): a relay lists its `auth`; an OpenAccess hub is one kind of `auth.url`.
- [OpenCreds](/opencreds): where the refresh token an agent was handed is kept.
- [OAuth 2.1](https://oauth.net/2.1/), [RFC 8628](https://www.rfc-editor.org/rfc/rfc8628) device authorization, [RFC 7523](https://www.rfc-editor.org/rfc/rfc7523) client assertions, [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414) server metadata: what a hub speaks.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-12 | First publication: the descriptor, the hub, linking, delegation, entitlements, the token, webhooks, the doors. |

## License

The specification text is CC BY 4.0. The reference implementation is MIT.
