import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { specMetadata } from "@/lib/page-meta";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = specMetadata(
  "/opencoupon",
  "OpenCoupon is one file a merchant serves about what is on offer right now, at /.well-known/opencoupon.json: every code, sale and shipping threshold with its kind, value, scope, dates, status and regions, expired codes kept so directories learn they died. A coupon site reads the merchant instead of a forum thread."
);

const DESCRIPTOR = `{
  "merchant": { "name": "Northwind Outfitters", "web": "https://northwind.example",
                "currency": "USD", "terms": "https://northwind.example/promotions/terms" },
  "updated": "2026-09-13T06:00:00Z",
  "coupons": [
    { "id": "fall15", "code": "FALL15", "title": "15% off everything for fall",
      "kind": "percent", "value": 15, "min_order": 50,
      "scope": { "excludes": ["gift-cards", "sale"] },
      "ends": "2026-09-30T23:59:59Z", "new_customers": false, "stackable": false,
      "regions": ["US", "CA"], "status": "active" },
    { "id": "ship-75", "title": "Free shipping over 75", "kind": "shipping", "min_order": 75 },
    { "id": "boots-sale", "title": "Trail boots, 40 off", "kind": "amount", "value": 40,
      "url": "https://northwind.example/boots/trail", "price": { "was": 160, "now": 120 } },
    { "id": "summer10", "code": "SUMMER10", "title": "10% off summer", "kind": "percent",
      "value": 10, "ends": "2026-08-31T23:59:59Z", "status": "expired" }
  ]
}`;

const KINDS: Array<[string, string, string]> = [
  ["percent", "value is a percentage", "15% off, capped by max_discount when stated"],
  ["amount", "value is an amount in currency", "40 off; price {was, now} shows the cut on a sale"],
  ["shipping", "no value", "free shipping at min_order"],
  ["bogo", "value bought, gets given", "buy 2 get 1"],
  ["gift", "gift names the item", "a gift with purchase"],
  ["other", "the merchant's own words", "kept, listed, not filtered on"]
];

const DIRECTORY: Array<[string, string]> = [
  ["Hourly, at least", "Coupons start and end on the hour. A file read once is a snapshot."],
  ["Dedupe on origin + id", "A re-read updates the row. An id that leaves the file is marked gone, not deleted."],
  ["Expiry with the read time", "A code shown as active is active as of a stated moment."],
  ["The merchant's url, unchanged", "A directory that routes through its own tracking says so beside the link."],
  ["Verified above claimed", "A code from the merchant's origin outranks the same code from a forum, and the page shows which is which."]
];

const ABSENT: Array<[string, string]> = [
  ["No affiliate links", "url is the merchant's. A commission link is the directory's own, marked as such, beside it."],
  ["No redemption", "The file says a code exists and what it does. Whether checkout accepts it for this cart is checkout's business."],
  ["No votes, no badges", "The origin is the verification. A score a directory adds is labelled as its own."],
  ["No catalog prices", "A coupon names what it applies to; the store says what that costs. price on a sale is the one exception."]
];

export default function OpenCouponPage(): ReactNode {
  return (
    <SiteShell active="OpenCoupon">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenCoupon</h2>
          <p>
            One file a merchant serves about what is on offer right now. A coupon site reads the
            merchant instead of a forum thread, and a dead code dies everywhere at once.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          Every coupon site is a graveyard. A code is posted once, copied everywhere, and lives on
          for years after the merchant retired it, because no coupon site knows when a code died
          and the merchant has no way to tell them. The merchant already knows exactly which codes
          work: its checkout is the source of truth and the promotion lives in a table with a start,
          an end and a rule. OpenCoupon is that table, exported, at{" "}
          <code style={mono}>/.well-known/opencoupon.json</code>.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. The first directory reading it is the deals collection at{" "}
          <a href="https://nichedb.dev/c/deals">nichedb.dev</a>. The smallest valid file is a
          merchant with a name and a coupon with a title.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The descriptor</h2>
          <p>
            A code fetched from the merchant&apos;s own origin is a code the merchant says works.
            That is the whole verification, and the whole point.
          </p>
        </div>
        <pre style={pre}>{DESCRIPTOR}</pre>
        <p style={{ color: "#41505d" }}>
          <code style={mono}>code</code> absent means nothing to type: the promotion applies on its
          own at <code style={mono}>url</code>. <code style={mono}>scope</code> narrows to
          categories or products, or everything but <code style={mono}>excludes</code>.{" "}
          <code style={mono}>status</code> is derived from the dates unless stated, and an expired
          coupon stays in the file for as long as copies of it circulate, so a directory learns it
          died from the one party that knows. Unknown keys are kept.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Six kinds</h2>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>kind</th>
              <th style={th}>value</th>
              <th style={th}>example</th>
            </tr>
          </thead>
          <tbody>
            {KINDS.map(([kind, value, example]) => (
              <tr key={kind}>
                <td style={td}>
                  <code style={mono}>{kind}</code>
                </td>
                <td style={td}>{value}</td>
                <td style={td}>{example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>What a directory owes a merchant</h2>
        </div>
        <table style={table}>
          <tbody>
            {DIRECTORY.map(([what, how]) => (
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
            <Link href="/docs/opencoupon">Specification</Link>: the descriptor, ten rules, six
            kinds, expired coupons, discovery, what a directory owes a merchant
          </li>
          <li>
            <a href="https://nichedb.dev/c/deals">nichedb.dev/c/deals</a>: the first directory
            reading it, beside the deal communities it reads today
          </li>
          <li>
            <Link href="/openserver">OpenServer</Link>, the same idea for a hosting provider&apos;s
            catalog; <Link href="/openprofile">OpenProfile.md</Link>, the operator behind a merchant
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
