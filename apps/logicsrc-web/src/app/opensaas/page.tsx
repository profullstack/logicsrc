import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { specMetadata } from "@/lib/page-meta";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = specMetadata(
  "/opensaas",
  "OpenSaaS is one file a subscription service serves at /.well-known/opensaas.json about how to deal with it: its plans, and how to subscribe, cancel, pause, change plan, stop the mail, export and delete, each as the page a person opens and the endpoint an agent calls with an OpenAccess scope. The way out, written down beside the way in."
);

const DESCRIPTOR = `{
  "service": { "name": "NicheDB", "web": "https://nichedb.dev",
               "openaccess": "https://nichedb.dev/.well-known/openaccess.json",
               "terms": "https://nichedb.dev/terms", "currency": "USD" },
  "updated": "2026-09-13T06:00:00Z",
  "plans": [
    { "id": "premium", "name": "Premium", "price": 1, "period": "day", "renews": true,
      "url": "https://nichedb.dev/premium", "includes": ["no ads", "no tracker"] },
    { "id": "pro", "name": "Pro", "price": 30, "period": "month", "trial": "14 days",
      "renews": true, "url": "https://nichedb.dev/pro" }
  ],
  "actions": {
    "subscribe": { "page": "https://nichedb.dev/premium",
                   "api": { "method": "POST", "url": "https://nichedb.dev/api/v1/billing/subscribe" },
                   "scope": "billing:subscribe", "steps": 2, "requires": ["account", "payment"] },
    "cancel":    { "page": "https://nichedb.dev/account/billing",
                   "api": { "method": "POST", "url": "https://nichedb.dev/api/v1/billing/cancel" },
                   "scope": "billing:cancel", "steps": 1, "confirm": "click",
                   "effective": "period-end", "refund": "none" },
    "unsubscribe": { "page": "https://nichedb.dev/account/mail", "scope": "mail:unsubscribe",
                     "api": { "method": "POST", "url": "https://nichedb.dev/api/v1/mail/unsubscribe" },
                     "steps": 1, "list_unsubscribe": true },
    "export":    { "page": "https://nichedb.dev/account/export", "scope": "account:export",
                   "api": { "method": "POST", "url": "https://nichedb.dev/api/v1/account/export" },
                   "steps": 1, "formats": ["json"], "within": "P1D" },
    "delete":    { "page": "https://nichedb.dev/account/delete", "scope": "account:delete",
                   "api": { "method": "POST", "url": "https://nichedb.dev/api/v1/account/delete" },
                   "steps": 2, "confirm": "email", "effective": "immediate", "retention": "P30D" }
  },
  "policies": { "auto_renew": true, "renewal_notice": "P7D", "price_change_notice": "P30D" }
}`;

const ACTIONS: Array<[string, string, string]> = [
  ["subscribe", "start a plan", "requires: account, payment, card, invoice, approval"],
  ["cancel", "end the plan", "effective: immediate or period-end; refund: none, prorated, full, P14D, or a URL"],
  ["pause", "stop paying for a while", "max: the longest pause, as a duration"],
  ["resume", "come back from a pause", ""],
  ["change_plan", "move to another plan", "proration: immediate, period-end, none"],
  ["unsubscribe", "stop the mail, not the plan", "list_unsubscribe: true when RFC 8058 headers are in the mail"],
  ["export", "take your data", "formats, and within: how long it takes"],
  ["delete", "close the account", "retention: how long the data lives after"]
];

const BOTH: Array<[string, string]> = [
  ["page", "The URL a person opens. The human half of the action, and the one place the way out is written down beside the way in."],
  ["api", "{ method, url } an agent calls with an OpenAccess bearer. Answers done, scheduled, pending with a next, or refused with a reason."],
  ["scope", "The OpenAccess scope the bearer must carry, defined in the service's own openaccess.json with a line a person reads on the consent screen."],
  ["steps", "How many things a person does from page to done. cancel.steps against subscribe.steps is the number a directory shows first."],
  ["confirm", "What the service demands before it takes: none, click, email, password, chat, call, mail. The last three are the ones a directory flags."]
];

const ABSENT: Array<[string, string]> = [
  ["No checkout", "subscribe.api starts a plan for a person with a way to pay on file, or answers pending with the page to add one. Payment is the processor's business."],
  ["No retention offers", "A discount on the way out is offered on page, to a person. cancel.api cancels."],
  ["No account data", "The file describes actions, not the account. The current plan comes from the service's API under the reserved entitlements scope."],
  ["No badges", "steps and confirm are the service's own statements. A directory that scores exit ease labels the score as its own and shows the numbers."]
];

export default function OpenSaaSPage(): ReactNode {
  return (
    <SiteShell active="OpenSaaS">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenSaaS</h2>
          <p>
            One file a subscription service serves about how to deal with it: the way in and the
            way out of every plan, for a person and for an agent, in the same place.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          Subscribing takes one click. Cancelling takes a support ticket, a phone call in office
          hours and a retention screen. The way in is on the pricing page; the way out is nowhere a
          search finds, and an agent asked to cancel what a person does not use cannot. The service
          already has a plan table, a cancel endpoint and a refund rule. OpenSaaS is those, exported,
          at <code style={mono}>/.well-known/opensaas.json</code>: every action as the{" "}
          <code style={mono}>page</code> a person opens and the <code style={mono}>api</code> an
          agent calls with an <Link href="/openaccess">OpenAccess</Link> scope.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. The first directory reading it is the saas collection at{" "}
          <a href="https://nichedb.dev/c/saas">nichedb.dev</a>, and the first service serving one
          is nichedb.dev itself. The smallest valid file is a service with a name and one action
          with a page.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The descriptor</h2>
          <p>
            A cancel endpoint fetched from the service&apos;s own origin is a cancel endpoint the
            service says works. That is the whole verification.
          </p>
        </div>
        <pre style={pre}>{DESCRIPTOR}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Eight actions</h2>
          <p>
            <code style={mono}>unsubscribe</code> is about mail and <code style={mono}>cancel</code>{" "}
            is about the plan, and they are two actions because services conflate them on purpose.
            Unknown actions are kept under their own name.
          </p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>action</th>
              <th style={th}>what it does</th>
              <th style={th}>its own keys</th>
            </tr>
          </thead>
          <tbody>
            {ACTIONS.map(([action, what, keys]) => (
              <tr key={action}>
                <td style={td}>
                  <code style={mono}>{action}</code>
                </td>
                <td style={td}>{what}</td>
                <td style={td}>{keys}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>One action, both readers</h2>
          <p>
            Every action carries the same five keys. An action with a page and no api can only be
            done by a person; one with an api and no page only by an agent; a directory shows which.
          </p>
        </div>
        <table style={table}>
          <tbody>
            {BOTH.map(([key, what]) => (
              <tr key={key}>
                <td style={td}>
                  <code style={mono}>{key}</code>
                </td>
                <td style={td}>{what}</td>
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
            <Link href="/docs/opensaas">Specification</Link>: the descriptor, ten rules, eight
            actions, acting on one as a person or an agent, discovery, what a directory owes a
            service
          </li>
          <li>
            <a href="https://nichedb.dev/.well-known/opensaas.json">nichedb.dev/.well-known/opensaas.json</a>
            : the first descriptor, and <a href="https://nichedb.dev/c/saas">nichedb.dev/c/saas</a>,
            the first directory reading them
          </li>
          <li>
            <Link href="/openaccess">OpenAccess</Link>, the grant an agent carries to call an action;{" "}
            <Link href="/opencoupon">OpenCoupon</Link>, the same idea for a merchant&apos;s promotions
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
