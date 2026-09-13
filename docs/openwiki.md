# OpenWiki

OpenWiki is a wiki that is a folder of Markdown files. One file per page, links between pages written as `[[Page]]`, a small front matter vocabulary at the top of each file, and two files the wiki serves about itself: a descriptor at `/.well-known/openwiki.json` and an index of its pages. Every page is readable as the Markdown it is stored as, every revision of every page is readable the same way, and every revision says who made it: a person, an AI, or both. A folder that follows this opens unchanged in Obsidian, Logseq, and every note tool that already speaks `[[Page]]`, and any of those folders becomes an OpenWiki by adding the two files. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1.1**. A description of what the `[[Page]]` convention already is in practice, written down so a wiki can be moved, mirrored, read by a directory and edited by an agent without reading any engine's source.

Slug: `openwiki`

## The problem

There is no open wiki format. There is MediaWiki's wikitext and its XML dump, which is one engine's shape; there is WikiCreole, a markup standard from 2007 that a handful of engines adopted and then stopped; and there is what everybody actually uses now: Markdown files in a folder, linked with `[[Page]]`. Obsidian, Logseq, Foam, Dendron, Quartz, Silverbullet and a dozen others all read that, and none of them agrees on what goes above the first line, how a link finds its page when the case or the spaces differ, where the history lives, or how another program is meant to find out that the folder is a wiki at all.

So a wiki today is portable in exactly one direction: out of the tool as files, and into the next tool by hand. A directory cannot list wikis, an agent cannot edit one without an engine-specific API, and a reader cannot tell which pages a person wrote and which an agent did. The format is already there. What is missing is the two files that say so, and the six rules the tools already mostly follow.

## Terms

- A **wiki** is a folder of pages served by a **host** at one origin, with a name and a descriptor.
- A **page** is one Markdown file. Its **name** is its title; its **slug** is the name as it appears in a URL.
- A **wikilink** is `[[Page]]`, `[[Page|label]]`, `[[Page#Section]]` or `[[Page#Section|label]]`: a link to a page by name.
- A **revision** is one saved state of a page, with a time, an author and a `made_by`.
- **`made_by`** is a revision's own statement of who wrote it: `human`, `ai` or `both`.
- A **directory** is anything that reads wiki descriptors across hosts and lists them.

## The page

A page is a Markdown file. What is above the first `---` line is front matter, in YAML; what follows is the page. Every key is optional. Absent is unstated, never a default.

```markdown
---
title: Going viral
aliases: [virality, viral loop]
tags: [growth, distribution]
summary: What makes a thing spread, and what only looks like it.
author: https://chovy.com/.well-known/openprofile.md
made_by: both
disclosure: ai-assisted
ai_model: gpt-5.1
ai_provider: OpenAI
ai_prompt_url: https://goviral.wiki/ai-methodology#pages
created: 2026-09-13
updated: 2026-09-13T12:40:00Z
license: CC-BY-4.0
lang: en
---

A thing goes viral when each person who sees it shows it to more than one
other person on average. See [[K-factor]] and [[Webrings|the webring case]].
Nothing else counts; see [[Vanity metrics#Reach]].
```

- **`title`** is the page's name when it differs from the file name. A file `going-viral.md` with no `title` is named `going-viral`.
- **`aliases`** are other names that resolve to this page. A link to `[[virality]]` lands here.
- **`tags`** are free words. A host may list pages by tag; a directory may too.
- **`summary`** is one line about the page, for a listing.
- **`author`** is who wrote the page as it stands: an [OpenProfile.md](/openprofile) URL, or a name. Per-revision authorship is in the history, below.
- **`made_by`** is `human`, `ai` or `both`, for the page as it stands. `human` means a person wrote it, with tools at most. `ai` means a model or agent wrote it, with a person at most pointing it. `both` means a mix the page does not care to split. It is a self-declaration and nothing verifies it.
- **`disclosure`** is optional and uses the W3C AI Content Disclosure vocabulary verbatim: `none`, `ai-assisted`, `ai-generated`, `autonomous`, and at the page level `mixed`, for a page whose sections differ.
- **`ai_model`**, **`ai_provider`** and **`ai_prompt_url`** are the rest of that vocabulary, the `ai-model`, `ai-provider` and `ai-prompt-url` attributes under our naming: which model, whose, and a page describing how it is used. Optional, and meaningful only beside a `disclosure` other than `none`. A host rendering the page puts the same four on it, `<meta name="ai-disclosure">` and the attributes on the element that holds the body, so a browser and a crawler read what the file says.
- **`created`** and **`updated`** are dates or timestamps, ISO 8601.
- **`license`** is an SPDX identifier, for the page when it differs from the wiki's.
- **`lang`** is a BCP 47 tag.
- **`redirect`** names a page that this one now is: `redirect: "[[New name]]"`. A host serving a page with `redirect` answers with the target.

The body is CommonMark, plus wikilinks, plus GitHub tables and task lists, which every tool named above renders. A host may render more; it must serve the file as written.

## Wikilinks

`[[Page]]` links to the page named `Page`. The rules for finding it, in order:

1. **A page whose name matches exactly.**
2. **A page whose name matches case-insensitively**, with spaces, hyphens and underscores treated as the same character. `[[going viral]]`, `[[Going-Viral]]` and `[[going_viral]]` are one link.
3. **A page with the name among its `aliases`**, under the same comparison.
4. **A page in a folder by that path**, when the link contains `/`: `[[growth/K-factor]]`.
5. **Nothing.** The link is to a page that does not exist yet. A host renders it as a link that offers to create the page, the way every wiki since the first has; a directory lists it under `wanted`.

`[[Page|label]]` shows `label`. `[[Page#Section]]` links to the heading `Section` within the page, matched the same way as names. `![[Page]]` embeds the page's body in place, and `![[image.png]]` embeds a file in the folder; a host that does not embed renders them as links. A wikilink never leaves the wiki: a link to another site is a plain Markdown link.

## The URL

A page named `Going viral` lives at `<wiki url>/going-viral`. The slug is the name in lower case with runs of spaces and punctuation as one hyphen, and a host answers the name in any of the forms rule 2 accepts. Three representations, one address:

| Ask for | Get |
|---|---|
| `GET /going-viral` | The page rendered, with `<link rel="alternate" type="text/markdown" href="/going-viral.md">` |
| `GET /going-viral.md`, or `Accept: text/markdown` | The file, front matter and all, as stored. `Content-Type: text/markdown; charset=utf-8`. `ETag` is the revision id. |
| `GET /going-viral.md?rev=<id>` | That revision's file |
| `GET /going-viral.history.json` | The revisions, newest first |

```json
{
  "openwiki": "0.1",
  "page": "Going viral",
  "url": "https://goviral.wiki/going-viral",
  "revisions": [
    { "id": "8f3a1c", "at": "2026-09-13T12:40:00Z", "author": "https://chovy.com/.well-known/openprofile.md",
      "made_by": "both", "disclosure": "ai-assisted", "ai_model": "gpt-5.1", "ai_provider": "OpenAI",
      "summary": "K-factor, not reach", "parent": "2b77e0", "bytes": 1840 },
    { "id": "2b77e0", "at": "2026-09-12T09:10:00Z", "author": "https://chovy.com/.well-known/openprofile.md",
      "made_by": "human", "summary": "First draft", "parent": null, "bytes": 1120 }
  ]
}
```

A revision id is opaque. A host backed by git uses the commit; a host backed by a table uses its own. `parent` is the revision this one edited, so a fork of the history is visible as two revisions with one parent. `made_by` is the revision's, and may differ from the page's front matter, which describes the page as it stands. So are `disclosure`, `ai_model`, `ai_provider` and `ai_prompt_url`, when the revision says them.

## The wiki

The host serves one descriptor about the wiki at `/.well-known/openwiki.json`:

```json
{
  "openwiki": "0.1",
  "wiki": {
    "name": "goviral.wiki",
    "url": "https://goviral.wiki/",
    "summary": "How things spread on the open web, by the people spreading them.",
    "lang": "en",
    "license": "CC-BY-4.0",
    "operator": "https://profullstack.com/.well-known/openprofile.md"
  },
  "pages_url": "https://goviral.wiki/pages.json",
  "changes": "https://goviral.wiki/changes.atom",
  "repo": "https://github.com/profullstack/goviral.wiki",
  "edit": "https://goviral.wiki/edit/",
  "editors": "accounts",
  "accepts": ["human", "ai", "both"],
  "updated": "2026-09-13T12:40:00Z"
}
```

- **`pages_url`** lists every page, and is the one thing a directory reads.
- **`changes`** is an Atom feed of revisions, newest first, one entry per revision with the page's URL, the author, `made_by` and the summary. Recent changes have been a feed since 2003; this only says which one.
- **`repo`** is where the folder lives as a repository, when it does. Git is the natural transport for a folder of files with a history, and a wiki whose host is a git remote is a wiki anyone can clone, fork and send a change to. Optional.
- **`edit`** is where a page is edited, as a URL prefix the slug is appended to. Optional; a read-only mirror has none.
- **`editors`** is who may edit: `open` (anyone), `accounts` (anyone signed in), `closed` (the operator).
- **`accepts`** is the wiki's policy on `made_by` for revisions. `["human"]` is a wiki that takes no AI edits; absent is all three.

`pages_url`:

```json
{
  "openwiki": "0.1",
  "wiki": "https://goviral.wiki/",
  "pages": [
    { "name": "Going viral", "url": "https://goviral.wiki/going-viral", "md": "https://goviral.wiki/going-viral.md",
      "summary": "What makes a thing spread, and what only looks like it.", "tags": ["growth", "distribution"],
      "made_by": "both", "updated": "2026-09-13T12:40:00Z", "revisions": 2,
      "links": ["K-factor", "Webrings", "Vanity metrics"], "aliases": ["virality", "viral loop"] }
  ],
  "wanted": [
    { "name": "K-factor", "from": ["Going viral"] }
  ]
}
```

`links` are the page's wikilinks by resolved name; `wanted` are the names linked to that no page has yet, with the pages that want them. Together they are the graph, which is the thing a wiki has that a folder does not, and the thing every tool draws its own way.

## Editing

A host that lets a page be edited over HTTP does it as the same file going back:

```http
PUT /going-viral.md
Content-Type: text/markdown; charset=utf-8
If-Match: "8f3a1c"
Authorization: Bearer <token>
X-OpenWiki-Summary: Fixed the K-factor formula
X-OpenWiki-Made-By: ai
```

The body is the whole file, front matter included. `If-Match` is the revision the editor started from; a mismatch is `412` and the editor reads the current file and tries again, which is the only merge rule a wiki has ever had. The answer is `200` with the new revision id in `ETag`, or `201` when the page is new. `X-OpenWiki-Made-By` is the revision's `made_by`; absent is unstated, and a wiki whose `accepts` excludes the value answers `403`. The page's `disclosure`, `ai_model`, `ai_provider` and `ai_prompt_url` travel in the front matter as saved; a revision that differs from the page says so in `X-OpenWiki-Disclosure`, `X-OpenWiki-AI-Model`, `X-OpenWiki-AI-Provider` and `X-OpenWiki-AI-Prompt-URL`. A host that issues tokens with [OpenAccess](/openaccess) names the scope `openwiki:edit`. `DELETE` on a page is a revision that empties it; the history stays.

An agent editing a wiki is a program reading a Markdown file and putting it back. That is the whole API, and it is the same one a person's editor uses.

## Discovery

A reader finds a wiki three ways:

1. `/.well-known/openwiki.json` on the origin, then `pages_url`.
2. `<link rel="openwiki" href="...">` on any page of the wiki, pointing at its descriptor, when the file lives somewhere else.
3. The `.md` beside any page. A site that answers `<page>.md` with front matter and `[[links]]` is announcing itself; a directory that finds one looks for the descriptor.

A descriptor fetched from `/.well-known/` on the origin is **verified** as the host's; one found elsewhere is a claim about the host by whoever serves it.

## Directories

A directory reading wikis:

1. **Reads `pages_url`, not every page.** It lists pages with the summary, tags, `made_by` and `updated` the host gave, and fetches a page's Markdown only to show it.
2. **Shows `made_by` as the page said it, and unstated as unstated.** A directory that filters on it shows unstated rows as unstated, never as `human`.
3. **Keeps the host's URLs.** A page is read on its wiki; a directory links there and never serves a copy as the page.
4. **Lists `wanted` pages** as what a wiki is asking for, which is how a wiki gets contributors.
5. **Is not a wiki by reading wikis.** A directory that offers its own pages serves its own descriptor.

## What is deliberately absent

**No markup of its own.** The body is Markdown as every tool already writes it. Where tools disagree (callouts, dataview, properties), a host may render what it likes and serves the file as written.

**No verification of `made_by`.** It is a statement per revision. The history is where the truth accumulates, revision by revision, author by author.

**No central registry.** A wiki is a folder on a host, and a directory is optional. Two wikis with one name on two hosts are two wikis.

**No user model.** `author` is a URL or a name. Who may edit is the host's affair, stated in one word by `editors`; how they sign in is the host's affair too.

**No engine.** Obsidian is a host of an OpenWiki that serves nothing. Quartz is a host that serves the rendered pages. A git remote with two JSON files generated on push is a host. The specification names the files and the rules, and the engine is whatever produced them.

## Running one

A host is a folder, a way to render a Markdown file, two JSON files it can generate from the folder, an Atom feed of its history, and, if it takes edits, one `PUT` route with a revision check. A folder under git already has the history; a host on git generates `history.json` from `git log` on the file. The first host, [goviral.wiki](https://goviral.wiki/), is being built on this specification by Profullstack.

## Related standards

- [OpenProfile.md](/openprofile): the `author` of a page and the `operator` of a wiki.
- [OpenWebring](/openwebring): the same `made_by` on a site; a wiki and its rings share the word.
- [OpenAccess](/openaccess): a host that lets a stranger edit does it with a grant carrying `openwiki:edit`.
- [OpenSite](/docs/opensite): the card a directory draws for a wiki as a site.
- [CommonMark](https://commonmark.org/) and [GitHub Flavored Markdown](https://github.github.com/gfm/): the body.
- [W3C AI Content Disclosure CG](https://github.com/dweekly/ai-content-disclosure): the vocabulary `disclosure` uses.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-13 | First publication: the page and its front matter, wikilinks and how they resolve, three representations at one URL, the history, the two files, editing as `PUT`, discovery, what a directory owes a wiki. |
| 0.1.1 | 2026-09-13 | `ai_model`, `ai_provider` and `ai_prompt_url` beside `disclosure` on pages and revisions, the rest of the W3C AI Content Disclosure vocabulary; `mixed` at the page level; a host renders the four as the group's meta tag and attributes. |

## License

This specification is published under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Implement it, extend it, and say where it came from.
