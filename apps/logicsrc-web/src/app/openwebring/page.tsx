import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = {
  title: "OpenWebring · LogicSRC",
  description:
    "OpenWebring is a webring that says who made it: one file a ring serves about its members at /.well-known/openwebring.json, one file a member may serve about itself, plain links between them, and a made_by declaration on every member, human, ai or both, so a reader can follow the human web or the machine web on purpose.",
  alternates: { canonical: "/openwebring" }
};

const MEMBER = `{
  "openwebring": "0.1",
  "site": { "url": "https://chovy.com/", "name": "Chovy's Blog",
            "feed": "https://chovy.com/feed.xml", "lang": "en",
            "author": "https://chovy.com/.well-known/openprofile.md" },
  "made_by": "human",
  "disclosure": "ai-assisted",
  "rings": [ { "ring": "https://rssamplifier.com/ring/small-web", "slug": "chovy" } ]
}`;

const RING = `{
  "openwebring": "0.1",
  "ring": { "slug": "small-web", "name": "Small Web",
            "url": "https://rssamplifier.com/ring/small-web",
            "accepts": ["human", "both"] },
  "members": [
    { "url": "https://chovy.com/", "slug": "chovy", "name": "Chovy's Blog",
      "feed": "https://chovy.com/feed.xml", "made_by": "human",
      "status": "active", "since": "2026-09-13", "checked": "2026-09-13T11:00:00Z" }
  ]
}`;

const LINKS = `<a href="https://rssamplifier.com/ring/small-web/previous?from=https://chovy.com/">←</a>
<a href="https://rssamplifier.com/ring/small-web">Small Web ring</a>
<a href="https://rssamplifier.com/ring/small-web/next?from=https://chovy.com/">→</a>`;

const MADE_BY: Array<[string, string]> = [
  ["human", "A person makes the content, with tools at most."],
  ["ai", "A model or agent makes it, with a person at most pointing it."],
  ["both", "A mix the site does not care to split."],
  ["absent", "Unstated. A directory shows it as unstated, never as human."]
];

const HOPS: Array<[string, string]> = [
  ["A 302 and nothing else", "No cookie, no interstitial, no counter. Cache-Control: no-store. Location is the member's url."],
  ["from, and every older shape", "?from=<url> is canonical; ?host=, ?via=, ?url=, a slug in the path and the bare Referer all resolve, so a member of any existing ring joins with no change."],
  ["Unknown from is random", "A member that moved or a reader with no referrer still lands in the ring."],
  ["The ring wraps", "After the last member comes the first."],
  ["Inactive is skipped, not removed", "A member whose link went missing stays in the list, shown and skipped, until it is back."],
  ["random never returns you", "When the ring has more than one member."]
];

const ABSENT: Array<[string, string]> = [
  ["No script", "A member is a link. A widget is a host's offer, never a requirement."],
  ["No verification of made_by", "It is a statement. Every badge scheme before this one said the same and was right to."],
  ["No central registry", "A ring is a file on a host; a directory is optional. Two rings with one name on two hosts are two rings."],
  ["No reader tracking", "A hop is a redirect, cached by nobody, remembered by nobody."],
  ["No invented relation for the hops", "next and prev are registered; me is identity; openwebring on a link points at a descriptor and nothing else."]
];

export default function OpenWebringPage(): ReactNode {
  return (
    <SiteShell active="OpenWebring">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenWebring</h2>
          <p>
            A webring that says who made it. One file a ring serves about its members, one a member
            may serve about itself, plain links between them, and a declaration on every member:
            human, ai, or both.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          Webrings came back, hundreds of them, and every one reinvents the same three things: a
          member list kept by hand in its own shape, a next and a previous link, and a check by eye
          that the member still links back. Meanwhile the one thing a reader in 2026 wants to know
          about a site, whether a person wrote it, has nowhere to be said that a ring can filter on.
          A ring for the human web and a ring for the machine web are the same ring with one field.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. The first host is{" "}
          <a href="https://rssamplifier.com/ring">rssamplifier.com</a>, one ring per topic out of
          the feeds it already reads; the first directory reading rings is{" "}
          <a href="https://nichedb.dev/c/webrings">nichedb.dev/c/webrings</a>. A member owes a ring
          one plain link, which is what every ring already asks for.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The member</h2>
          <p>The whole obligation is three anchors. The descriptor is optional and says the rest.</p>
        </div>
        <pre style={pre}>{LINKS}</pre>
        <pre style={pre}>{MEMBER}</pre>
        <p style={{ color: "#41505d" }}>
          <code style={mono}>rings</code> is the one thing no existing format carries: the
          site&apos;s own statement of which rings it belongs to. <code style={mono}>disclosure</code>{" "}
          is optional and uses the W3C AI Content Disclosure vocabulary verbatim, so it maps onto the
          HTML attribute and the IETF header without translation.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>made_by</h2>
          <p>A self-declaration. Nothing verifies it, and a directory says so beside it.</p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>value</th>
              <th style={th}>means</th>
            </tr>
          </thead>
          <tbody>
            {MADE_BY.map(([value, means]) => (
              <tr key={value}>
                <td style={td}>
                  <code style={mono}>{value}</code>
                </td>
                <td style={td}>{means}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The ring</h2>
          <p>
            Listed at <code style={mono}>/.well-known/openwebring.json</code> on the host, members in
            ring order at <code style={mono}>members_url</code>, and the same members as OPML.
          </p>
        </div>
        <pre style={pre}>{RING}</pre>
        <p style={{ color: "#41505d" }}>
          <code style={mono}>accepts</code> is the ring&apos;s policy on <code style={mono}>made_by</code>.
          A host checks members on a schedule, the way the IndieWeb ring does: it fetches the page,
          looks for any link to the ring, and marks <code style={mono}>active</code> or{" "}
          <code style={mono}>inactive</code>. It never removes a member for a missing link.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Six hop rules</h2>
        </div>
        <table style={table}>
          <tbody>
            {HOPS.map(([what, how]) => (
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
            <Link href="/docs/openwebring">Specification</Link>: the member, the host, the two
            files, six hop rules, verification, discovery, what a directory owes a ring
          </li>
          <li>
            <a href="https://rssamplifier.com/ring">rssamplifier.com/ring</a>: the first host, one
            ring per topic and a ring of the sites Profullstack publishes
          </li>
          <li>
            <a href="https://nichedb.dev/c/webrings">nichedb.dev/c/webrings</a>: the first directory
            reading rings, every ring and every member across hosts, with who makes each site
          </li>
          <li>
            <Link href="/openprofile">OpenProfile.md</Link>, the author behind a member;{" "}
            <Link href="/opencoupon">OpenCoupon</Link> and <Link href="/openserver">OpenServer</Link>,
            the same serve-your-own-file idea for other things a site knows about itself
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
