# OpenWebring

OpenWebring is a webring that says who made it. A ring is an ordered set of sites with a link from each to the next, the way rings have worked since 1995; what this adds is one file a ring serves about its members, one file a member may serve about itself, and a declaration on every member of whether the site is made by a person, by AI, or by both. A reader who wants only the human web can follow the ring and get it. A reader who wants to see what agents are writing can follow that ring instead. Nobody has to guess, and nobody has to install a script. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1.1**. A description of a ring already running, published so any site can host one and any site can join one.

Slug: `openwebring`

## The problem

Webrings came back. There are hundreds of them again, on Neocities and personal domains and the fediverse, and every one of them reinvents the same three things: a list of members somebody keeps by hand, a `next` and a `previous` link that go somewhere, and a check, usually by eye, that the member still links back. Each ring keeps its list in its own shape (an HTML page, a JSON file, a JavaScript array, a git repo), so a site in four rings is described four ways, and no directory can read a ring without reading its source code.

Meanwhile the one thing a reader in 2026 wants to know about a site, whether a person wrote it, has no place to be said. There are badges, and there are three proposals for a header or an attribute, and none of them is something a ring can filter on. A ring for the human web and a ring for the machine web are the same ring with one field, if the field exists.

## Terms

- A **ring** is an ordered, circular list of member sites, run by a **host**. The host serves the ring's file and the hops.
- A **member** is a site in a ring. A site may be in many rings.
- A **hop** is the link a reader follows from one member to the next: `next`, `previous`, `random`.
- A **descriptor** is the file a site serves at `/.well-known/openwebring.json`: about itself as a member, about the rings it hosts, or both.
- **`made_by`** is a member's own statement of who makes its content: `human`, `ai` or `both`.
- A **directory** is anything that reads ring descriptors across hosts and lists them.

## The member

A member owes a ring one thing: a plain link to the ring on a page the ring can find, usually the home page. No script, no image, no markup beyond `<a href>`:

```html
<a href="https://rssamplifier.com/ring/small-web/previous?from=https://chovy.com/">←</a>
<a href="https://rssamplifier.com/ring/small-web">Small Web ring</a>
<a href="https://rssamplifier.com/ring/small-web/next?from=https://chovy.com/">→</a>
```

That is the whole obligation, and it is satisfied by every member of every existing ring today, because that is what those rings already ask for.

A member may also serve a descriptor at `/.well-known/openwebring.json`:

```json
{
  "openwebring": "0.1",
  "site": {
    "url": "https://chovy.com/",
    "name": "Chovy's Blog",
    "feed": "https://chovy.com/feed.xml",
    "lang": "en",
    "banner": "https://chovy.com/ring-88x31.png",
    "author": "https://chovy.com/.well-known/openprofile.md"
  },
  "made_by": "human",
  "disclosure": "ai-assisted",
  "ai_model": "gpt-5.1",
  "ai_provider": "OpenAI",
  "ai_prompt_url": "https://chovy.com/ai-methodology#posts",
  "rings": [
    { "ring": "https://rssamplifier.com/ring/small-web", "slug": "chovy" }
  ],
  "updated": "2026-09-13T12:00:00Z"
}
```

- **`site.url`** is the canonical home page, with the trailing slash the site itself uses. It is the identity a ring matches hops against.
- **`site.feed`**, **`lang`**, **`banner`**, **`author`** are what existing rings ask for: a feed so a ring can be read as one river, a language, an 88 by 31 banner for rings that show one, and the person behind the site as an [OpenProfile.md](/openprofile) URL. Absent is unstated.
- **`made_by`** is `human`, `ai` or `both`. `human` means a person makes the content, with tools at most. `ai` means a model or agent makes it, with a person at most pointing it. `both` means a mix the site does not care to split. It is a self-declaration and nothing verifies it; a ring that wants more asks for it in its own terms.
- **`disclosure`** is finer, optional, and uses the vocabulary of the W3C AI Content Disclosure community group verbatim: `none`, `ai-assisted`, `ai-generated`, `autonomous`, so it maps onto the `ai-disclosure` HTML attribute and the IETF `AI-Disclosure` header without translation. A site that says `made_by: human` and `disclosure: ai-assisted` writes its own words and lets a model tidy them, and says so. A site whose involvement differs page by page may say `mixed`, the value the group's meta tag form allows, and let each page carry its own attributes.
- **`ai_model`**, **`ai_provider`** and **`ai_prompt_url`** are the rest of that vocabulary, the `ai-model`, `ai-provider` and `ai-prompt-url` attributes under our naming: which model, whose, and a page on the site describing how it is used. Optional, and meaningful only beside a `disclosure` other than `none`. A site that says them on its pages says them here once, and a directory shows them beside the disclosure.
- **`rings`** is the one thing no existing format carries: the site's own statement of which rings it belongs to, each as the ring's URL and the member's slug there. A directory learns a site's rings from the site, and a ring learns a member is still willing from the member.

## The host

A host serves its rings at `/.well-known/openwebring.json` on its origin, under `hosts`:

```json
{
  "openwebring": "0.1",
  "site": { "url": "https://rssamplifier.com/", "name": "RSS Amplifier" },
  "hosts": [
    {
      "slug": "small-web",
      "name": "Small Web",
      "url": "https://rssamplifier.com/ring/small-web",
      "description": "Independent blogs published from the maker's own domain.",
      "accepts": ["human", "both"],
      "join": "https://rssamplifier.com/ring/small-web#join",
      "members": 214,
      "members_url": "https://rssamplifier.com/ring/small-web/openwebring.json",
      "opml": "https://rssamplifier.com/ring/small-web/opml",
      "updated": "2026-09-13T12:00:00Z"
    }
  ]
}
```

And each ring's own file, at `members_url` (a host with one small ring may put `members` inline instead):

```json
{
  "openwebring": "0.1",
  "ring": {
    "slug": "small-web",
    "name": "Small Web",
    "url": "https://rssamplifier.com/ring/small-web",
    "host": "https://rssamplifier.com/",
    "accepts": ["human", "both"]
  },
  "members": [
    {
      "url": "https://chovy.com/",
      "slug": "chovy",
      "name": "Chovy's Blog",
      "feed": "https://chovy.com/feed.xml",
      "lang": "en",
      "made_by": "human",
      "status": "active",
      "since": "2026-09-13",
      "checked": "2026-09-13T11:00:00Z"
    }
  ],
  "updated": "2026-09-13T12:00:00Z"
}
```

- **`accepts`** is the ring's policy on `made_by`: which declarations it admits. Absent means all three. A reader filtering rings for the human web looks for `["human"]`.
- **`join`** is where a site asks in. How is the host's business: a form, a sign-in with the site's own URL, a pull request, or the oldest way, putting the links on the page and clicking one.
- **`members`** is the list in ring order. Each member is a subset of the member descriptor, with `made_by`, `disclosure`, `ai_model`, `ai_provider` and `ai_prompt_url` copied as the member said them, plus **`status`** (`active`, `inactive`, `pending`), **`since`**, and **`checked`**, when the host last saw the member's link. Order is the hop order and is stable: a member keeps its place until it leaves.
- **`opml`** is the same members as an OPML 2.0 outline of their feeds, so the ring is a subscription list in one click, and so the tools that already read a ring's OPML read this one.

## Hops

A ring serves three hops under its URL:

```
GET <ring>/next?from=<member url>
GET <ring>/previous?from=<member url>      (alias: /prev)
GET <ring>/random
```

The rules, and every one degrades:

1. **A hop is a `302` with `Cache-Control: no-store`, and nothing else.** No cookie, no interstitial, no counter that identifies the reader. The `Location` is the member's `url`.
2. **`from` is the canonical way to say where the reader is.** A host also accepts every shape rings already use, so a member written for another ring joins with no change: `?host=<domain>`, `?via=<url>`, `?url=<url or domain>`, a slug in the path (`<ring>/<slug>/next`), and no parameter at all, resolved from the `Referer`. A domain matches the member whose `url` is on it.
3. **An unknown `from` gets a random member, never an error.** A member that moved or a reader with no referrer still gets somewhere in the ring.
4. **The ring wraps.** After the last member comes the first.
5. **A hop skips members that are not `active`.** An inactive member is still in the list, still shown, and still skipped, until its link is back.
6. **`random` never lands the reader on the member they came from,** when the ring has more than one.

## Verification

A host checks its members the way the IndieWeb ring does: on a schedule, it fetches each member's page (the home page, or the pages the member's descriptor names) and looks for any link to the ring, in any of the shapes above. Found, the member is `active`; missing, `inactive`. A host never removes a member for a missing link; it marks and waits, because sites go down and come back. `checked` says when it last looked. A host may offer `<ring>/check?url=<member url>` so a member who just fixed the link need not wait for the schedule.

`made_by` is not verified, by anyone, and a directory says so beside it. A ring that admits only `human` and finds a member is not is a matter between that ring and that member, in the ring's own terms.

## Discovery

A reader finds a ring three ways:

1. `/.well-known/openwebring.json` on the host's origin, then `members_url` for each ring.
2. `<link rel="openwebring" href="...">` on a member's home page, pointing at its descriptor, when the file lives somewhere else.
3. The hop links themselves. A site that links to `<something>/next?from=` is announcing a ring; a directory that follows the link finds the host.

A descriptor fetched from `/.well-known/` on the host's origin is **verified** as the host's; one found elsewhere is a claim about the host by whoever serves it.

## Directories

A directory reading rings:

1. **Reads `members_url`, not the members' pages.** The host already checked; the directory reports `status` and `checked` as the host gave them.
2. **Dedupes a site across rings by `url`**, so one site in four rings is one site with four memberships.
3. **Shows `made_by` as the member said it, and unstated as unstated.** A directory that filters on it shows unstated rows as unstated, never as `human`.
4. **Keeps the member's own `url`**, unchanged, and links to the ring's own `join`.
5. **Offers the same three hops over its own listing** only if it says it is a ring, with its own descriptor. A directory is not a ring by reading rings.

The first host is [rssamplifier.com](https://rssamplifier.com/ring), the open directory of independent feeds, which runs one ring per topic out of the feeds it already reads and a curated ring of the sites Profullstack publishes. The first directory reading rings is [nichedb.dev/c/webrings](https://nichedb.dev/c/webrings): one row per ring and one per member, with `made_by` as the member said it and the status the host last verified, re-read hourly.

## What is deliberately absent

**No script.** A member is a link. A host may offer a widget; it is never required, and a ring whose members all need JavaScript to hop is a ring that stops when a CDN does.

**No verification of `made_by`.** It is a statement. Every badge scheme before this one said the same and was right to.

**No central registry.** A ring is a file on a host, and a directory is optional. Two rings with the same name on two hosts are two rings.

**No reader tracking.** A hop is a redirect, cached by nobody, remembered by nobody.

**No invented link relation for the hops.** `next` and `prev` are registered relations and may be used on the hop links; `me` is for identity; `openwebring` on a `<link>` points at a descriptor and nothing else.

## Running one

A host is a table of rings, a table of members with a position, three redirect routes, a scheduled fetch of member pages, and two files. The first one was built into a site that already had the feeds.

## Related standards

- [OpenProfile.md](/openprofile): the `author` behind a member, and the `operator` behind a host.
- [OpenServer](/docs/openserver), [OpenCoupon](/docs/opencoupon), [OpenThreat](/docs/openthreat): the same serve-your-own-file shape for other things a site knows about itself.
- [OpenAccess](/openaccess): a host that lets a member sign in with its URL to edit its entry may do it with a grant carrying `openwebring:edit`.
- [W3C AI Content Disclosure CG](https://github.com/dweekly/ai-content-disclosure) and [IETF draft-abaris-aicdh](https://datatracker.ietf.org/doc/draft-abaris-aicdh/): the vocabulary `disclosure` uses.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-13 | First publication: the member, the host, the two files, six hop rules, verification, discovery, what a directory owes a ring. |
| 0.1.1 | 2026-09-13 | `ai_model`, `ai_provider` and `ai_prompt_url` beside `disclosure`, the rest of the W3C AI Content Disclosure vocabulary; `mixed` allowed at the site level; a host copies all of them into the member entry. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
