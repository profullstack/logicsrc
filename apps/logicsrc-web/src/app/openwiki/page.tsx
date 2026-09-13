import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = {
  title: "OpenWiki · LogicSRC",
  description:
    "OpenWiki is a wiki that is a folder of Markdown files: [[Page]] links, a small front matter vocabulary, a descriptor at /.well-known/openwiki.json, an index of pages, every page and every revision readable as Markdown, and made_by on every revision, human, ai or both. Opens unchanged in Obsidian and Logseq.",
  alternates: { canonical: "/openwiki" }
};

const PAGE = `---
title: Going viral
aliases: [virality, viral loop]
tags: [growth, distribution]
summary: What makes a thing spread, and what only looks like it.
author: https://chovy.com/.well-known/openprofile.md
made_by: both
disclosure: ai-assisted
updated: 2026-09-13T12:40:00Z
---

A thing goes viral when each person who sees it shows it to more
than one other person on average. See [[K-factor]] and
[[Webrings|the webring case]]. Nothing else counts.`;

const WIKI = `{
  "openwiki": "0.1",
  "wiki": { "name": "goviral.wiki", "url": "https://goviral.wiki/",
            "license": "CC-BY-4.0",
            "operator": "https://profullstack.com/.well-known/openprofile.md" },
  "pages_url": "https://goviral.wiki/pages.json",
  "changes": "https://goviral.wiki/changes.atom",
  "repo": "https://github.com/profullstack/goviral.wiki",
  "edit": "https://goviral.wiki/edit/",
  "editors": "accounts",
  "accepts": ["human", "ai", "both"]
}`;

const PUT = `PUT /going-viral.md
Content-Type: text/markdown; charset=utf-8
If-Match: "8f3a1c"
Authorization: Bearer <token>
X-OpenWiki-Summary: Fixed the K-factor formula
X-OpenWiki-Made-By: ai`;

const RESOLVE: Array<[string, string]> = [
  ["Exact name", "A page named exactly that."],
  ["Loose name", "Case-insensitive; spaces, hyphens and underscores are one character. [[going viral]], [[Going-Viral]] and [[going_viral]] are one link."],
  ["Alias", "A page listing the name under aliases."],
  ["Path", "A page in a folder by that path, when the link contains a slash."],
  ["Nothing", "A page that does not exist yet: a host offers to create it, a directory lists it under wanted."]
];

const URLS: Array<[string, string]> = [
  ["GET /going-viral", "The page rendered, with a rel=alternate link to the Markdown."],
  ["GET /going-viral.md", "The file as stored, front matter and all. ETag is the revision id."],
  ["GET /going-viral.md?rev=<id>", "That revision's file."],
  ["GET /going-viral.history.json", "Every revision: id, time, author, made_by, summary, parent."],
  ["PUT /going-viral.md", "The whole file back, with If-Match on the revision you started from. 412 means read and retry."]
];

const ABSENT: Array<[string, string]> = [
  ["No markup of its own", "The body is Markdown as every tool already writes it. A host serves the file as written."],
  ["No verification of made_by", "A statement per revision. The history is where the truth accumulates."],
  ["No central registry", "A wiki is a folder on a host; a directory is optional."],
  ["No user model", "author is a URL or a name. Who may edit is one word, editors; how they sign in is the host's affair."],
  ["No engine", "Obsidian is a host that serves nothing; Quartz is a host that renders; a git remote with two JSON files is a host."]
];

export default function OpenWikiPage(): ReactNode {
  return (
    <SiteShell active="OpenWiki">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenWiki</h2>
          <p>
            A wiki that is a folder of Markdown files. [[Page]] links, a small front matter
            vocabulary, two files the wiki serves about itself, every page and every revision
            readable as Markdown, and on every revision: human, ai, or both.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          There is no open wiki format. MediaWiki&apos;s wikitext is one engine&apos;s shape,
          WikiCreole stalled in 2007, and what everybody uses now is Markdown files linked with
          [[Page]]: Obsidian, Logseq, Foam, Quartz and a dozen others read it, and none agrees on
          what goes above the first line, how a link finds its page, where the history lives, or
          how another program finds out the folder is a wiki. The format is there. This is the two
          files that say so, and the rules the tools already mostly follow.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. A folder that follows this opens unchanged in Obsidian and Logseq, and any
          such folder becomes an OpenWiki by adding the two files. The first host,{" "}
          <a href="https://goviral.wiki/">goviral.wiki</a>, is being built on it.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The page</h2>
          <p>One Markdown file. Front matter above the first rule, every key optional, absent unstated.</p>
        </div>
        <pre style={pre}>{PAGE}</pre>
        <p style={{ color: "#41505d" }}>
          <code style={mono}>made_by</code> and <code style={mono}>author</code> describe the page as
          it stands; the history carries them per revision. <code style={mono}>disclosure</code>{" "}
          uses the W3C AI Content Disclosure vocabulary verbatim. <code style={mono}>redirect</code>{" "}
          names the page this one now is.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>How a wikilink finds its page</h2>
          <p>In this order. The first four are what the tools do; the fifth is what a wiki is for.</p>
        </div>
        <table style={table}>
          <tbody>
            {RESOLVE.map(([what, how]) => (
              <tr key={what}>
                <td style={td}>
                  <strong>{what}</strong>
                </td>
                <td style={td}>{how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>One address, three representations, and the way back</h2>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>ask for</th>
              <th style={th}>get</th>
            </tr>
          </thead>
          <tbody>
            {URLS.map(([ask, get]) => (
              <tr key={ask}>
                <td style={td}>
                  <code style={mono}>{ask}</code>
                </td>
                <td style={td}>{get}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <pre style={pre}>{PUT}</pre>
        <p style={{ color: "#41505d" }}>
          An agent editing a wiki is a program reading a Markdown file and putting it back. That is
          the whole API, and it is the same one a person&apos;s editor uses. A token from{" "}
          <Link href="/openaccess">OpenAccess</Link> carries <code style={mono}>openwiki:edit</code>.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The wiki</h2>
          <p>
            One descriptor at <code style={mono}>/.well-known/openwiki.json</code>, an index of pages
            at <code style={mono}>pages_url</code> with the link graph and the pages still wanted,
            recent changes as Atom, and the folder as a git remote when it is one.
          </p>
        </div>
        <pre style={pre}>{WIKI}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>What is deliberately absent</h2>
        </div>
        <table style={table}>
          <tbody>
            {ABSENT.map(([what, why]) => (
              <tr key={what}>
                <td style={td}>
                  <strong>{what}</strong>
                </td>
                <td style={td}>{why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Where everything lives</h2>
        </div>
        <ul style={{ color: "#41505d", lineHeight: 1.9, paddingLeft: "1.1rem" }}>
          <li>
            <Link href="/docs/openwiki">Specification</Link>: the page and its front matter,
            wikilinks and how they resolve, the URL, the history, the two files, editing,
            discovery, what a directory owes a wiki
          </li>
          <li>
            <a href="https://goviral.wiki/">goviral.wiki</a>: the first host, being built on this
          </li>
          <li>
            <Link href="/openprofile">OpenProfile.md</Link>, the author of a page;{" "}
            <Link href="/openwebring">OpenWebring</Link>, the same made_by on a site;{" "}
            <Link href="/docs/opensite">OpenSite</Link>, the card a directory draws for a wiki
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
