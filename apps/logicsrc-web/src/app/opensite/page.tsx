import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = {
  title: "OpenSite · LogicSRC",
  description:
    "OpenSite is one record about a page or a site: the card a careful reader would draw from one URL, declared by the site at /.well-known/opensite.json or read from the page by written-down rules, kept by an index and handed to anyone. Title, description, picture, kind, author, feeds, and the card tags verbatim.",
  alternates: { canonical: "/opensite" }
};

const RECORD = `{
  "opensite": "0.1",
  "url": "https://nixamp.com/?url=https%3A%2F%2Fserver1.chovy.nixamp.com%3A4321%2Fview%2FJV5m&play=channel%3Aurl-6f4152c1590e",
  "canonical": "https://nixamp.com/?url=https%3A%2F%2Fserver1.chovy.nixamp.com%3A4321%2Fview%2FJV5m&play=channel%3Aurl-6f4152c1590e",
  "site": { "name": "nixamp", "web": "https://nixamp.com" },
  "kind": "stream",
  "title": "Inspiring Founders Podcast",
  "description": "Inspiring Founders Podcast is live on server1. Tune in free on nixamp, no account needed.",
  "image": { "url": "https://d3t3ozftmdmh3i.cloudfront.net/.../44567180.jpg", "width": 3000, "height": 3000 },
  "language": "en",
  "fetched_at": "2026-09-13T04:52:10Z",
  "status": "live",
  "source": "read",
  "cards": {
    "og": { "title": "Inspiring Founders Podcast", "type": "website", "image": "https://d3t3ozftmdmh3i.cloudfront.net/.../44567180.jpg" },
    "twitter": { "card": "summary" }
  }
}`;

const DESCRIPTOR = `{
  "opensite": "0.1",
  "site": { "name": "nixamp", "web": "https://nixamp.com",
            "description": "Broadcast live radio, TV and film from your own machine.",
            "image": "https://nixamp.com/hero.png", "language": "en",
            "operator": "https://nixamp.com/~chovy/OpenProfile.md",
            "kinds": ["stream", "page"], "sitemaps": ["https://nixamp.com/sitemap.xml"] },
  "index": { "allow": true, "refresh": 3600,
             "records": "https://nixamp.com/opensite/records.jsonl" }
}`;

const READING: Array<[string, string]> = [
  ["title", "JSON-LD headline or name, else og:title, else twitter:title, else <title>"],
  ["description", "JSON-LD description, else og:description, else twitter:description, else <meta name=description>"],
  ["image", "og:image with its width, height and alt, else twitter:image, else JSON-LD image, else the largest icon; http(s) only"],
  ["kind", "JSON-LD @type, else og:type, else page"],
  ["canonical", "rel=canonical, else og:url, else the final URL after redirects"],
  ["author", "JSON-LD author.name or article:author, else <meta name=author>; a rel=me link to an OpenProfile.md is the profile"],
  ["cards", "every og:, twitter: and other prefixed tag, kept verbatim so a person can see what a scraper saw"]
];

const CONSUMERS: Array<[string, string, string]> = [
  ["X", "twitter:* then og:*", "caches per URL about a week; no way to flush it"],
  ["Slack", "og:*, then twitter:*, then <title>", "caches per URL about a month; a changed URL is a new read"],
  ["iMessage", "og:*, then <title>, then apple-touch-icon", "caches on the device"],
  ["Discord", "og:*, twitter:*, theme-color", "caches for hours"],
  ["LinkedIn", "og:*", "wants at least 1200 by 627 for a wide card; the Post Inspector re-reads on request"],
  ["WhatsApp", "og:*", "reads only the first part of the page, so tags belong at the top of <head>"],
  ["Facebook", "og:*", "wants og:image:width and height or the first share has no picture"]
];

const ABSENT: Array<[string, string]> = [
  ["No ranking", "A record says what a page is. Which page is better is an index's business, and it says so under its own name."],
  ["No rendering rules", "The table of consumers is a reader's guide to what others do, not a rule for how a card must look."],
  ["No content", "A record is the card, not the page. The page stays where it is; the record points at it."],
  ["No push", "A site serves a descriptor and, if it likes, a records file. An index reads them on its own schedule."]
];

export default function OpenSitePage(): ReactNode {
  return (
    <SiteShell active="OpenSite">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenSite</h2>
          <p>
            One record about a page or a site: the card a careful reader would draw, declared by the
            site or read from the page by rules that are written down, kept by an index and handed to
            anyone.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          Every link pasted into a chat becomes a card, drawn from tags the page carries for the
          purpose. A dozen consumers read those tags a dozen ways, each caches its first reading for
          days, and none of them publishes what it got. A site that fixes its card cannot tell them.
          An index that read a page well cannot share the reading except as another scrape. OpenSite
          is the reading, written down: a record per URL, a descriptor per site at{" "}
          <code style={mono}>/.well-known/opensite.json</code>, and the order in which a reader takes
          each field from a page.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. The first index is{" "}
          <a href="https://nichedb.dev/c/sites">nichedb.dev/c/sites</a>, which reads any URL you paste
          and shows what each consumer would draw; the first publisher is{" "}
          <a href="https://nixamp.com">nixamp</a>, whose share links carry a card for every live
          channel.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The record</h2>
          <p>
            One JSON object per URL, keyed by <code style={mono}>canonical</code>. Required:{" "}
            <code style={mono}>url</code>, <code style={mono}>canonical</code>,{" "}
            <code style={mono}>site</code>, <code style={mono}>kind</code>,{" "}
            <code style={mono}>title</code>, <code style={mono}>fetched_at</code>,{" "}
            <code style={mono}>status</code> and <code style={mono}>source</code>.
          </p>
        </div>
        <pre style={pre}>{RECORD}</pre>
        <p style={{ color: "#41505d" }}>
          <code style={mono}>source</code> is <code style={mono}>declared</code> when the site
          published the record itself and <code style={mono}>read</code> when a reader derived it
          from the page. <code style={mono}>cards</code> keeps the page&apos;s own tags verbatim and
          unmerged, because the consumers do not agree and a person checking a card wants to see what
          each will do. <code style={mono}>status</code> is live, gone, moved or blocked.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The descriptor</h2>
          <p>
            What a site says about itself as a whole, and whether it wants to be read at all.{" "}
            <code style={mono}>index.records</code>, when present, is a JSON Lines file of the
            site&apos;s own records that an index may take instead of reading every page.
          </p>
        </div>
        <pre style={pre}>{DESCRIPTOR}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Reading a page</h2>
          <p>
            The part every scraper already does and nobody wrote down. First answer wins for each
            key; robots.txt and <code style={mono}>index.allow</code> are honoured; at most five
            redirects, 2 MB and 15 seconds.
          </p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>key</th>
              <th style={th}>taken from, in order</th>
            </tr>
          </thead>
          <tbody>
            {READING.map(([key, from]) => (
              <tr key={key}>
                <td style={td}>
                  <code style={mono}>{key}</code>
                </td>
                <td style={td}>{from}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>How consumers draw a card</h2>
          <p>
            Observed on 2026-09-13. Two rules follow: put the card tags in the first few kilobytes of
            the page, and when a consumer has cached a wrong card, the only certain fix is a URL it
            has not seen.
          </p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>consumer</th>
              <th style={th}>reads</th>
              <th style={th}>caches</th>
            </tr>
          </thead>
          <tbody>
            {CONSUMERS.map(([who, reads, caches]) => (
              <tr key={who}>
                <td style={td}>
                  <strong>{who}</strong>
                </td>
                <td style={td}>{reads}</td>
                <td style={td}>{caches}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
            <Link href="/docs/opensite">Specification</Link>: the record and the descriptor, the
            reading order, the four calls an index offers, the consumer table, conformance
          </li>
          <li>
            <a href="https://nichedb.dev/c/sites">nichedb.dev/c/sites</a>: the first index; paste a
            URL at <a href="https://nichedb.dev/c/sites/add">nichedb.dev/c/sites/add</a> and see every
            tag and every card
          </li>
          <li>
            <a href="https://nixamp.com">nixamp.com</a>: the first publisher, a card for every live
            channel on a share link
          </li>
          <li>
            <Link href="/openprofile">OpenProfile.md</Link>, who a page&apos;s author and a site&apos;s
            operator are; <Link href="/openbroadcast">OpenBroadcast</Link>, what a stream record
            points at; <Link href="/openaccess">OpenAccess</Link>, who may edit a declared record
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
