import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { specMetadata } from "@/lib/page-meta";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = specMetadata(
  "/openaffiliate",
  "OpenAffiliate is one file a merchant serves about the commission it pays, at /.well-known/openaffiliate.json, and four calls that let a person or an agent earn it: join with a profile, link with one parameter, read your own ledger, get paid to your own address. No network in the money."
);

const DESCRIPTOR = `{
  "merchant": { "name": "CrawlProof", "web": "https://crawlproof.com", "currency": "USD",
                "terms": "https://crawlproof.com/affiliate/terms" },
  "updated": "2026-09-13T06:00:00Z",
  "programs": [
    { "id": "partners", "title": "CrawlProof partner program",
      "join": "https://crawlproof.com/api/affiliate/v1/join",
      "ledger": "https://crawlproof.com/api/affiliate/v1/ledger",
      "approval": "open",
      "pays": [
        { "event": "sale", "kind": "percent", "value": 30 },
        { "event": "subscription", "kind": "percent", "value": 30, "months": 12 },
        { "event": "signup", "kind": "amount", "value": 0.5 }
      ],
      "link": { "param": "oa", "deep": true },
      "window": 30, "attribution": "last", "hold_days": 30,
      "payout": { "methods": ["usdc/eip155:137"], "min": 10, "schedule": "weekly" },
      "self": "refused", "status": "active" }
  ]
}`;

const JOIN = `POST https://crawlproof.com/api/affiliate/v1/join
{ "profile": "https://anthony.example/.well-known/openprofile.md" }

201 { "membership": "am_8f3c", "status": "active", "code": "anthony",
      "link": "https://crawlproof.com/?oa=anthony", "token": "oa_5Kq…",
      "ledger": "https://crawlproof.com/api/affiliate/v1/ledger" }`;

const EVENTS: Array<[string, string, string]> = [
  ["sale", "a one-time charge", "percent of amount, or a flat amount"],
  ["subscription", "each charge of a recurring one", "months caps how many renewals pay; absent is every one"],
  ["signup", "an account created", "usually a flat amount"],
  ["lead", "a form submitted", "a flat amount"],
  ["install", "an app installed", "a flat amount"],
  ["other", "the merchant's own words", "kept, listed, not filtered on"]
];

const CALLS: Array<[string, string]> = [
  ["Join", "POST the program's join URL with an OpenProfile.md URL. Back comes a code, a link, a token and the terms as they stood. open answers active at once; review answers pending."],
  ["Link", "The merchant's URL with ?oa=code. No redirect host, no shortener, no pixel. deep: true means it works on any page, so you link to the product you recommend."],
  ["Ledger", "GET the ledger with the token: clicks, every conversion with its status and hold, balances pending, approved and paid, every payout with its tx. A reversal must carry a reason."],
  ["Payout", "The whole approved balance to your own pay address on the schedule, once it passes min. Nothing netted, because there is no network to pay."]
];

const NETWORK: Array<[string, string]> = [
  ["A third of the commission", "Nothing. The merchant pays the affiliate. A directory that charges does so as a stated fee, never as a share of a conversion."],
  ["Apply, wait weeks", "A profile. approval: open answers at once; review says the merchant looks first, and says so in the file."],
  ["Terms in a PDF you signed once", "Terms in a file at a fixed URL, fetched any time, kept with the membership as they stood at the join, changed forward only."],
  ["A reversal with no reason", "A reversal without a reason is not a reversal. The affiliate reports it and a directory says so beside the program."],
  ["Ten dashboards", "One ledger shape per program, readable by anyone with the token, so one page can show all of them."],
  ["Sixty days, minus a fee, in their currency", "hold_days, then the schedule, to your own address, in the asset the file names. The tx is in the ledger."]
];

const ABSENT: Array<[string, string]> = [
  ["No network", "The merchant serves the terms, records the conversions and sends the money. Nobody sits in the middle of a payment."],
  ["No tracking host", "A link is the merchant's URL with a parameter. Only a navigation sets attribution; an image, frame, script or prefetch sets nothing."],
  ["No application form", "An affiliate is a profile. A person or an agent, with an operator who answers for the agent."],
  ["No exclusivity", "A membership binds nobody to one program, and a program may not require it."],
  ["No impression payments", "A view is not an event. The events are things a customer did."]
];

export default function OpenAffiliatePage(): ReactNode {
  return (
    <SiteShell active="OpenAffiliate">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenAffiliate</h2>
          <p>
            One file a merchant serves about the commission it pays, and four calls that let a
            person or an agent earn it. No network in the money.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          Affiliate marketing runs through networks, and the networks are the problem. A merchant
          pays a third of every commission for a pixel and a payout file. An affiliate applies to
          each program by hand, waits weeks, and ends up with ten dashboards that disagree. Terms
          live in a PDF signed once. A conversion is reversed with no reason. A payout arrives sixty
          days later, minus a fee. And none of it is readable by a machine, so an agent that could
          earn by recommending the right product cannot find out what the commission is. The
          merchant already knows what it pays and what each sale was worth. OpenAffiliate is that,
          written down, at <code style={mono}>/.well-known/openaffiliate.json</code>.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. The reference implementation is{" "}
          <a href="https://crawlproof.com/affiliate">crawlproof.com</a>, which runs its own
          program, joins other merchants&apos; programs from the same dashboard, and pays in USDC on
          Polygon. The smallest valid file is a merchant with a name and a program with a title
          and one thing it pays.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The descriptor</h2>
          <p>
            A commission fetched from the merchant&apos;s own origin is the commission the merchant
            says it pays, today, in words it cannot say it never agreed to.
          </p>
        </div>
        <pre style={pre}>{DESCRIPTOR}</pre>
        <p style={{ color: "#41505d" }}>
          <code style={mono}>pays</code> is one entry per event. <code style={mono}>window</code>{" "}
          is the attribution window in days and <code style={mono}>attribution</code> whether a
          later click replaces an earlier one. <code style={mono}>hold_days</code> is the refund
          window a conversion waits out as pending. <code style={mono}>payout.methods</code> are{" "}
          <code style={mono}>asset/chain</code> pairs or a named rail. <code style={mono}>self</code>{" "}
          says whether the affiliate&apos;s own purchase pays. Unknown keys are kept.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Four calls</h2>
        </div>
        <table style={table}>
          <tbody>
            {CALLS.map(([what, how]) => (
              <tr key={what}>
                <td style={td}>
                  <strong>{what}</strong>
                </td>
                <td style={td}>{how}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <pre style={pre}>{JOIN}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Six events</h2>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>event</th>
              <th style={th}>what happened</th>
              <th style={th}>how it pays</th>
            </tr>
          </thead>
          <tbody>
            {EVENTS.map(([event, what, how]) => (
              <tr key={event}>
                <td style={td}>
                  <code style={mono}>{event}</code>
                </td>
                <td style={td}>{what}</td>
                <td style={td}>{how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>What a network costs, and what replaces it</h2>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>on a network</th>
              <th style={th}>with OpenAffiliate</th>
            </tr>
          </thead>
          <tbody>
            {NETWORK.map(([before, after]) => (
              <tr key={before}>
                <td style={td}>{before}</td>
                <td style={td}>{after}</td>
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
            <Link href="/docs/openaffiliate">Specification</Link>: the descriptor, eleven rules,
            six events, join, links and attribution, the ledger, webhooks, payouts, discovery,
            what a directory owes a merchant
          </li>
          <li>
            <a href="https://crawlproof.com/affiliate">crawlproof.com/affiliate</a>: the reference
            implementation, running its own program and a directory of others
          </li>
          <li>
            <Link href="/openprofile">OpenProfile.md</Link>, the affiliate&apos;s identity and pay
            address; <Link href="/opencoupon">OpenCoupon</Link>, a merchant&apos;s promotions in
            the same shape
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
